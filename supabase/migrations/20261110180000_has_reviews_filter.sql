-- "Has reviews" filter: places with at least one visible review.
-- places.review_count is maintained by refresh_place_rating() and only counts reviews with status 'visible',
-- so pending, rejected, hidden and deleted reviews never make a place match.

-- Repair any counter that drifted from the reviews it summarises (no-op when everything is in sync).
update public.places p
   set review_count = s.cnt,
       rating_avg = s.avg,
       text_review_count = s.text_cnt
  from (
    select pl.id,
           count(r.id)::int as cnt,
           round(avg(r.rating)::numeric, 2) as avg,
           (count(r.id) filter (where r.body is not null))::int as text_cnt
      from public.places pl
      left join public.reviews r on r.place_id = pl.id and r.status = 'visible'
     group by pl.id
  ) s
 where p.id = s.id
   and (p.review_count is distinct from s.cnt
     or p.rating_avg is distinct from s.avg
     or p.text_review_count is distinct from s.text_cnt);

-- The map asks for reviewed places inside the visible area.
create index if not exists places_published_reviewed_lat_lng_idx
  on public.places (lat, lng)
  where status = 'published' and review_count > 0;

drop function if exists public.get_city_ranking(uuid, text, text, boolean, boolean, boolean, text, integer, integer);

create function public.get_city_ranking(
  p_city_id uuid,
  p_category text default null,
  p_sort text default 'score',
  p_wifi boolean default false,
  p_power boolean default false,
  p_calls boolean default false,
  p_q text default null,
  p_limit integer default 30,
  p_offset integer default 0,
  p_reviewed boolean default false
)
returns table (
  id uuid, slug text, name text, name_local text, category text, address text, lat double precision,
  lng double precision, website text, opening_hours text, price_level integer, day_pass_price_cents integer,
  wifi text, power_outlets text, calls text, focus text, internet_fee text, outdoor_seating text,
  web_day_pass jsonb, download_median_mbps numeric, upload_median_mbps numeric, speed_test_count integer,
  rating_avg numeric, review_count integer, text_review_count integer, work_score numeric, score_rank bigint,
  cover_preview_path text, cover_full_path text, total_count bigint
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with base as (
    select p.*,
           rank() over (order by p.work_score desc) as score_rank
      from public.places p
     where p.city_id = p_city_id
       and p.status = 'published'
       and (p_category is null or p.category = p_category)
  ),
  filtered as (
    select b.* from base b
     where (not p_wifi or b.wifi = 'yes' or b.download_median_mbps is not null)
       and (not p_power or b.power_outlets in ('plenty', 'some'))
       and (not p_calls or b.calls in ('yes', 'limited'))
       and (not p_reviewed or b.review_count > 0)
       and (
         nullif(trim(p_q), '') is null
         or lower(extensions.unaccent(b.name)) like '%' || lower(extensions.unaccent(trim(p_q))) || '%'
         or lower(extensions.unaccent(coalesce(b.address, ''))) like '%' || lower(extensions.unaccent(trim(p_q))) || '%'
       )
  )
  select f.id, f.slug, f.name, f.name_local, f.category, f.address, f.lat, f.lng, f.website, f.opening_hours,
         f.price_level, f.day_pass_price_cents, f.wifi, f.power_outlets, f.calls, f.focus, f.internet_fee,
         f.outdoor_seating, f.web_facts -> 'day_pass' as web_day_pass,
         f.download_median_mbps, f.upload_median_mbps, f.speed_test_count,
         f.rating_avg, f.review_count, f.text_review_count, f.work_score, f.score_rank,
         ph.preview_path as cover_preview_path,
         case when f.category <> 'cafe' or public.is_plus() or public.is_admin() then ph.full_path end as cover_full_path,
         count(*) over () as total_count
    from filtered f
    left join lateral (
      select x.preview_path, x.full_path from public.place_photos x
       where x.place_id = f.id and x.status = 'approved'
       order by x.sort_order asc, x.created_at asc limit 1
    ) ph on true
   order by
     case when p_sort = 'rating' then f.rating_avg end desc nulls last,
     case when p_sort = 'wifi' then f.download_median_mbps end desc nulls last,
     case when p_sort = 'reviews' then f.review_count end desc,
     case when p_sort = 'name' then f.name end asc,
     f.work_score desc,
     f.review_count desc,
     f.name asc
   limit least(greatest(p_limit, 1), 100)
  offset greatest(p_offset, 0);
$$;

grant execute on function public.get_city_ranking(uuid, text, text, boolean, boolean, boolean, text, integer, integer, boolean) to anon, authenticated;
