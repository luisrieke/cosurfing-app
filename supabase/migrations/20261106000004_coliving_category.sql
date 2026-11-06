-- Colivings are a fourth place category. They are places to stay, and most of them only let
-- residents use the workspace, so they never show up in the default "All" ranking, the city
-- stats (place count, city score, median Wi-Fi) or the "rate a place" prompts. They have their
-- own tab and their own rank. Keep in sync with src/lib/types.ts.

alter table public.places drop constraint if exists places_category_check;
alter table public.places add constraint places_category_check
  check (category in ('coworking', 'cafe', 'library', 'coliving'));

alter table public.place_suggestions drop constraint if exists place_suggestions_category_check;
alter table public.place_suggestions add constraint place_suggestions_category_check
  check (category in ('coworking', 'cafe', 'library', 'coliving'));

-- What we know about a coliving's season and whether people who do not stay there can work there.
alter table public.places
  add column season text not null default 'unknown'
    check (season in ('year_round', 'seasonal', 'unknown')),
  add column season_note text check (season_note is null or char_length(season_note) <= 200),
  add column non_guest_work text not null default 'unknown'
    check (non_guest_work in ('yes', 'no', 'unknown')),
  add column non_guest_note text check (non_guest_note is null or char_length(non_guest_note) <= 200),
  add column min_stay text check (min_stay is null or char_length(min_stay) <= 60);

alter table public.cities add column coliving_count integer not null default 0;

create or replace function public.compute_place_score(p public.places, s public.place_rating_stats)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  c_prior constant numeric := 3;
  m_prior constant numeric := 3.5;
  n numeric := coalesce(p.review_count, 0);
  avg_rating numeric := coalesce(p.rating_avg, m_prior);
  bayes numeric;
  rev numeric;
  wifi numeric;
  power numeric;
  calls numeric;
  facts numeric;
  completeness numeric;
  cat numeric;
  has_price boolean;
  total numeric;
begin
  bayes := (c_prior * m_prior + n * avg_rating) / (c_prior + n);
  rev := greatest(0, least(1, (bayes - 1) / 4));

  if p.download_median_mbps is not null then
    wifi := least(1, ln(1 + p.download_median_mbps) / ln(101));
  elsif s.wifi_avg is not null then
    wifi := (s.wifi_avg - 1) / 4;
  elsif p.wifi = 'yes' then
    wifi := 0.5;
  elsif p.wifi = 'no' then
    wifi := 0;
  else
    wifi := 0.25;
  end if;

  if s.power_avg is not null then
    power := (s.power_avg - 1) / 4;
  else
    power := case p.power_outlets when 'plenty' then 1 when 'some' then 0.6 when 'none' then 0 else 0.3 end;
  end if;

  if s.calls_answers is not null and s.calls_answers > 0 then
    calls := s.calls_ok_count::numeric / s.calls_answers;
  else
    calls := case p.calls when 'yes' then 1 when 'limited' then 0.5 when 'no' then 0 else 0.3 end;
  end if;
  facts := (power + calls) / 2;

  has_price := p.day_pass_price_cents is not null or p.price_level is not null
    or (p.web_facts ? 'day_pass');
  completeness := (
    (case when p.opening_hours is not null then 1 else 0 end)
    + (case when p.website is not null then 1 else 0 end)
    + (case when p.address is not null then 1 else 0 end)
    + (case when has_price then 1 else 0 end)
  )::numeric / 4;

  cat := case p.category when 'coworking' then 1 when 'library' then 0.8 when 'coliving' then 0.8 else 0.5 end;

  total := 10 * (0.55 * rev + 0.20 * wifi + 0.10 * facts + 0.10 * completeness + 0.05 * cat);

  return jsonb_build_object(
    'score', round(total, 2),
    'reviews', round(rev * 10, 1),
    'wifi', round(wifi * 10, 1),
    'facts', round(facts * 10, 1),
    'completeness', round(completeness * 10, 1),
    'category', round(cat * 10, 1)
  );
end;
$$;

create or replace function public.refresh_city_stats(p_city uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.cities c
     set place_count = s.total,
         coworking_count = s.coworking,
         cafe_count = s.cafe,
         library_count = s.library,
         coliving_count = s.coliving,
         review_count = s.reviews,
         speed_test_count = s.tests,
         median_download_mbps = s.median_down,
         top_score = s.top,
         city_score = s.city_score
    from (
      select count(*) filter (where category <> 'coliving')::int as total,
             count(*) filter (where category = 'coworking')::int as coworking,
             count(*) filter (where category = 'cafe')::int as cafe,
             count(*) filter (where category = 'library')::int as library,
             count(*) filter (where category = 'coliving')::int as coliving,
             coalesce(sum(review_count) filter (where category <> 'coliving'), 0)::int as reviews,
             coalesce(sum(speed_test_count) filter (where category <> 'coliving'), 0)::int as tests,
             round((percentile_cont(0.5) within group (order by download_median_mbps)
               filter (where download_median_mbps is not null and category <> 'coliving'))::numeric, 1) as median_down,
             max(work_score) filter (where category <> 'coliving') as top,
             (
               select case when count(*) = 0 then null else round(sum(t.work_score) / 10, 2) end
               from (
                 select p2.work_score from public.places p2
                 where p2.city_id = p_city and p2.status = 'published' and p2.category <> 'coliving'
                 order by p2.work_score desc
                 limit 10
               ) t
             ) as city_score
      from public.places
      where city_id = p_city and status = 'published'
    ) s
   where c.id = p_city;
end;
$$;

-- "All" (p_category null) means places to work: colivings only appear on their own tab.
create or replace function public.get_city_ranking(
  p_city_id uuid,
  p_category text default null,
  p_sort text default 'score',
  p_wifi boolean default false,
  p_power boolean default false,
  p_calls boolean default false,
  p_q text default null,
  p_limit integer default 30,
  p_offset integer default 0
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
       and (case when p_category is null then p.category <> 'coliving' else p.category = p_category end)
  ),
  filtered as (
    select b.* from base b
     where (not p_wifi or b.wifi = 'yes' or b.download_median_mbps is not null)
       and (not p_power or b.power_outlets in ('plenty', 'some'))
       and (not p_calls or b.calls in ('yes', 'limited'))
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

-- A coliving is ranked among the city's colivings, every other place among the places to work.
create or replace function public.get_place_rank(p_place_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select 1 + count(*)::int
    from public.places me
    join public.places p
      on p.city_id = me.city_id
     and p.status = 'published'
     and p.id <> me.id
     and (p.category = 'coliving') = (me.category = 'coliving')
     and (p.work_score > me.work_score
       or (p.work_score = me.work_score and p.review_count > me.review_count)
       or (p.work_score = me.work_score and p.review_count = me.review_count and p.name < me.name))
   where me.id = p_place_id
     and me.status = 'published';
$$;

-- Onboarding asks people to rate places they have worked at, not places they would have to stay at.
create or replace function public.get_places_to_rate(p_city_id uuid, p_limit integer default 6)
returns table (id uuid, slug text, name text, category text, address text, work_score numeric, review_count integer)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.slug, p.name, p.category, p.address, p.work_score, p.review_count
    from public.places p
   where auth.uid() is not null
     and p.city_id = p_city_id
     and p.status = 'published'
     and p.category <> 'coliving'
     and not exists (select 1 from public.reviews r where r.place_id = p.id and r.user_id = auth.uid())
   order by p.work_score desc, p.review_count desc
   limit least(greatest(p_limit, 1), 20);
$$;

-- Coliving photos are public like coworking and library photos; only café photos stay a Plus feature.
drop policy if exists "full photos readable when allowed" on storage.objects;
create policy "full photos readable when allowed" on storage.objects
  for select using (
    bucket_id = 'place-photos'
    and (
      public.is_admin()
      or (storage.foldername(objects.name))[2] = (select auth.uid())::text
      or (
        (
          public.is_plus()
          or exists (
            select 1 from public.places p
             where p.id::text = (storage.foldername(objects.name))[1]
               and p.category in ('coworking', 'library', 'coliving')
               and p.status = 'published'
          )
        )
        and coalesce(public.place_photo_file_status(objects.name), 'approved') = 'approved'
      )
    )
  );
