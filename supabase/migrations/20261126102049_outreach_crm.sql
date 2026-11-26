-- Outreach CRM: a history of every contact with a place (emails sent and received, calls, visits,
-- notes), plus contact person, notes and a follow-up date on the outreach row itself.
-- The admin outreach list shows the contact email, the last contact and the history per place.

alter table public.place_outreach
  add column if not exists contact_name text,
  add column if not exists notes text,
  add column if not exists last_contacted_at timestamptz,
  add column if not exists next_follow_up_at date;

create table if not exists public.place_outreach_activities (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id) on delete cascade,
  kind text not null check (kind in ('email_out', 'email_in', 'call', 'visit', 'note')),
  from_address text,
  to_address text,
  subject text,
  body text,
  gmail_message_id text,
  gmail_thread_id text,
  occurred_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists place_outreach_activities_place_idx
  on public.place_outreach_activities (place_id, occurred_at desc);

alter table public.place_outreach_activities enable row level security;

revoke all on public.place_outreach_activities from anon;

drop policy if exists "admins manage outreach activities" on public.place_outreach_activities;
create policy "admins manage outreach activities" on public.place_outreach_activities
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- Logging an email or call keeps last_contacted_at current without a second write from the client.
create or replace function public.place_outreach_touch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind in ('email_out', 'email_in', 'call', 'visit') then
    insert into public.place_outreach (place_id, last_contacted_at)
    values (new.place_id, new.occurred_at)
    on conflict (place_id) do update
      set last_contacted_at = greatest(coalesce(public.place_outreach.last_contacted_at, excluded.last_contacted_at), excluded.last_contacted_at);
  end if;
  return new;
end;
$$;

drop trigger if exists place_outreach_activities_touch on public.place_outreach_activities;
create trigger place_outreach_activities_touch
  after insert on public.place_outreach_activities
  for each row execute function public.place_outreach_touch();

-- The list now also returns the contact email, CRM fields and the number of logged activities.
create or replace function public.admin_outreach(
  p_stage text default null,
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_pattern text;
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_search is not null then
    v_pattern := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  with matching as (
    select p.id, p.slug, p.name, p.address, p.website, c.name as city_name,
           coalesce(o.stage, 'to_contact') as stage,
           o.contact_name, o.notes, o.last_contacted_at, o.next_follow_up_at
      from public.places p
      left join public.cities c on c.id = p.city_id
      left join public.place_outreach o on o.place_id = p.id
     where p.status = 'published'
       and (v_pattern is null or p.name ilike v_pattern or c.name ilike v_pattern)
  ),
  page as (
    select m.*, pc.email,
           (select count(*) from public.place_outreach_activities a where a.place_id = m.id) as activity_count
      from (
        select * from matching
         where p_stage is null or stage = p_stage
         order by name, id
         limit least(greatest(p_limit, 1), 200)
        offset greatest(p_offset, 0)
      ) m
      left join public.place_contacts pc on pc.place_id = m.id
  )
  select jsonb_build_object(
    'counts', coalesce((select jsonb_object_agg(s.stage, s.n) from (
      select stage, count(*) as n from matching group by stage
    ) s), '{}'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'slug', slug, 'name', name, 'address', address, 'website', website,
      'city', case when city_name is null then null else jsonb_build_object('name', city_name) end,
      'stage', stage, 'email', email, 'contact_name', contact_name, 'notes', notes,
      'last_contacted_at', last_contacted_at, 'next_follow_up_at', next_follow_up_at,
      'activity_count', activity_count
    ) order by name, id) from page), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.admin_outreach(text, text, integer, integer) from public, anon;
grant execute on function public.admin_outreach(text, text, integer, integer) to authenticated;
