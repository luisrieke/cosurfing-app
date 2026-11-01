-- Speed test verification: the server decides whether a test was taken on site. The app sends
-- the GPS fix and network type captured while the test ran; submit_speed_test checks them against
-- the place and stores the evidence. Only verified (on_site) tests feed the place medians.

alter table public.speed_tests
  add column lat numeric(8, 4),
  add column lng numeric(8, 4),
  add column accuracy_m integer,
  add column network_type text not null default 'unknown' check (network_type in ('wifi', 'cellular', 'unknown')),
  add column verification text check (verification in ('verified', 'too_far', 'low_accuracy', 'no_location', 'cellular')),
  add column ip_hash text;

-- Salt for ip_hash. RLS without policies: only security definer functions can read it.
create table public.speed_test_salt (
  id boolean primary key default true check (id),
  salt text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
);
insert into public.speed_test_salt default values;
alter table public.speed_test_salt enable row level security;
revoke all on public.speed_test_salt from anon, authenticated;

-- Inserts only go through submit_speed_test, which sets on_site itself.
drop policy if exists "write own speed test" on public.speed_tests;
revoke insert on public.speed_tests from anon, authenticated;

create or replace function public.submit_speed_test(
  p_place_id uuid,
  p_download_mbps numeric,
  p_upload_mbps numeric,
  p_ping_ms integer,
  p_lat double precision,
  p_lng double precision,
  p_accuracy_m double precision,
  p_network_type text
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
  v_has_fix boolean := p_lat is not null and p_lng is not null and p_lat between -90 and 90 and p_lng between -180 and 180;
  v_distance double precision;
  v_verification text;
  v_ip text;
  v_ip_hash text;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
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
    when v_network = 'cellular' then 'cellular'
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
    lat, lng, accuracy_m, network_type, verification, ip_hash
  ) values (
    p_place_id, v_user, round(p_download_mbps, 1), round(p_upload_mbps, 1), p_ping_ms,
    v_verification = 'verified', round(v_distance)::int,
    case when v_has_fix then round(p_lat::numeric, 4) end,
    case when v_has_fix then round(p_lng::numeric, 4) end,
    round(p_accuracy_m)::int, v_network, v_verification, v_ip_hash
  );

  return query select v_verification, round(v_distance)::int;
end;
$$;

revoke all on function public.submit_speed_test(uuid, numeric, numeric, integer, double precision, double precision, double precision, text) from public, anon;
grant execute on function public.submit_speed_test(uuid, numeric, numeric, integer, double precision, double precision, double precision, text) to authenticated;

-- Only tests confirmed on site count toward the place medians and the ranking.
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
         last_speed_test_at = s.last_at
    from (
      select round((percentile_cont(0.5) within group (order by download_mbps))::numeric, 1) as down,
             round((percentile_cont(0.5) within group (order by upload_mbps))::numeric, 1) as up,
             round(percentile_cont(0.5) within group (order by ping_ms))::int as ping,
             count(*)::int as cnt,
             max(created_at) as last_at
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

-- Recompute every place that has tests so existing medians follow the new rule.
update public.speed_tests s
   set status = s.status
 where s.id in (select distinct on (place_id) id from public.speed_tests order by place_id, created_at desc);
