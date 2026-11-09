-- Speed tests: up to 4 per member and place in 24 hours (instead of 1 per hour), so members can
-- measure different spots, plus an optional note such as where to sit for the best signal.

alter table public.speed_tests
  add column note text check (note is null or char_length(btrim(note)) between 1 and 280);

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
       and s.created_at > now() - interval '24 hours'
  ) >= 4 then
    raise exception 'speed_test_rate_limited' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.speed_test_rate_limit() from public, anon, authenticated;

drop function public.submit_speed_test(uuid, numeric, numeric, integer, double precision, double precision, double precision, text);

create function public.submit_speed_test(
  p_place_id uuid,
  p_download_mbps numeric,
  p_upload_mbps numeric,
  p_ping_ms integer,
  p_lat double precision,
  p_lng double precision,
  p_accuracy_m double precision,
  p_network_type text,
  p_note text default null
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
  v_note text := nullif(btrim(p_note), '');
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
    lat, lng, accuracy_m, network_type, verification, ip_hash, note
  ) values (
    p_place_id, v_user, round(p_download_mbps, 1), round(p_upload_mbps, 1), p_ping_ms,
    v_verification = 'verified', round(v_distance)::int,
    case when v_has_fix then round(p_lat::numeric, 4) end,
    case when v_has_fix then round(p_lng::numeric, 4) end,
    round(p_accuracy_m)::int, v_network, v_verification, v_ip_hash, v_note
  );

  return query select v_verification, round(v_distance)::int;
end;
$$;

revoke all on function public.submit_speed_test(uuid, numeric, numeric, integer, double precision, double precision, double precision, text, text) from public, anon;
grant execute on function public.submit_speed_test(uuid, numeric, numeric, integer, double precision, double precision, double precision, text, text) to authenticated;

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
  note text
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.download_mbps, s.upload_mbps, s.ping_ms, s.on_site, s.created_at,
         s.user_id = auth.uid(),
         coalesce(pr.display_name, 'Cosurfer'),
         s.note
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
