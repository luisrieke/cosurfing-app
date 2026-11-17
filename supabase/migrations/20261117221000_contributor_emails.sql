-- Emails that bring contributors back, sent by the contributor-emails function:
--   review_live    a review went live after moderation (service email, always sent)
--   visit_prompt   "How was X?" about 20 h after an on-site speed test or saving a place (opt-in)
--   impact_digest  monthly "places you reviewed were viewed X times" (opt-in)
-- Plus aggregated daily view counts per place, without anything about the viewer.

-- ---------------------------------------------------------------------------
-- Consent and unsubscribe token
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column email_nudges boolean not null default false,
  add column email_nudges_at timestamptz,
  add column email_token uuid not null default gen_random_uuid();

create unique index profiles_email_token_idx on public.profiles (email_token);

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
    new.email_token := old.email_token;
    new.email_nudges_at := old.email_nudges_at;
  end if;
  -- Proof of consent: when it was given, cleared when it is withdrawn.
  if new.email_nudges is distinct from old.email_nudges then
    new.email_nudges_at := case when new.email_nudges then now() end;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Queue
-- ---------------------------------------------------------------------------

create table public.contributor_emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('review_live', 'visit_prompt', 'impact_digest')),
  place_id uuid references public.places (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  send_after timestamptz not null default now(),
  sent_at timestamptz,
  skipped text,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now()
);

create unique index contributor_emails_once_idx
  on public.contributor_emails (user_id, kind, place_id)
  where kind in ('review_live', 'visit_prompt');
create index contributor_emails_due_idx
  on public.contributor_emails (send_after)
  where sent_at is null and skipped is null;
create index contributor_emails_user_idx on public.contributor_emails (user_id, kind, sent_at);

alter table public.contributor_emails enable row level security;

create policy "admins read contributor emails" on public.contributor_emails
  for select to authenticated
  using ((select public.is_admin()));

create or replace function public.queue_review_live_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'pending' and new.status = 'visible' then
    insert into public.contributor_emails (user_id, kind, place_id)
    values (new.user_id, 'review_live', new.place_id)
    on conflict do nothing;
  end if;
  return null;
end;
$$;

drop trigger if exists reviews_live_email on public.reviews;
create trigger reviews_live_email
  after update of status on public.reviews
  for each row execute function public.queue_review_live_email();

create or replace function public.queue_visit_prompt(p_user uuid, p_place uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.contributor_emails (user_id, kind, place_id, send_after)
  select p_user, 'visit_prompt', p_place, now() + interval '20 hours'
   where not exists (select 1 from public.reviews r where r.user_id = p_user and r.place_id = p_place)
  on conflict do nothing;
$$;

create or replace function public.speed_tests_visit_prompt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.on_site then
    perform public.queue_visit_prompt(new.user_id, new.place_id);
  end if;
  return null;
end;
$$;

drop trigger if exists speed_tests_visit_prompt on public.speed_tests;
create trigger speed_tests_visit_prompt
  after insert on public.speed_tests
  for each row execute function public.speed_tests_visit_prompt();

create or replace function public.favorites_visit_prompt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.queue_visit_prompt(new.user_id, new.place_id);
  return null;
end;
$$;

drop trigger if exists favorites_visit_prompt on public.favorites;
create trigger favorites_visit_prompt
  after insert on public.favorites
  for each row execute function public.favorites_visit_prompt();

-- ---------------------------------------------------------------------------
-- Place views (aggregated per day, nothing about the viewer)
-- ---------------------------------------------------------------------------

create table public.place_view_counts (
  place_id uuid not null references public.places (id) on delete cascade,
  day date not null default current_date,
  views integer not null default 0,
  primary key (place_id, day)
);

alter table public.place_view_counts enable row level security;

create policy "admins read place views" on public.place_view_counts
  for select to authenticated
  using ((select public.is_admin()));

create or replace function public.track_place_view(p_place_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.place_view_counts (place_id, day, views)
  select p.id, current_date, 1 from public.places p where p.id = p_place_id and p.status = 'published'
  on conflict (place_id, day) do update set views = place_view_counts.views + 1;
$$;

-- ---------------------------------------------------------------------------
-- For the contributor-emails function (service role only)
-- ---------------------------------------------------------------------------

create or replace function public.contributor_email_batch(p_limit integer default 50)
returns table (
  id uuid,
  kind text,
  user_id uuid,
  place_id uuid,
  place_name text,
  place_slug text,
  city_id uuid,
  city_name text,
  city_slug text,
  display_name text,
  email_token uuid,
  payload jsonb,
  attempts integer
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  update public.contributor_emails e set skipped = 'no_consent'
    from public.profiles pr
   where pr.id = e.user_id and e.kind in ('visit_prompt', 'impact_digest')
     and e.sent_at is null and e.skipped is null and not pr.email_nudges;

  update public.contributor_emails e set skipped = 'already_reviewed'
   where e.kind = 'visit_prompt' and e.sent_at is null and e.skipped is null
     and exists (select 1 from public.reviews r where r.user_id = e.user_id and r.place_id = e.place_id);

  update public.contributor_emails e set skipped = 'stale'
   where e.kind = 'review_live' and e.sent_at is null and e.skipped is null
     and e.created_at < now() - interval '7 days';

  update public.contributor_emails e set skipped = 'place_gone'
   where e.place_id is not null and e.sent_at is null and e.skipped is null
     and not exists (select 1 from public.places p where p.id = e.place_id and p.status = 'published');

  -- At most one "How was X?" every 3 days per person.
  update public.contributor_emails e
     set send_after = l.last_sent + interval '3 days'
    from (
      select c.user_id, max(c.sent_at) as last_sent
        from public.contributor_emails c
       where c.kind = 'visit_prompt' and c.sent_at > now() - interval '3 days'
       group by c.user_id
    ) l
   where e.user_id = l.user_id and e.kind = 'visit_prompt'
     and e.sent_at is null and e.skipped is null and e.send_after < l.last_sent + interval '3 days';

  with ranked as (
    select c.id, row_number() over (partition by c.user_id order by c.send_after, c.created_at) as rn
      from public.contributor_emails c
     where c.kind = 'visit_prompt' and c.sent_at is null and c.skipped is null and c.send_after <= now()
  )
  update public.contributor_emails e
     set send_after = now() + interval '3 days'
    from ranked
   where e.id = ranked.id and ranked.rn > 1;

  return query
    select e.id, e.kind, e.user_id, e.place_id,
           p.name, p.slug,
           coalesce(p.city_id, pr.home_city_id),
           c.name, c.slug,
           coalesce(pr.display_name, ''),
           pr.email_token,
           e.payload,
           e.attempts
      from public.contributor_emails e
      join public.profiles pr on pr.id = e.user_id
      left join public.places p on p.id = e.place_id
      left join public.cities c on c.id = coalesce(p.city_id, pr.home_city_id)
     where e.sent_at is null and e.skipped is null and e.attempts < 5 and e.send_after <= now()
     order by e.send_after
     limit least(greatest(p_limit, 1), 200);
end;
$$;

-- Places the person has not rated yet, ones without any review first.
create or replace function public.contributor_email_suggestions(p_user uuid, p_city uuid, p_exclude uuid default null, p_limit integer default 3)
returns table (slug text, name text, review_count integer)
language sql
stable
security definer
set search_path = public
as $$
  select p.slug, p.name, p.review_count
    from public.places p
   where p.city_id = p_city
     and p.status = 'published'
     and p.category <> 'coliving'
     and p.id is distinct from p_exclude
     and not exists (select 1 from public.reviews r where r.place_id = p.id and r.user_id = p_user)
   order by (p.review_count = 0) desc, p.work_score desc nulls last, p.name
   limit least(greatest(p_limit, 1), 10);
$$;

create or replace function public.queue_impact_digests()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with stats as (
    select pr.id as user_id,
           (select coalesce(sum(v.views), 0)
              from public.reviews r
              join public.place_view_counts v on v.place_id = r.place_id
             where r.user_id = pr.id and r.status = 'visible'
               and v.day >= current_date - 30 and v.day >= r.created_at::date) as views,
           (select count(*)
              from public.review_unlocks u
              join public.reviews r on r.id = u.review_id
             where r.user_id = pr.id and r.status = 'visible' and u.user_id <> pr.id
               and u.unlocked_at >= now() - interval '30 days') as unlocks,
           (select count(*) from public.reviews r where r.user_id = pr.id and r.status = 'visible') as reviews
      from public.profiles pr
     where pr.email_nudges
  )
  insert into public.contributor_emails (user_id, kind, payload)
  select s.user_id, 'impact_digest', jsonb_build_object('views', s.views, 'unlocks', s.unlocks, 'reviews', s.reviews)
    from stats s
   where s.reviews > 0 and (s.views >= 20 or s.unlocks >= 1);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.contributor_unsubscribe(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles set email_nudges = false where email_token = p_token;
  return found;
end;
$$;

revoke all on function public.queue_review_live_email() from public, anon, authenticated;
revoke all on function public.queue_visit_prompt(uuid, uuid) from public, anon, authenticated;
revoke all on function public.speed_tests_visit_prompt() from public, anon, authenticated;
revoke all on function public.favorites_visit_prompt() from public, anon, authenticated;
revoke all on function public.contributor_email_batch(integer) from public, anon, authenticated;
revoke all on function public.contributor_email_suggestions(uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.queue_impact_digests() from public, anon, authenticated;
revoke all on function public.contributor_unsubscribe(uuid) from public, anon, authenticated;
grant execute on function public.contributor_email_batch(integer) to service_role;
grant execute on function public.contributor_email_suggestions(uuid, uuid, uuid, integer) to service_role;
grant execute on function public.contributor_unsubscribe(uuid) to service_role;
grant execute on function public.track_place_view(uuid) to anon, authenticated;

select cron.schedule('cosurfing-impact-digests', '0 8 1 * *', $$select public.queue_impact_digests()$$);
select cron.schedule(
  'cosurfing-purge-contributor-emails',
  '53 3 * * *',
  $$delete from public.contributor_emails where created_at < now() - interval '400 days';
    delete from public.place_view_counts where day < current_date - 730$$
);
-- The sender (cosurfing-contributor-emails, every 10 minutes) is scheduled separately once
-- the emails have been checked with EMAIL_SANDBOX_TO:
-- select cron.schedule('cosurfing-contributor-emails', '*/10 * * * *', $$select public.invoke_crawler('contributor-emails')$$);
