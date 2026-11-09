-- Members can also share photos of a place's opening hours sign. They reuse the menu photo
-- table, bucket and policies; `kind` tells them apart.

alter table public.place_menus
  add column kind text not null default 'menu' check (kind in ('menu', 'hours'));

drop index if exists public.place_menus_place_idx;
create index place_menus_place_idx on public.place_menus (place_id, kind, created_at desc);

-- At most 10 photos per member, place and kind.
create or replace function public.place_menus_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    select count(*) from public.place_menus m
     where m.place_id = new.place_id and m.user_id = new.user_id and m.kind = new.kind
  ) >= 10 then
    raise exception 'menu_limit_reached';
  end if;
  return new;
end;
$$;

drop function if exists public.get_place_menus(uuid);

-- Newest first. Author names stay hidden from visitors without an account.
create function public.get_place_menus(p_place_id uuid)
returns table (
  id uuid,
  path text,
  kind text,
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
         m.kind,
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
