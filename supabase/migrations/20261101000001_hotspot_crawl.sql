-- Small nomad hotspots next to bigger cities (Canggu next to Denpasar, Ponta do Sol next to Funchal).
--   claim_crawl_job   also returns is_hotspot and population, so the crawler can take every named café
--                     in small hotspots instead of only those tagged with wifi.
--   upsert_osm_places moves an already known place to the city being crawled when the place lies closer
--                     to that city's centre, so a new hotspot gets its places back from its neighbour.

drop function if exists public.claim_crawl_job();

create function public.claim_crawl_job()
returns table (
  job_id uuid,
  city_id uuid,
  city_slug text,
  city_name text,
  country_code text,
  lat double precision,
  lng double precision,
  radius_km numeric,
  is_hotspot boolean,
  population integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.crawl_jobs;
begin
  -- Jobs stuck in "running" (function timeout) go back to the queue.
  update public.crawl_jobs
     set status = 'queued', run_after = now() + interval '5 minutes'
   where status = 'running' and started_at < now() - interval '10 minutes' and attempts < 3;
  update public.crawl_jobs
     set status = 'failed', finished_at = now(), error = coalesce(error, 'timed out')
   where status = 'running' and started_at < now() - interval '10 minutes' and attempts >= 3;

  select * into j from public.crawl_jobs
   where status = 'queued' and run_after <= now()
   order by priority desc, created_at asc
   limit 1
   for update skip locked;
  if j.id is null then
    return;
  end if;
  update public.crawl_jobs set status = 'running', started_at = now(), attempts = attempts + 1 where id = j.id;
  update public.cities set crawl_status = 'running' where id = j.city_id;
  return query
    select j.id, c.id, c.slug, c.name, c.country_code, c.lat, c.lng, c.crawl_radius_km, c.is_hotspot, c.population
      from public.cities c where c.id = j.city_id;
end;
$$;

revoke all on function public.claim_crawl_job() from public, anon, authenticated;

-- Equirectangular distance; accurate enough to compare distances within one crawl area.
create or replace function public.approx_distance_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
parallel safe
set search_path = public
as $$
  select 6371 * sqrt(
    power(radians(lat2 - lat1), 2) + power(radians(lng2 - lng1) * cos(radians((lat1 + lat2) / 2)), 2)
  );
$$;

revoke all on function public.approx_distance_km(double precision, double precision, double precision, double precision) from public, anon, authenticated;

-- Merge crawled OpenStreetMap places into a city. Fields listed in locked_fields
-- (confirmed by an admin or users) are never overwritten.
create or replace function public.upsert_osm_places(p_city_id uuid, p_items jsonb, p_started_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  v_city public.cities;
  v_other public.cities;
  v_existing public.places;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_archived integer := 0;
  v_moved integer := 0;
  v_moved_from uuid[] := '{}';
  v_move boolean;
  v_lat double precision;
  v_lng double precision;
  lf text[];
  v_from uuid;
begin
  select * into v_city from public.cities where id = p_city_id;
  if v_city.id is null then
    raise exception 'city not found';
  end if;
  perform set_config('cosurfing.bulk', 'on', true);

  for item in select * from jsonb_array_elements(p_items) loop
    select * into v_existing from public.places
     where osm_type = item ->> 'osm_type' and osm_id = (item ->> 'osm_id')::bigint;
    if v_existing.id is null then
      insert into public.places (
        city_id, slug, name, name_local, category, status, source, osm_type, osm_id, osm_tags, osm_seen_at,
        address, lat, lng, website, phone, opening_hours, wifi, internet_fee, outdoor_seating, wheelchair
      ) values (
        p_city_id,
        public.place_slug(item ->> 'name', v_city.slug, (item ->> 'osm_id')::bigint),
        item ->> 'name',
        item ->> 'name_local',
        item ->> 'category',
        'published',
        'osm',
        item ->> 'osm_type',
        (item ->> 'osm_id')::bigint,
        item -> 'tags',
        now(),
        item ->> 'address',
        (item ->> 'lat')::double precision,
        (item ->> 'lng')::double precision,
        item ->> 'website',
        item ->> 'phone',
        item ->> 'opening_hours',
        coalesce(item ->> 'wifi', 'unknown'),
        coalesce(item ->> 'internet_fee', 'unknown'),
        coalesce(item ->> 'outdoor_seating', 'unknown'),
        coalesce(item ->> 'wheelchair', 'unknown')
      );
      v_inserted := v_inserted + 1;
    else
      lf := v_existing.locked_fields;
      v_move := false;
      if v_existing.city_id <> p_city_id and not ('city_id' = any(lf)) then
        select * into v_other from public.cities where id = v_existing.city_id;
        v_lat := coalesce((item ->> 'lat')::double precision, v_existing.lat);
        v_lng := coalesce((item ->> 'lng')::double precision, v_existing.lng);
        v_move := v_other.id is null
          or public.approx_distance_km(v_lat, v_lng, v_city.lat, v_city.lng)
             < public.approx_distance_km(v_lat, v_lng, v_other.lat, v_other.lng);
        if v_move then
          v_moved := v_moved + 1;
          if v_other.id is not null and not (v_other.id = any(v_moved_from)) then
            v_moved_from := v_moved_from || v_other.id;
          end if;
        end if;
      end if;
      update public.places set
        city_id = case when v_move then p_city_id else city_id end,
        name = case when 'name' = any(lf) then name else item ->> 'name' end,
        name_local = item ->> 'name_local',
        category = case when 'category' = any(lf) then category else item ->> 'category' end,
        osm_tags = item -> 'tags',
        osm_seen_at = now(),
        status = case when status = 'archived' and source = 'osm' and not ('status' = any(lf)) then 'published' else status end,
        address = case when 'address' = any(lf) then address else coalesce(item ->> 'address', address) end,
        lat = case when 'lat' = any(lf) then lat else (item ->> 'lat')::double precision end,
        lng = case when 'lng' = any(lf) then lng else (item ->> 'lng')::double precision end,
        website = case when 'website' = any(lf) then website else coalesce(item ->> 'website', website) end,
        phone = case when 'phone' = any(lf) then phone else coalesce(item ->> 'phone', phone) end,
        opening_hours = case when 'opening_hours' = any(lf) then opening_hours else coalesce(item ->> 'opening_hours', opening_hours) end,
        wifi = case when 'wifi' = any(lf) then wifi else coalesce(item ->> 'wifi', wifi) end,
        internet_fee = case when 'internet_fee' = any(lf) then internet_fee else coalesce(item ->> 'internet_fee', internet_fee) end,
        outdoor_seating = case when 'outdoor_seating' = any(lf) then outdoor_seating else coalesce(item ->> 'outdoor_seating', outdoor_seating) end,
        wheelchair = case when 'wheelchair' = any(lf) then wheelchair else coalesce(item ->> 'wheelchair', wheelchair) end
      where id = v_existing.id;
      v_updated := v_updated + 1;
    end if;
  end loop;

  -- Places that disappeared from OpenStreetMap and nobody reviewed are archived.
  with gone as (
    update public.places
       set status = 'archived'
     where city_id = p_city_id
       and source = 'osm'
       and status = 'published'
       and review_count = 0
       and speed_test_count = 0
       and (osm_seen_at is null or osm_seen_at < p_started_at)
       and not ('status' = any(locked_fields))
    returning 1
  )
  select count(*) into v_archived from gone;

  perform set_config('cosurfing.bulk', 'off', true);
  perform public.refresh_city_stats(p_city_id);
  foreach v_from in array v_moved_from loop
    perform public.refresh_city_stats(v_from);
  end loop;
  return jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'archived', v_archived, 'moved', v_moved);
end;
$$;

revoke all on function public.upsert_osm_places(uuid, jsonb, timestamptz) from public, anon, authenticated;
