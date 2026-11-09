-- Wi-Fi notes: members share how to get online at a place (network name, where the password is,
-- captive portal quirks), optionally with a photo of a QR code or password sign. They go live
-- right away, but only signed-in members see their content since they often contain passwords.
-- Photos live in the private 'place-wifi' bucket under {place_id}/{user_id}/{random}.jpg.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('place-wifi', 'place-wifi', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

create table public.place_wifi_notes (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text check (body is null or char_length(btrim(body)) between 1 and 500),
  photo_path text unique,
  rights_accepted_at timestamptz not null,
  terms_version text check (terms_version is null or char_length(terms_version) <= 20),
  created_at timestamptz not null default now(),
  constraint place_wifi_notes_content check (body is not null or photo_path is not null),
  constraint place_wifi_notes_path_own check (
    photo_path is null or photo_path like place_id::text || '/' || user_id::text || '/%'
  )
);

create index place_wifi_notes_place_idx on public.place_wifi_notes (place_id, created_at desc);
create index place_wifi_notes_user_idx on public.place_wifi_notes (user_id);

alter table public.place_wifi_notes enable row level security;

create policy "read own wifi notes" on public.place_wifi_notes
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "members add wifi notes to published places" on public.place_wifi_notes
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.places p where p.id = place_id and p.status = 'published')
  );
create policy "members and admins delete wifi notes" on public.place_wifi_notes
  for delete to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));

-- At most 10 notes per member and place.
create or replace function public.place_wifi_notes_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    select count(*) from public.place_wifi_notes n
     where n.place_id = new.place_id and n.user_id = new.user_id
  ) >= 10 then
    raise exception 'wifi_note_limit_reached';
  end if;
  return new;
end;
$$;

create trigger place_wifi_notes_limit
  before insert on public.place_wifi_notes
  for each row execute function public.place_wifi_notes_limit();

-- Newest first. Visitors without an account only learn that notes exist (is_locked).
create or replace function public.get_place_wifi_notes(p_place_id uuid)
returns table (
  id uuid,
  body text,
  photo_path text,
  has_photo boolean,
  is_locked boolean,
  author_name text,
  is_own boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select n.id,
         case when auth.uid() is not null then n.body end,
         case when auth.uid() is not null then n.photo_path end,
         n.photo_path is not null,
         auth.uid() is null,
         case when auth.uid() is not null then coalesce(pr.display_name, 'Cosurfer') end,
         coalesce(n.user_id = auth.uid(), false),
         n.created_at
    from public.place_wifi_notes n
    join public.places p on p.id = n.place_id and (p.status = 'published' or public.is_admin())
    left join public.profiles pr on pr.id = n.user_id
   where n.place_id = p_place_id
   order by n.created_at desc;
$$;

revoke all on function public.get_place_wifi_notes(uuid) from public;
grant execute on function public.get_place_wifi_notes(uuid) to anon, authenticated;
revoke all on function public.place_wifi_notes_limit() from public, anon, authenticated;

-- Storage: signed-in members only, never anon.
create policy "members read wifi photos" on storage.objects
  for select to authenticated using (bucket_id = 'place-wifi');

create policy "users upload own wifi photos" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'place-wifi'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and exists (
      select 1 from public.places p
       where p.id::text = (storage.foldername(name))[1] and p.status = 'published'
    )
  );

create policy "users and admins delete wifi photo files" on storage.objects
  for delete to authenticated using (
    bucket_id = 'place-wifi'
    and ((storage.foldername(name))[2] = (select auth.uid())::text or (select public.is_admin()))
  );
