-- Venue owners: the team of a café, coworking or coliving can keep their own entry up to date.
--
-- An admin creates a single-use invite link for a place (place_owner_invites) and sends it to the
-- venue. Whoever opens it signed in becomes an owner of that place (place_owners). Owners edit a
-- fixed set of fields through owner_update_place (never name, slug, city, location or status),
-- upload photos that go live right away, and hide or reorder the photos of their place.
-- Every owner edit is logged in place_owner_changes for the admin.
--
-- Also new:
--   places.access 'on_request'   no drop-ins, but you can ask the team first
--   places.hours_source 'venue'  opening hours entered by the venue itself (like 'team', never
--                                recomputed from the listing)
-- Keep in sync with src/lib/types.ts (PlaceAccess) and src/lib/hours.ts (HoursSource).

-- ---------------------------------------------------------------------------
-- Access "on request"
-- ---------------------------------------------------------------------------

alter table public.places drop constraint if exists places_access_check;
alter table public.places
  add constraint places_access_check
  check (access in ('open', 'registration', 'on_request', 'application', 'members', 'unknown'));

-- NOTE: replaces place_fact_value_ok from 20261113210000_access_fact.sql; only the access branch changed.
create or replace function public.place_fact_value_ok(p_key text, p_value jsonb)
returns boolean
language sql
immutable
as $$
  select case p_key
    when 'access' then p_value in ('"open"'::jsonb, '"registration"'::jsonb, '"on_request"'::jsonb, '"application"'::jsonb, '"members"'::jsonb)
    when 'open_24_7' then jsonb_typeof(p_value) = 'boolean'
    when 'meeting_rooms' then jsonb_typeof(p_value) = 'boolean'
    when 'phone_booths' then jsonb_typeof(p_value) = 'boolean'
    when 'wifi' then jsonb_typeof(p_value) = 'boolean' or p_value = '"unreliable"'::jsonb
    when 'laptops' then p_value in ('"welcome"'::jsonb, '"not_allowed"'::jsonb)
    when 'opening_hours' then
      case jsonb_typeof(p_value)
        when 'string' then char_length(p_value #>> '{}') between 3 and 300
        when 'object' then public.opening_hours_valid(p_value)
        else false
      end
    when 'laptop_hours' then
      jsonb_typeof(p_value) = 'object'
      and public.laptop_hours_valid(p_value)
      and exists (select 1 from jsonb_each(p_value) e where e.value ->> 'mode' <> 'unknown')
    when 'price_range' then
      case when jsonb_typeof(p_value) = 'number' then (p_value #>> '{}')::numeric in (1, 2, 3, 4) else false end
    when 'day_pass' then
      case when jsonb_typeof(p_value) = 'object' and jsonb_typeof(p_value -> 'amount') = 'number'
             then (p_value ->> 'amount')::numeric between 0 and 10000 and coalesce(p_value ->> 'currency', '') ~ '^[A-Z]{3}$'
                  and (not (p_value ? 'note') or (jsonb_typeof(p_value -> 'note') = 'string' and char_length(p_value ->> 'note') <= 200))
           else false end
    when 'week_pass' then
      case when jsonb_typeof(p_value) = 'object' and jsonb_typeof(p_value -> 'amount') = 'number'
             then (p_value ->> 'amount')::numeric > 0 and (p_value ->> 'amount')::numeric <= 10000
                  and coalesce(p_value ->> 'currency', '') ~ '^[A-Z]{3}$'
                  and (not (p_value ? 'note') or (jsonb_typeof(p_value -> 'note') = 'string' and char_length(p_value ->> 'note') <= 200))
           else false end
    when 'month_pass' then
      case when jsonb_typeof(p_value) = 'object' and jsonb_typeof(p_value -> 'amount') = 'number'
             then (p_value ->> 'amount')::numeric > 0 and (p_value ->> 'amount')::numeric <= 10000
                  and coalesce(p_value ->> 'currency', '') ~ '^[A-Z]{3}$'
                  and (not (p_value ? 'note') or (jsonb_typeof(p_value -> 'note') = 'string' and char_length(p_value ->> 'note') <= 200))
           else false end
    -- Price of one hour in a meeting room; 0 means the rooms are free for members.
    when 'meeting_room_hour' then
      case when jsonb_typeof(p_value) = 'object' and jsonb_typeof(p_value -> 'amount') = 'number'
             then (p_value ->> 'amount')::numeric between 0 and 10000 and coalesce(p_value ->> 'currency', '') ~ '^[A-Z]{3}$'
           else false end
    when 'meeting_room_details' then
      jsonb_typeof(p_value) = 'string' and char_length(btrim(p_value #>> '{}')) between 3 and 300
    else false
  end;
$$;

revoke all on function public.place_fact_value_ok(text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Hours source "venue"
-- ---------------------------------------------------------------------------

alter table public.places drop constraint if exists places_hours_source_check;
alter table public.places
  add constraint places_hours_source_check
  check (hours_source in ('team', 'venue', 'community', 'osm', 'website', 'listing'));

-- NOTE: replaces places_derive_hours from 20261110200000_structured_opening_hours.sql; 'venue'
-- hours are kept like 'team' hours.
create or replace function public.places_derive_hours()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d record;
begin
  if new.hours_source in ('team', 'venue') and new.hours is null then
    new.hours_source := null;
  end if;

  if new.hours_source in ('team', 'venue') then
    if tg_op = 'INSERT' or old.hours_source is distinct from new.hours_source or new.hours is distinct from old.hours then
      new.hours_status := 'structured';
      new.hours_note := null;
      new.hours_flags := '{}';
    end if;
  elsif tg_op = 'INSERT'
     or new.opening_hours is distinct from old.opening_hours
     or (new.web_facts -> 'opening_hours') is distinct from (old.web_facts -> 'opening_hours')
     or new.hours_source is distinct from old.hours_source
     or new.locked_fields is distinct from old.locked_fields then
    select * into d from public.derive_place_hours(
      case when tg_op = 'INSERT' then null else new.id end,
      new.opening_hours, new.web_facts, new.source, new.locked_fields
    );
    new.hours := d.hours;
    -- "Keep as text" survives re-deriving the same unreadable text.
    new.hours_status := case
      when tg_op = 'UPDATE' and d.status = 'needs_review' and new.hours_status = 'text_only'
       and new.opening_hours is not distinct from old.opening_hours
       and d.source is not distinct from old.hours_source then 'text_only'
      else d.status end;
    new.hours_source := d.source;
    new.hours_note := d.note;
    new.hours_flags := coalesce(d.flags, '{}');
  end if;

  -- Laptop hours without a source, or a source without hours, fall back to the member majority.
  if new.laptop_source is not null and new.laptop_hours is null then
    new.laptop_source := null;
  end if;
  if new.laptop_source is null then
    if tg_op = 'INSERT' then
      new.laptop_hours := null;
    elsif old.laptop_source is not null or new.laptop_hours is distinct from old.laptop_hours then
      new.laptop_hours := public.community_laptop_hours(new.id);
      new.laptop_source := case when new.laptop_hours is not null then 'community' end;
    end if;
  end if;

  if tg_op = 'INSERT' or new.hours is distinct from old.hours then
    new.open_ranges := public.hours_week_ranges(new.hours);
  end if;
  if tg_op = 'INSERT' or new.hours is distinct from old.hours
     or new.laptop_hours is distinct from old.laptop_hours or new.category is distinct from old.category then
    new.laptop_ranges := public.laptop_week_ranges(new.laptop_hours, new.hours, new.category);
  end if;
  return new;
end;
$$;

create or replace function public.refresh_place_hours(p_place uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.places%rowtype;
  d record;
begin
  select * into p from public.places where id = p_place;
  if not found or p.hours_source in ('team', 'venue') then
    return;
  end if;
  select * into d from public.derive_place_hours(p.id, p.opening_hours, p.web_facts, p.source, p.locked_fields);
  update public.places
     set hours = d.hours,
         hours_source = d.source,
         hours_status = case when d.status = 'needs_review' and p.hours_status = 'text_only'
                              and p.hours_source is not distinct from d.source then 'text_only' else d.status end,
         hours_note = d.note,
         hours_flags = coalesce(d.flags, '{}')
   where id = p_place
     and (hours is distinct from d.hours
       or hours_source is distinct from d.source
       or hours_note is distinct from d.note
       or hours_flags is distinct from coalesce(d.flags, '{}')
       or (hours_status is distinct from d.status and not (hours_status = 'text_only' and d.status = 'needs_review')));
end;
$$;

-- ---------------------------------------------------------------------------
-- Owners, invites, change log
-- ---------------------------------------------------------------------------

create table public.place_owners (
  place_id uuid not null references public.places (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  invite_id uuid,
  created_at timestamptz not null default now(),
  primary key (place_id, user_id)
);

create index place_owners_user_idx on public.place_owners (user_id);

create table public.place_owner_invites (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id) on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  -- Who it was sent to, for the admin's overview only; anyone with the link can accept it.
  sent_to text check (sent_to is null or char_length(sent_to) <= 200),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz
);

create index place_owner_invites_place_idx on public.place_owner_invites (place_id, created_at desc);

create table public.place_owner_changes (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  -- {"field": {"from": …, "to": …}}
  changes jsonb not null,
  created_at timestamptz not null default now()
);

create index place_owner_changes_created_idx on public.place_owner_changes (created_at desc);
create index place_owner_changes_place_idx on public.place_owner_changes (place_id, created_at desc);

alter table public.place_owners enable row level security;
alter table public.place_owner_invites enable row level security;
alter table public.place_owner_changes enable row level security;

create policy "owners read own rows, admins manage" on public.place_owners
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "admins remove owners" on public.place_owners
  for delete to authenticated using ((select public.is_admin()));

create policy "admins manage owner invites" on public.place_owner_invites
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "admins read owner changes" on public.place_owner_changes
  for select to authenticated using ((select public.is_admin()));

create or replace function public.is_place_owner(p_place_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.place_owners where place_id = p_place_id and user_id = auth.uid()
  );
$$;

revoke all on function public.is_place_owner(uuid) from public;
grant execute on function public.is_place_owner(uuid) to authenticated;

-- What an invite link is for, so the page can show the place before the visitor signs in.
create or replace function public.get_place_owner_invite(p_token text)
returns table (place_id uuid, place_name text, place_slug text, city_name text, state text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.name, p.slug, c.name,
         case
           when i.accepted_at is not null then case when i.accepted_by = auth.uid() then 'accepted' else 'used' end
           when i.expires_at < now() then 'expired'
           else 'valid'
         end
    from public.place_owner_invites i
    join public.places p on p.id = i.place_id
    left join public.cities c on c.id = p.city_id
   where i.token = p_token;
$$;

revoke all on function public.get_place_owner_invite(text) from public;
grant execute on function public.get_place_owner_invite(text) to anon, authenticated;

create or replace function public.accept_place_owner_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  i public.place_owner_invites%rowtype;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;
  select * into i from public.place_owner_invites where token = p_token for update;
  if i.id is null then
    raise exception 'invite_invalid';
  end if;
  if i.accepted_at is not null then
    if i.accepted_by = v_uid then
      return i.place_id;
    end if;
    raise exception 'invite_used';
  end if;
  if i.expires_at < now() then
    raise exception 'invite_expired';
  end if;
  insert into public.place_owners (place_id, user_id, invite_id)
  values (i.place_id, v_uid, i.id)
  on conflict (place_id, user_id) do nothing;
  update public.place_owner_invites set accepted_by = v_uid, accepted_at = now() where id = i.id;
  return i.place_id;
end;
$$;

revoke all on function public.accept_place_owner_invite(text) from public, anon;
grant execute on function public.accept_place_owner_invite(text) to authenticated;

create or replace function public.get_my_owned_places()
returns table (id uuid, slug text, name text, category text, status text, city_name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.slug, p.name, p.category, p.status, c.name
    from public.place_owners o
    join public.places p on p.id = o.place_id
    left join public.cities c on c.id = p.city_id
   where o.user_id = auth.uid()
   order by p.name;
$$;

revoke all on function public.get_my_owned_places() from public, anon;
grant execute on function public.get_my_owned_places() to authenticated;

-- The full place row for its owners (places RLS only shows published places to non-admins).
create or replace function public.owner_get_place(p_place_id uuid)
returns setof public.places
language sql
stable
security definer
set search_path = public
as $$
  select p.* from public.places p
   where p.id = p_place_id and (public.is_place_owner(p.id) or public.is_admin());
$$;

revoke all on function public.owner_get_place(uuid) from public, anon;
grant execute on function public.owner_get_place(uuid) to authenticated;

-- Owners may change these fields and nothing else. Keys missing from p_patch stay as they are;
-- a null hours / laptop_hours goes back to the listing / member answers.
create or replace function public.owner_update_place(p_place_id uuid, p_patch jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed constant text[] := array[
    'description', 'website', 'phone', 'access', 'access_note', 'day_pass_price_cents',
    'wifi', 'power_outlets', 'calls', 'laptop_rules', 'hours', 'laptop_hours',
    'non_guest_work', 'non_guest_note', 'season', 'season_note', 'min_stay'
  ];
  logged constant text[] := allowed || array['hours_source', 'laptop_source'];
  crawled constant text[] := array['website', 'phone', 'wifi'];
  k text;
  v_before jsonb;
  v_after jsonb;
  v_diff jsonb := '{}';
  v_lock text[] := '{}';
  v_text text;
begin
  if auth.uid() is null or not (public.is_place_owner(p_place_id) or public.is_admin()) then
    raise exception 'not allowed';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'invalid patch';
  end if;
  for k in select jsonb_object_keys(p_patch) loop
    if not k = any (allowed) then
      raise exception 'field % cannot be edited', k;
    end if;
  end loop;

  v_text := btrim(p_patch ->> 'description');
  if char_length(v_text) > 1500 then raise exception 'description is too long (max 1500 characters)'; end if;
  v_text := btrim(p_patch ->> 'laptop_rules');
  if char_length(v_text) > 500 then raise exception 'laptop rules are too long (max 500 characters)'; end if;
  v_text := btrim(p_patch ->> 'website');
  if v_text <> '' and (v_text !~* '^https?://[^\s/]+\.[^\s]+$' or char_length(v_text) > 300) then
    raise exception 'website must be a full address starting with https://';
  end if;
  v_text := btrim(p_patch ->> 'phone');
  if char_length(v_text) > 40 then raise exception 'phone number is too long'; end if;
  if p_patch ? 'day_pass_price_cents' and jsonb_typeof(p_patch -> 'day_pass_price_cents') not in ('number', 'null') then
    raise exception 'day pass price must be a number';
  end if;
  if (p_patch ->> 'day_pass_price_cents')::numeric > 100000 then
    raise exception 'day pass price is too high';
  end if;

  select to_jsonb(p) into v_before from public.places p where p.id = p_place_id for update;
  if v_before is null then
    raise exception 'place not found';
  end if;

  update public.places set
    description = case when p_patch ? 'description' then nullif(btrim(p_patch ->> 'description'), '') else description end,
    website = case when p_patch ? 'website' then nullif(btrim(p_patch ->> 'website'), '') else website end,
    phone = case when p_patch ? 'phone' then nullif(btrim(p_patch ->> 'phone'), '') else phone end,
    access = case when p_patch ? 'access' then coalesce(p_patch ->> 'access', 'unknown') else access end,
    access_note = case when p_patch ? 'access_note' then nullif(btrim(p_patch ->> 'access_note'), '') else access_note end,
    day_pass_price_cents = case when p_patch ? 'day_pass_price_cents' then round((p_patch ->> 'day_pass_price_cents')::numeric)::int else day_pass_price_cents end,
    wifi = case when p_patch ? 'wifi' then coalesce(p_patch ->> 'wifi', 'unknown') else wifi end,
    power_outlets = case when p_patch ? 'power_outlets' then coalesce(p_patch ->> 'power_outlets', 'unknown') else power_outlets end,
    calls = case when p_patch ? 'calls' then coalesce(p_patch ->> 'calls', 'unknown') else calls end,
    laptop_rules = case when p_patch ? 'laptop_rules' then nullif(btrim(p_patch ->> 'laptop_rules'), '') else laptop_rules end,
    hours = case when p_patch ? 'hours' then case when jsonb_typeof(p_patch -> 'hours') = 'object' then p_patch -> 'hours' end else hours end,
    hours_source = case when p_patch ? 'hours' then case when jsonb_typeof(p_patch -> 'hours') = 'object' then 'venue' end else hours_source end,
    laptop_hours = case when p_patch ? 'laptop_hours' then case when jsonb_typeof(p_patch -> 'laptop_hours') = 'object' then p_patch -> 'laptop_hours' end else laptop_hours end,
    laptop_source = case when p_patch ? 'laptop_hours' then case when jsonb_typeof(p_patch -> 'laptop_hours') = 'object' then 'venue' end else laptop_source end,
    non_guest_work = case when p_patch ? 'non_guest_work' then coalesce(p_patch ->> 'non_guest_work', 'unknown') else non_guest_work end,
    non_guest_note = case when p_patch ? 'non_guest_note' then nullif(btrim(p_patch ->> 'non_guest_note'), '') else non_guest_note end,
    season = case when p_patch ? 'season' then coalesce(p_patch ->> 'season', 'unknown') else season end,
    season_note = case when p_patch ? 'season_note' then nullif(btrim(p_patch ->> 'season_note'), '') else season_note end,
    min_stay = case when p_patch ? 'min_stay' then nullif(btrim(p_patch ->> 'min_stay'), '') else min_stay end
  where id = p_place_id;

  select to_jsonb(p) into v_after from public.places p where p.id = p_place_id;
  foreach k in array logged loop
    if (v_before -> k) is distinct from (v_after -> k) then
      v_diff := v_diff || jsonb_build_object(k, jsonb_build_object('from', v_before -> k, 'to', v_after -> k));
      if k = any (crawled) then
        v_lock := v_lock || k;
      end if;
    end if;
  end loop;

  if v_diff = '{}'::jsonb then
    return;
  end if;

  -- The crawler must not overwrite what the venue said.
  update public.places
     set locked_fields = (select array(select distinct x from unnest(coalesce(locked_fields, '{}') || v_lock) x order by 1)),
         last_verified_at = current_date
   where id = p_place_id;

  insert into public.place_owner_changes (place_id, user_id, changes)
  values (p_place_id, auth.uid(), v_diff);
end;
$$;

revoke all on function public.owner_update_place(uuid, jsonb) from public, anon;
grant execute on function public.owner_update_place(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Owner photos
-- ---------------------------------------------------------------------------

-- Photos owners upload are approved right away, like those of admins and local guides.
create or replace function public.place_photos_trusted_autoapprove()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'pending' and (
    public.is_trusted_author(new.uploaded_by)
    or exists (select 1 from public.place_owners o where o.place_id = new.place_id and o.user_id = new.uploaded_by)
  ) then
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

-- WITH CHECK sees the row after BEFORE triggers, so auto-approved owner rows must pass too.
drop policy if exists "users upload pending photos" on public.place_photos;
create policy "users upload pending photos" on public.place_photos
  for insert to authenticated with check (
    uploaded_by = (select auth.uid())
    and (
      status = 'pending'
      or (status = 'approved' and ((select public.is_admin()) or (select public.is_local_guide()) or public.is_place_owner(place_id)))
    )
    and rights_accepted_at is not null
    and full_path like place_id::text || '/' || (select auth.uid())::text || '/%'
    and preview_path like place_id::text || '/' || (select auth.uid())::text || '/%'
    and exists (select 1 from public.places p where p.id = place_photos.place_id and p.status = 'published')
  );

-- Owners see the full photos of their own place (cafés are otherwise Plus only).
create or replace function public.owns_place_folder(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.place_owners o
     where o.user_id = auth.uid() and o.place_id::text = (storage.foldername(p_name))[1]
  );
$$;

revoke all on function public.owns_place_folder(text) from public;
grant execute on function public.owns_place_folder(text) to authenticated;

create policy "owners read photos of their place" on storage.objects
  for select to authenticated using (bucket_id = 'place-photos' and public.owns_place_folder(name));

create or replace function public.owner_get_place_photos(p_place_id uuid)
returns table (id uuid, sort_order integer, preview_path text, full_path text, own boolean)
language sql
stable
security definer
set search_path = public
as $$
  select ph.id, ph.sort_order, ph.preview_path, ph.full_path, ph.uploaded_by = auth.uid()
    from public.place_photos ph
   where ph.place_id = p_place_id
     and ph.status = 'approved'
     and (public.is_place_owner(p_place_id) or public.is_admin())
   order by ph.sort_order asc, ph.created_at asc;
$$;

revoke all on function public.owner_get_place_photos(uuid) from public, anon;
grant execute on function public.owner_get_place_photos(uuid) to authenticated;

-- Hidden, not deleted: the admin can restore the photo from the photo queue.
create or replace function public.owner_hide_place_photo(p_photo_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_place uuid;
begin
  select place_id into v_place from public.place_photos where id = p_photo_id;
  if v_place is null or not (public.is_place_owner(v_place) or public.is_admin()) then
    raise exception 'not allowed';
  end if;
  update public.place_photos
     set status = 'rejected', rejected_reason = 'Removed by the venue'
   where id = p_photo_id;
  insert into public.place_owner_changes (place_id, user_id, changes)
  values (v_place, auth.uid(), jsonb_build_object('photo_removed', jsonb_build_object('from', p_photo_id, 'to', null)));
end;
$$;

revoke all on function public.owner_hide_place_photo(uuid) from public, anon;
grant execute on function public.owner_hide_place_photo(uuid) to authenticated;

create or replace function public.owner_reorder_place_photos(p_place_id uuid, p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_place_owner(p_place_id) or public.is_admin()) then
    raise exception 'not allowed';
  end if;
  update public.place_photos ph
     set sort_order = x.ord - 1
    from unnest(p_ids) with ordinality as x(id, ord)
   where ph.id = x.id and ph.place_id = p_place_id;
end;
$$;

revoke all on function public.owner_reorder_place_photos(uuid, uuid[]) from public, anon;
grant execute on function public.owner_reorder_place_photos(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin overview
-- ---------------------------------------------------------------------------

create or replace function public.admin_get_place_owners(p_place_id uuid default null)
returns table (place_id uuid, place_name text, place_slug text, user_id uuid, email text, display_name text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;
  return query
    select o.place_id, p.name, p.slug, o.user_id, u.email::text, pr.display_name, o.created_at
      from public.place_owners o
      join public.places p on p.id = o.place_id
      left join auth.users u on u.id = o.user_id
      left join public.profiles pr on pr.id = o.user_id
     where p_place_id is null or o.place_id = p_place_id
     order by o.created_at desc;
end;
$$;

revoke all on function public.admin_get_place_owners(uuid) from public, anon;
grant execute on function public.admin_get_place_owners(uuid) to authenticated;

create or replace function public.admin_get_owner_changes(p_limit integer default 50)
returns table (id uuid, place_id uuid, place_name text, place_slug text, email text, changes jsonb, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;
  return query
    select c.id, c.place_id, p.name, p.slug, u.email::text, c.changes, c.created_at
      from public.place_owner_changes c
      join public.places p on p.id = c.place_id
      left join auth.users u on u.id = c.user_id
     order by c.created_at desc
     limit least(greatest(p_limit, 1), 200);
end;
$$;

revoke all on function public.admin_get_owner_changes(integer) from public, anon;
grant execute on function public.admin_get_owner_changes(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Starterkitchen (Kiel), from the team's reply on 2026-11-25: no drop-ins; you can come to the
-- open breakfast on Wednesdays and work there that day, other days only if you ask first.
-- ---------------------------------------------------------------------------

update public.places
   set access = 'on_request',
       access_note = 'No drop-ins. Join the open breakfast on Wednesdays and stay to work that day. Other days only if you ask the team first.',
       last_verified_at = date '2026-11-25'
 where slug = 'starterkitchen-de-kiel';

notify pgrst, 'reload schema';
