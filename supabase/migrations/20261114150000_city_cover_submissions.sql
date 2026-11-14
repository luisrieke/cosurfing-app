-- Members can suggest a nicer cover photo for a city (a landmark or typical view). Submissions stay
-- 'pending' until an admin approves one, which replaces the city's cover. Uploaders accept the
-- Terms (rights_accepted_at) for usage rights, like place photos; approved covers stay when the
-- uploader deletes their account (uploaded_by is set null).
-- Files live in the public 'city-covers' bucket under {city_id}/{user_id}/{random}.jpg (full size)
-- and {city_id}/{user_id}/{random}-thumb.jpg; the random names keep pending files unlisted.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('city-covers', 'city-covers', true, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

create table public.city_cover_submissions (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities (id) on delete cascade,
  uploaded_by uuid default auth.uid() references public.profiles (id) on delete set null,
  full_path text not null unique,
  thumb_path text not null unique,
  -- Rejected submissions are deleted together with their files.
  status text not null default 'pending' check (status in ('pending', 'approved')),
  rights_accepted_at timestamptz not null,
  terms_version text check (terms_version is null or char_length(terms_version) <= 20),
  -- The cover an approval replaced, so an admin can restore it.
  previous_cover_url text,
  previous_cover_thumb_url text,
  previous_cover_attribution text,
  previous_cover_source_url text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index city_cover_submissions_pending_idx on public.city_cover_submissions (created_at) where status = 'pending';
create index city_cover_submissions_uploader_idx on public.city_cover_submissions (uploaded_by) where uploaded_by is not null;
create index city_cover_submissions_city_idx on public.city_cover_submissions (city_id);

alter table public.city_cover_submissions enable row level security;

create policy "uploaders and admins read cover submissions" on public.city_cover_submissions
  for select to authenticated using (uploaded_by = (select auth.uid()) or (select public.is_admin()));

create policy "members submit city covers" on public.city_cover_submissions
  for insert to authenticated with check (
    uploaded_by = (select auth.uid())
    and status = 'pending'
    and full_path like city_id::text || '/' || (select auth.uid())::text || '/%'
    and thumb_path like city_id::text || '/' || (select auth.uid())::text || '/%'
    and exists (select 1 from public.cities c where c.id = city_id and c.status = 'active')
  );

create policy "uploaders delete pending covers, admins any" on public.city_cover_submissions
  for delete to authenticated using (
    (uploaded_by = (select auth.uid()) and status = 'pending') or (select public.is_admin())
  );

-- At most 3 covers per member waiting for review.
create or replace function public.city_cover_submissions_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.uploaded_by is null or public.is_admin() then
    return new;
  end if;
  if (select count(*) from public.city_cover_submissions
       where uploaded_by = new.uploaded_by and status = 'pending') >= 3 then
    raise exception 'city_cover_limit_reached';
  end if;
  return new;
end;
$$;

create trigger city_cover_submissions_limit
  before insert on public.city_cover_submissions
  for each row execute function public.city_cover_submissions_limit();

-- The caller passes the public URLs (the database does not know the project URL); they must point
-- at this submission's files in the city-covers bucket.
create or replace function public.approve_city_cover(p_submission_id uuid, p_cover_url text, p_thumb_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.city_cover_submissions;
  c public.cities;
  v_name text;
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;
  select * into s from public.city_cover_submissions where id = p_submission_id for update;
  if s.id is null then
    raise exception 'submission not found';
  end if;
  if p_cover_url not like '%/storage/v1/object/public/city-covers/' || s.full_path
     or p_thumb_url not like '%/storage/v1/object/public/city-covers/' || s.thumb_path then
    raise exception 'cover urls do not match the submission';
  end if;

  select * into c from public.cities where id = s.city_id for update;
  select display_name into v_name from public.profiles where id = s.uploaded_by;

  update public.city_cover_submissions
     set status = 'approved',
         reviewed_at = now(),
         previous_cover_url = c.cover_url,
         previous_cover_thumb_url = c.cover_thumb_url,
         previous_cover_attribution = c.cover_attribution,
         previous_cover_source_url = c.cover_source_url
   where id = s.id;

  update public.cities
     set cover_url = p_cover_url,
         cover_thumb_url = p_thumb_url,
         cover_attribution = 'Photo: ' || coalesce(nullif(trim(v_name), ''), 'a Cosurfer') || ', via Cosurfing',
         cover_source_url = null
   where id = s.city_id;
end;
$$;

revoke all on function public.city_cover_submissions_limit() from public, anon, authenticated;
revoke all on function public.approve_city_cover(uuid, text, text) from public, anon;
grant execute on function public.approve_city_cover(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage policies
-- ---------------------------------------------------------------------------

-- Security definer: storage policies run with the caller's RLS.
create or replace function public.city_cover_file_status(p_path text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select s.status from public.city_cover_submissions s
   where s.full_path = p_path or s.thumb_path = p_path
   limit 1;
$$;

revoke all on function public.city_cover_file_status(text) from public;
grant execute on function public.city_cover_file_status(text) to anon, authenticated;

create policy "city covers are public" on storage.objects
  for select to anon, authenticated using (bucket_id = 'city-covers');

create policy "members upload own city covers" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'city-covers'
    and (storage.foldername(objects.name))[2] = (select auth.uid())::text
    -- objects.name, not name: inside the subquery a bare name would be cities.name.
    and exists (
      select 1 from public.cities c
       where c.id::text = (storage.foldername(objects.name))[1] and c.status = 'active'
    )
  );

-- Uploaders may remove their files only while the cover is pending (or never got a row).
create policy "uploaders delete pending cover files, admins any" on storage.objects
  for delete to authenticated using (
    bucket_id = 'city-covers'
    and (
      (select public.is_admin())
      or (
        (storage.foldername(objects.name))[2] = (select auth.uid())::text
        and coalesce(public.city_cover_file_status(objects.name), 'pending') = 'pending'
      )
    )
  );
