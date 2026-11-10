-- 1) Wi-Fi can be "there, but unreliable": the community fact `wifi` accepts the string "unreliable"
--    next to true/false. The combined answer is kept on places.wifi_community and lowers the
--    Wi-Fi part of the work score.
-- 2) Mobile data speed tests for people who work from their own hotspot: speed_tests.kind
--    ('wifi' | 'mobile') plus an optional carrier. Mobile tests get their own medians on the place
--    and never count toward the work score or the city stats.

-- ---------------------------------------------------------------------------
-- Wi-Fi: "unreliable"
-- ---------------------------------------------------------------------------

create or replace function public.place_fact_value_ok(p_key text, p_value jsonb)
returns boolean
language sql
immutable
as $$
  select case p_key
    when 'open_24_7' then jsonb_typeof(p_value) = 'boolean'
    when 'meeting_rooms' then jsonb_typeof(p_value) = 'boolean'
    when 'phone_booths' then jsonb_typeof(p_value) = 'boolean'
    when 'wifi' then jsonb_typeof(p_value) = 'boolean' or p_value = '"unreliable"'::jsonb
    when 'laptops' then p_value in ('"welcome"'::jsonb, '"not_allowed"'::jsonb)
    when 'opening_hours' then
      case when jsonb_typeof(p_value) = 'string' then char_length(p_value #>> '{}') between 3 and 300 else false end
    when 'price_range' then
      case when jsonb_typeof(p_value) = 'number' then (p_value #>> '{}')::numeric in (1, 2, 3, 4) else false end
    when 'day_pass' then
      case when jsonb_typeof(p_value) = 'object' and jsonb_typeof(p_value -> 'amount') = 'number'
             then (p_value ->> 'amount')::numeric between 0 and 10000 and coalesce(p_value ->> 'currency', '') ~ '^[A-Z]{3}$'
           else false end
    else false
  end;
$$;

alter table public.places
  add column wifi_community text check (wifi_community in ('yes', 'unreliable', 'no'));

-- Majority of the approved member answers; ties go to the most recent one and the venue website
-- counts as the oldest "yes". Same rule as summarizeFacts in src/lib/facts.ts.
create or replace function public.refresh_place_wifi_community(p_place uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_answer text;
begin
  select case x.v when 'true' then 'yes' when 'false' then 'no' when '"unreliable"' then 'unreliable' end
    into v_answer
    from (
      select a.v, count(*) as n, max(a.at) as latest
        from (
          select f.value::text as v, f.updated_at as at
            from public.place_facts f
           where f.place_id = p_place and f.key = 'wifi' and f.status = 'approved'
          union all
          select 'true', '-infinity'::timestamptz
            from public.places p
           where p.id = p_place
             and p.web_facts ? 'wifi_mentioned'
             and exists (
               select 1 from public.place_facts f
                where f.place_id = p_place and f.key = 'wifi' and f.status = 'approved'
             )
        ) a
       group by a.v
       order by n desc, latest desc
       limit 1
    ) x;

  update public.places
     set wifi_community = v_answer
   where id = p_place
     and wifi_community is distinct from v_answer;
end;
$$;

create or replace function public.place_facts_refresh_wifi()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.key, old.key) = 'wifi' then
    perform public.refresh_place_wifi_community(coalesce(new.place_id, old.place_id));
  end if;
  return null;
end;
$$;

drop trigger if exists place_facts_wifi_community on public.place_facts;
create trigger place_facts_wifi_community
  after insert or update or delete on public.place_facts
  for each row execute function public.place_facts_refresh_wifi();

revoke all on function public.refresh_place_wifi_community(uuid) from public, anon, authenticated;
revoke all on function public.place_facts_refresh_wifi() from public, anon, authenticated;

create or replace function public.compute_place_score(p public.places, s public.place_rating_stats)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  c_prior constant numeric := 3;
  m_prior constant numeric := 3.5;
  n numeric := coalesce(p.review_count, 0);
  avg_rating numeric := coalesce(p.rating_avg, m_prior);
  bayes numeric;
  rev numeric;
  wifi numeric;
  power numeric;
  calls numeric;
  facts numeric;
  completeness numeric;
  cat numeric;
  has_price boolean;
  total numeric;
begin
  bayes := (c_prior * m_prior + n * avg_rating) / (c_prior + n);
  rev := greatest(0, least(1, (bayes - 1) / 4));

  if p.download_median_mbps is not null then
    wifi := least(1, ln(1 + p.download_median_mbps) / ln(101));
  elsif s.wifi_avg is not null then
    wifi := (s.wifi_avg - 1) / 4;
  elsif p.wifi_community is not null then
    wifi := case p.wifi_community when 'yes' then 0.5 when 'unreliable' then 0.2 else 0 end;
  elsif p.wifi = 'yes' then
    wifi := 0.5;
  elsif p.wifi = 'no' then
    wifi := 0;
  else
    wifi := 0.25;
  end if;
  -- A fast test on a good moment does not make Wi-Fi that keeps dropping out reliable.
  if p.wifi_community = 'unreliable' then
    wifi := least(wifi, 0.4);
  end if;

  if s.power_avg is not null then
    power := (s.power_avg - 1) / 4;
  else
    power := case p.power_outlets when 'plenty' then 1 when 'some' then 0.6 when 'none' then 0 else 0.3 end;
  end if;

  if s.calls_answers is not null and s.calls_answers > 0 then
    calls := s.calls_ok_count::numeric / s.calls_answers;
  else
    calls := case p.calls when 'yes' then 1 when 'limited' then 0.5 when 'no' then 0 else 0.3 end;
  end if;
  facts := (power + calls) / 2;

  has_price := p.day_pass_price_cents is not null or p.price_level is not null
    or (p.web_facts ? 'day_pass');
  completeness := (
    (case when p.opening_hours is not null then 1 else 0 end)
    + (case when p.website is not null then 1 else 0 end)
    + (case when p.address is not null then 1 else 0 end)
    + (case when has_price then 1 else 0 end)
  )::numeric / 4;

  cat := case p.category when 'coworking' then 1 when 'library' then 0.8 when 'coliving' then 0.8 else 0.5 end;

  total := 10 * (0.55 * rev + 0.20 * wifi + 0.10 * facts + 0.10 * completeness + 0.05 * cat);

  return jsonb_build_object(
    'score', round(total, 2),
    'reviews', round(rev * 10, 1),
    'wifi', round(wifi * 10, 1),
    'facts', round(facts * 10, 1),
    'completeness', round(completeness * 10, 1),
    'category', round(cat * 10, 1)
  );
end;
$$;

revoke all on function public.compute_place_score(public.places, public.place_rating_stats) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Mobile data speed tests
-- ---------------------------------------------------------------------------

alter table public.speed_tests
  add column kind text not null default 'wifi' check (kind in ('wifi', 'mobile')),
  add column carrier text check (carrier is null or char_length(btrim(carrier)) between 1 and 60);

alter table public.places
  add column mobile_download_median_mbps numeric(7, 1),
  add column mobile_upload_median_mbps numeric(7, 1),
  add column mobile_ping_median_ms integer,
  add column mobile_speed_test_count integer not null default 0;

create or replace function public.speed_test_rate_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (
    select count(*) from public.speed_tests s
     where s.user_id = new.user_id
       and s.place_id = new.place_id
       and s.kind = new.kind
       and s.created_at > now() - interval '24 hours'
  ) >= 4 then
    raise exception 'speed_test_rate_limited' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.speed_test_rate_limit() from public, anon, authenticated;

-- Only tests confirmed on site count; Wi-Fi and mobile data each get their own medians.
create or replace function public.refresh_place_speed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  target := coalesce(new.place_id, old.place_id);
  update public.places p
     set download_median_mbps = s.down,
         upload_median_mbps = s.up,
         ping_median_ms = s.ping,
         speed_test_count = s.cnt,
         last_speed_test_at = s.last_at,
         mobile_download_median_mbps = s.m_down,
         mobile_upload_median_mbps = s.m_up,
         mobile_ping_median_ms = s.m_ping,
         mobile_speed_test_count = s.m_cnt
    from (
      select round((percentile_cont(0.5) within group (order by download_mbps) filter (where kind = 'wifi'))::numeric, 1) as down,
             round((percentile_cont(0.5) within group (order by upload_mbps) filter (where kind = 'wifi'))::numeric, 1) as up,
             round(percentile_cont(0.5) within group (order by ping_ms) filter (where kind = 'wifi'))::int as ping,
             (count(*) filter (where kind = 'wifi'))::int as cnt,
             max(created_at) filter (where kind = 'wifi') as last_at,
             round((percentile_cont(0.5) within group (order by download_mbps) filter (where kind = 'mobile'))::numeric, 1) as m_down,
             round((percentile_cont(0.5) within group (order by upload_mbps) filter (where kind = 'mobile'))::numeric, 1) as m_up,
             round(percentile_cont(0.5) within group (order by ping_ms) filter (where kind = 'mobile'))::int as m_ping,
             (count(*) filter (where kind = 'mobile'))::int as m_cnt
        from public.speed_tests
       where place_id = target
         and status = 'visible'
         and on_site
         and created_at > now() - interval '18 months'
    ) s
   where p.id = target;
  perform public.refresh_profile_stats(coalesce(new.user_id, old.user_id));
  return null;
end;
$$;

revoke all on function public.refresh_place_speed() from public, anon, authenticated;

drop function public.submit_speed_test(uuid, numeric, numeric, integer, double precision, double precision, double precision, text, text);

create function public.submit_speed_test(
  p_place_id uuid,
  p_download_mbps numeric,
  p_upload_mbps numeric,
  p_ping_ms integer,
  p_lat double precision,
  p_lng double precision,
  p_accuracy_m double precision,
  p_network_type text,
  p_note text default null,
  p_kind text default 'wifi',
  p_carrier text default null
)
returns table (verification text, distance_m integer)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_user uuid := auth.uid();
  v_place public.places%rowtype;
  v_network text := case when p_network_type in ('wifi', 'cellular') then p_network_type else 'unknown' end;
  v_kind text := case when p_kind = 'mobile' then 'mobile' else 'wifi' end;
  v_carrier text;
  v_has_fix boolean := p_lat is not null and p_lng is not null and p_lat between -90 and 90 and p_lng between -180 and 180;
  v_note text := nullif(btrim(p_note), '');
  v_distance double precision;
  v_verification text;
  v_ip text;
  v_ip_hash text;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if v_kind = 'mobile' then
    v_carrier := nullif(left(btrim(p_carrier), 60), '');
  end if;

  select * into v_place from public.places where id = p_place_id and status = 'published';
  if not found then
    raise exception 'place_not_found' using errcode = 'P0002';
  end if;

  if v_has_fix and v_place.lat is not null and v_place.lng is not null then
    v_distance := 2 * 6371000 * asin(sqrt(
      power(sin(radians(p_lat - v_place.lat) / 2), 2)
      + cos(radians(v_place.lat)) * cos(radians(p_lat)) * power(sin(radians(p_lng - v_place.lng) / 2), 2)
    ));
  end if;

  v_verification := case
    when v_kind = 'wifi' and v_network = 'cellular' then 'cellular'
    when v_distance is null then 'no_location'
    when p_accuracy_m is null or p_accuracy_m > 100 then 'low_accuracy'
    when v_distance - p_accuracy_m > 150 then 'too_far'
    else 'verified'
  end;

  -- Network prefix of the caller (/24 for IPv4, /48 for IPv6), hashed.
  begin
    v_ip := trim(split_part(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ',', 1));
    if v_ip <> '' then
      select encode(sha256(convert_to(
               host(network(set_masklen(v_ip::inet, case when family(v_ip::inet) = 4 then 24 else 48 end))) || s.salt,
               'UTF8')), 'hex')
        into v_ip_hash
        from public.speed_test_salt s;
    end if;
  exception when others then
    v_ip_hash := null;
  end;

  insert into public.speed_tests (
    place_id, user_id, download_mbps, upload_mbps, ping_ms, on_site, distance_m,
    lat, lng, accuracy_m, network_type, verification, ip_hash, note, kind, carrier
  ) values (
    p_place_id, v_user, round(p_download_mbps, 1), round(p_upload_mbps, 1), p_ping_ms,
    v_verification = 'verified', round(v_distance)::int,
    case when v_has_fix then round(p_lat::numeric, 4) end,
    case when v_has_fix then round(p_lng::numeric, 4) end,
    round(p_accuracy_m)::int, v_network, v_verification, v_ip_hash, v_note, v_kind, v_carrier
  );

  return query select v_verification, round(v_distance)::int;
end;
$$;

revoke all on function public.submit_speed_test(uuid, numeric, numeric, integer, double precision, double precision, double precision, text, text, text, text) from public, anon;
grant execute on function public.submit_speed_test(uuid, numeric, numeric, integer, double precision, double precision, double precision, text, text, text, text) to authenticated;

drop function public.get_place_speed_tests(uuid);

-- Individual speed tests: signed-in users only.
create function public.get_place_speed_tests(p_place_id uuid)
returns table (
  id uuid,
  download_mbps numeric,
  upload_mbps numeric,
  ping_ms integer,
  on_site boolean,
  created_at timestamptz,
  is_own boolean,
  author_name text,
  note text,
  kind text,
  carrier text
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.download_mbps, s.upload_mbps, s.ping_ms, s.on_site, s.created_at,
         s.user_id = auth.uid(),
         coalesce(pr.display_name, 'Cosurfer'),
         s.note,
         s.kind,
         s.carrier
    from public.speed_tests s
    join public.places p on p.id = s.place_id and p.status = 'published'
    left join public.profiles pr on pr.id = s.user_id
   where auth.uid() is not null
     and s.place_id = p_place_id
     and (s.status = 'visible' or public.is_admin())
   order by s.created_at desc
   limit 50;
$$;

revoke all on function public.get_place_speed_tests(uuid) from public;
grant execute on function public.get_place_speed_tests(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------

-- Tests measured on mobile data so far were Wi-Fi tests that did not count. They are mobile data
-- tests now, checked against the location only. The row trigger refreshes the place medians.
update public.speed_tests
   set kind = 'mobile',
       verification = case
         when distance_m is null then 'no_location'
         when accuracy_m is null or accuracy_m > 100 then 'low_accuracy'
         when distance_m - accuracy_m > 150 then 'too_far'
         else 'verified'
       end,
       on_site = distance_m is not null and accuracy_m is not null and accuracy_m <= 100 and distance_m - accuracy_m <= 150
 where network_type = 'cellular';

select public.refresh_place_wifi_community(place_id)
  from (select distinct place_id from public.place_facts where key = 'wifi') f;
