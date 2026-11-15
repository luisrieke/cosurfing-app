-- Mallorca: sort places into the more specific towns added to scripts/data/nomad-hotspots.json
-- (Sa Pobla, Muro, Can Picafort, Campanet, Lloseta, Andratx, Magaluf, Port de Sóller, Porto Cristo ...).
--
-- The crawler never moves a place that is already on the map: a place first crawled for Inca stays in Inca
-- even after Lloseta or Selva exist. rehome_places_nearest_city() does that move once the new cities have
-- been imported (import-cities.mjs):
--   * a place goes to the nearest of the given cities when it lies inside that city's crawl radius and
--     the city is one of p_into_slugs (the newly added towns), or
--   * when its current city is too far away (curated places and colivings that were put in the nearest
--     city before a closer town existed: the Búger and Llubí colivings sat in Palma, 35 km away).
-- Places inside the radius of their current city are otherwise left where they are. Slugs and everything
-- else on the place stay as they are, so links keep working. Cities that do not exist yet are skipped, so
-- the function can be run again after each import:
--
--   select public.rehome_places_nearest_city(<all Mallorca slugs>, <new slugs>);

create or replace function public.rehome_places_nearest_city(p_city_slugs text[], p_into_slugs text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moved integer;
  v_city uuid;
  v_affected uuid[];
begin
  perform set_config('cosurfing.bulk', 'on', true);

  with region as (
    select id, slug, lat, lng, crawl_radius_km from public.cities where slug = any(p_city_slugs)
  ),
  best as (
    select p.id as place_id,
           p.city_id as old_city,
           b.id as new_city,
           b.slug as new_slug,
           b.dist as new_dist,
           public.approx_distance_km(p.lat, p.lng, cur.lat, cur.lng) as cur_dist,
           cur.crawl_radius_km as cur_radius
      from public.places p
      join region cur on cur.id = p.city_id
      cross join lateral (
        select r.id, r.slug, public.approx_distance_km(p.lat, p.lng, r.lat, r.lng) as dist, r.crawl_radius_km
          from region r
         order by public.approx_distance_km(p.lat, p.lng, r.lat, r.lng)
         limit 1
      ) b
     where b.dist <= b.crawl_radius_km
       and b.id <> p.city_id
  ),
  moved as (
    update public.places p
       set city_id = best.new_city
      from best
     where p.id = best.place_id
       and (best.new_slug = any(p_into_slugs) or best.cur_dist > best.cur_radius)
    returning p.id, best.old_city, best.new_city
  )
  select count(distinct id),
         coalesce(array_agg(distinct c), '{}')
    into v_moved, v_affected
    from (
      select id, old_city as c from moved
      union all
      select id, new_city from moved
    ) s;

  perform set_config('cosurfing.bulk', 'off', true);
  foreach v_city in array v_affected loop
    perform public.disambiguate_place_names(v_city);
    perform public.refresh_city_stats(v_city);
  end loop;
  return v_moved;
end;
$$;

revoke all on function public.rehome_places_nearest_city(text[], text[]) from public, anon, authenticated;

select public.rehome_places_nearest_city(
  array[
    'palma', 'soller', 'pollenca', 'port-de-pollenca', 'alcudia', 'port-d-andratx', 'peguera', 'santa-ponca',
    'palmanova', 'valldemossa', 'esporles', 'santa-maria-del-cami', 'inca', 'sineu', 'arta', 'cala-ratjada',
    'manacor', 'felanitx', 'santanyi', 'ses-salines', 'campos', 'platja-de-palma',
    'sa-pobla', 'muro', 'can-picafort', 'santa-margalida', 'campanet', 'selva', 'llubi', 'binissalem', 'lloseta',
    'alaro', 'consell', 'bunyola', 'marratxi', 'algaida', 'montuiri', 'petra', 'vilafranca-de-bonany', 'porreres',
    'llucmajor', 'andratx', 'magaluf', 'portals-nous', 'port-de-soller', 'son-servera', 'cala-millor',
    'sant-llorenc-des-cardassar', 'porto-cristo', 'cala-d-or', 'portocolom', 'colonia-de-sant-jordi'
  ],
  array[
    'sa-pobla', 'muro', 'can-picafort', 'santa-margalida', 'campanet', 'selva', 'llubi', 'binissalem', 'lloseta',
    'alaro', 'consell', 'bunyola', 'marratxi', 'algaida', 'montuiri', 'petra', 'vilafranca-de-bonany', 'porreres',
    'llucmajor', 'andratx', 'magaluf', 'portals-nous', 'port-de-soller', 'son-servera', 'cala-millor',
    'sant-llorenc-des-cardassar', 'porto-cristo', 'cala-d-or', 'portocolom', 'colonia-de-sant-jordi'
  ]
);
