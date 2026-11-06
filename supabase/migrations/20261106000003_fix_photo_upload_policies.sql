-- Inside the EXISTS subquery an unqualified `name` resolves to places.name, not the object path,
-- so every user upload was rejected. Qualify it with objects.
drop policy if exists "users upload own full photos" on storage.objects;
create policy "users upload own full photos" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'place-photos'
    and (storage.foldername(objects.name))[2] = (select auth.uid())::text
    and exists (
      select 1 from public.places p
       where p.id::text = (storage.foldername(objects.name))[1] and p.status = 'published'
    )
  );

drop policy if exists "users upload own previews" on storage.objects;
create policy "users upload own previews" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'place-previews'
    and (storage.foldername(objects.name))[2] = (select auth.uid())::text
    and exists (
      select 1 from public.places p
       where p.id::text = (storage.foldername(objects.name))[1] and p.status = 'published'
    )
  );
