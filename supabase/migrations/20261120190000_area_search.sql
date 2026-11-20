-- Search by island, region and country: "Sicily" finds Palermo and Catania, "Mallorca" finds Palma,
-- "Malta" offers the whole country.
--
-- cities.region covers many regions (Sicily, Madeira, Crete) but not islands inside a region (Mallorca is
-- "Balearic Islands") and is empty for many towns (Canggu, Machico). public.areas fills that gap: a city
-- belongs to an area when it has the area's region, or when it lies in the area's box and its own region
-- does not say otherwise.

create table if not exists public.areas (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  kind text not null check (kind in ('island', 'region')),
  country_code text not null,
  -- Matches cities.region exactly; cities without a region fall back to the box.
  region text,
  -- Other spellings people search for (local, German, English).
  aliases text[] not null default '{}',
  south double precision not null,
  north double precision not null,
  west double precision not null,
  east double precision not null,
  created_at timestamptz not null default now(),
  check (south < north and west < east)
);

alter table public.areas enable row level security;

drop policy if exists "areas are public" on public.areas;
create policy "areas are public" on public.areas for select to anon, authenticated using (true);

create or replace function public.area_has_city(a public.areas, c public.cities)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select c.country_code = a.country_code
     and (
       (a.region is not null and c.region = a.region)
       or (c.lat between a.south and a.north and c.lng between a.west and a.east and (a.region is null or c.region is null))
     );
$$;

insert into public.areas (slug, name, kind, country_code, region, aliases, south, north, west, east) values
  -- Spain
  ('mallorca', 'Mallorca', 'island', 'ES', null, '{Majorca,Mallorka}', 39.10, 39.97, 2.30, 3.48),
  ('menorca', 'Menorca', 'island', 'ES', null, '{Minorca}', 39.79, 40.10, 3.79, 4.33),
  ('ibiza', 'Ibiza', 'island', 'ES', null, '{Eivissa}', 38.83, 39.12, 1.15, 1.63),
  ('formentera', 'Formentera', 'island', 'ES', null, '{}', 38.63, 38.81, 1.37, 1.59),
  ('balearic-islands', 'Balearic Islands', 'region', 'ES', 'Balearic Islands', '{Balearics,Baleares,Balearen,"Illes Balears"}', 38.60, 40.10, 1.10, 4.40),
  ('tenerife', 'Tenerife', 'island', 'ES', null, '{Teneriffa}', 27.99, 28.59, -16.93, -16.11),
  ('gran-canaria', 'Gran Canaria', 'island', 'ES', null, '{}', 27.73, 28.19, -15.84, -15.35),
  ('lanzarote', 'Lanzarote', 'island', 'ES', null, '{}', 28.83, 29.43, -13.89, -13.33),
  ('fuerteventura', 'Fuerteventura', 'island', 'ES', null, '{}', 28.04, 28.76, -14.52, -13.81),
  ('canary-islands', 'Canary Islands', 'region', 'ES', 'Canary Islands', '{Canaries,Canarias,Kanaren,"Kanarische Inseln"}', 27.60, 29.45, -18.20, -13.30),
  -- Portugal
  ('madeira', 'Madeira', 'island', 'PT', 'Madeira', '{}', 32.38, 33.13, -17.30, -16.27),
  ('azores', 'Azores', 'region', 'PT', 'Azores', '{Açores,Azoren}', 36.90, 39.75, -31.30, -24.75),
  ('algarve', 'Algarve', 'region', 'PT', 'Faro', '{}', 36.95, 37.55, -9.00, -7.38),
  -- Italy and France
  ('sicily', 'Sicily', 'island', 'IT', 'Sicily', '{Sicilia,Sizilien}', 35.40, 38.85, 11.90, 15.66),
  ('sardinia', 'Sardinia', 'island', 'IT', 'Sardinia', '{Sardegna,Sardinien}', 38.85, 41.32, 8.10, 9.85),
  ('corsica', 'Corsica', 'island', 'FR', null, '{Corse,Korsika}', 41.33, 43.03, 8.53, 9.57),
  -- Greece
  ('crete', 'Crete', 'island', 'GR', 'Crete', '{Kreta,Kriti}', 34.80, 35.70, 23.50, 26.35),
  ('corfu', 'Corfu', 'island', 'GR', null, '{Kerkyra,Korfu}', 39.35, 39.83, 19.62, 20.13),
  ('rhodes', 'Rhodes', 'island', 'GR', null, '{Rhodos,Rodos}', 35.85, 36.47, 27.68, 28.25),
  ('santorini', 'Santorini', 'island', 'GR', null, '{Thira,Thera}', 36.33, 36.49, 25.33, 25.50),
  ('naxos', 'Naxos', 'island', 'GR', null, '{}', 36.93, 37.21, 25.33, 25.60),
  -- Malta
  ('gozo', 'Gozo', 'island', 'MT', null, '{Għawdex,Ghawdex}', 36.00, 36.09, 14.18, 14.36),
  -- Indonesia
  ('bali', 'Bali', 'island', 'ID', 'Bali', '{}', -8.86, -8.05, 114.42, 115.72),
  ('lombok', 'Lombok', 'island', 'ID', null, '{}', -8.95, -8.08, 115.82, 116.75),
  ('gili-islands', 'Gili Islands', 'island', 'ID', null, '{Gilis}', -8.37, -8.33, 116.02, 116.09),
  -- Thailand
  ('koh-phangan', 'Koh Phangan', 'island', 'TH', null, '{"Ko Pha-ngan","Ko Phangan","Koh Pha Ngan",Phangan}', 9.66, 9.81, 99.95, 100.10),
  ('koh-samui', 'Koh Samui', 'island', 'TH', null, '{"Ko Samui",Samui}', 9.40, 9.60, 99.90, 100.10),
  ('koh-tao', 'Koh Tao', 'island', 'TH', null, '{"Ko Tao"}', 10.04, 10.14, 99.79, 99.86),
  ('koh-lanta', 'Koh Lanta', 'island', 'TH', null, '{"Ko Lanta",Lanta}', 7.45, 7.80, 98.95, 99.15),
  ('phuket', 'Phuket', 'island', 'TH', null, '{}', 7.75, 8.20, 98.25, 98.48),
  -- Elsewhere
  ('siargao', 'Siargao', 'island', 'PH', null, '{}', 9.65, 10.05, 125.95, 126.20),
  ('zanzibar', 'Zanzibar', 'island', 'TZ', null, '{Unguja,Sansibar}', -6.50, -5.70, 39.10, 39.60)
on conflict (slug) do nothing;

-- Islands, regions and countries whose name starts with the search term, for the search dropdown.
-- Only areas with places count. A region row is left out when it only repeats a city ("Berlin") or a
-- curated area ("Sicily"), and a country row when the country is a single city ("Singapore").
create or replace function public.search_areas(p_q text, p_limit integer default 3)
returns table(
  key text, kind text, name text, country_code text, country_name text, city_count integer, place_count integer,
  south double precision, north double precision, west double precision, east double precision
)
language sql
stable
security definer
set search_path to 'public', 'extensions'
as $$
  with q as (
    select lower(extensions.unaccent(trim(coalesce(p_q, '')))) as term
  ),
  p as (
    select term, replace(replace(replace(term, '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat
      from q
     where char_length(term) >= 2
  ),
  live as (
    select c.* from public.cities c where c.status = 'active' and c.place_count > 0
  ),
  curated as (
    select 'area:' || a.slug as key, a.kind, a.name, a.country_code, max(c.country_name) as country_name,
           count(*)::int as city_count, sum(c.place_count)::int as place_count,
           a.south, a.north, a.west, a.east,
           exists (select 1 from unnest(a.name || a.aliases) n where lower(extensions.unaccent(n)) = p.term) as exact
      from public.areas a
      cross join p
      join public.cities c on c.status = 'active' and c.place_count > 0 and public.area_has_city(a, c)
     where exists (select 1 from unnest(a.name || a.aliases) n where lower(extensions.unaccent(n)) like p.pat)
     group by a.id, p.term
  ),
  regions as (
    select 'region:' || c.country_code || ':' || c.region as key, 'region'::text as kind, c.region as name, c.country_code,
           max(c.country_name) as country_name, count(*)::int as city_count, sum(c.place_count)::int as place_count,
           min(c.lat) as south, max(c.lat) as north, min(c.lng) as west, max(c.lng) as east,
           lower(extensions.unaccent(c.region)) = p.term as exact
      from live c
      cross join p
     where c.region is not null
       and lower(extensions.unaccent(c.region)) like p.pat
     group by c.country_code, c.region, p.term
    having count(*) >= 2
  ),
  distinct_regions as (
    select r.*
      from regions r
     where not exists (
             select 1 from public.cities x
              where x.status = 'active' and x.country_code = r.country_code
                and lower(extensions.unaccent(x.name)) = lower(extensions.unaccent(r.name))
           )
       and not exists (
             select 1 from public.areas a
              where a.country_code = r.country_code
                and (a.region = r.name
                     or exists (select 1 from unnest(a.name || a.aliases) n
                                 where lower(extensions.unaccent(n)) = lower(extensions.unaccent(r.name))))
           )
  ),
  countries as (
    select 'country:' || c.country_code as key, 'country'::text as kind, max(c.country_name) as name, c.country_code,
           max(c.country_name) as country_name, count(*)::int as city_count, sum(c.place_count)::int as place_count,
           min(c.lat) as south, max(c.lat) as north, min(c.lng) as west, max(c.lng) as east,
           bool_or(lower(extensions.unaccent(c.country_name)) = p.term) as exact
      from live c
      cross join p
     where lower(extensions.unaccent(c.country_name)) like p.pat
     group by c.country_code, p.term
    having count(*) >= 2
  ),
  hits as (
    select * from curated
    union all select * from distinct_regions
    union all select * from countries
  )
  select h.key, h.kind, h.name, h.country_code, h.country_name, h.city_count, h.place_count, h.south, h.north, h.west, h.east
    from hits h
   order by h.exact desc, h.place_count desc, h.name
   limit least(greatest(coalesce(p_limit, 3), 1), 10);
$$;

-- Cities also match on their region and on the curated areas they belong to, from three letters on.
create or replace function public.list_cities(p_q text default null::text, p_continent text default null::text, p_sort text default 'score'::text, p_limit integer default 48, p_offset integer default 0)
returns table(id uuid, slug text, name text, country_code text, country_name text, region text, continent text, population integer, is_hotspot boolean, cover_url text, cover_thumb_url text, cover_attribution text, crawl_status text, place_count integer, coworking_count integer, cafe_count integer, library_count integer, review_count integer, speed_test_count integer, median_download_mbps numeric, top_score numeric, city_score numeric, total_count bigint)
language sql
stable
security definer
set search_path to 'public', 'extensions'
as $function$
  with q as (
    select nullif(lower(extensions.unaccent(trim(p_q))), '') as term
  ),
  area_hits as (
    select a
      from public.areas a
     where char_length((select term from q)) >= 3
       and exists (
             select 1 from unnest(a.name || a.aliases) n
              where lower(extensions.unaccent(n)) like (select term from q) || '%'
           )
  ),
  filtered as (
    -- Name matches rank by similarity; region, area and country matches (sim 0) follow in p_sort order.
    select c.*,
           case when (select term from q) is null then 0
                when lower(extensions.unaccent(c.name)) like '%' || (select term from q) || '%'
                  or extensions.similarity(lower(extensions.unaccent(c.name)), (select term from q)) > 0.35
                  then extensions.similarity(lower(extensions.unaccent(c.name)), (select term from q))
                else 0
           end as sim
      from public.cities c
     where c.status = 'active'
       and (p_continent is null or c.continent = p_continent)
       and (
         (select term from q) is null
         or lower(extensions.unaccent(c.name)) like '%' || (select term from q) || '%'
         or lower(extensions.unaccent(c.country_name)) like (select term from q) || '%'
         or extensions.similarity(lower(extensions.unaccent(c.name)), (select term from q)) > 0.35
         or (char_length((select term from q)) >= 3 and lower(extensions.unaccent(c.region)) like (select term from q) || '%')
         or exists (select 1 from area_hits h where public.area_has_city(h.a, c))
       )
  )
  select f.id, f.slug, f.name, f.country_code, f.country_name, f.region, f.continent, f.population, f.is_hotspot,
         f.cover_url, f.cover_thumb_url, f.cover_attribution, f.crawl_status,
         f.place_count, f.coworking_count, f.cafe_count, f.library_count, f.review_count, f.speed_test_count,
         f.median_download_mbps, f.top_score, f.city_score,
         count(*) over () as total_count
    from filtered f
   order by
     case when (select term from q) is not null then f.sim end desc nulls last,
     case when p_sort = 'name' then f.name end asc,
     case when p_sort = 'places' then f.place_count end desc,
     case when p_sort = 'wifi' then f.median_download_mbps end desc nulls last,
     case when p_sort = 'reviews' then f.review_count end desc,
     case when p_sort = 'population' then f.population end desc nulls last,
     case when p_sort = 'score' then f.city_score end desc nulls last,
     f.population desc nulls last,
     f.name asc
   limit least(greatest(p_limit, 1), 100)
  offset greatest(p_offset, 0);
$function$;
