-- import_cities: match by name + country first, and let a hotspot that borrowed a neighbour's GeoNames id
-- (St. Julian's borrows Sliema's) not swallow other towns that borrow or own the same id (Sliema, Gżira,
-- Msida). geonames_id is unique, so an id that another row already holds is left out for the new row.

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
  v_geonames_taken boolean := false;
  v_inserted integer := 0;
  v_updated integer := 0;
begin
  for item in select * from jsonb_array_elements(p_items) loop
    v_cc := upper(item ->> 'country_code');
    v_id := null;
    select id into v_id from public.cities
     where lower(name) = lower(item ->> 'name') and upper(country_code) = v_cc
     limit 1;
    if v_id is null and item ->> 'geonames_id' is not null then
      -- Hotspots borrow the GeoNames id of a neighbouring town; a row that is already a hotspot under
      -- another name keeps its id instead of swallowing the new town.
      select id into v_id from public.cities
       where geonames_id = (item ->> 'geonames_id')::int and not coalesce(is_hotspot, false);
      v_geonames_taken := v_id is null and exists (
        select 1 from public.cities where geonames_id = (item ->> 'geonames_id')::int
      );
    else
      v_geonames_taken := false;
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
        case when v_geonames_taken then null else (item ->> 'geonames_id')::int end,
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
        geonames_id = coalesce(
          geonames_id,
          (select (item ->> 'geonames_id')::int
            where not exists (select 1 from public.cities c where c.geonames_id = (item ->> 'geonames_id')::int))
        ),
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
