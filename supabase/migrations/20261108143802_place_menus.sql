-- Photos of a place's current menu or price list, uploaded by members. They go live right away
-- (prices are not editorial content); uploaders and admins can remove them.
-- Files live in the public 'place-menus' bucket under {place_id}/{user_id}/{random}.jpg.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('place-menus', 'place-menus', true, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

create table public.place_menus (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  path text not null unique,
  rights_accepted_at timestamptz not null,
  terms_version text check (terms_version is null or char_length(terms_version) <= 20),
  created_at timestamptz not null default now(),
  constraint place_menus_path_own check (path like place_id::text || '/' || user_id::text || '/%')
);

create index place_menus_place_idx on public.place_menus (place_id, created_at desc);
create index place_menus_user_idx on public.place_menus (user_id);

alter table public.place_menus enable row level security;

create policy "read own menus" on public.place_menus
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "members add menus to published places" on public.place_menus
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.places p where p.id = place_id and p.status = 'published')
  );
create policy "members and admins delete menus" on public.place_menus
  for delete to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));

-- At most 10 menu photos per member and place.
create or replace function public.place_menus_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.place_menus m where m.place_id = new.place_id and m.user_id = new.user_id) >= 10 then
    raise exception 'menu_limit_reached';
  end if;
  return new;
end;
$$;

create trigger place_menus_limit
  before insert on public.place_menus
  for each row execute function public.place_menus_limit();

-- Newest first. Author names stay hidden from visitors without an account.
create or replace function public.get_place_menus(p_place_id uuid)
returns table (
  id uuid,
  path text,
  author_name text,
  is_own boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select m.id,
         m.path,
         case when auth.uid() is not null then coalesce(pr.display_name, 'Cosurfer') end,
         coalesce(m.user_id = auth.uid(), false),
         m.created_at
    from public.place_menus m
    join public.places p on p.id = m.place_id and (p.status = 'published' or public.is_admin())
    left join public.profiles pr on pr.id = m.user_id
   where m.place_id = p_place_id
   order by m.created_at desc;
$$;

revoke all on function public.get_place_menus(uuid) from public;
grant execute on function public.get_place_menus(uuid) to anon, authenticated;
revoke all on function public.place_menus_limit() from public, anon, authenticated;

-- Storage
create policy "menus are public" on storage.objects
  for select to anon, authenticated using (bucket_id = 'place-menus');

create policy "users upload own menus" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'place-menus'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and exists (
      select 1 from public.places p
       where p.id::text = (storage.foldername(name))[1] and p.status = 'published'
    )
  );

create policy "users and admins delete menu files" on storage.objects
  for delete to authenticated using (
    bucket_id = 'place-menus'
    and ((storage.foldername(name))[2] = (select auth.uid())::text or (select public.is_admin()))
  );
