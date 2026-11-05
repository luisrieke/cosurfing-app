-- Optional profile pictures. Files live in the public 'avatars' bucket under {user_id}/{random}.jpg;
-- users may only write and delete inside their own folder.

alter table public.profiles
  add column avatar_path text,
  add constraint profiles_avatar_path_own check (avatar_path is null or avatar_path like id::text || '/%');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "avatars are public" on storage.objects
  for select to anon, authenticated using (bucket_id = 'avatars');

create policy "users upload own avatar" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "users delete own avatar" on storage.objects
  for delete to authenticated using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
