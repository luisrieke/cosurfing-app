-- Minimal stand-in for the production schema, enough to run the opening hours migration and its tests
-- on a plain Postgres (16+): scripts/test-hours-sql.sh.

create extension if not exists unaccent;
create schema if not exists extensions;
create schema if not exists auth;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;

create or replace function extensions.unaccent(text) returns text language sql immutable as $$ select public.unaccent($1) $$;
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create or replace function public.is_admin() returns boolean language sql stable as $$ select false $$;
create or replace function public.is_plus() returns boolean language sql stable as $$ select false $$;

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table public.cities (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  timezone text
);

create table public.places (
  id uuid primary key default gen_random_uuid(),
  city_id uuid references public.cities (id),
  slug text not null,
  name text not null,
  name_local text,
  category text not null,
  status text not null default 'published',
  source text,
  address text,
  lat double precision,
  lng double precision,
  website text,
  opening_hours text,
  laptop_rules text,
  price_level integer,
  day_pass_price_cents integer,
  wifi text,
  wifi_community text,
  power_outlets text,
  calls text,
  focus text,
  internet_fee text,
  outdoor_seating text,
  web_facts jsonb not null default '{}',
  locked_fields text[] not null default '{}',
  download_median_mbps numeric,
  upload_median_mbps numeric,
  speed_test_count integer not null default 0,
  rating_avg numeric,
  review_count integer not null default 0,
  text_review_count integer not null default 0,
  work_score numeric,
  score_breakdown jsonb,
  updated_at timestamptz not null default now()
);

create table public.place_rating_stats (
  place_id uuid primary key,
  wifi_avg numeric,
  power_avg numeric,
  calls_answers integer,
  calls_ok_count integer
);

create table public.place_facts (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id) on delete cascade,
  user_id uuid not null default gen_random_uuid(),
  key text not null,
  value jsonb not null,
  status text not null default 'approved',
  updated_at timestamptz not null default now()
);

create table public.place_photos (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null,
  preview_path text,
  full_path text,
  status text,
  sort_order integer default 0,
  created_at timestamptz default now()
);

-- Score as in production; compute_place_score is replaced by the migration.
create or replace function public.compute_place_score(p public.places, s public.place_rating_stats)
returns jsonb language sql stable as $$ select jsonb_build_object('score', 5) $$;

create or replace function public.places_set_score()
returns trigger language plpgsql as $$
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

create trigger places_score before insert or update on public.places
  for each row execute function public.places_set_score();
create trigger places_updated_at before update on public.places
  for each row execute function public.set_updated_at();

create or replace function public.get_city_ranking(
  p_city_id uuid, p_category text default null, p_sort text default 'score', p_wifi boolean default false,
  p_power boolean default false, p_calls boolean default false, p_q text default null,
  p_limit integer default 30, p_offset integer default 0
) returns table (id uuid) language sql as $$ select null::uuid $$;
