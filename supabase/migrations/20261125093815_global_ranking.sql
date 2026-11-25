-- Rankings across all cities (/rankings/cafes, /rankings/coworkings, /rankings/colivings) and the
-- data behind /sitemap.xml.

create index if not exists places_category_score_idx
  on public.places (category, work_score desc, review_count desc)
  where status = 'published';

-- Same row shape as get_city_ranking plus the city. Lists stop at the top 100 per category and continent,
-- with at most 5 places per city; equal scores go to nomad hotspots, then to cities with more reviews.
create or replace function public.get_global_ranking(
  p_category text,
  p_continent text default null,
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  id uuid, slug text, name text, name_local text, category text, address text, lat double precision,
  lng double precision, website text, opening_hours text, price_level integer, day_pass_price_cents integer,
  wifi text, power_outlets text, calls text, focus text, internet_fee text, outdoor_seating text,
  web_day_pass jsonb, download_median_mbps numeric, upload_median_mbps numeric, speed_test_count integer,
  rating_avg numeric, review_count integer, text_review_count integer, work_score numeric, score_rank bigint,
  cover_preview_path text, cover_full_path text, total_count bigint,
  hours jsonb, hours_status text, laptop_hours jsonb, laptop_source text,
  city_name text, city_slug text, country_name text, city_timezone text
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with candidates as (
    select p.*, c.name as c_name, c.slug as c_slug, c.country_name as c_country, c.timezone as c_timezone,
           c.is_hotspot as c_hotspot, c.review_count as c_reviews, c.population as c_population
      from public.places p
      join public.cities c on c.id = p.city_id
     where p.status = 'published'
       and p.category = p_category
       and c.status = 'active'
       and (p_continent is null or c.continent = p_continent)
     order by p.work_score desc, p.review_count desc, c.is_hotspot desc, c.review_count desc, c.population desc nulls last, p.name asc
     limit 3000
  ),
  top as (
    select * from (
      select x.*, row_number() over (
               partition by x.city_id
               order by x.work_score desc, x.review_count desc, x.name asc
             ) as city_pos
        from candidates x
    ) y
     where y.city_pos <= 5
     order by y.work_score desc, y.review_count desc, y.c_hotspot desc, y.c_reviews desc, y.c_population desc nulls last, y.name asc
     limit 100
  ),
  ranked as (
    select t.*,
           row_number() over (order by t.work_score desc, t.review_count desc, t.c_hotspot desc, t.c_reviews desc, t.c_population desc nulls last, t.name asc) as score_rank,
           count(*) over () as total_count
      from top t
  ),
  page as (
    select * from ranked r
     order by r.score_rank
     limit least(greatest(p_limit, 1), 100)
    offset greatest(p_offset, 0)
  )
  select f.id, f.slug, f.name, f.name_local, f.category, f.address, f.lat, f.lng, f.website, f.opening_hours,
         f.price_level, f.day_pass_price_cents, f.wifi, f.power_outlets, f.calls, f.focus, f.internet_fee,
         f.outdoor_seating, f.web_facts -> 'day_pass' as web_day_pass,
         f.download_median_mbps, f.upload_median_mbps, f.speed_test_count,
         f.rating_avg, f.review_count, f.text_review_count, f.work_score, f.score_rank,
         ph.preview_path as cover_preview_path,
         case when f.category <> 'cafe' or public.is_plus() or public.is_admin() then ph.full_path end as cover_full_path,
         f.total_count,
         f.hours, f.hours_status, f.laptop_hours, f.laptop_source,
         f.c_name, f.c_slug, f.c_country, f.c_timezone
    from page f
    left join lateral (
      select x.preview_path, x.full_path from public.place_photos x
       where x.place_id = f.id and x.status = 'approved'
       order by x.stars desc, x.sort_order asc, x.created_at asc limit 1
    ) ph on true
   order by f.score_rank;
$$;

revoke all on function public.get_global_ranking(text, text, integer, integer) from public;
grant execute on function public.get_global_ranking(text, text, integer, integer) to anon, authenticated;

-- Data for /sitemap.xml, returned as one JSON value because PostgREST caps row counts.
-- Without p_page: the cities with their category counts and the number of place pages.
-- With p_page (from 0): the slugs and last changes of that page of places.
create or replace function public.get_sitemap(p_page integer default null, p_page_size integer default 40000)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_page is null then jsonb_build_object(
      'cities', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 's', c.slug, 'u', c.crawled_at,
                 'cafe', c.cafe_count, 'coworking', c.coworking_count, 'coliving', c.coliving_count
               ) order by c.population desc nulls last), '[]'::jsonb)
          from public.cities c
         where c.status = 'active' and c.place_count + c.coliving_count > 0
      ),
      'place_pages', (
        select ceil(count(*)::numeric / greatest(p_page_size, 1))::integer
          from public.places p
          join public.cities c on c.id = p.city_id
         where p.status = 'published' and c.status = 'active'
      )
    )
    else (
      select coalesce(jsonb_agg(jsonb_build_object('s', x.slug, 'u', x.updated_at) order by x.slug), '[]'::jsonb)
        from (
          select p.slug, p.updated_at
            from public.places p
            join public.cities c on c.id = p.city_id
           where p.status = 'published' and c.status = 'active'
           order by p.slug
           limit greatest(p_page_size, 1)
          offset greatest(p_page, 0) * greatest(p_page_size, 1)
        ) x
    )
  end;
$$;

revoke all on function public.get_sitemap(integer, integer) from public;
grant execute on function public.get_sitemap(integer, integer) to anon, authenticated;
