-- Cosurfing initial schema
-- Applied to the Supabase project via the dashboard / MCP. Keep in sync with src/lib/types.ts.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cities
-- ---------------------------------------------------------------------------

create table public.cities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  country_code text not null check (char_length(country_code) = 2),
  country_name text not null,
  lat double precision not null,
  lng double precision not null,
  zoom integer not null default 12,
  status text not null default 'waitlist' check (status in ('active', 'waitlist')),
  created_at timestamptz not null default now()
);

create unique index cities_name_country_idx on public.cities (lower(name), upper(country_code));
create index cities_status_idx on public.cities (status);

-- ---------------------------------------------------------------------------
-- Profiles + admins + entitlements
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 40),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select true from public.admin_users where user_id = auth.uid() limit 1),
    false
  );
$$;

create table public.entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  status text not null default 'inactive' check (status in ('active', 'inactive')),
  source text not null check (source in ('stripe', 'revenuecat', 'dev')),
  stripe_customer_id text,
  stripe_subscription_id text,
  revenuecat_app_user_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

create index entitlements_stripe_customer_idx on public.entitlements (stripe_customer_id);

create trigger entitlements_updated_at
  before update on public.entitlements
  for each row execute function public.set_updated_at();

-- Plus status with a one day grace period around renewals.
create or replace function public.is_plus(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select true
      from public.entitlements e
      where e.user_id = uid
        and e.status = 'active'
        and (e.current_period_end is null or e.current_period_end > now() - interval '1 day')
      limit 1
    ),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- Places + photos
-- ---------------------------------------------------------------------------

create table public.places (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities (id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 120),
  category text not null check (category in ('coworking', 'cafe')),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  description text,
  address text,
  lat double precision not null,
  lng double precision not null,
  website text,
  opening_hours text,
  price_level integer check (price_level is null or price_level between 1 and 3),
  day_pass_price_cents integer check (day_pass_price_cents is null or day_pass_price_cents >= 0),
  wifi text not null default 'unknown' check (wifi in ('yes', 'no', 'unknown')),
  power_outlets text not null default 'unknown' check (power_outlets in ('plenty', 'some', 'none', 'unknown')),
  focus text not null default 'unknown' check (focus in ('great', 'okay', 'poor', 'unknown')),
  calls text not null default 'unknown' check (calls in ('yes', 'limited', 'no', 'unknown')),
  laptop_rules text,
  last_verified_at date,
  is_example boolean not null default false,
  review_count integer not null default 0,
  rating_avg numeric(3, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index places_city_status_idx on public.places (city_id, status);
create index places_category_idx on public.places (category);

create trigger places_updated_at
  before update on public.places
  for each row execute function public.set_updated_at();

create table public.place_photos (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id) on delete cascade,
  sort_order integer not null default 0,
  full_path text not null,
  preview_path text not null,
  width integer,
  height integer,
  created_at timestamptz not null default now()
);

create index place_photos_place_idx on public.place_photos (place_id, sort_order);

-- ---------------------------------------------------------------------------
-- Reviews, favorites, suggestions, reports
-- ---------------------------------------------------------------------------

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  body text not null check (char_length(body) between 10 and 2000),
  status text not null default 'visible' check (status in ('visible', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (place_id, user_id)
);

create index reviews_place_idx on public.reviews (place_id, status);
create index reviews_user_idx on public.reviews (user_id);

create trigger reviews_updated_at
  before update on public.reviews
  for each row execute function public.set_updated_at();

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
  update public.places p
  set review_count = s.cnt,
      rating_avg = s.avg
  from (
    select count(*)::int as cnt, round(avg(rating)::numeric, 2) as avg
    from public.reviews
    where place_id = target and status = 'visible'
  ) s
  where p.id = target;
  return null;
end;
$$;

create trigger reviews_refresh_rating
  after insert or update or delete on public.reviews
  for each row execute function public.refresh_place_rating();

create table public.favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  place_id uuid not null references public.places (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, place_id)
);

create table public.place_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  city_id uuid references public.cities (id) on delete set null,
  city_text text,
  name text not null check (char_length(name) between 1 and 120),
  category text not null check (category in ('coworking', 'cafe')),
  address text,
  website text,
  notes text check (notes is null or char_length(notes) <= 2000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index place_suggestions_status_idx on public.place_suggestions (status, created_at desc);

create table public.place_reports (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 5 and 2000),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now()
);

create index place_reports_status_idx on public.place_reports (status, created_at desc);

-- ---------------------------------------------------------------------------
-- City waiting lists (written only by the waitlist edge function)
-- ---------------------------------------------------------------------------

create table public.city_waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities (id) on delete cascade,
  email text not null check (email = lower(email)),
  first_name text check (first_name is null or char_length(first_name) <= 60),
  status text not null default 'pending' check (status in ('pending', 'verified', 'left')),
  confirm_token_hash text,
  confirm_token_expires_at timestamptz,
  leave_token_hash text,
  verified_at timestamptz,
  left_at timestamptz,
  ambassador_email_status text not null default 'not_sent'
    check (ambassador_email_status in ('not_sent', 'sent', 'failed')),
  ambassador_email_error text,
  ambassador_email_sent_at timestamptz,
  resend_email_id text,
  ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (city_id, email)
);

create index city_waitlist_entries_city_idx on public.city_waitlist_entries (city_id, status);
create index city_waitlist_entries_confirm_idx on public.city_waitlist_entries (confirm_token_hash);
create index city_waitlist_entries_leave_idx on public.city_waitlist_entries (leave_token_hash);

create trigger city_waitlist_entries_updated_at
  before update on public.city_waitlist_entries
  for each row execute function public.set_updated_at();

-- Simple fixed-window rate limiting used by edge functions (service role only).
create table public.rate_limits (
  key text primary key,
  count integer not null default 0,
  window_start timestamptz not null default now()
);

create or replace function public.consume_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count integer;
begin
  insert into public.rate_limits as r (key, count, window_start)
  values (p_key, 1, now())
  on conflict (key) do update
    set count = case
          when r.window_start < now() - make_interval(secs => p_window_seconds) then 1
          else r.count + 1
        end,
        window_start = case
          when r.window_start < now() - make_interval(secs => p_window_seconds) then now()
          else r.window_start
        end
  returning count into current_count;
  return current_count <= p_limit;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.cities enable row level security;
alter table public.profiles enable row level security;
alter table public.admin_users enable row level security;
alter table public.entitlements enable row level security;
alter table public.places enable row level security;
alter table public.place_photos enable row level security;
alter table public.reviews enable row level security;
alter table public.favorites enable row level security;
alter table public.place_suggestions enable row level security;
alter table public.place_reports enable row level security;
alter table public.city_waitlist_entries enable row level security;
alter table public.rate_limits enable row level security;

-- cities: readable by everyone, managed by admins (waitlist cities are created by the edge function).
create policy "cities are public" on public.cities
  for select to anon, authenticated using (true);
create policy "admins manage cities" on public.cities
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- profiles: own row (display names reach other users only through get_place_reviews).
create policy "read own profile" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- admin_users: no client access at all (is_admin() is security definer).

-- entitlements: read own, never written by clients.
create policy "read own entitlement" on public.entitlements
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- places: published for everyone, everything for admins.
create policy "published places are public" on public.places
  for select to anon, authenticated using (status = 'published' or public.is_admin());
create policy "admins manage places" on public.places
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- place_photos: metadata (paths) of published places is public; the private bucket enforces access to full files.
create policy "photos of published places are public" on public.place_photos
  for select to anon, authenticated using (
    public.is_admin() or exists (
      select 1 from public.places p where p.id = place_id and p.status = 'published'
    )
  );
create policy "admins manage photos" on public.place_photos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- reviews: own rows directly; everyone else reads through get_place_reviews (premium gating).
create policy "read own reviews" on public.reviews
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "write own review" on public.reviews
  for insert to authenticated with check (
    user_id = auth.uid() and exists (
      select 1 from public.places p where p.id = place_id and p.status = 'published'
    )
  );
create policy "update own review" on public.reviews
  for update to authenticated using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());
create policy "delete own review" on public.reviews
  for delete to authenticated using (user_id = auth.uid() or public.is_admin());

-- favorites: private.
create policy "own favorites" on public.favorites
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- suggestions + reports: users create and see their own, admins process.
create policy "create suggestion" on public.place_suggestions
  for insert to authenticated with check (user_id = auth.uid());
create policy "read own suggestions" on public.place_suggestions
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "admins update suggestions" on public.place_suggestions
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "create report" on public.place_reports
  for insert to authenticated with check (
    user_id = auth.uid() and exists (
      select 1 from public.places p where p.id = place_id and p.status = 'published'
    )
  );
create policy "read own reports" on public.place_reports
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "admins update reports" on public.place_reports
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- waitlist: admins read; all writes happen with the service role in the edge function.
create policy "admins read waitlist" on public.city_waitlist_entries
  for select to authenticated using (public.is_admin());

-- rate_limits: service role only (no policies).

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Photos of a place. Full-resolution paths are only returned when the caller may see them;
-- the private storage bucket enforces the same rule.
create or replace function public.get_place_photos(p_place_id uuid)
returns table (
  id uuid,
  sort_order integer,
  preview_path text,
  full_path text,
  locked boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_category text;
  v_status text;
  v_allowed boolean;
begin
  select category, status into v_category, v_status from public.places where places.id = p_place_id;
  if v_status is null then
    return;
  end if;
  if v_status <> 'published' and not public.is_admin() then
    return;
  end if;
  v_allowed := v_category = 'coworking' or public.is_admin() or public.is_plus();
  return query
    select ph.id,
           ph.sort_order,
           ph.preview_path,
           case when v_allowed then ph.full_path else null end as full_path,
           not v_allowed as locked
    from public.place_photos ph
    where ph.place_id = p_place_id
    order by ph.sort_order asc, ph.created_at asc;
end;
$$;

-- Reviews of a place. Review text is withheld for cafés unless the caller is Plus, admin or the author.
create or replace function public.get_place_reviews(p_place_id uuid)
returns table (
  id uuid,
  place_id uuid,
  user_id uuid,
  rating integer,
  body text,
  author_name text,
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
  v_category text;
  v_status text;
  v_unlocked boolean;
  v_uid uuid := auth.uid();
begin
  select category, status into v_category, v_status from public.places where places.id = p_place_id;
  if v_status is null then
    return;
  end if;
  if v_status <> 'published' and not public.is_admin() then
    return;
  end if;
  v_unlocked := v_category = 'coworking' or public.is_admin() or public.is_plus();
  return query
    select r.id,
           r.place_id,
           case when v_unlocked or r.user_id = v_uid or public.is_admin() then r.user_id else null end as user_id,
           r.rating,
           case when v_unlocked or r.user_id = v_uid then r.body else null end as body,
           case when v_unlocked or r.user_id = v_uid then coalesce(pr.display_name, 'Cosurfer') else null end as author_name,
           r.created_at,
           r.updated_at,
           (not v_unlocked and r.user_id is distinct from v_uid) as is_locked,
           (r.user_id = v_uid) as is_own,
           r.status
    from public.reviews r
    left join public.profiles pr on pr.id = r.user_id
    where r.place_id = p_place_id
      and (r.status = 'visible' or r.user_id = v_uid or public.is_admin())
    order by r.created_at desc;
end;
$$;

-- Admin: approve a suggestion by creating a draft place from it.
create or replace function public.approve_suggestion(p_id uuid, p_slug text, p_lat double precision, p_lng double precision)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.place_suggestions%rowtype;
  new_id uuid;
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;
  select * into s from public.place_suggestions where id = p_id for update;
  if s.id is null then
    raise exception 'suggestion not found';
  end if;
  if s.city_id is null then
    raise exception 'suggestion has no city';
  end if;
  insert into public.places (city_id, slug, name, category, status, address, website, description, lat, lng)
  values (s.city_id, p_slug, s.name, s.category, 'draft', s.address, s.website, s.notes, p_lat, p_lng)
  returning id into new_id;
  update public.place_suggestions set status = 'approved' where id = p_id;
  return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Storage buckets + policies
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('place-photos', 'place-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('place-previews', 'place-previews', true, 262144, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Full photos: readable only for coworking places, Plus members and admins.
create policy "full photos readable when allowed" on storage.objects
  for select to anon, authenticated using (
    bucket_id = 'place-photos' and (
      public.is_admin()
      or public.is_plus()
      or exists (
        select 1 from public.places p
        where p.id::text = (storage.foldername(name))[1]
          and p.category = 'coworking'
          and p.status = 'published'
      )
    )
  );

create policy "admins upload full photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'place-photos' and public.is_admin());
create policy "admins update full photos" on storage.objects
  for update to authenticated using (bucket_id = 'place-photos' and public.is_admin());
create policy "admins delete full photos" on storage.objects
  for delete to authenticated using (bucket_id = 'place-photos' and public.is_admin());

-- Blurred previews: public bucket, admin-managed.
create policy "previews are public" on storage.objects
  for select to anon, authenticated using (bucket_id = 'place-previews');
create policy "admins upload previews" on storage.objects
  for insert to authenticated with check (bucket_id = 'place-previews' and public.is_admin());
create policy "admins update previews" on storage.objects
  for update to authenticated using (bucket_id = 'place-previews' and public.is_admin());
create policy "admins delete previews" on storage.objects
  for delete to authenticated using (bucket_id = 'place-previews' and public.is_admin());

-- ---------------------------------------------------------------------------
-- Launch cities
-- ---------------------------------------------------------------------------

insert into public.cities (slug, name, country_code, country_name, lat, lng, zoom, status)
values
  ('berlin', 'Berlin', 'DE', 'Germany', 52.5200, 13.4050, 12, 'active'),
  ('parga', 'Parga', 'GR', 'Greece', 39.2853, 20.4005, 15, 'active')
on conflict (slug) do nothing;
