-- Rankings platform: ~1,000 cities, crawled places (OpenStreetMap + websites), work score,
-- detailed reviews, crowd-sourced speed tests, contributor points and the crawl queue.
-- Keep in sync with src/lib/types.ts.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------------
-- Example data is gone for good: real data comes from the crawler and users.
-- ---------------------------------------------------------------------------

delete from public.places where is_example = true;

-- ---------------------------------------------------------------------------
-- Cities
-- ---------------------------------------------------------------------------

alter table public.cities
  add column geonames_id integer unique,
  add column population integer,
  add column continent text check (continent is null or continent in ('AF', 'AS', 'EU', 'NA', 'SA', 'OC', 'AN')),
  add column region text,
  add column timezone text,
  add column is_hotspot boolean not null default false,
  add column cover_url text,
  add column cover_thumb_url text,
  add column cover_attribution text,
  add column cover_source_url text,
  add column crawl_status text not null default 'pending'
    check (crawl_status in ('pending', 'running', 'done', 'failed')),
  add column crawled_at timestamptz,
  add column crawl_error text,
  add column crawl_radius_km numeric(5, 1) not null default 10,
  add column place_count integer not null default 0,
  add column coworking_count integer not null default 0,
  add column cafe_count integer not null default 0,
  add column library_count integer not null default 0,
  add column review_count integer not null default 0,
  add column speed_test_count integer not null default 0,
  add column median_download_mbps numeric(7, 1),
  add column top_score numeric(4, 2),
  add column city_score numeric(4, 2);

create index cities_population_idx on public.cities (population desc nulls last);
create index cities_city_score_idx on public.cities (city_score desc nulls last);
create index cities_continent_idx on public.cities (continent);

-- Every city in the database is browsable now. The waiting list stays for cities we do not have.
update public.cities set status = 'active';

-- ---------------------------------------------------------------------------
-- Places
-- ---------------------------------------------------------------------------

alter table public.places drop constraint places_category_check;
alter table public.places add constraint places_category_check
  check (category in ('coworking', 'cafe', 'library'));

alter table public.places
  add column source text not null default 'admin' check (source in ('osm', 'user', 'admin')),
  add column osm_type text check (osm_type is null or osm_type in ('node', 'way', 'relation')),
  add column osm_id bigint,
  add column osm_tags jsonb,
  add column osm_seen_at timestamptz,
  add column name_local text,
  add column phone text,
  add column internet_fee text not null default 'unknown'
    check (internet_fee in ('no', 'yes', 'customers', 'unknown')),
  add column outdoor_seating text not null default 'unknown'
    check (outdoor_seating in ('yes', 'no', 'unknown')),
  add column wheelchair text not null default 'unknown'
    check (wheelchair in ('yes', 'limited', 'no', 'unknown')),
  add column web_facts jsonb not null default '{}'::jsonb,
  add column web_crawl_status text not null default 'pending'
    check (web_crawl_status in ('pending', 'running', 'done', 'failed', 'blocked', 'skipped')),
  add column web_crawled_at timestamptz,
  add column locked_fields text[] not null default '{}',
  add column download_median_mbps numeric(7, 1),
  add column upload_median_mbps numeric(7, 1),
  add column ping_median_ms integer,
  add column speed_test_count integer not null default 0,
  add column last_speed_test_at timestamptz,
  add column text_review_count integer not null default 0,
  add column work_score numeric(4, 2) not null default 0,
  add column score_breakdown jsonb not null default '{}'::jsonb;

create unique index places_osm_idx on public.places (osm_type, osm_id) where osm_id is not null;
create index places_city_score_idx on public.places (city_id, status, work_score desc);
create index places_enrich_idx on public.places (web_crawl_status, web_crawled_at) where website is not null;

-- Aggregated detail ratings. Separate table so RLS can keep them for signed-in users only.
create table public.place_rating_stats (
  place_id uuid primary key references public.places (id) on delete cascade,
  wifi_avg numeric(3, 2),
  power_avg numeric(3, 2),
  quiet_avg numeric(3, 2),
  comfort_avg numeric(3, 2),
  value_avg numeric(3, 2),
  calls_ok_count integer not null default 0,
  calls_answers integer not null default 0,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Reviews: optional text, detail ratings
-- ---------------------------------------------------------------------------

alter table public.reviews drop constraint reviews_body_check;
alter table public.reviews alter column body drop not null;
alter table public.reviews add constraint reviews_body_check
  check (body is null or char_length(body) between 3 and 2000);

alter table public.reviews
  add column wifi_rating integer check (wifi_rating is null or wifi_rating between 1 and 5),
  add column power_rating integer check (power_rating is null or power_rating between 1 and 5),
  add column quiet_rating integer check (quiet_rating is null or quiet_rating between 1 and 5),
  add column comfort_rating integer check (comfort_rating is null or comfort_rating between 1 and 5),
  add column value_rating integer check (value_rating is null or value_rating between 1 and 5),
  add column calls_ok boolean,
  add column visited_at date;

-- ---------------------------------------------------------------------------
-- Speed tests
-- ---------------------------------------------------------------------------

create table public.speed_tests (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  download_mbps numeric(7, 2) not null check (download_mbps >= 0 and download_mbps <= 10000),
  upload_mbps numeric(7, 2) check (upload_mbps is null or (upload_mbps >= 0 and upload_mbps <= 10000)),
  ping_ms integer check (ping_ms is null or (ping_ms >= 0 and ping_ms <= 10000)),
  on_site boolean not null default false,
  distance_m integer,
  status text not null default 'visible' check (status in ('visible', 'hidden')),
  created_at timestamptz not null default now()
);

create index speed_tests_place_idx on public.speed_tests (place_id, created_at desc);
create index speed_tests_user_idx on public.speed_tests (user_id, created_at desc);

-- One test per user, place and hour.
create or replace function public.speed_test_rate_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1 from public.speed_tests s
    where s.user_id = new.user_id
      and s.place_id = new.place_id
      and s.created_at > now() - interval '1 hour'
  ) then
    raise exception 'speed_test_rate_limited' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger speed_tests_rate_limit
  before insert on public.speed_tests
  for each row execute function public.speed_test_rate_limit();

-- ---------------------------------------------------------------------------
-- Profiles: contributor stats + onboarding
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column points integer not null default 0,
  add column review_count integer not null default 0,
  add column speed_test_count integer not null default 0,
  add column home_city_id uuid references public.cities (id) on delete set null,
  add column onboarded_at timestamptz;

-- Clients may update their profile, but never their stats.
create or replace function public.protect_profile_stats()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.points := old.points;
    new.review_count := old.review_count;
    new.speed_test_count := old.speed_test_count;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_stats
  before update on public.profiles
  for each row execute function public.protect_profile_stats();

create or replace function public.refresh_profile_stats(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reviews integer;
  v_tests integer;
  v_suggestions integer;
begin
  if p_user is null then
    return;
  end if;
  select count(*) into v_reviews from public.reviews where user_id = p_user and status = 'visible';
  select count(*) into v_tests from public.speed_tests where user_id = p_user and status = 'visible';
  select count(*) into v_suggestions from public.place_suggestions where user_id = p_user and status <> 'rejected';
  update public.profiles
     set review_count = v_reviews,
         speed_test_count = v_tests,
         points = v_reviews * 10 + v_tests * 5 + v_suggestions * 5
   where id = p_user;
end;
$$;

-- ---------------------------------------------------------------------------
-- Crawl queue
-- ---------------------------------------------------------------------------

create table public.crawl_jobs (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities (id) on delete cascade,
  priority integer not null default 0,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  attempts integer not null default 0,
  run_after timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  error text,
  stats jsonb,
  created_at timestamptz not null default now()
);

create index crawl_jobs_queue_idx on public.crawl_jobs (status, priority desc, run_after);
create unique index crawl_jobs_one_open_per_city on public.crawl_jobs (city_id) where status in ('queued', 'running');

-- ---------------------------------------------------------------------------
-- Score
-- ---------------------------------------------------------------------------

-- Work score (0-10). Pure function of a place row plus its detail-rating stats.
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

  cat := case p.category when 'coworking' then 1 when 'library' then 0.8 else 0.5 end;

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

create or replace function public.places_set_score()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.place_rating_stats;
  b jsonb;
begin
  select * into s from public.place_rating_stats where place_id = new.id;
  b := public.compute_place_score(new, s);
  new.work_score := (b ->> 'score')::numeric;
  new.score_breakdown := b;
  return new;
end;
$$;

create trigger places_score
  before insert or update on public.places
  for each row execute function public.places_set_score();

-- City statistics, denormalised for the city grid.
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
         review_count = s.reviews,
         speed_test_count = s.tests,
         median_download_mbps = s.median_down,
         top_score = s.top,
         city_score = s.city_score
    from (
      select count(*)::int as total,
             count(*) filter (where category = 'coworking')::int as coworking,
             count(*) filter (where category = 'cafe')::int as cafe,
             count(*) filter (where category = 'library')::int as library,
             coalesce(sum(review_count), 0)::int as reviews,
             coalesce(sum(speed_test_count), 0)::int as tests,
             round((percentile_cont(0.5) within group (order by download_median_mbps)
               filter (where download_median_mbps is not null))::numeric, 1) as median_down,
             max(work_score) as top,
             -- Average of the top 10 with missing slots counted as 0, so a city needs depth to rank high.
             (
               select case when count(*) = 0 then null else round(sum(t.work_score) / 10, 2) end
               from (
                 select p2.work_score from public.places p2
                 where p2.city_id = p_city and p2.status = 'published'
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

create or replace function public.places_city_stats_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Bulk crawler upserts refresh the city once at the end instead of per row.
  if coalesce(current_setting('cosurfing.bulk', true), '') = 'on' then
    return null;
  end if;
  if tg_op = 'DELETE' then
    perform public.refresh_city_stats(old.city_id);
  else
    perform public.refresh_city_stats(new.city_id);
    if tg_op = 'UPDATE' and old.city_id is distinct from new.city_id then
      perform public.refresh_city_stats(old.city_id);
    end if;
  end if;
  return null;
end;
$$;

create trigger places_city_stats_insert_delete
  after insert or delete on public.places
  for each row execute function public.places_city_stats_trigger();

create trigger places_city_stats_update
  after update on public.places
  for each row
  when (
    old.status is distinct from new.status
    or old.category is distinct from new.category
    or old.work_score is distinct from new.work_score
    or old.review_count is distinct from new.review_count
    or old.speed_test_count is distinct from new.speed_test_count
    or old.download_median_mbps is distinct from new.download_median_mbps
    or old.city_id is distinct from new.city_id
  )
  execute function public.places_city_stats_trigger();

-- Reviews -> rating aggregates, detail stats, score, profile points.
create or replace function public.refresh_place_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  target := coalesce(new.place_id, old.place_id);
  -- The place itself is being deleted (cascade): nothing to aggregate.
  if not exists (select 1 from public.places where id = target) then
    perform public.refresh_profile_stats(coalesce(new.user_id, old.user_id));
    return null;
  end if;

  insert into public.place_rating_stats as prs (
    place_id, wifi_avg, power_avg, quiet_avg, comfort_avg, value_avg, calls_ok_count, calls_answers, updated_at
  )
  select target,
         round(avg(wifi_rating)::numeric, 2),
         round(avg(power_rating)::numeric, 2),
         round(avg(quiet_rating)::numeric, 2),
         round(avg(comfort_rating)::numeric, 2),
         round(avg(value_rating)::numeric, 2),
         count(*) filter (where calls_ok is true)::int,
         count(calls_ok)::int,
         now()
    from public.reviews
   where place_id = target and status = 'visible'
  on conflict (place_id) do update
    set wifi_avg = excluded.wifi_avg,
        power_avg = excluded.power_avg,
        quiet_avg = excluded.quiet_avg,
        comfort_avg = excluded.comfort_avg,
        value_avg = excluded.value_avg,
        calls_ok_count = excluded.calls_ok_count,
        calls_answers = excluded.calls_answers,
        updated_at = now();

  update public.places p
     set review_count = s.cnt,
         rating_avg = s.avg,
         text_review_count = s.text_cnt
    from (
      select count(*)::int as cnt,
             round(avg(rating)::numeric, 2) as avg,
             count(*) filter (where body is not null)::int as text_cnt
        from public.reviews
       where place_id = target and status = 'visible'
    ) s
   where p.id = target;

  perform public.refresh_profile_stats(coalesce(new.user_id, old.user_id));
  return null;
end;
$$;

-- Speed tests -> medians on the place, score, profile points.
create or replace function public.refresh_place_speed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  target := coalesce(new.place_id, old.place_id);
  update public.places p
     set download_median_mbps = s.down,
         upload_median_mbps = s.up,
         ping_median_ms = s.ping,
         speed_test_count = s.cnt,
         last_speed_test_at = s.last_at
    from (
      select round((percentile_cont(0.5) within group (order by download_mbps))::numeric, 1) as down,
             round((percentile_cont(0.5) within group (order by upload_mbps))::numeric, 1) as up,
             round(percentile_cont(0.5) within group (order by ping_ms))::int as ping,
             count(*)::int as cnt,
             max(created_at) as last_at
        from public.speed_tests
       where place_id = target
         and status = 'visible'
         and created_at > now() - interval '18 months'
    ) s
   where p.id = target;
  perform public.refresh_profile_stats(coalesce(new.user_id, old.user_id));
  return null;
end;
$$;

create trigger speed_tests_refresh
  after insert or update or delete on public.speed_tests
  for each row execute function public.refresh_place_speed();

create or replace function public.suggestions_refresh_points()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_profile_stats(coalesce(new.user_id, old.user_id));
  return null;
end;
$$;

create trigger place_suggestions_points
  after insert or update or delete on public.place_suggestions
  for each row execute function public.suggestions_refresh_points();

-- ---------------------------------------------------------------------------
-- RLS for new tables
-- ---------------------------------------------------------------------------

alter table public.place_rating_stats enable row level security;
alter table public.speed_tests enable row level security;
alter table public.crawl_jobs enable row level security;

-- Detail ratings: signed-in users only (anonymous visitors see them locked).
create policy "detail ratings for signed-in users" on public.place_rating_stats
  for select to authenticated using (true);

create policy "read own speed tests" on public.speed_tests
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "write own speed test" on public.speed_tests
  for insert to authenticated with check (
    user_id = auth.uid() and status = 'visible' and exists (
      select 1 from public.places p where p.id = place_id and p.status = 'published'
    )
  );
create policy "delete own speed test" on public.speed_tests
  for delete to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "admins moderate speed tests" on public.speed_tests
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "admins read crawl jobs" on public.crawl_jobs
  for select to authenticated using (public.is_admin());

-- Reviews: a hidden review must not be re-shown by its author.
drop policy "update own review" on public.reviews;
create policy "update own review" on public.reviews
  for update to authenticated using (user_id = auth.uid() or public.is_admin())
  with check (public.is_admin() or (user_id = auth.uid() and status = 'visible'));

-- Display names are shown on contributor lists, so profiles of contributors are public through RPCs only.

-- ---------------------------------------------------------------------------
-- Public RPCs
-- ---------------------------------------------------------------------------

create or replace function public.list_cities(
  p_q text default null,
  p_continent text default null,
  p_sort text default 'score',
  p_limit integer default 48,
  p_offset integer default 0
)
returns table (
  id uuid,
  slug text,
  name text,
  country_code text,
  country_name text,
  region text,
  continent text,
  population integer,
  is_hotspot boolean,
  cover_url text,
  cover_thumb_url text,
  cover_attribution text,
  crawl_status text,
  place_count integer,
  coworking_count integer,
  cafe_count integer,
  library_count integer,
  review_count integer,
  speed_test_count integer,
  median_download_mbps numeric,
  top_score numeric,
  city_score numeric,
  total_count bigint
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with q as (
    select nullif(trim(p_q), '') as term
  ),
  filtered as (
    select c.*,
           case when (select term from q) is null then 0
                else extensions.similarity(lower(extensions.unaccent(c.name)), lower(extensions.unaccent((select term from q))))
           end as sim
      from public.cities c
     where c.status = 'active'
       and (p_continent is null or c.continent = p_continent)
       and (
         (select term from q) is null
         or lower(extensions.unaccent(c.name)) like '%' || lower(extensions.unaccent((select term from q))) || '%'
         or lower(extensions.unaccent(c.country_name)) like lower(extensions.unaccent((select term from q))) || '%'
         or extensions.similarity(lower(extensions.unaccent(c.name)), lower(extensions.unaccent((select term from q)))) > 0.35
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
$$;

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
  id uuid,
  slug text,
  name text,
  name_local text,
  category text,
  address text,
  lat double precision,
  lng double precision,
  website text,
  opening_hours text,
  price_level integer,
  day_pass_price_cents integer,
  wifi text,
  power_outlets text,
  calls text,
  focus text,
  internet_fee text,
  outdoor_seating text,
  web_day_pass jsonb,
  download_median_mbps numeric,
  upload_median_mbps numeric,
  speed_test_count integer,
  rating_avg numeric,
  review_count integer,
  text_review_count integer,
  work_score numeric,
  score_rank bigint,
  cover_preview_path text,
  cover_full_path text,
  total_count bigint
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
       where x.place_id = f.id order by x.sort_order asc, x.created_at asc limit 1
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

-- Reviews: star ratings are public, everything else needs a (free) account.
drop function public.get_place_reviews(uuid);
create function public.get_place_reviews(p_place_id uuid)
returns table (
  id uuid,
  place_id uuid,
  user_id uuid,
  rating integer,
  body text,
  author_name text,
  author_points integer,
  wifi_rating integer,
  power_rating integer,
  quiet_rating integer,
  comfort_rating integer,
  value_rating integer,
  calls_ok boolean,
  visited_at date,
  has_body boolean,
  created_at timestamptz,
  updated_at timestamptz,
  is_locked boolean,
  is_own boolean,
  status text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_status text;
  v_uid uuid := auth.uid();
  v_unlocked boolean := auth.uid() is not null;
begin
  select places.status into v_status from public.places where places.id = p_place_id;
  if v_status is null then
    return;
  end if;
  if v_status <> 'published' and not public.is_admin() then
    return;
  end if;
  return query
    select r.id,
           r.place_id,
           case when r.user_id = v_uid or public.is_admin() then r.user_id end,
           r.rating,
           case when v_unlocked then r.body end,
           case when v_unlocked then coalesce(pr.display_name, 'Cosurfer') end,
           case when v_unlocked then pr.points end,
           case when v_unlocked then r.wifi_rating end,
           case when v_unlocked then r.power_rating end,
           case when v_unlocked then r.quiet_rating end,
           case when v_unlocked then r.comfort_rating end,
           case when v_unlocked then r.value_rating end,
           case when v_unlocked then r.calls_ok end,
           case when v_unlocked then r.visited_at end,
           r.body is not null,
           r.created_at,
           r.updated_at,
           not v_unlocked,
           coalesce(r.user_id = v_uid, false),
           r.status
      from public.reviews r
      left join public.profiles pr on pr.id = r.user_id
     where r.place_id = p_place_id
       and (r.status = 'visible' or r.user_id = v_uid or public.is_admin())
     order by (r.body is not null) desc, r.created_at desc;
end;
$$;

-- Individual speed tests: signed-in users only.
create or replace function public.get_place_speed_tests(p_place_id uuid)
returns table (
  id uuid,
  download_mbps numeric,
  upload_mbps numeric,
  ping_ms integer,
  on_site boolean,
  created_at timestamptz,
  is_own boolean,
  author_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.download_mbps, s.upload_mbps, s.ping_ms, s.on_site, s.created_at,
         s.user_id = auth.uid(),
         coalesce(pr.display_name, 'Cosurfer')
    from public.speed_tests s
    join public.places p on p.id = s.place_id and p.status = 'published'
    left join public.profiles pr on pr.id = s.user_id
   where auth.uid() is not null
     and s.place_id = p_place_id
     and (s.status = 'visible' or public.is_admin())
   order by s.created_at desc
   limit 50;
$$;

-- Top contributors of a city (display names only).
create or replace function public.get_city_contributors(p_city_id uuid, p_limit integer default 5)
returns table (
  display_name text,
  points integer,
  city_reviews bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(pr.display_name, 'Cosurfer'), pr.points, count(*) as city_reviews
    from public.reviews r
    join public.places p on p.id = r.place_id and p.city_id = p_city_id and p.status = 'published'
    join public.profiles pr on pr.id = r.user_id
   where r.status = 'visible'
   group by pr.id, pr.display_name, pr.points
   order by count(*) desc, pr.points desc
   limit least(greatest(p_limit, 1), 20);
$$;

-- Next places the signed-in user could rate (top of the ranking, not yet reviewed).
create or replace function public.get_places_to_rate(p_city_id uuid, p_limit integer default 6)
returns table (
  id uuid,
  slug text,
  name text,
  category text,
  address text,
  work_score numeric,
  review_count integer
)
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
     and not exists (select 1 from public.reviews r where r.place_id = p.id and r.user_id = auth.uid())
   order by p.work_score desc, p.review_count desc
   limit least(greatest(p_limit, 1), 20);
$$;

-- Visitors of a city that has not been crawled yet move it to the front of the queue.
create or replace function public.request_city_crawl(p_city_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.crawl_jobs
     set priority = greatest(priority, 1000), run_after = least(run_after, now())
   where city_id = p_city_id and status = 'queued';
  if not found then
    insert into public.crawl_jobs (city_id, priority)
    select c.id, 1000 from public.cities c
     where c.id = p_city_id and c.crawl_status in ('pending', 'failed')
       and not exists (select 1 from public.crawl_jobs j where j.city_id = c.id and j.status in ('queued', 'running'))
    on conflict do nothing;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Crawler RPCs (service role only)
-- ---------------------------------------------------------------------------

create or replace function public.claim_crawl_job()
returns table (
  job_id uuid,
  city_id uuid,
  city_slug text,
  city_name text,
  country_code text,
  lat double precision,
  lng double precision,
  radius_km numeric
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
    select j.id, c.id, c.slug, c.name, c.country_code, c.lat, c.lng, c.crawl_radius_km
      from public.cities c where c.id = j.city_id;
end;
$$;

create or replace function public.finish_crawl_job(p_job_id uuid, p_ok boolean, p_error text, p_stats jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.crawl_jobs;
begin
  select * into j from public.crawl_jobs where id = p_job_id;
  if j.id is null then
    return;
  end if;
  if p_ok then
    update public.crawl_jobs set status = 'done', finished_at = now(), error = null, stats = p_stats where id = j.id;
    update public.cities set crawl_status = 'done', crawled_at = now(), crawl_error = null where id = j.city_id;
  elsif j.attempts < 3 then
    update public.crawl_jobs
       set status = 'queued', error = p_error, run_after = now() + (j.attempts * interval '10 minutes')
     where id = j.id;
    update public.cities set crawl_status = 'pending', crawl_error = p_error where id = j.city_id;
  else
    update public.crawl_jobs set status = 'failed', finished_at = now(), error = p_error where id = j.id;
    update public.cities set crawl_status = 'failed', crawl_error = p_error where id = j.city_id;
  end if;
end;
$$;

create or replace function public.place_slug(p_name text, p_city_slug text, p_osm_id bigint)
returns text
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  base text;
  candidate text;
begin
  base := lower(extensions.unaccent(coalesce(p_name, '')));
  base := regexp_replace(base, '[^a-z0-9]+', '-', 'g');
  base := trim(both '-' from base);
  base := left(base, 50);
  base := trim(both '-' from base);
  if base = '' then
    base := 'place';
  end if;
  candidate := base || '-' || p_city_slug;
  if exists (select 1 from public.places where slug = candidate) then
    candidate := candidate || '-' || p_osm_id::text;
  end if;
  return candidate;
end;
$$;

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
  v_existing public.places;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_archived integer := 0;
  lf text[];
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
      update public.places set
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
  return jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'archived', v_archived);
end;
$$;

create or replace function public.claim_enrich_batch(p_limit integer default 20)
returns table (
  id uuid,
  name text,
  category text,
  website text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.places
     set web_crawl_status = 'pending'
   where web_crawl_status = 'running' and web_crawled_at < now() - interval '15 minutes';
  return query
    with picked as (
      select p.id from public.places p
       where p.website is not null
         and p.status = 'published'
         and (
           p.web_crawl_status = 'pending'
           or (p.web_crawl_status in ('done', 'failed', 'blocked') and p.web_crawled_at < now() - interval '90 days')
         )
       order by (p.web_crawl_status = 'pending') desc, p.work_score desc
       limit least(greatest(p_limit, 1), 50)
       for update skip locked
    )
    update public.places p
       set web_crawl_status = 'running', web_crawled_at = now()
      from picked
     where p.id = picked.id
    returning p.id, p.name, p.category, p.website;
end;
$$;

create or replace function public.save_web_facts(p_place_id uuid, p_status text, p_facts jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.places
     set web_crawl_status = p_status,
         web_crawled_at = now(),
         web_facts = case when p_status = 'done' then coalesce(p_facts, '{}'::jsonb) else web_facts end,
         opening_hours = case
           when opening_hours is null and not ('opening_hours' = any(locked_fields)) and p_facts ? 'opening_hours'
             then p_facts -> 'opening_hours' ->> 'value'
           else opening_hours end
   where id = p_place_id;
end;
$$;

-- Crawler shared secret lives in Vault; edge functions verify incoming cron calls against it.
create or replace function public.check_crawler_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = public, vault
as $$
  select coalesce(
    (select decrypted_secret = p_secret from vault.decrypted_secrets where name = 'crawler_secret' limit 1),
    false
  );
$$;

-- Re-crawl every city every 30 days (big cities first).
create or replace function public.enqueue_due_crawls()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  insert into public.crawl_jobs (city_id, priority)
  select c.id,
         case when c.crawl_status = 'pending' then 100 else 0 end
           + least(coalesce(c.population, 0) / 1000000, 40)
           + case when c.is_hotspot then 60 else 0 end
    from public.cities c
   where c.status = 'active'
     and (c.crawled_at is null or c.crawled_at < now() - interval '30 days')
     and not exists (select 1 from public.crawl_jobs j where j.city_id = c.id and j.status in ('queued', 'running'))
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin RPCs
-- ---------------------------------------------------------------------------

create or replace function public.admin_requeue_city(p_city_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;
  update public.crawl_jobs set priority = 2000, run_after = now() where city_id = p_city_id and status = 'queued';
  if not found then
    insert into public.crawl_jobs (city_id, priority)
    select p_city_id, 2000
     where not exists (select 1 from public.crawl_jobs where city_id = p_city_id and status = 'running');
  end if;
end;
$$;

create or replace function public.admin_requeue_enrich(p_city_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;
  perform set_config('cosurfing.bulk', 'on', true);
  update public.places set web_crawl_status = 'pending'
   where city_id = p_city_id and website is not null and web_crawl_status <> 'running';
  get diagnostics n = row_count;
  perform set_config('cosurfing.bulk', 'off', true);
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function public.speed_test_rate_limit() from public, anon, authenticated;
revoke all on function public.protect_profile_stats() from public, anon, authenticated;
revoke all on function public.places_set_score() from public, anon, authenticated;
revoke all on function public.places_city_stats_trigger() from public, anon, authenticated;
revoke all on function public.refresh_place_speed() from public, anon, authenticated;
revoke all on function public.suggestions_refresh_points() from public, anon, authenticated;
revoke all on function public.refresh_place_rating() from public, anon, authenticated;
revoke all on function public.refresh_profile_stats(uuid) from public, anon, authenticated;
revoke all on function public.refresh_city_stats(uuid) from public, anon, authenticated;
revoke all on function public.compute_place_score(public.places, public.place_rating_stats) from public, anon, authenticated;
revoke all on function public.place_slug(text, text, bigint) from public, anon, authenticated;

-- Service role only (crawler).
revoke all on function public.claim_crawl_job() from public, anon, authenticated;
revoke all on function public.finish_crawl_job(uuid, boolean, text, jsonb) from public, anon, authenticated;
revoke all on function public.upsert_osm_places(uuid, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.claim_enrich_batch(integer) from public, anon, authenticated;
revoke all on function public.save_web_facts(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.check_crawler_secret(text) from public, anon, authenticated;
revoke all on function public.enqueue_due_crawls() from public, anon, authenticated;

-- Signed-in only (functions check is_admin / auth.uid themselves).
revoke all on function public.admin_requeue_city(uuid) from public, anon;
revoke all on function public.admin_requeue_enrich(uuid) from public, anon;
revoke all on function public.get_places_to_rate(uuid, integer) from public, anon;

-- Public.
grant execute on function public.list_cities(text, text, text, integer, integer) to anon, authenticated;
grant execute on function public.get_city_ranking(uuid, text, text, boolean, boolean, boolean, text, integer, integer) to anon, authenticated;
grant execute on function public.get_place_reviews(uuid) to anon, authenticated;
grant execute on function public.get_place_speed_tests(uuid) to anon, authenticated;
grant execute on function public.get_city_contributors(uuid, integer) to anon, authenticated;
grant execute on function public.request_city_crawl(uuid) to anon, authenticated;
