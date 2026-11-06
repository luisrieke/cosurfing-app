-- Signed-in users can upload photos of published places. Uploads stay 'pending' (invisible to
-- everyone but the uploader and admins) until an admin approves them. Uploaders must accept the
-- Terms (rights_accepted_at), which grant Spacifik UG exclusive usage rights to the photo.
-- Storage layout for user uploads: {place_id}/{user_id}/{random}.jpg in both buckets.

alter table public.place_photos
  add column uploaded_by uuid references public.profiles (id) on delete set null,
  add column status text not null default 'approved' check (status in ('pending', 'approved', 'rejected')),
  add column rights_accepted_at timestamptz,
  add column rejected_reason text check (rejected_reason is null or char_length(rejected_reason) <= 500);

create index place_photos_pending_idx on public.place_photos (created_at desc) where status = 'pending';
create index place_photos_uploader_idx on public.place_photos (uploaded_by) where uploaded_by is not null;

-- ---------------------------------------------------------------------------
-- Table RLS
-- ---------------------------------------------------------------------------

drop policy if exists "photos of published places are public" on public.place_photos;
create policy "approved photos of published places are public" on public.place_photos
  for select to anon, authenticated using (
    (select public.is_admin())
    or uploaded_by = (select auth.uid())
    or (
      status = 'approved'
      and exists (select 1 from public.places p where p.id = place_photos.place_id and p.status = 'published')
    )
  );

create policy "users upload pending photos" on public.place_photos
  for insert to authenticated with check (
    uploaded_by = (select auth.uid())
    and status = 'pending'
    and rights_accepted_at is not null
    and full_path like place_id::text || '/' || (select auth.uid())::text || '/%'
    and preview_path like place_id::text || '/' || (select auth.uid())::text || '/%'
    and exists (select 1 from public.places p where p.id = place_photos.place_id and p.status = 'published')
  );

create policy "users delete own pending photos" on public.place_photos
  for delete to authenticated using (uploaded_by = (select auth.uid()) and status = 'pending');

-- At most 10 photos per user waiting for review.
create or replace function public.place_photos_pending_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.uploaded_by is null or public.is_admin() then
    return new;
  end if;
  if (select count(*) from public.place_photos where uploaded_by = new.uploaded_by and status = 'pending') >= 10 then
    raise exception 'You already have 10 photos waiting for review. Please wait until they are checked.';
  end if;
  return new;
end;
$$;

create trigger place_photos_pending_limit
  before insert on public.place_photos
  for each row execute function public.place_photos_pending_limit();

-- ---------------------------------------------------------------------------
-- Storage policies
-- ---------------------------------------------------------------------------

-- Security definer: storage policies run with the caller's RLS, which hides pending rows from them.
create or replace function public.place_photo_file_status(p_path text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select ph.status from public.place_photos ph
   where ph.full_path = p_path or ph.preview_path = p_path
   limit 1;
$$;

drop policy if exists "full photos readable when allowed" on storage.objects;
create policy "full photos readable when allowed" on storage.objects
  for select using (
    bucket_id = 'place-photos'
    and (
      public.is_admin()
      or (storage.foldername(objects.name))[2] = (select auth.uid())::text
      or (
        (public.is_plus() or exists (
          select 1 from public.places p
           where p.id::text = (storage.foldername(objects.name))[1]
             and p.category in ('coworking', 'library')
             and p.status = 'published'
        ))
        and coalesce(public.place_photo_file_status(objects.name), 'approved') = 'approved'
      )
    )
  );

create policy "users upload own full photos" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'place-photos'
    and (storage.foldername(objects.name))[2] = (select auth.uid())::text
    and exists (
      select 1 from public.places p
       where p.id::text = (storage.foldername(objects.name))[1] and p.status = 'published'
    )
  );

create policy "users upload own previews" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'place-previews'
    and (storage.foldername(objects.name))[2] = (select auth.uid())::text
    and exists (
      select 1 from public.places p
       where p.id::text = (storage.foldername(objects.name))[1] and p.status = 'published'
    )
  );

-- Uploaders may remove their files only while the photo is still pending (or never got a row).
create policy "users delete own pending photo files" on storage.objects
  for delete to authenticated using (
    bucket_id in ('place-photos', 'place-previews')
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and coalesce(public.place_photo_file_status(objects.name), 'pending') = 'pending'
  );

-- ---------------------------------------------------------------------------
-- Read paths: only approved photos
-- ---------------------------------------------------------------------------

create or replace function public.get_place_photos(p_place_id uuid)
returns table (id uuid, sort_order integer, preview_path text, full_path text, locked boolean)
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
  v_allowed := v_category <> 'cafe' or public.is_admin() or public.is_plus();
  return query
    select ph.id,
           ph.sort_order,
           ph.preview_path,
           case when v_allowed then ph.full_path else null end as full_path,
           not v_allowed as locked
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

-- ---------------------------------------------------------------------------
-- Moderation + points
-- ---------------------------------------------------------------------------

-- Approve: the photo goes to the end of the gallery.
create or replace function public.approve_place_photo(p_photo_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;
  update public.place_photos ph
     set status = 'approved',
         rejected_reason = null,
         sort_order = coalesce((
           select max(x.sort_order) + 1 from public.place_photos x
            where x.place_id = ph.place_id and x.status = 'approved'
         ), 0)
   where ph.id = p_photo_id;
end;
$$;

-- Approved photos are worth 5 points each, like speed tests and suggestions.
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
  v_photos integer;
begin
  if p_user is null then
    return;
  end if;
  select count(*) into v_reviews from public.reviews where user_id = p_user and status = 'visible';
  select count(*) into v_tests from public.speed_tests where user_id = p_user and status = 'visible';
  select count(*) into v_suggestions from public.place_suggestions where user_id = p_user and status <> 'rejected';
  select count(*) into v_photos from public.place_photos where uploaded_by = p_user and status = 'approved';
  update public.profiles
     set review_count = v_reviews,
         speed_test_count = v_tests,
         points = v_reviews * 10 + v_tests * 5 + v_suggestions * 5 + v_photos * 5
   where id = p_user;
end;
$$;

create or replace function public.place_photos_refresh_points()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_profile_stats(old.uploaded_by);
  else
    perform public.refresh_profile_stats(new.uploaded_by);
  end if;
  return null;
end;
$$;

create trigger place_photos_points
  after update of status or delete on public.place_photos
  for each row execute function public.place_photos_refresh_points();

grant execute on function public.place_photo_file_status(text) to anon, authenticated;
revoke all on function public.place_photos_pending_limit() from public, anon, authenticated;
revoke all on function public.place_photos_refresh_points() from public, anon, authenticated;
revoke all on function public.refresh_profile_stats(uuid) from public, anon, authenticated;
revoke all on function public.approve_place_photo(uuid) from public, anon;
grant execute on function public.approve_place_photo(uuid) to authenticated;
grant execute on function public.get_place_photos(uuid) to anon, authenticated;
grant execute on function public.get_city_ranking(uuid, text, text, boolean, boolean, boolean, text, integer, integer) to anon, authenticated;
