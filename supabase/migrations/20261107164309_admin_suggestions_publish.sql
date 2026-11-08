-- Admins who suggest a place publish it immediately. Other people's suggestions stay pending.
-- A second suggestion of the same name and address in the same city reuses the existing place.

alter table public.place_suggestions
  add column if not exists place_id uuid references public.places (id) on delete set null;

create or replace function public.publish_pending_admin_suggestion(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.place_suggestions%rowtype;
  v_city public.cities%rowtype;
  v_id uuid;
  v_slug text;
  v_base text;
  n int := 2;
begin
  select * into s from public.place_suggestions where id = p_id for update;
  if s.id is null or s.status <> 'pending' or s.city_id is null then
    return s.place_id;
  end if;
  if not exists (select 1 from public.admin_users where user_id = s.user_id) then
    return null;
  end if;
  select * into v_city from public.cities where id = s.city_id;
  if v_city.id is null then
    return null;
  end if;

  select p.id into v_id
  from public.places p
  where p.city_id = s.city_id
    and lower(p.name) = lower(s.name)
    and p.status <> 'archived'
    and coalesce(p.address, '') = coalesce(s.address, '')
  limit 1;

  if v_id is null then
    v_base := public.place_slug(s.name, v_city.slug, 0);
    v_slug := v_base;
    while exists (select 1 from public.places where slug = v_slug) loop
      v_slug := trim(both '-' from left(v_base, 54)) || '-' || n::text;
      n := n + 1;
      exit when n > 40;
    end loop;

    insert into public.places (
      city_id, slug, name, category, status, address, website, description, lat, lng, source
    ) values (
      s.city_id, v_slug, s.name, s.category, 'published', s.address, s.website, s.notes,
      v_city.lat, v_city.lng, 'admin'
    )
    returning id into v_id;
  end if;

  update public.place_suggestions
    set status = 'approved', place_id = v_id
    where id = s.id;

  return v_id;
end;
$$;

revoke all on function public.publish_pending_admin_suggestion(uuid) from public, anon, authenticated;

create or replace function public.tg_publish_admin_suggestion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.publish_pending_admin_suggestion(new.id);
  return null;
end;
$$;

revoke all on function public.tg_publish_admin_suggestion() from public, anon, authenticated;

drop trigger if exists place_suggestions_admin_publish on public.place_suggestions;
create trigger place_suggestions_admin_publish
  after insert on public.place_suggestions
  for each row execute function public.tg_publish_admin_suggestion();

insert into public.admin_users (user_id)
select id from auth.users where email = 'luis.rieke@spacifik.com'
on conflict (user_id) do nothing;

do $$
declare
  r record;
begin
  for r in
    select ps.id
    from public.place_suggestions ps
    join public.admin_users a on a.user_id = ps.user_id
    where ps.status = 'pending' and ps.city_id is not null
    order by ps.created_at
  loop
    perform public.publish_pending_admin_suggestion(r.id);
  end loop;
end $$;
