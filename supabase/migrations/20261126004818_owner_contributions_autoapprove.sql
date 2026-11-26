-- Contributions from the owners of a place go live right away, on their own place only.
--
-- Already the case: owner_update_place (listing fields), venue offers, owner photos.
-- New here: the community routes. Facts (save_place_facts), menu photos and member deals
-- (place_offers) of a place's owner skip the moderation queue for that place.
--
-- Not changed on purpose: reviews and everything on other places still follow the normal rules,
-- so owners cannot rate their own venue or wave through contributions elsewhere.

create or replace function public.is_owner_of_place(p_user uuid, p_place uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user is not null and exists (
    select 1 from public.place_owners where user_id = p_user and place_id = p_place
  );
$$;

revoke all on function public.is_owner_of_place(uuid, uuid) from public, anon, authenticated;

create or replace function public.place_menus_trust()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_trusted_author(new.user_id) or public.is_owner_of_place(new.user_id, new.place_id) then
    new.status := 'approved';
  else
    new.status := 'pending';
  end if;
  return new;
end;
$$;

create or replace function public.place_offers_trust()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_trusted_author(new.user_id) or public.is_owner_of_place(new.user_id, new.place_id) then
    new.status := 'approved';
  else
    new.status := 'pending';
  end if;
  return new;
end;
$$;

revoke all on function public.place_menus_trust() from public, anon, authenticated;
revoke all on function public.place_offers_trust() from public, anon, authenticated;

-- NOTE: replaces save_place_facts from 20261109180000_levels_and_profiles.sql; only v_trusted changed.
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
  v_trusted := public.is_trusted_author(v_uid) or public.is_owner_of_place(v_uid, p_place_id);

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

revoke all on function public.save_place_facts(uuid, jsonb) from public, anon;
grant execute on function public.save_place_facts(uuid, jsonb) to authenticated;

-- Whatever the new owner had already submitted for this place while waiting goes live too.
create or replace function public.publish_owner_pending(p_user uuid, p_place uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.place_facts
     set value = pending_value, pending_value = null, pending_delete = false, updated_at = now()
   where user_id = p_user and place_id = p_place and status = 'approved' and pending_value is not null;

  delete from public.place_facts
   where user_id = p_user and place_id = p_place and status = 'approved' and pending_delete;

  update public.place_facts
     set status = 'approved', pending_value = null, pending_delete = false
   where user_id = p_user and place_id = p_place and status = 'pending';

  update public.place_menus set status = 'approved'
   where user_id = p_user and place_id = p_place and status = 'pending';
  update public.place_offers set status = 'approved'
   where user_id = p_user and place_id = p_place and status = 'pending';
  update public.place_photos ph
     set status = 'approved',
         rejected_reason = null,
         sort_order = coalesce((
           select max(x.sort_order) + 1 from public.place_photos x
            where x.place_id = ph.place_id and x.status = 'approved'
         ), 0)
   where ph.uploaded_by = p_user and ph.place_id = p_place and ph.status = 'pending';
end;
$$;

revoke all on function public.publish_owner_pending(uuid, uuid) from public, anon, authenticated;

-- NOTE: replaces accept_place_owner_invite from 20261125235815_place_owners.sql; only the
-- publish_owner_pending call is new.
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
  perform public.publish_owner_pending(v_uid, i.place_id);
  return i.place_id;
end;
$$;

revoke all on function public.accept_place_owner_invite(text) from public, anon;
grant execute on function public.accept_place_owner_invite(text) to authenticated;

notify pgrst, 'reload schema';
