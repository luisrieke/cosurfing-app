-- Admin follow-ups for community changes. Whenever a change from a member goes live (a review,
-- a fact, a photo, a menu or hours photo, an offer or a suggested place) an open task is created
-- so the team can thank the contributor and reach out to the cafe or coworking space (for example
-- to offer a booking integration). Changes by the same member on the same place are merged into
-- one open task. Rejected or still pending changes never create a task.

create table public.place_change_tasks (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'done')),
  -- e.g. {"review": 1, "fact": 2}
  kind_counts jsonb not null default '{}'::jsonb,
  -- keys of changed facts, so the outreach message can mention what changed
  fact_keys text[] not null default '{}',
  thanked_at timestamptz,
  reached_out_at timestamptz,
  created_at timestamptz not null default now(),
  last_change_at timestamptz not null default now(),
  completed_at timestamptz
);

-- One open task per place and member; later changes are merged into it.
create unique index place_change_tasks_open_uidx
  on public.place_change_tasks (place_id, user_id) where status = 'open';
create index place_change_tasks_status_idx on public.place_change_tasks (status, last_change_at desc);
create index place_change_tasks_place_idx on public.place_change_tasks (place_id, created_at);
create index place_change_tasks_user_idx on public.place_change_tasks (user_id);

alter table public.place_change_tasks enable row level security;

create policy "admins manage place change tasks" on public.place_change_tasks
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- Remember when a task was closed, whoever closes it. Reopening clears the timestamp again.
create or replace function public.place_change_tasks_set_completed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'done' then
    if tg_op = 'INSERT' or old.status is distinct from 'done' or new.completed_at is null then
      new.completed_at := coalesce(new.completed_at, now());
    end if;
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger place_change_tasks_set_completed_at
  before insert or update on public.place_change_tasks
  for each row execute function public.place_change_tasks_set_completed_at();

-- ---------------------------------------------------------------------------
-- Recording a change
-- ---------------------------------------------------------------------------

create or replace function public.record_place_change(
  p_place uuid,
  p_user uuid,
  p_kind text,
  p_detail text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_place is null or p_user is null then
    return;
  end if;
  -- The team's own edits do not need a thank-you.
  if exists (select 1 from public.admin_users where user_id = p_user) then
    return;
  end if;

  insert into public.place_change_tasks as t (place_id, user_id, kind_counts, fact_keys)
  values (
    p_place,
    p_user,
    jsonb_build_object(p_kind, 1),
    case when p_detail is null then '{}'::text[] else array[p_detail] end
  )
  on conflict (place_id, user_id) where status = 'open'
  do update set
    kind_counts = jsonb_set(
      t.kind_counts,
      array[p_kind],
      to_jsonb(coalesce((t.kind_counts ->> p_kind)::int, 0) + 1)
    ),
    fact_keys = case
      when p_detail is null or p_detail = any (t.fact_keys) then t.fact_keys
      else t.fact_keys || p_detail
    end,
    last_change_at = now();
end;
$$;

revoke all on function public.record_place_change(uuid, uuid, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Triggers: fire when a change becomes live
-- ---------------------------------------------------------------------------

create or replace function public.place_change_tasks_on_live()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if tg_table_name = 'reviews' then
      if new.status = 'visible' and (
        tg_op = 'INSERT'
        or (old.status is distinct from 'visible' and old.status is distinct from 'hidden')
        or (
          old.status = 'visible' and (
            new.rating is distinct from old.rating
            or new.body is distinct from old.body
            or new.wifi_rating is distinct from old.wifi_rating
            or new.power_rating is distinct from old.power_rating
            or new.quiet_rating is distinct from old.quiet_rating
            or new.comfort_rating is distinct from old.comfort_rating
            or new.value_rating is distinct from old.value_rating
            or new.calls_ok is distinct from old.calls_ok
            or new.visited_at is distinct from old.visited_at
          )
        )
      ) then
        perform public.record_place_change(new.place_id, new.user_id, 'review');
      end if;

    elsif tg_table_name = 'place_facts' then
      if new.status = 'approved' and (
        tg_op = 'INSERT' or old.status is distinct from 'approved' or new.value is distinct from old.value
      ) then
        perform public.record_place_change(new.place_id, new.user_id, 'fact', new.key);
      end if;

    elsif tg_table_name = 'place_photos' then
      if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
        perform public.record_place_change(new.place_id, new.uploaded_by, 'photo');
      end if;

    elsif tg_table_name = 'place_menus' then
      if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
        perform public.record_place_change(
          new.place_id, new.user_id, case when new.kind = 'hours' then 'hours' else 'menu' end
        );
      end if;

    elsif tg_table_name = 'place_offers' then
      if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
        perform public.record_place_change(new.place_id, new.user_id, 'offer');
      end if;

    elsif tg_table_name = 'place_suggestions' then
      if new.status = 'approved' and new.place_id is not null and (
        tg_op = 'INSERT' or old.status is distinct from 'approved' or old.place_id is null
      ) then
        perform public.record_place_change(new.place_id, new.user_id, 'suggestion');
      end if;
    end if;
  exception when others then
    -- Bookkeeping for the admin list must never block a member's contribution.
    raise warning 'place_change_tasks_on_live failed for %: %', tg_table_name, sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function public.place_change_tasks_on_live() from public, anon, authenticated;

create trigger place_change_tasks_reviews
  after insert or update on public.reviews
  for each row execute function public.place_change_tasks_on_live();
create trigger place_change_tasks_facts
  after insert or update on public.place_facts
  for each row execute function public.place_change_tasks_on_live();
create trigger place_change_tasks_photos
  after insert or update on public.place_photos
  for each row execute function public.place_change_tasks_on_live();
create trigger place_change_tasks_menus
  after insert or update on public.place_menus
  for each row execute function public.place_change_tasks_on_live();
create trigger place_change_tasks_offers
  after insert or update on public.place_offers
  for each row execute function public.place_change_tasks_on_live();
create trigger place_change_tasks_suggestions
  after insert or update on public.place_suggestions
  for each row execute function public.place_change_tasks_on_live();

-- ---------------------------------------------------------------------------
-- Admin list
-- ---------------------------------------------------------------------------

create or replace function public.admin_get_place_change_tasks()
returns table (
  id uuid,
  place_id uuid,
  place_name text,
  place_slug text,
  place_website text,
  city_name text,
  user_id uuid,
  author_name text,
  author_avatar_path text,
  author_email text,
  status text,
  kind_counts jsonb,
  fact_keys text[],
  thanked_at timestamptz,
  reached_out_at timestamptz,
  created_at timestamptz,
  last_change_at timestamptz,
  completed_at timestamptz,
  previous_count integer,
  previous_reached_out_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    return;
  end if;
  return query
    select t.id,
           t.place_id,
           p.name,
           p.slug,
           p.website,
           c.name,
           t.user_id,
           coalesce(pr.display_name, 'Cosurfer'),
           pr.avatar_path,
           u.email::text,
           t.status,
           t.kind_counts,
           t.fact_keys,
           t.thanked_at,
           t.reached_out_at,
           t.created_at,
           t.last_change_at,
           t.completed_at,
           (select count(*)::int from public.place_change_tasks o
             where o.place_id = t.place_id and o.id <> t.id and o.created_at < t.created_at),
           (select max(o.reached_out_at) from public.place_change_tasks o
             where o.place_id = t.place_id and o.id <> t.id)
      from public.place_change_tasks t
      join public.places p on p.id = t.place_id
      left join public.cities c on c.id = p.city_id
      left join public.profiles pr on pr.id = t.user_id
      left join auth.users u on u.id = t.user_id
     order by t.last_change_at desc
     limit 500;
end;
$$;

revoke all on function public.admin_get_place_change_tasks() from public, anon;
grant execute on function public.admin_get_place_change_tasks() to authenticated;
