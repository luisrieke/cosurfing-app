-- Admins can star place photos; every tap adds one. Photos with the most stars come first in the
-- gallery and become the cover in the ranking, ties keep the existing sort_order.
alter table public.place_photos add column stars integer not null default 0;

create index place_photos_place_stars_idx on public.place_photos (place_id, stars desc, sort_order)
  where status = 'approved';

create or replace function public.star_place_photo(p_photo_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stars integer;
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;
  update public.place_photos set stars = stars + 1 where id = p_photo_id returning stars into v_stars;
  return v_stars;
end;
$$;

revoke all on function public.star_place_photo(uuid) from public, anon;
grant execute on function public.star_place_photo(uuid) to authenticated;

-- Star counts are only returned to admins.
drop function public.get_place_photos(uuid);
create function public.get_place_photos(p_place_id uuid)
returns table (id uuid, sort_order integer, preview_path text, full_path text, stars integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status from public.places where places.id = p_place_id;
  if v_status is null then
    return;
  end if;
  if v_status <> 'published' and not public.is_admin() then
    return;
  end if;
  return query
    select ph.id, ph.sort_order, ph.preview_path, ph.full_path,
           case when public.is_admin() then ph.stars end
    from public.place_photos ph
    where ph.place_id = p_place_id and ph.status = 'approved'
    order by ph.stars desc, ph.sort_order asc, ph.created_at asc;
end;
$$;

revoke all on function public.get_place_photos(uuid) from public;
grant execute on function public.get_place_photos(uuid) to anon, authenticated;

-- Same as 20261110200000_structured_opening_hours.sql, with the cover picked by stars first.
create or replace function public.get_city_ranking(
  p_city_id uuid,
  p_category text default null,
  p_sort text default 'score',
  p_wifi boolean default false,
  p_power boolean default false,
  p_calls boolean default false,
  p_q text default null,
  p_limit integer default 30,
  p_offset integer default 0,
  p_reviewed boolean default false,
  p_open_now boolean default false,
  p_work_now boolean default false
)
returns table (
  id uuid, slug text, name text, name_local text, category text, address text, lat double precision,
  lng double precision, website text, opening_hours text, price_level integer, day_pass_price_cents integer,
  wifi text, power_outlets text, calls text, focus text, internet_fee text, outdoor_seating text,
  web_day_pass jsonb, download_median_mbps numeric, upload_median_mbps numeric, speed_test_count integer,
  rating_avg numeric, review_count integer, text_review_count integer, work_score numeric, score_rank bigint,
  cover_preview_path text, cover_full_path text, total_count bigint,
  hours jsonb, hours_status text, laptop_hours jsonb, laptop_source text
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with now_local as (
    select public.local_week_minute(c.timezone) as m from public.cities c where c.id = p_city_id
  ),
  base as (
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
       and (not (p_open_now or p_work_now) or coalesce(b.open_ranges @> (select m from now_local), false))
       and (not p_work_now or coalesce(b.laptop_ranges @> (select m from now_local), false))
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
         count(*) over () as total_count,
         f.hours, f.hours_status, f.laptop_hours, f.laptop_source
    from filtered f
    left join lateral (
      select x.preview_path, x.full_path from public.place_photos x
       where x.place_id = f.id and x.status = 'approved'
       order by x.stars desc, x.sort_order asc, x.created_at asc limit 1
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

revoke all on function public.get_city_ranking(uuid, text, text, boolean, boolean, boolean, text, integer, integer, boolean, boolean, boolean) from public;
grant execute on function public.get_city_ranking(uuid, text, text, boolean, boolean, boolean, text, integer, integer, boolean, boolean, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Map: places in the viewport, with the same time filters
