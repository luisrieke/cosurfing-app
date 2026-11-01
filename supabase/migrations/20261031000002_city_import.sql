-- City import (GeoNames + nomad hotspots, see scripts/import-cities.mjs) and the helper that lets
-- pg_cron call the crawler edge functions.

-- Upsert cities from the import script. Existing rows are matched by GeoNames id, then by name + country
-- (Berlin and Parga existed before the import). Service role only.
create or replace function public.import_cities(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  v_id uuid;
  v_slug text;
  v_cc text;
  v_inserted integer := 0;
  v_updated integer := 0;
begin
  for item in select * from jsonb_array_elements(p_items) loop
    v_cc := upper(item ->> 'country_code');
    v_id := null;
    if item ? 'geonames_id' and item ->> 'geonames_id' is not null then
      select id into v_id from public.cities where geonames_id = (item ->> 'geonames_id')::int;
    end if;
    if v_id is null then
      select id into v_id from public.cities
       where lower(name) = lower(item ->> 'name') and upper(country_code) = v_cc;
    end if;

    if v_id is null then
      v_slug := item ->> 'slug';
      if exists (select 1 from public.cities where slug = v_slug) then
        v_slug := v_slug || '-' || lower(v_cc);
      end if;
      if exists (select 1 from public.cities where slug = v_slug) then
        v_slug := v_slug || '-' || coalesce(item ->> 'geonames_id', substr(md5(random()::text), 1, 6));
      end if;
      insert into public.cities (
        slug, name, country_code, country_name, lat, lng, zoom, status, geonames_id, population, continent,
        region, timezone, is_hotspot, crawl_radius_km, cover_url, cover_thumb_url, cover_attribution, cover_source_url
      ) values (
        v_slug,
        item ->> 'name',
        v_cc,
        item ->> 'country_name',
        (item ->> 'lat')::double precision,
        (item ->> 'lng')::double precision,
        coalesce((item ->> 'zoom')::int, 12),
        'active',
        (item ->> 'geonames_id')::int,
        (item ->> 'population')::int,
        item ->> 'continent',
        item ->> 'region',
        item ->> 'timezone',
        coalesce((item ->> 'is_hotspot')::boolean, false),
        coalesce((item ->> 'crawl_radius_km')::numeric, 10),
        item ->> 'cover_url',
        item ->> 'cover_thumb_url',
        item ->> 'cover_attribution',
        item ->> 'cover_source_url'
      );
      v_inserted := v_inserted + 1;
    else
      update public.cities set
        geonames_id = coalesce(geonames_id, (item ->> 'geonames_id')::int),
        country_name = coalesce(item ->> 'country_name', country_name),
        population = coalesce((item ->> 'population')::int, population),
        continent = coalesce(item ->> 'continent', continent),
        region = coalesce(item ->> 'region', region),
        timezone = coalesce(item ->> 'timezone', timezone),
        is_hotspot = is_hotspot or coalesce((item ->> 'is_hotspot')::boolean, false),
        crawl_radius_km = coalesce((item ->> 'crawl_radius_km')::numeric, crawl_radius_km),
        cover_url = coalesce(item ->> 'cover_url', cover_url),
        cover_thumb_url = coalesce(item ->> 'cover_thumb_url', cover_thumb_url),
        cover_attribution = coalesce(item ->> 'cover_attribution', cover_attribution),
        cover_source_url = coalesce(item ->> 'cover_source_url', cover_source_url),
        status = 'active'
      where id = v_id;
      v_updated := v_updated + 1;
    end if;
  end loop;

  return jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'queued', public.enqueue_due_crawls());
end;
$$;

revoke all on function public.import_cities(jsonb) from public, anon, authenticated;

create extension if not exists pg_net with schema extensions;

-- Fire-and-forget call of a crawler edge function (used by pg_cron).
create or replace function public.invoke_crawler(p_function text)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'crawler_secret';
  if v_url is null or v_secret is null then
    raise exception 'project_url / crawler_secret missing in vault';
  end if;
  return net.http_post(
    url := v_url || '/functions/v1/' || p_function,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-crawler-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 145000
  );
end;
$$;

revoke all on function public.invoke_crawler(text) from public, anon, authenticated;
