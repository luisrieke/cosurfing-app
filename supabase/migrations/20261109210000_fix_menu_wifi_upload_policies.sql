-- Same bug as 20261106000003: inside the EXISTS subquery an unqualified `name` resolves to
-- places.name, not the object path, so every menu and wifi photo upload was rejected.
drop policy if exists "users upload own menus" on storage.objects;
create policy "users upload own menus" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'place-menus'
    and (storage.foldername(objects.name))[2] = (select auth.uid())::text
    and exists (
      select 1 from public.places p
       where p.id::text = (storage.foldername(objects.name))[1] and p.status = 'published'
    )
  );

drop policy if exists "users upload own wifi photos" on storage.objects;
create policy "users upload own wifi photos" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'place-wifi'
    and (storage.foldername(objects.name))[2] = (select auth.uid())::text
    and exists (
      select 1 from public.places p
       where p.id::text = (storage.foldername(objects.name))[1] and p.status = 'published'
    )
  );
