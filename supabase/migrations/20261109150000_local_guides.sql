-- Local guides: trusted contributors whose place suggestions and photo uploads go live without
-- admin review. Add more with:
--   insert into public.local_guides (user_id) select id from auth.users where email = '...';

create table if not exists public.local_guides (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- No client access at all (is_local_guide() is security definer).
alter table public.local_guides enable row level security;

create or replace function public.is_local_guide()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select true from public.local_guides where user_id = auth.uid() limit 1),
    false
  );
$$;

revoke all on function public.is_local_guide() from public;
grant execute on function public.is_local_guide() to anon, authenticated;

create or replace function public.is_trusted_author(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user is not null and (
    exists (select 1 from public.admin_users where user_id = p_user)
    or exists (select 1 from public.local_guides where user_id = p_user)
  );
$$;

revoke all on function public.is_trusted_author(uuid) from public, anon, authenticated;

insert into public.local_guides (user_id)
select id from auth.users where email in ('luis.rieke@spacifik.com', 'sophie510@gmx.de')
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- Suggestions from admins and local guides publish immediately
-- ---------------------------------------------------------------------------

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
  if not public.is_trusted_author(s.user_id) then
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
      v_city.lat, v_city.lng,
      case when exists (select 1 from public.admin_users where user_id = s.user_id) then 'admin' else 'user' end
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

do $$
declare
  r record;
begin
  for r in
    select ps.id
    from public.place_suggestions ps
    join public.local_guides g on g.user_id = ps.user_id
    where ps.status = 'pending' and ps.city_id is not null
    order by ps.created_at
  loop
    perform public.publish_pending_admin_suggestion(r.id);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Photos from admins and local guides are approved on upload
-- ---------------------------------------------------------------------------

create or replace function public.place_photos_trusted_autoapprove()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'pending' and public.is_trusted_author(new.uploaded_by) then
    new.status := 'approved';
    new.sort_order := coalesce((
      select max(x.sort_order) + 1 from public.place_photos x
       where x.place_id = new.place_id and x.status = 'approved'
    ), 0);
  end if;
  return new;
end;
$$;

revoke all on function public.place_photos_trusted_autoapprove() from public, anon, authenticated;

drop trigger if exists place_photos_trusted_autoapprove on public.place_photos;
create trigger place_photos_trusted_autoapprove
  before insert on public.place_photos
  for each row execute function public.place_photos_trusted_autoapprove();

-- WITH CHECK sees the row after BEFORE triggers, so auto-approved rows must pass too.
drop policy if exists "users upload pending photos" on public.place_photos;
create policy "users upload pending photos" on public.place_photos
  for insert to authenticated with check (
    uploaded_by = (select auth.uid())
    and (
      status = 'pending'
      or (status = 'approved' and ((select public.is_admin()) or (select public.is_local_guide())))
    )
    and rights_accepted_at is not null
    and full_path like place_id::text || '/' || (select auth.uid())::text || '/%'
    and preview_path like place_id::text || '/' || (select auth.uid())::text || '/%'
    and exists (select 1 from public.places p where p.id = place_photos.place_id and p.status = 'published')
  );

drop trigger if exists place_photos_points on public.place_photos;
create trigger place_photos_points
  after insert or update of status or delete on public.place_photos
  for each row execute function public.place_photos_refresh_points();

do $$
declare
  r record;
begin
  for r in
    select ph.id
    from public.place_photos ph
    join public.local_guides g on g.user_id = ph.uploaded_by
    where ph.status = 'pending'
    order by ph.created_at
  loop
    update public.place_photos ph
       set status = 'approved',
           rejected_reason = null,
           sort_order = coalesce((
             select max(x.sort_order) + 1 from public.place_photos x
              where x.place_id = ph.place_id and x.status = 'approved'
           ), 0)
     where ph.id = r.id;
  end loop;
end $$;
