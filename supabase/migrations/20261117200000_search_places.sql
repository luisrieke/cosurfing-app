-- Global place search, for the search field on the map and the city list.
--
-- Every word of the query has to appear in the place name, its city, its country or its address, in
-- any order ("naad paris", "paris naad" and "coffee 11e" all find Naad Coffee in Paris). Accents and
-- case are ignored, like in list_cities and get_city_ranking. Names that start with the query come
-- first, then names that contain it as a word, then the best work score.

create or replace function public.search_places(p_q text, p_limit integer default 8)
returns table (
  id uuid,
  slug text,
  name text,
  category text,
  address text,
  lat double precision,
  lng double precision,
  work_score numeric,
  review_count integer,
  city_slug text,
  city_name text,
  country_name text
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with q as (
    select lower(extensions.unaccent(trim(coalesce(p_q, '')))) as phrase,
           coalesce(
             (select array_agg(regexp_replace(t, '([\\%_])', '\\\1', 'g'))
                from unnest(regexp_split_to_array(lower(extensions.unaccent(trim(coalesce(p_q, '')))), '\s+')) t
               where t <> ''),
             '{}'
           ) as tokens
  ),
  hits as (
    select p.id, p.slug, p.name, p.category, p.address, p.lat, p.lng, p.work_score, p.review_count,
           c.slug as city_slug, c.name as city_name, c.country_name,
           lower(extensions.unaccent(p.name)) as lname
      from public.places p
      join public.cities c on c.id = p.city_id
     where p.status = 'published'
       and c.status = 'active'
       and char_length((select phrase from q)) >= 2
       and not exists (
         select 1
           from unnest((select tokens from q)) t
          where lower(extensions.unaccent(p.name || ' ' || c.name || ' ' || c.country_name || ' ' || coalesce(p.address, '')))
                not like '%' || t || '%'
       )
  )
  select h.id, h.slug, h.name, h.category, h.address, h.lat, h.lng, h.work_score, h.review_count,
         h.city_slug, h.city_name, h.country_name
    from hits h
   order by
     case when h.lname like (select phrase from q) || '%' then 0
          when h.lname like '% ' || (select phrase from q) || '%' then 1
          else 2
     end,
     h.work_score desc,
     h.name
   limit least(greatest(coalesce(p_limit, 8), 1), 30);
$$;

revoke all on function public.search_places(text, integer) from public;
grant execute on function public.search_places(text, integer) to anon, authenticated;
