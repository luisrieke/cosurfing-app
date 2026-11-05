-- Community facts: every member can add or correct the hard facts of a place (one value per fact).
-- The app combines them with the facts read from the venue website: averages for prices,
-- the majority answer for everything else. Keep keys in sync with src/lib/facts.ts.

create table public.place_facts (
  place_id uuid not null references public.places (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (place_id, user_id, key),
  constraint place_facts_value_check check (
    case key
      when 'open_24_7' then jsonb_typeof(value) = 'boolean'
      when 'meeting_rooms' then jsonb_typeof(value) = 'boolean'
      when 'phone_booths' then jsonb_typeof(value) = 'boolean'
      when 'wifi' then jsonb_typeof(value) = 'boolean'
      when 'laptops' then value in ('"welcome"'::jsonb, '"not_allowed"'::jsonb)
      when 'opening_hours' then
        case when jsonb_typeof(value) = 'string' then char_length(value #>> '{}') between 3 and 300 else false end
      when 'price_range' then
        case when jsonb_typeof(value) = 'number' then (value #>> '{}')::numeric in (1, 2, 3, 4) else false end
      when 'day_pass' then
        case when jsonb_typeof(value) = 'object' and jsonb_typeof(value -> 'amount') = 'number'
               then (value ->> 'amount')::numeric between 0 and 10000 and coalesce(value ->> 'currency', '') ~ '^[A-Z]{3}$'
             else false end
      else false
    end
  )
);

create index place_facts_user_idx on public.place_facts (user_id);

alter table public.place_facts enable row level security;

-- Members read their own entries directly; everyone else reads through get_place_facts.
create policy "read own facts" on public.place_facts
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "admins delete facts" on public.place_facts
  for delete to authenticated using ((select public.is_admin()));

-- All entries of a place. Names are shown to signed-in users only, like review authors.
create or replace function public.get_place_facts(p_place_id uuid)
returns table (
  key text,
  value jsonb,
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
         case when auth.uid() is not null then coalesce(pr.display_name, 'Cosurfer') end,
         coalesce(f.user_id = auth.uid(), false),
         f.updated_at
    from public.place_facts f
    join public.places p on p.id = f.place_id and (p.status = 'published' or public.is_admin())
    left join public.profiles pr on pr.id = f.user_id
   where f.place_id = p_place_id
   order by f.updated_at desc;
$$;

-- Replaces the caller's facts for a place: keys missing from p_facts (or null) are removed.
create or replace function public.save_place_facts(p_place_id uuid, p_facts jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
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

  delete from public.place_facts f
   where f.place_id = p_place_id
     and f.user_id = v_uid
     and coalesce(jsonb_typeof(p_facts -> f.key), 'null') = 'null';

  insert into public.place_facts (place_id, user_id, key, value)
  select p_place_id, v_uid, e.key, e.value
    from jsonb_each(p_facts) e
   where jsonb_typeof(e.value) <> 'null'
  on conflict (place_id, user_id, key) do update
    set value = excluded.value, updated_at = now()
    where place_facts.value is distinct from excluded.value;
end;
$$;

revoke all on function public.get_place_facts(uuid) from public;
grant execute on function public.get_place_facts(uuid) to anon, authenticated;
revoke all on function public.save_place_facts(uuid, jsonb) from public, anon;
grant execute on function public.save_place_facts(uuid, jsonb) to authenticated;
