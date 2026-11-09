-- Points land on the public score immediately. Level and Local Guide use only the confirmed
-- part (points - points_pending). New contributions from people who are not trusted stay
-- pending until an admin accepts them, or until the author earns Local Guide.

-- ---------------------------------------------------------------------------
-- Profile counters
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column points_pending integer not null default 0,
  add column edit_rejections integer not null default 0,
  add column is_guide boolean not null default false;

create or replace function public.protect_profile_stats()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.points := old.points;
    new.points_pending := old.points_pending;
    new.review_count := old.review_count;
    new.speed_test_count := old.speed_test_count;
    new.edit_rejections := old.edit_rejections;
    new.is_guide := old.is_guide;
  end if;
  return new;
end;
$$;

-- An admin can stop earned auto-publish. A row in local_guides still wins.
create table public.guide_revokes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.guide_revokes enable row level security;

-- ---------------------------------------------------------------------------
-- Review moderation
-- ---------------------------------------------------------------------------

alter table public.reviews drop constraint reviews_status_check;
alter table public.reviews
  add constraint reviews_status_check check (status in ('visible', 'hidden', 'pending', 'rejected'));

alter table public.reviews
  add column edit_status text check (edit_status is null or edit_status in ('pending', 'rejected')),
  add column pending_rating integer check (pending_rating is null or pending_rating between 1 and 5),
  add column pending_body text check (pending_body is null or char_length(pending_body) between 3 and 2000),
  add column pending_wifi_rating integer check (pending_wifi_rating is null or pending_wifi_rating between 1 and 5),
  add column pending_power_rating integer check (pending_power_rating is null or pending_power_rating between 1 and 5),
  add column pending_quiet_rating integer check (pending_quiet_rating is null or pending_quiet_rating between 1 and 5),
  add column pending_comfort_rating integer check (pending_comfort_rating is null or pending_comfort_rating between 1 and 5),
  add column pending_value_rating integer check (pending_value_rating is null or pending_value_rating between 1 and 5),
  add column pending_calls_ok boolean,
  add column pending_visited_at date;

drop policy if exists "update own review" on public.reviews;
create policy "update own review" on public.reviews
  for update to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()))
  with check (
    (select public.is_admin())
    or (user_id = (select auth.uid()) and status in ('visible', 'pending'))
  );

-- ---------------------------------------------------------------------------
-- Facts, menus, offers
-- ---------------------------------------------------------------------------

create or replace function public.place_fact_value_ok(p_key text, p_value jsonb)
returns boolean
language sql
immutable
as $$
  select case p_key
    when 'open_24_7' then jsonb_typeof(p_value) = 'boolean'
    when 'meeting_rooms' then jsonb_typeof(p_value) = 'boolean'
    when 'phone_booths' then jsonb_typeof(p_value) = 'boolean'
    when 'wifi' then jsonb_typeof(p_value) = 'boolean'
    when 'laptops' then p_value in ('"welcome"'::jsonb, '"not_allowed"'::jsonb)
    when 'opening_hours' then
      case when jsonb_typeof(p_value) = 'string' then char_length(p_value #>> '{}') between 3 and 300 else false end
    when 'price_range' then
      case when jsonb_typeof(p_value) = 'number' then (p_value #>> '{}')::numeric in (1, 2, 3, 4) else false end
    when 'day_pass' then
      case when jsonb_typeof(p_value) = 'object' and jsonb_typeof(p_value -> 'amount') = 'number'
             then (p_value ->> 'amount')::numeric between 0 and 10000 and coalesce(p_value ->> 'currency', '') ~ '^[A-Z]{3}$'
           else false end
    else false
  end;
$$;

alter table public.place_facts
  add column status text not null default 'approved' check (status in ('pending', 'approved', 'rejected')),
  add column pending_value jsonb,
  add column pending_delete boolean not null default false;

alter table public.place_facts drop constraint place_facts_value_check;
alter table public.place_facts
  add constraint place_facts_value_check check (public.place_fact_value_ok(key, value)),
  add constraint place_facts_pending_value_check check (pending_value is null or public.place_fact_value_ok(key, pending_value));

alter table public.place_menus
  add column status text not null default 'approved' check (status in ('pending', 'approved', 'rejected'));

alter table public.place_offers
  add column status text not null default 'approved' check (status in ('pending', 'approved', 'rejected'));

-- ---------------------------------------------------------------------------
-- Trust: admin, manual local guide, or earned (400 confirmed, clean record)
-- ---------------------------------------------------------------------------

create or replace function public.contribution_totals(p_user uuid)
returns table (
  points integer,
  points_pending integer,
  approved_count integer,
  rejected_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  with c as (
    select
      (select count(*) from public.reviews where user_id = p_user and status = 'visible') as reviews_ok,
      (select count(*) from public.reviews where user_id = p_user and status = 'pending') as reviews_wait,
      (select count(*) from public.reviews where user_id = p_user and status in ('rejected', 'hidden')) as reviews_no,
      (select count(*) from public.place_photos where uploaded_by = p_user and status = 'approved') as photos_ok,
      (select count(*) from public.place_photos where uploaded_by = p_user and status = 'pending') as photos_wait,
      (select count(*) from public.place_photos where uploaded_by = p_user and status = 'rejected') as photos_no,
      (select count(*) from public.place_suggestions where user_id = p_user and status = 'approved') as suggestions_ok,
      (select count(*) from public.place_suggestions where user_id = p_user and status = 'pending') as suggestions_wait,
      (select count(*) from public.place_suggestions where user_id = p_user and status = 'rejected') as suggestions_no,
      (select count(*) from public.speed_tests where user_id = p_user and status = 'visible') as tests_ok,
      (select count(*) from public.place_facts where user_id = p_user and status = 'approved') as facts_ok,
      (select count(*) from public.place_facts where user_id = p_user and status = 'pending') as facts_wait,
      (select count(*) from public.place_facts where user_id = p_user and status = 'rejected') as facts_no,
      (select count(*) from public.place_menus where user_id = p_user and status = 'approved') as menus_ok,
      (select count(*) from public.place_menus where user_id = p_user and status = 'pending') as menus_wait,
      (select count(*) from public.place_menus where user_id = p_user and status = 'rejected') as menus_no,
      (select count(*) from public.place_offers where user_id = p_user and status = 'approved') as offers_ok,
      (select count(*) from public.place_offers where user_id = p_user and status = 'pending') as offers_wait,
      (select count(*) from public.place_offers where user_id = p_user and status = 'rejected') as offers_no,
      (select coalesce(edit_rejections, 0) from public.profiles where id = p_user) as edits
  )
  select
    (reviews_ok * 10 + reviews_wait * 10
      + photos_ok * 5 + photos_wait * 5
      + suggestions_ok * 5 + suggestions_wait * 5
      + tests_ok * 5
      + facts_ok * 2 + facts_wait * 2
      + menus_ok * 5 + menus_wait * 5
      + offers_ok * 2 + offers_wait * 2)::integer,
    (reviews_wait * 10 + photos_wait * 5 + suggestions_wait * 5
      + facts_wait * 2 + menus_wait * 5 + offers_wait * 2)::integer,
    (reviews_ok + photos_ok + suggestions_ok + facts_ok + menus_ok + offers_ok)::integer,
    (reviews_no + photos_no + suggestions_no + facts_no + menus_no + offers_no + edits)::integer
  from c;
$$;

create or replace function public.user_is_local_guide(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user is not null and (
    exists (select 1 from public.local_guides where user_id = p_user)
    or (
      not exists (select 1 from public.guide_revokes where user_id = p_user)
      and exists (
        select 1 from public.contribution_totals(p_user) t
        where (t.points - t.points_pending) >= 400
          and (t.approved_count + t.rejected_count) > 0
          and t.rejected_count * 10 <= (t.approved_count + t.rejected_count)
      )
    )
  );
$$;

create or replace function public.is_trusted_author(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user is not null and (
    exists (select 1 from public.admin_users where user_id = p_user)
    or public.user_is_local_guide(p_user)
  );
$$;

-- Reads the stored flag plus the manual list, so photo policies stay cheap.
-- refresh_profile_stats keeps is_guide in step with user_is_local_guide.
create or replace function public.is_local_guide()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    exists (select 1 from public.local_guides where user_id = auth.uid())
    or coalesce((select p.is_guide from public.profiles p where p.id = auth.uid()), false),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- Publish everything still waiting once the author is trusted
-- ---------------------------------------------------------------------------

create or replace function public.publish_user_pending(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if p_user is null then
    return;
  end if;

  update public.reviews
     set rating = pending_rating,
         body = pending_body,
         wifi_rating = pending_wifi_rating,
         power_rating = pending_power_rating,
         quiet_rating = pending_quiet_rating,
         comfort_rating = pending_comfort_rating,
         value_rating = pending_value_rating,
         calls_ok = pending_calls_ok,
         visited_at = pending_visited_at,
         edit_status = null,
         pending_rating = null,
         pending_body = null,
         pending_wifi_rating = null,
         pending_power_rating = null,
         pending_quiet_rating = null,
         pending_comfort_rating = null,
         pending_value_rating = null,
         pending_calls_ok = null,
         pending_visited_at = null
   where user_id = p_user and edit_status = 'pending' and pending_rating is not null;

  update public.reviews set status = 'visible' where user_id = p_user and status = 'pending';

  for r in
    select ph.id
      from public.place_photos ph
     where ph.uploaded_by = p_user and ph.status = 'pending'
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

  for r in
    select ps.id
      from public.place_suggestions ps
     where ps.user_id = p_user and ps.status = 'pending' and ps.city_id is not null
     order by ps.created_at
  loop
    perform public.publish_pending_admin_suggestion(r.id);
  end loop;

  update public.place_facts
     set value = pending_value, pending_value = null, pending_delete = false, updated_at = now()
   where user_id = p_user and status = 'approved' and pending_value is not null;

  delete from public.place_facts
   where user_id = p_user and status = 'approved' and pending_delete;

  update public.place_facts
     set status = 'approved', pending_value = null, pending_delete = false
   where user_id = p_user and status = 'pending';

  update public.place_menus set status = 'approved' where user_id = p_user and status = 'pending';
  update public.place_offers set status = 'approved' where user_id = p_user and status = 'pending';
end;
$$;

create or replace function public.refresh_profile_stats(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
begin
  if p_user is null then
    return;
  end if;
  if current_setting('cosurfing.refreshing', true) = '1' then
    select * into t from public.contribution_totals(p_user);
    update public.profiles
       set points = coalesce(t.points, 0),
           points_pending = coalesce(t.points_pending, 0)
     where id = p_user;
    return;
  end if;

  perform set_config('cosurfing.refreshing', '1', true);
  if public.is_trusted_author(p_user) then
    perform public.publish_user_pending(p_user);
  end if;
  select * into t from public.contribution_totals(p_user);
  update public.profiles
     set points = coalesce(t.points, 0),
         points_pending = coalesce(t.points_pending, 0),
         review_count = (select count(*) from public.reviews where user_id = p_user and status = 'visible'),
         speed_test_count = (select count(*) from public.speed_tests where user_id = p_user and status = 'visible'),
         is_guide = public.user_is_local_guide(p_user)
   where id = p_user;
  perform set_config('cosurfing.refreshing', '', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- New writes from untrusted authors wait
-- ---------------------------------------------------------------------------

create or replace function public.reviews_moderate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if public.is_trusted_author(new.user_id) then
      new.status := 'visible';
    else
      new.status := 'pending';
    end if;
    new.edit_status := null;
    new.pending_rating := null;
    new.pending_body := null;
    new.pending_wifi_rating := null;
    new.pending_power_rating := null;
    new.pending_quiet_rating := null;
    new.pending_comfort_rating := null;
    new.pending_value_rating := null;
    new.pending_calls_ok := null;
    new.pending_visited_at := null;
    return new;
  end if;

  if old.status = 'hidden' and not public.is_admin() then
    raise exception 'review_hidden' using errcode = 'P0001';
  end if;
  if public.is_admin() then
    return new;
  end if;

  if public.is_trusted_author(new.user_id) then
    if old.status <> 'hidden' then
      new.status := 'visible';
    end if;
    new.edit_status := null;
    new.pending_rating := null;
    new.pending_body := null;
    new.pending_wifi_rating := null;
    new.pending_power_rating := null;
    new.pending_quiet_rating := null;
    new.pending_comfort_rating := null;
    new.pending_value_rating := null;
    new.pending_calls_ok := null;
    new.pending_visited_at := null;
    return new;
  end if;

  if old.status = 'visible' then
    if new.rating is distinct from old.rating
      or new.body is distinct from old.body
      or new.wifi_rating is distinct from old.wifi_rating
      or new.power_rating is distinct from old.power_rating
      or new.quiet_rating is distinct from old.quiet_rating
      or new.comfort_rating is distinct from old.comfort_rating
      or new.value_rating is distinct from old.value_rating
      or new.calls_ok is distinct from old.calls_ok
      or new.visited_at is distinct from old.visited_at
    then
      new.pending_rating := new.rating;
      new.pending_body := new.body;
      new.pending_wifi_rating := new.wifi_rating;
      new.pending_power_rating := new.power_rating;
      new.pending_quiet_rating := new.quiet_rating;
      new.pending_comfort_rating := new.comfort_rating;
      new.pending_value_rating := new.value_rating;
      new.pending_calls_ok := new.calls_ok;
      new.pending_visited_at := new.visited_at;
      new.edit_status := 'pending';
    end if;
    new.rating := old.rating;
    new.body := old.body;
    new.wifi_rating := old.wifi_rating;
    new.power_rating := old.power_rating;
    new.quiet_rating := old.quiet_rating;
    new.comfort_rating := old.comfort_rating;
    new.value_rating := old.value_rating;
    new.calls_ok := old.calls_ok;
    new.visited_at := old.visited_at;
    new.status := 'visible';
    return new;
  end if;

  if old.status = 'rejected' then
    update public.profiles set edit_rejections = edit_rejections + 1 where id = new.user_id;
  end if;
  new.status := 'pending';
  new.edit_status := null;
  new.pending_rating := null;
  new.pending_body := null;
  new.pending_wifi_rating := null;
  new.pending_power_rating := null;
  new.pending_quiet_rating := null;
  new.pending_comfort_rating := null;
  new.pending_value_rating := null;
  new.pending_calls_ok := null;
  new.pending_visited_at := null;
  return new;
end;
$$;

drop trigger if exists reviews_moderate on public.reviews;
create trigger reviews_moderate
  before insert or update on public.reviews
  for each row execute function public.reviews_moderate();

create or replace function public.reviews_keep_rejection()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status in ('rejected', 'hidden') then
    update public.profiles set edit_rejections = edit_rejections + 1 where id = old.user_id;
  end if;
  return old;
end;
$$;

drop trigger if exists reviews_keep_rejection on public.reviews;
create trigger reviews_keep_rejection
  before delete on public.reviews
  for each row execute function public.reviews_keep_rejection();

create or replace function public.place_menus_trust()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_trusted_author(new.user_id) then
    new.status := 'approved';
  else
    new.status := 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists place_menus_trust on public.place_menus;
create trigger place_menus_trust
  before insert on public.place_menus
  for each row execute function public.place_menus_trust();

create or replace function public.place_offers_trust()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_trusted_author(new.user_id) then
    new.status := 'approved';
  else
    new.status := 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists place_offers_trust on public.place_offers;
create trigger place_offers_trust
  before insert on public.place_offers
  for each row execute function public.place_offers_trust();

create or replace function public.touch_profile_points()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_profile_stats(old.user_id);
  else
    perform public.refresh_profile_stats(new.user_id);
  end if;
  return null;
end;
$$;

drop trigger if exists place_facts_points on public.place_facts;
create trigger place_facts_points
  after insert or update or delete on public.place_facts
  for each row execute function public.touch_profile_points();

drop trigger if exists place_menus_points on public.place_menus;
create trigger place_menus_points
  after insert or update of status or delete on public.place_menus
  for each row execute function public.touch_profile_points();

drop trigger if exists place_offers_points on public.place_offers;
create trigger place_offers_points
  after insert or update of status or delete on public.place_offers
  for each row execute function public.touch_profile_points();

-- Admins can publish a suggestion even when the author is not trusted yet.
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
  if not public.is_trusted_author(s.user_id) and not public.is_admin() then
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

-- ---------------------------------------------------------------------------
-- Saving facts keeps a live value until the edit is accepted
-- ---------------------------------------------------------------------------

create or replace function public.save_place_facts(p_place_id uuid, p_facts jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_trusted boolean;
  e record;
  v_status text;
  v_value jsonb;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;
  if jsonb_typeof(p_facts) is distinct from 'object' then
    raise exception 'invalid facts';
  end if;
  if not exists (select 1 from public.places where id = p_place_id and status = 'published') then
    raise exception 'place not found';
  end if;
  v_trusted := public.is_trusted_author(v_uid);

  for e in select key, value from jsonb_each(p_facts)
  loop
    if jsonb_typeof(e.value) = 'null' then
      continue;
    end if;
    if not public.place_fact_value_ok(e.key, e.value) then
      raise exception 'invalid facts';
    end if;

    select f.status, f.value into v_status, v_value
      from public.place_facts f
     where f.place_id = p_place_id and f.user_id = v_uid and f.key = e.key;

    if v_trusted then
      insert into public.place_facts (place_id, user_id, key, value, status, pending_value, pending_delete)
      values (p_place_id, v_uid, e.key, e.value, 'approved', null, false)
      on conflict (place_id, user_id, key) do update
        set value = excluded.value,
            status = 'approved',
            pending_value = null,
            pending_delete = false,
            updated_at = now()
      where place_facts.value is distinct from excluded.value
         or place_facts.status is distinct from 'approved'
         or place_facts.pending_value is not null
         or place_facts.pending_delete;
    elsif v_status = 'approved' then
      if v_value is distinct from e.value then
        update public.place_facts
           set pending_value = e.value, pending_delete = false, updated_at = now()
         where place_id = p_place_id and user_id = v_uid and key = e.key;
      else
        update public.place_facts
           set pending_value = null, pending_delete = false
         where place_id = p_place_id and user_id = v_uid and key = e.key
           and (pending_value is not null or pending_delete);
      end if;
    else
      if v_status = 'rejected' then
        update public.profiles set edit_rejections = edit_rejections + 1 where id = v_uid;
      end if;
      insert into public.place_facts (place_id, user_id, key, value, status, pending_value, pending_delete)
      values (p_place_id, v_uid, e.key, e.value, 'pending', null, false)
      on conflict (place_id, user_id, key) do update
        set value = excluded.value,
            status = 'pending',
            pending_value = null,
            pending_delete = false,
            updated_at = now()
      where place_facts.value is distinct from excluded.value
         or place_facts.status is distinct from 'pending'
         or place_facts.pending_value is not null
         or place_facts.pending_delete;
    end if;
  end loop;

  for e in
    select f.key, f.status
      from public.place_facts f
     where f.place_id = p_place_id
       and f.user_id = v_uid
       and (not (p_facts ? f.key) or jsonb_typeof(p_facts -> f.key) = 'null')
  loop
    if e.status = 'rejected' then
      update public.profiles set edit_rejections = edit_rejections + 1 where id = v_uid;
    end if;
    if v_trusted or e.status <> 'approved' then
      delete from public.place_facts
       where place_id = p_place_id and user_id = v_uid and key = e.key;
    else
      update public.place_facts
         set pending_delete = true, pending_value = null, updated_at = now()
       where place_id = p_place_id and user_id = v_uid and key = e.key
         and not pending_delete;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Readers see live rows. Authors also see their own waiting changes.
-- ---------------------------------------------------------------------------

drop function if exists public.get_place_facts(uuid);
create function public.get_place_facts(p_place_id uuid)
returns table (
  key text,
  value jsonb,
  pending_value jsonb,
  status text,
  pending_delete boolean,
  author_name text,
  is_own boolean,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select f.key,
         f.value,
         case when f.user_id = auth.uid() or public.is_admin() then f.pending_value end,
         f.status,
         case when f.user_id = auth.uid() or public.is_admin() then f.pending_delete else false end,
         case when auth.uid() is not null then coalesce(pr.display_name, 'Cosurfer') end,
         coalesce(f.user_id = auth.uid(), false),
         f.updated_at
    from public.place_facts f
    join public.places p on p.id = f.place_id and (p.status = 'published' or public.is_admin())
    left join public.profiles pr on pr.id = f.user_id
   where f.place_id = p_place_id
     and (
       f.status = 'approved'
       or f.user_id = auth.uid()
       or public.is_admin()
     )
   order by f.updated_at desc;
$$;

drop function if exists public.get_place_menus(uuid);
create function public.get_place_menus(p_place_id uuid)
returns table (
  id uuid,
  path text,
  kind text,
  author_name text,
  is_own boolean,
  created_at timestamptz,
  status text
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
         m.created_at,
         m.status
    from public.place_menus m
    join public.places p on p.id = m.place_id and (p.status = 'published' or public.is_admin())
    left join public.profiles pr on pr.id = m.user_id
   where m.place_id = p_place_id
     and (m.status = 'approved' or m.user_id = auth.uid() or public.is_admin())
   order by m.created_at desc;
$$;

drop function if exists public.get_place_offers(uuid);
create function public.get_place_offers(p_place_id uuid)
returns table (
  id uuid,
  kind text,
  title text,
  details text,
  url text,
  code text,
  is_locked boolean,
  expires_on date,
  author_name text,
  is_own boolean,
  created_at timestamptz,
  status text
)
language sql
stable
security definer
set search_path = public
as $$
  select o.id,
         o.kind,
         o.title,
         o.details,
         case when auth.uid() is not null then o.url end,
         case when auth.uid() is not null then o.code end,
         auth.uid() is null and (o.url is not null or o.code is not null),
         o.expires_on,
         case when auth.uid() is not null then coalesce(pr.display_name, 'Cosurfer') end,
         coalesce(o.user_id = auth.uid(), false),
         o.created_at,
         o.status
    from public.place_offers o
    join public.places p on p.id = o.place_id and (p.status = 'published' or public.is_admin())
    left join public.profiles pr on pr.id = o.user_id
   where o.place_id = p_place_id
     and (o.expires_on is null or o.expires_on >= current_date)
     and (o.status = 'approved' or o.user_id = auth.uid() or public.is_admin())
   order by (o.kind = 'deal') desc, o.created_at desc;
$$;

drop function if exists public.get_place_reviews(uuid);
create function public.get_place_reviews(p_place_id uuid)
returns table (
  id uuid,
  place_id uuid,
  user_id uuid,
  rating integer,
  body text,
  author_name text,
  author_points integer,
  wifi_rating integer,
  power_rating integer,
  quiet_rating integer,
  comfort_rating integer,
  value_rating integer,
  calls_ok boolean,
  visited_at date,
  has_body boolean,
  created_at timestamptz,
  updated_at timestamptz,
  is_locked boolean,
  body_locked boolean,
  is_own boolean,
  status text,
  author_id uuid,
  author_avatar_path text,
  author_points_pending integer,
  author_is_guide boolean,
  edit_status text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_status text;
  v_uid uuid := auth.uid();
  v_signed_in boolean := auth.uid() is not null;
  v_all_bodies boolean := public.is_plus() or public.is_admin();
begin
  select places.status into v_status from public.places where places.id = p_place_id;
  if v_status is null then
    return;
  end if;
  if v_status <> 'published' and not public.is_admin() then
    return;
  end if;
  return query
    select r.id,
           r.place_id,
           case when r.user_id = v_uid or public.is_admin() then r.user_id end,
           r.rating,
           case when x.body_visible then r.body end,
           case when v_signed_in then coalesce(pr.display_name, 'Cosurfer') end,
           case when v_signed_in then pr.points end,
           case when v_signed_in then r.wifi_rating end,
           case when v_signed_in then r.power_rating end,
           case when v_signed_in then r.quiet_rating end,
           case when v_signed_in then r.comfort_rating end,
           case when v_signed_in then r.value_rating end,
           case when v_signed_in then r.calls_ok end,
           case when v_signed_in then r.visited_at end,
           r.body is not null,
           r.created_at,
           r.updated_at,
           not v_signed_in,
           r.body is not null and not x.body_visible,
           coalesce(r.user_id = v_uid, false),
           r.status,
           case when v_signed_in then r.user_id end,
           case when v_signed_in then pr.avatar_path end,
           case when v_signed_in then pr.points_pending end,
           coalesce(pr.is_guide, false),
           case when r.user_id = v_uid or public.is_admin() then r.edit_status end
      from public.reviews r
      left join public.profiles pr on pr.id = r.user_id
      cross join lateral (
        select v_all_bodies
            or coalesce(r.user_id = v_uid, false)
            or (v_signed_in and exists (
                  select 1 from public.review_unlocks u where u.user_id = v_uid and u.review_id = r.id
                )) as body_visible
      ) x
     where r.place_id = p_place_id
       and (r.status = 'visible' or r.user_id = v_uid or public.is_admin())
     order by (r.body is not null) desc, r.created_at desc;
end;
$$;

drop function if exists public.get_city_contributors(uuid, integer);
create function public.get_city_contributors(p_city_id uuid, p_limit integer default 5)
returns table (
  rank bigint,
  user_id uuid,
  display_name text,
  avatar_path text,
  points integer,
  points_pending integer,
  is_guide boolean,
  city_reviews bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select row_number() over (order by count(*) desc, pr.points desc, pr.id) as rank,
         pr.id,
         coalesce(pr.display_name, 'Cosurfer'),
         pr.avatar_path,
         pr.points,
         pr.points_pending,
         pr.is_guide,
         count(*) as city_reviews
    from public.reviews r
    join public.places p on p.id = r.place_id and p.city_id = p_city_id and p.status = 'published'
    join public.profiles pr on pr.id = r.user_id
   where r.status = 'visible'
   group by pr.id, pr.display_name, pr.avatar_path, pr.points, pr.points_pending, pr.is_guide
   order by rank
   limit least(greatest(p_limit, 1), 20);
$$;

-- ---------------------------------------------------------------------------
-- Public profiles
-- ---------------------------------------------------------------------------

create or replace function public.get_public_profile(p_user uuid)
returns table (
  id uuid,
  display_name text,
  avatar_path text,
  points integer,
  points_pending integer,
  is_guide boolean,
  review_count integer,
  photo_count integer,
  guide_revoked boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select pr.id,
         coalesce(pr.display_name, 'Cosurfer'),
         pr.avatar_path,
         pr.points,
         pr.points_pending,
         pr.is_guide,
         pr.review_count,
         (select count(*)::integer from public.place_photos ph where ph.uploaded_by = pr.id and ph.status = 'approved'),
         public.is_admin() and exists (select 1 from public.guide_revokes g where g.user_id = pr.id)
    from public.profiles pr
   where pr.id = p_user;
$$;

create or replace function public.get_profile_places(p_user uuid)
returns table (
  id uuid,
  slug text,
  name text,
  category text,
  lat double precision,
  lng double precision,
  rating integer,
  review_status text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.slug, p.name, p.category, p.lat, p.lng, rv.rating, rv.status
    from public.places p
    left join lateral (
      select r.rating, r.status
        from public.reviews r
       where r.place_id = p.id
         and r.user_id = p_user
         and (
           r.status = 'visible'
           or ((auth.uid() = p_user or public.is_admin()) and r.status in ('pending', 'rejected'))
         )
       order by (r.status = 'visible') desc, r.updated_at desc
       limit 1
    ) rv on true
   where (p.status = 'published' or public.is_admin())
     and (
       rv.rating is not null
       or exists (
         select 1 from public.place_photos ph
          where ph.place_id = p.id
            and ph.uploaded_by = p_user
            and (
              ph.status = 'approved'
              or ((auth.uid() = p_user or public.is_admin()) and ph.status = 'pending')
            )
       )
     )
   order by p.name;
$$;

create or replace function public.get_profile_reviews(p_user uuid)
returns table (
  id uuid,
  place_id uuid,
  place_slug text,
  place_name text,
  place_category text,
  rating integer,
  body text,
  has_body boolean,
  created_at timestamptz,
  status text,
  edit_status text,
  is_own boolean,
  body_locked boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id,
         r.place_id,
         p.slug,
         p.name,
         p.category,
         r.rating,
         case when x.body_visible then r.body end,
         r.body is not null,
         r.created_at,
         r.status,
         case when auth.uid() = p_user or public.is_admin() then r.edit_status end,
         coalesce(auth.uid() = p_user, false),
         r.body is not null and not x.body_visible
    from public.reviews r
    join public.places p on p.id = r.place_id and (p.status = 'published' or public.is_admin())
    cross join lateral (
      select public.is_plus()
          or public.is_admin()
          or coalesce(auth.uid() = p_user, false)
          or (auth.uid() is not null and exists (
                select 1 from public.review_unlocks u where u.user_id = auth.uid() and u.review_id = r.id
              )) as body_visible
    ) x
   where r.user_id = p_user
     and (
       r.status = 'visible'
       or ((auth.uid() = p_user or public.is_admin()) and r.status in ('pending', 'rejected', 'hidden'))
     )
   order by r.created_at desc;
$$;

create or replace function public.get_profile_photos(p_user uuid)
returns table (
  id uuid,
  place_id uuid,
  place_slug text,
  place_name text,
  preview_path text,
  full_path text,
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select ph.id, ph.place_id, p.slug, p.name, ph.preview_path, ph.full_path, ph.status, ph.created_at
    from public.place_photos ph
    join public.places p on p.id = ph.place_id and (p.status = 'published' or public.is_admin())
   where ph.uploaded_by = p_user
     and (
       ph.status = 'approved'
       or ((auth.uid() = p_user or public.is_admin()) and ph.status = 'pending')
     )
   order by ph.created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- Admin inbox
-- ---------------------------------------------------------------------------

create or replace function public.moderate_contribution(
  p_kind text,
  p_decision text,
  p_id uuid default null,
  p_place_id uuid default null,
  p_user_id uuid default null,
  p_key text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_status text;
  v_edit text;
  v_place uuid;
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise exception 'invalid decision';
  end if;

  if p_kind = 'review' then
    select user_id, status, edit_status into v_user, v_status, v_edit from public.reviews where id = p_id;
    if v_user is null then
      return;
    end if;
    if v_status = 'pending' then
      update public.reviews
         set status = case when p_decision = 'approve' then 'visible' else 'rejected' end
       where id = p_id;
    elsif v_edit = 'pending' then
      if p_decision = 'reject' then
        update public.profiles set edit_rejections = edit_rejections + 1 where id = v_user;
        update public.reviews
           set edit_status = 'rejected',
               pending_rating = null,
               pending_body = null,
               pending_wifi_rating = null,
               pending_power_rating = null,
               pending_quiet_rating = null,
               pending_comfort_rating = null,
               pending_value_rating = null,
               pending_calls_ok = null,
               pending_visited_at = null
         where id = p_id;
      else
        update public.reviews
           set rating = pending_rating,
               body = pending_body,
               wifi_rating = pending_wifi_rating,
               power_rating = pending_power_rating,
               quiet_rating = pending_quiet_rating,
               comfort_rating = pending_comfort_rating,
               value_rating = pending_value_rating,
               calls_ok = pending_calls_ok,
               visited_at = pending_visited_at,
               edit_status = null,
               pending_rating = null,
               pending_body = null,
               pending_wifi_rating = null,
               pending_power_rating = null,
               pending_quiet_rating = null,
               pending_comfort_rating = null,
               pending_value_rating = null,
               pending_calls_ok = null,
               pending_visited_at = null
         where id = p_id and pending_rating is not null;
      end if;
    end if;
    return;
  end if;

  if p_kind = 'photo' then
    if p_decision = 'approve' then
      perform public.approve_place_photo(p_id);
    else
      update public.place_photos set status = 'rejected', rejected_reason = 'rejected' where id = p_id and status = 'pending';
    end if;
    return;
  end if;

  if p_kind = 'suggestion' then
    if p_decision = 'approve' then
      v_place := public.publish_pending_admin_suggestion(p_id);
      if v_place is null or not exists (select 1 from public.place_suggestions where id = p_id and status = 'approved') then
        raise exception 'suggestion_needs_city' using errcode = 'P0001';
      end if;
    else
      update public.place_suggestions set status = 'rejected' where id = p_id and status = 'pending';
    end if;
    return;
  end if;

  if p_kind = 'fact' then
    select user_id, status into v_user, v_status
      from public.place_facts
     where place_id = p_place_id and user_id = p_user_id and key = p_key;
    if v_user is null then
      return;
    end if;
    if v_status = 'pending' then
      update public.place_facts
         set status = case when p_decision = 'approve' then 'approved' else 'rejected' end,
             pending_value = null,
             pending_delete = false
       where place_id = p_place_id and user_id = p_user_id and key = p_key;
    elsif p_decision = 'approve' then
      if exists (
        select 1 from public.place_facts
         where place_id = p_place_id and user_id = p_user_id and key = p_key and pending_delete
      ) then
        delete from public.place_facts where place_id = p_place_id and user_id = p_user_id and key = p_key;
      else
        update public.place_facts
           set value = pending_value, pending_value = null, pending_delete = false, updated_at = now()
         where place_id = p_place_id and user_id = p_user_id and key = p_key and pending_value is not null;
      end if;
    else
      update public.profiles set edit_rejections = edit_rejections + 1 where id = v_user;
      update public.place_facts
         set pending_value = null, pending_delete = false
       where place_id = p_place_id and user_id = p_user_id and key = p_key;
    end if;
    return;
  end if;

  if p_kind = 'menu' then
    update public.place_menus
       set status = case when p_decision = 'approve' then 'approved' else 'rejected' end
     where id = p_id and status = 'pending';
    return;
  end if;

  if p_kind = 'offer' then
    update public.place_offers
       set status = case when p_decision = 'approve' then 'approved' else 'rejected' end
     where id = p_id and status = 'pending';
    return;
  end if;

  raise exception 'invalid kind';
end;
$$;

create or replace function public.get_pending_contributions()
returns table (
  kind text,
  id uuid,
  place_id uuid,
  user_id uuid,
  author_name text,
  avatar_path text,
  place_name text,
  place_slug text,
  created_at timestamptz,
  summary text,
  fact_key text,
  image_path text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    return;
  end if;
  return query
    select 'review'::text,
           r.id,
           r.place_id,
           r.user_id,
           coalesce(pr.display_name, 'Cosurfer'),
           pr.avatar_path,
           p.name,
           p.slug,
           r.updated_at,
           case when r.status = 'pending'
             then 'New review · ' || r.rating::text || ' stars'
             else 'Review edit · ' || coalesce(r.pending_rating, r.rating)::text || ' stars'
           end,
           null::text,
           null::text
      from public.reviews r
      join public.places p on p.id = r.place_id
      left join public.profiles pr on pr.id = r.user_id
     where r.status = 'pending' or r.edit_status = 'pending'
    union all
    select 'photo',
           ph.id,
           ph.place_id,
           ph.uploaded_by,
           coalesce(pr.display_name, 'Cosurfer'),
           pr.avatar_path,
           p.name,
           p.slug,
           ph.created_at,
           'Photo',
           null::text,
           ph.preview_path
      from public.place_photos ph
      join public.places p on p.id = ph.place_id
      left join public.profiles pr on pr.id = ph.uploaded_by
     where ph.status = 'pending'
    union all
    select 'suggestion',
           s.id,
           s.place_id,
           s.user_id,
           coalesce(pr.display_name, 'Cosurfer'),
           pr.avatar_path,
           s.name,
           pl.slug,
           s.created_at,
           'New place' || case when s.city_id is null then ' · city missing' else '' end,
           null::text,
           null::text
      from public.place_suggestions s
      left join public.places pl on pl.id = s.place_id
      left join public.profiles pr on pr.id = s.user_id
     where s.status = 'pending'
    union all
    select 'fact',
           null::uuid,
           f.place_id,
           f.user_id,
           coalesce(pr.display_name, 'Cosurfer'),
           pr.avatar_path,
           p.name,
           p.slug,
           f.updated_at,
           case
             when f.pending_delete then f.key || ' · remove'
             when f.pending_value is not null then f.key || ' · ' || left(f.pending_value::text, 80)
             else f.key || ' · ' || left(f.value::text, 80)
           end,
           f.key,
           null::text
      from public.place_facts f
      join public.places p on p.id = f.place_id
      left join public.profiles pr on pr.id = f.user_id
     where f.status = 'pending' or f.pending_value is not null or f.pending_delete
    union all
    select 'menu',
           m.id,
           m.place_id,
           m.user_id,
           coalesce(pr.display_name, 'Cosurfer'),
           pr.avatar_path,
           p.name,
           p.slug,
           m.created_at,
           case when m.kind = 'hours' then 'Opening hours photo' else 'Menu photo' end,
           null::text,
           m.path
      from public.place_menus m
      join public.places p on p.id = m.place_id
      left join public.profiles pr on pr.id = m.user_id
     where m.status = 'pending'
    union all
    select 'offer',
           o.id,
           o.place_id,
           o.user_id,
           coalesce(pr.display_name, 'Cosurfer'),
           pr.avatar_path,
           p.name,
           p.slug,
           o.created_at,
           o.title,
           null::text,
           null::text
      from public.place_offers o
      join public.places p on p.id = o.place_id
      left join public.profiles pr on pr.id = o.user_id
     where o.status = 'pending'
    order by 9;
end;
$$;

create or replace function public.pending_contribution_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case when public.is_admin() then (
    (select count(*) from public.reviews where status = 'pending' or edit_status = 'pending')
    + (select count(*) from public.place_photos where status = 'pending')
    + (select count(*) from public.place_suggestions where status = 'pending')
    + (select count(*) from public.place_facts where status = 'pending' or pending_value is not null or pending_delete)
    + (select count(*) from public.place_menus where status = 'pending')
    + (select count(*) from public.place_offers where status = 'pending')
  )::integer else 0 end;
$$;

create or replace function public.set_guide_revoked(p_user uuid, p_revoked boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;
  if p_revoked then
    insert into public.guide_revokes (user_id) values (p_user) on conflict (user_id) do nothing;
  else
    delete from public.guide_revokes where user_id = p_user;
  end if;
  perform public.refresh_profile_stats(p_user);
end;
$$;

revoke all on function public.place_fact_value_ok(text, jsonb) from public, anon, authenticated;
revoke all on function public.contribution_totals(uuid) from public, anon, authenticated;
revoke all on function public.user_is_local_guide(uuid) from public, anon, authenticated;
revoke all on function public.is_trusted_author(uuid) from public, anon, authenticated;
revoke all on function public.publish_user_pending(uuid) from public, anon, authenticated;
revoke all on function public.refresh_profile_stats(uuid) from public, anon, authenticated;
revoke all on function public.reviews_moderate() from public, anon, authenticated;
revoke all on function public.reviews_keep_rejection() from public, anon, authenticated;
revoke all on function public.place_menus_trust() from public, anon, authenticated;
revoke all on function public.place_offers_trust() from public, anon, authenticated;
revoke all on function public.touch_profile_points() from public, anon, authenticated;
revoke all on function public.publish_pending_admin_suggestion(uuid) from public, anon, authenticated;
revoke all on function public.protect_profile_stats() from public, anon, authenticated;

grant execute on function public.is_local_guide() to anon, authenticated;
grant execute on function public.get_place_facts(uuid) to anon, authenticated;
grant execute on function public.get_place_menus(uuid) to anon, authenticated;
grant execute on function public.get_place_offers(uuid) to anon, authenticated;
grant execute on function public.get_place_reviews(uuid) to anon, authenticated;
grant execute on function public.get_city_contributors(uuid, integer) to anon, authenticated;
grant execute on function public.get_public_profile(uuid) to anon, authenticated;
grant execute on function public.get_profile_places(uuid) to anon, authenticated;
grant execute on function public.get_profile_reviews(uuid) to anon, authenticated;
grant execute on function public.get_profile_photos(uuid) to anon, authenticated;
grant execute on function public.moderate_contribution(text, text, uuid, uuid, uuid, text) to authenticated;
grant execute on function public.get_pending_contributions() to authenticated;
grant execute on function public.pending_contribution_count() to authenticated;
grant execute on function public.set_guide_revoked(uuid, boolean) to authenticated;

-- Recompute scores and publish anything still waiting for people who are already trusted.
do $$
declare
  r record;
begin
  for r in select id from public.profiles loop
    perform public.refresh_profile_stats(r.id);
  end loop;
end $$;
