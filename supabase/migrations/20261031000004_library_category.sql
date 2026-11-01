-- Libraries are a third place category: allow them in suggestions and treat their photos like
-- coworking photos (public). Only café photos stay a Plus feature.

alter table public.place_suggestions drop constraint if exists place_suggestions_category_check;
alter table public.place_suggestions
  add constraint place_suggestions_category_check check (category in ('coworking', 'cafe', 'library'));

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
    where ph.place_id = p_place_id
    order by ph.sort_order asc, ph.created_at asc;
end;
$$;

drop policy if exists "full photos readable when allowed" on storage.objects;
create policy "full photos readable when allowed" on storage.objects
  for select using (
    bucket_id = 'place-photos'
    and (
      public.is_admin()
      or public.is_plus()
      or exists (
        select 1 from public.places p
         where p.id::text = (storage.foldername(objects.name))[1]
           and p.category in ('coworking', 'library')
           and p.status = 'published'
      )
    )
  );
