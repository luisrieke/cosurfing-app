-- Photos are no longer a Plus feature: everyone sees every approved photo in full resolution.
-- Written reviews are the new gate: visitors see none, free accounts unlock up to
-- review_unlock_limit() per UTC day (an unlocked review stays unlocked), Plus and admins see all.

-- ---------------------------------------------------------------------------
-- Photos: full resolution for everyone
-- ---------------------------------------------------------------------------

drop policy if exists "full photos readable when allowed" on storage.objects;
create policy "full photos readable when allowed" on storage.objects
  for select using (
    bucket_id = 'place-photos'
    and (
      public.is_admin()
      or (storage.foldername(objects.name))[2] = (select auth.uid())::text
      or (
        exists (
          select 1 from public.places p
           where p.id::text = (storage.foldername(objects.name))[1]
             and p.status = 'published'
        )
        and coalesce(public.place_photo_file_status(objects.name), 'approved') = 'approved'
      )
    )
  );

drop function public.get_place_photos(uuid);
create function public.get_place_photos(p_place_id uuid)
returns table (id uuid, sort_order integer, preview_path text, full_path text)
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
    select ph.id, ph.sort_order, ph.preview_path, ph.full_path
    from public.place_photos ph
    where ph.place_id = p_place_id and ph.status = 'approved'
    order by ph.sort_order asc, ph.created_at asc;
end;
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
         ph.full_path as cover_full_path,
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

-- ---------------------------------------------------------------------------
-- Review unlocks
-- ---------------------------------------------------------------------------

create table public.review_unlocks (
  user_id uuid not null references auth.users (id) on delete cascade,
  review_id uuid not null references public.reviews (id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, review_id)
);

create index review_unlocks_user_time on public.review_unlocks (user_id, unlocked_at desc);

-- Rows are only written through unlock_review(), which enforces the daily limit.
alter table public.review_unlocks enable row level security;
create policy "read own review unlocks" on public.review_unlocks
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.review_unlock_limit()
returns integer
language sql
immutable
as $$ select 3 $$;

create or replace function public.review_unlocks_used_today(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
    from public.review_unlocks
   where user_id = p_user
     and unlocked_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
$$;

create or replace function public.get_review_unlock_quota()
returns table (daily_limit integer, used_today integer, remaining integer, unlimited boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_used integer;
begin
  if v_uid is null then
    return;
  end if;
  v_used := public.review_unlocks_used_today(v_uid);
  return query
    select public.review_unlock_limit(),
           v_used,
           greatest(0, public.review_unlock_limit() - v_used),
           public.is_plus() or public.is_admin();
end;
$$;

create or replace function public.unlock_review(p_review_id uuid)
returns table (daily_limit integer, used_today integer, remaining integer, unlimited boolean)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_author uuid;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;
  select r.user_id into v_author
    from public.reviews r
    join public.places p on p.id = r.place_id
   where r.id = p_review_id and r.status = 'visible' and r.body is not null and p.status = 'published';
  if not found then
    raise exception 'review_not_found' using errcode = 'P0002';
  end if;
  if v_author <> v_uid and not (public.is_plus() or public.is_admin()) then
    -- Serialize unlocks per user so parallel requests cannot exceed the limit.
    perform pg_advisory_xact_lock(hashtext('review_unlock:' || v_uid::text));
    if not exists (select 1 from public.review_unlocks u where u.user_id = v_uid and u.review_id = p_review_id) then
      if public.review_unlocks_used_today(v_uid) >= public.review_unlock_limit() then
        raise exception 'unlock_limit_reached' using errcode = 'P0001';
      end if;
      insert into public.review_unlocks (user_id, review_id) values (v_uid, p_review_id);
    end if;
  end if;
  return query select * from public.get_review_unlock_quota();
end;
$$;

-- Star ratings stay public. Signed-in callers see author, detail ratings and which reviews have
-- text; the text itself only for their own reviews, reviews they unlocked, Plus and admins.
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
  body_locked boolean,
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
  v_signed_in boolean := auth.uid() is not null;
  v_all_bodies boolean := public.is_plus() or public.is_admin();
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
           case when x.body_visible then r.body end,
           case when v_signed_in then coalesce(pr.display_name, 'Cosurfer') end,
           case when v_signed_in then pr.points end,
           case when v_signed_in then r.wifi_rating end,
           case when v_signed_in then r.power_rating end,
           case when v_signed_in then r.quiet_rating end,
           case when v_signed_in then r.comfort_rating end,
           case when v_signed_in then r.value_rating end,
           case when v_signed_in then r.calls_ok end,
           case when v_signed_in then r.visited_at end,
           r.body is not null,
           r.created_at,
           r.updated_at,
           not v_signed_in,
           r.body is not null and not x.body_visible,
           coalesce(r.user_id = v_uid, false),
           r.status
      from public.reviews r
      left join public.profiles pr on pr.id = r.user_id
      cross join lateral (
        select v_all_bodies
            or coalesce(r.user_id = v_uid, false)
            or (v_signed_in and exists (
                  select 1 from public.review_unlocks u where u.user_id = v_uid and u.review_id = r.id
                )) as body_visible
      ) x
     where r.place_id = p_place_id
       and (r.status = 'visible' or r.user_id = v_uid or public.is_admin())
     order by (r.body is not null) desc, r.created_at desc;
end;
$$;

revoke all on function public.review_unlocks_used_today(uuid) from public, anon, authenticated;
revoke all on function public.get_review_unlock_quota() from public, anon;
revoke all on function public.unlock_review(uuid) from public, anon;
grant execute on function public.review_unlock_limit() to anon, authenticated;
grant execute on function public.get_review_unlock_quota() to authenticated;
grant execute on function public.unlock_review(uuid) to authenticated;
grant execute on function public.get_place_reviews(uuid) to anon, authenticated;
grant execute on function public.get_place_photos(uuid) to anon, authenticated;
grant execute on function public.get_city_ranking(uuid, text, text, boolean, boolean, boolean, text, integer, integer) to anon, authenticated;
