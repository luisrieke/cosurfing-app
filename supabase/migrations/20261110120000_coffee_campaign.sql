-- Early Contributors Coffee Program ("Your next 3 coffees are on me").
--
-- Participation is tied to the Supabase user. Every table below has RLS enabled and no client
-- policies: participants and admins only go through the security definer RPCs at the bottom.
--
-- Proof (screenshots, receipt) is not uploaded here. Participants send it as a direct message
-- to Luis on Instagram, TikTok or X together with their personal code (coffee_participants.code)
-- and then mark the step as sent (coffee_mark_sent). The admin matches the message by code and
-- handle, records the receipt details on approval and pays by hand.
--
-- Spot policy (first N participants, enforced here under an advisory lock):
--   * join            -> 'reserved' for reservation_days, or 'waitlisted' when every spot is taken
--   * base submitted  -> 'held' (no expiry while it is under review)
--   * base approved   -> 'confirmed' (counts for good)
--   * base rejected   -> back to 'reserved' for resubmit_days while attempts < max_base_attempts,
--                        otherwise 'released'
--   * reservation expires without a submission -> 'released' (reason 'expired'); may rejoin once
--   Freed spots go to the oldest waitlisted participant, who gets a fresh reservation and an email.
-- Spots taken = held + confirmed + reserved with an unexpired reservation.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.coffee_campaign (
  id text primary key default 'early-contributors' check (id = 'early-contributors'),
  status text not null default 'draft' check (status in ('draft', 'live', 'paused', 'closed')),
  max_participants integer not null default 50 check (max_participants between 1 and 1000),
  max_coffee_cents integer not null default 500 check (max_coffee_cents between 1 and 500),
  reservation_days integer not null default 7 check (reservation_days between 1 and 60),
  resubmit_days integer not null default 7 check (resubmit_days between 1 and 60),
  max_attempts integer not null default 2 check (max_attempts between 1 and 5),
  starts_at timestamptz,
  ends_at timestamptz,
  submissions_close_at timestamptz,
  terms_version text not null default '2026-11-11' check (char_length(terms_version) <= 20),
  updated_at timestamptz not null default now()
);

insert into public.coffee_campaign (id) values ('early-contributors');

create table public.coffee_participants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  -- Quoted in the direct message so the proof can be matched to the account.
  code text not null unique check (code ~ '^CS-[A-HJ-NP-Z2-9]{5}$'),
  social_channel text check (social_channel is null or social_channel in ('instagram', 'tiktok', 'x')),
  social_handle text check (social_handle is null or social_handle ~ '^[A-Za-z0-9._]{1,40}$'),
  spot_status text not null check (spot_status in ('reserved', 'held', 'confirmed', 'waitlisted', 'released')),
  reserved_until timestamptz,
  released_reason text check (released_reason is null or released_reason in ('expired', 'rejected', 'disqualified', 'withdrawn', 'campaign_closed')),
  rejoins integer not null default 0,
  terms_version text not null,
  terms_accepted_at timestamptz not null default now(),
  joined_at timestamptz not null default now(),
  promoted_at timestamptz,
  confirmed_at timestamptz,
  released_at timestamptz,
  admin_note text check (admin_note is null or char_length(admin_note) <= 2000),
  updated_at timestamptz not null default now(),
  constraint coffee_participants_reservation check ((spot_status = 'reserved') = (reserved_until is not null))
);

create index coffee_participants_spot_idx on public.coffee_participants (spot_status, joined_at);

create trigger coffee_participants_updated_at
  before update on public.coffee_participants
  for each row execute function public.set_updated_at();

create table public.coffee_rewards (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.coffee_participants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  step text not null check (step in ('contribute', 'new_place', 'spread')),
  status text not null default 'not_started'
    check (status in ('not_started', 'submitted', 'under_review', 'approved', 'rejected', 'paid')),
  attempts integer not null default 0,
  submitted_at timestamptz,
  submitted_by text check (submitted_by is null or submitted_by in ('participant', 'admin')),
  checks jsonb not null default '{}'::jsonb,
  referral_user_id uuid references auth.users (id) on delete set null,
  approved_cents integer check (approved_cents is null or approved_cents between 1 and 500),
  receipt_fingerprint text check (receipt_fingerprint is null or char_length(receipt_fingerprint) <= 300),
  decision_reason text,
  decision_note text check (decision_note is null or char_length(decision_note) <= 1000),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  paid_cents integer check (paid_cents is null or paid_cents between 1 and 500),
  paid_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, step),
  constraint coffee_rewards_approved check (status not in ('approved', 'paid') or (approved_cents is not null and receipt_fingerprint is not null)),
  constraint coffee_rewards_paid check ((status = 'paid') = (paid_at is not null) and (paid_cents is null or paid_cents <= approved_cents))
);

-- The same receipt can never be reimbursed twice, and a friend can only be referred once.
create unique index coffee_rewards_receipt_once on public.coffee_rewards (receipt_fingerprint)
  where status in ('approved', 'paid');
create unique index coffee_rewards_referral_once on public.coffee_rewards (referral_user_id)
  where referral_user_id is not null and status <> 'rejected';
create index coffee_rewards_status_idx on public.coffee_rewards (status, submitted_at);

create trigger coffee_rewards_updated_at
  before update on public.coffee_rewards
  for each row execute function public.set_updated_at();

-- Only collected after a reward was approved. Deleted 30 days after the last approved reward was paid.
create table public.coffee_payout_details (
  user_id uuid primary key references auth.users (id) on delete cascade,
  method text not null check (method in ('paypal', 'sepa')),
  account_holder text not null check (char_length(account_holder) between 2 and 120),
  paypal_email text check (paypal_email is null or (char_length(paypal_email) <= 254 and paypal_email like '%_@_%._%')),
  iban text check (iban is null or iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coffee_payout_details_method check (
    (method = 'paypal' and paypal_email is not null and iban is null)
    or (method = 'sepa' and iban is not null and paypal_email is null)
  )
);

create trigger coffee_payout_details_updated_at
  before update on public.coffee_payout_details
  for each row execute function public.set_updated_at();

-- Accounting record of every manual payout. Survives account deletion (tax retention, § 147 AO).
create table public.coffee_payouts (
  id uuid primary key default gen_random_uuid(),
  reward_id uuid references public.coffee_rewards (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  step text not null,
  payee text not null check (char_length(payee) <= 120),
  amount_cents integer not null check (amount_cents between 1 and 500),
  method text not null check (method in ('paypal', 'sepa', 'other')),
  reference text check (reference is null or char_length(reference) <= 200),
  paid_by uuid references auth.users (id) on delete set null,
  paid_at timestamptz not null default now()
);

create table public.coffee_notices (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('spot_reserved', 'reward_approved', 'reward_rejected', 'reward_paid')),
  user_id uuid not null references auth.users (id) on delete cascade,
  step text,
  reason text,
  note text,
  amount_cents integer,
  can_resubmit boolean,
  attempts integer not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index coffee_notices_unsent_idx on public.coffee_notices (created_at) where sent_at is null;

alter table public.coffee_campaign enable row level security;
alter table public.coffee_participants enable row level security;
alter table public.coffee_rewards enable row level security;
alter table public.coffee_payout_details enable row level security;
alter table public.coffee_payouts enable row level security;
alter table public.coffee_notices enable row level security;

-- ---------------------------------------------------------------------------
-- Incentive disclosure on reviews (§ 5b (3) UWG, Omnibus Directive)
-- ---------------------------------------------------------------------------

alter table public.reviews add column coffee_program boolean not null default false;

create or replace function public.coffee_window_start(p_user uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select least(coalesce(c.starts_at, p.joined_at), p.joined_at)
    from public.coffee_participants p
    cross join public.coffee_campaign c
   where p.user_id = p_user;
$$;

-- Reviews written while someone takes part are labelled; clients can never remove the label.
create or replace function public.reviews_coffee_program()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.coffee_program := (tg_op = 'UPDATE' and old.coffee_program)
    or exists (
      select 1 from public.coffee_participants p
       where p.user_id = new.user_id and p.spot_status in ('reserved', 'held', 'confirmed')
    );
  return new;
end;
$$;

revoke all on function public.reviews_coffee_program() from public, anon, authenticated;

create trigger reviews_coffee_program
  before insert or update on public.reviews
  for each row execute function public.reviews_coffee_program();

create or replace function public.coffee_flag_reviews(p_user uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.reviews
     set coffee_program = true
   where user_id = p_user
     and not coffee_program
     and created_at >= public.coffee_window_start(p_user);
$$;

revoke all on function public.coffee_flag_reviews(uuid) from public, anon, authenticated;

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
  edit_status text,
  coffee_program boolean
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
           case when r.user_id = v_uid or public.is_admin() then r.edit_status end,
           r.coffee_program
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

grant execute on function public.get_place_reviews(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Spots
-- ---------------------------------------------------------------------------

create or replace function public.coffee_spots_taken()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
    from public.coffee_participants
   where spot_status in ('held', 'confirmed')
      or (spot_status = 'reserved' and reserved_until > now());
$$;

revoke all on function public.coffee_spots_taken() from public, anon, authenticated;

-- Releases expired reservations and hands freed spots to the waitlist, oldest first.
create or replace function public.coffee_rebalance()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.coffee_campaign;
  v_free integer;
  v_p record;
begin
  perform pg_advisory_xact_lock(hashtext('coffee_campaign'));
  select * into c from public.coffee_campaign where id = 'early-contributors';

  update public.coffee_participants
     set spot_status = 'released', released_reason = 'expired', released_at = now(), reserved_until = null
   where spot_status = 'reserved' and reserved_until <= now();

  if c.status = 'closed'
     or (c.submissions_close_at is not null and now() >= c.submissions_close_at) then
    update public.coffee_participants
       set spot_status = 'released', released_reason = 'campaign_closed', released_at = now(), reserved_until = null
     where spot_status in ('reserved', 'waitlisted');
    return;
  end if;
  if c.status <> 'live' then
    return;
  end if;

  v_free := c.max_participants - public.coffee_spots_taken();
  if v_free <= 0 then
    return;
  end if;
  for v_p in
    select id, user_id from public.coffee_participants
     where spot_status = 'waitlisted'
     order by joined_at, id
     limit v_free
     for update
  loop
    update public.coffee_participants
       set spot_status = 'reserved',
           reserved_until = now() + make_interval(days => c.reservation_days),
           promoted_at = now()
     where id = v_p.id;
    insert into public.coffee_notices (kind, user_id) values ('spot_reserved', v_p.user_id);
  end loop;
end;
$$;

revoke all on function public.coffee_rebalance() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Participant RPCs
-- ---------------------------------------------------------------------------

create or replace function public.coffee_campaign_public()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'status', case
                when c.status = 'live' and c.ends_at is not null and now() >= c.ends_at then 'closed'
                when c.status = 'live' and c.starts_at is not null and now() < c.starts_at then 'draft'
                else c.status
              end,
    'max_participants', c.max_participants,
    'spots_taken', public.coffee_spots_taken(),
    'max_coffee_cents', c.max_coffee_cents,
    'reservation_days', c.reservation_days,
    'starts_at', c.starts_at,
    'ends_at', c.ends_at,
    'submissions_close_at', c.submissions_close_at,
    'terms_version', c.terms_version
  )
  from public.coffee_campaign c
  where c.id = 'early-contributors';
$$;

grant execute on function public.coffee_campaign_public() to anon, authenticated;

create or replace function public.coffee_step_open(p_participant public.coffee_participants, p_step text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_participant.spot_status in ('reserved', 'held', 'confirmed')
     and (c.submissions_close_at is null or now() < c.submissions_close_at)
     and c.status in ('live', 'paused')
     and (r.status = 'not_started' or (r.status = 'rejected' and r.attempts < c.max_attempts
                                       and (p_step <> 'contribute' or p_participant.spot_status = 'reserved')))
     and (p_step = 'contribute' or exists (
           select 1 from public.coffee_rewards b
            where b.user_id = p_participant.user_id and b.step = 'contribute'
              and b.status in ('submitted', 'under_review', 'approved', 'paid')
         ))
    from public.coffee_rewards r
    cross join public.coffee_campaign c
   where r.user_id = p_participant.user_id and r.step = p_step and c.id = 'early-contributors';
$$;

revoke all on function public.coffee_step_open(public.coffee_participants, text) from public, anon, authenticated;

create or replace function public.coffee_my_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  p public.coffee_participants;
  v_position integer;
  v_payout public.coffee_payout_details;
begin
  if v_uid is null then
    raise exception 'not_signed_in';
  end if;
  perform public.coffee_rebalance();
  select * into p from public.coffee_participants where user_id = v_uid;
  if not found then
    return jsonb_build_object('campaign', public.coffee_campaign_public(), 'participant', null, 'rewards', '[]'::jsonb);
  end if;
  if p.spot_status = 'waitlisted' then
    select count(*) + 1 into v_position from public.coffee_participants
     where spot_status = 'waitlisted' and (joined_at, id) < (p.joined_at, p.id);
  end if;
  select * into v_payout from public.coffee_payout_details where user_id = v_uid;
  return jsonb_build_object(
    'campaign', public.coffee_campaign_public(),
    'participant', jsonb_build_object(
      'code', p.code,
      'social_channel', p.social_channel,
      'social_handle', p.social_handle,
      'spot_status', p.spot_status,
      'reserved_until', p.reserved_until,
      'released_reason', p.released_reason,
      'waitlist_position', v_position,
      'joined_at', p.joined_at,
      'can_rejoin', p.spot_status = 'released' and p.released_reason = 'expired' and p.rejoins < 1
    ),
    'rewards', coalesce((
      select jsonb_agg(jsonb_build_object(
               'step', r.step,
               'status', r.status,
               'attempts', r.attempts,
               'approved_cents', r.approved_cents,
               'paid_cents', r.paid_cents,
               'decision_reason', case when r.status = 'rejected' then r.decision_reason end,
               'decision_note', case when r.status in ('approved', 'rejected', 'paid') then r.decision_note end,
               'submitted_at', r.submitted_at,
               'paid_at', r.paid_at,
               'can_submit', public.coffee_step_open(p, r.step)
             ) order by array_position(array['contribute', 'new_place', 'spread'], r.step))
        from public.coffee_rewards r where r.user_id = v_uid
    ), '[]'::jsonb),
    'payout', jsonb_build_object(
      'needed', exists (select 1 from public.coffee_rewards r where r.user_id = v_uid and r.status = 'approved'),
      'method', v_payout.method,
      'hint', case
                when v_payout.method = 'paypal' then regexp_replace(v_payout.paypal_email, '^(.).*(@.*)$', '\1…\2')
                when v_payout.method = 'sepa' then left(v_payout.iban, 2) || ' … ' || right(v_payout.iban, 4)
              end
    )
  );
end;
$$;

revoke all on function public.coffee_my_status() from public, anon;
grant execute on function public.coffee_my_status() to authenticated;

-- Short, unambiguous code (no 0/O, 1/I) that participants quote in their direct message.
create or replace function public.coffee_new_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  loop
    v_code := 'CS-' || (
      select string_agg(substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::integer, 1), '')
        from generate_series(1, 5)
    );
    exit when not exists (select 1 from public.coffee_participants where code = v_code);
  end loop;
  return v_code;
end;
$$;

revoke all on function public.coffee_new_code() from public, anon, authenticated;

create or replace function public.coffee_join(p_terms_version text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  c public.coffee_campaign;
  p public.coffee_participants;
  v_status text;
  v_until timestamptz;
  v_exists boolean;
begin
  if v_uid is null then
    raise exception 'not_signed_in';
  end if;
  perform public.coffee_rebalance();
  select * into c from public.coffee_campaign where id = 'early-contributors';
  if c.status <> 'live'
     or (c.starts_at is not null and now() < c.starts_at)
     or (c.ends_at is not null and now() >= c.ends_at) then
    raise exception 'campaign_not_open';
  end if;
  if p_terms_version is distinct from c.terms_version then
    raise exception 'terms_outdated';
  end if;

  select * into p from public.coffee_participants where user_id = v_uid for update;
  v_exists := found;
  if v_exists and p.spot_status <> 'released' then
    return public.coffee_my_status();
  end if;
  if v_exists and (p.released_reason <> 'expired' or p.rejoins >= 1) then
    raise exception 'not_eligible';
  end if;

  if public.coffee_spots_taken() < c.max_participants then
    v_status := 'reserved';
    v_until := now() + make_interval(days => c.reservation_days);
  else
    v_status := 'waitlisted';
  end if;

  if v_exists then
    update public.coffee_participants
       set spot_status = v_status, reserved_until = v_until, released_reason = null, released_at = null,
           rejoins = rejoins + 1, terms_version = p_terms_version, terms_accepted_at = now(), joined_at = now()
     where id = p.id;
  else
    insert into public.coffee_participants (user_id, code, spot_status, reserved_until, terms_version)
    values (v_uid, public.coffee_new_code(), v_status, v_until, p_terms_version)
    returning * into p;
    insert into public.coffee_rewards (participant_id, user_id, step)
    select p.id, v_uid, s from unnest(array['contribute', 'new_place', 'spread']) s;
  end if;

  if v_status = 'reserved' then
    perform public.coffee_flag_reviews(v_uid);
  end if;
  return public.coffee_my_status();
end;
$$;

revoke all on function public.coffee_join(text) from public, anon;
grant execute on function public.coffee_join(text) to authenticated;

-- Marks steps as sent once the proof went out as a direct message. Bonus steps can be sent
-- together with Step 1. Returns the steps that were accepted; raises when none was open.
create or replace function public.coffee_record_sent(p_participant uuid, p_steps text[], p_by text)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.coffee_campaign;
  part public.coffee_participants;
  v_step text;
  v_accepted text[] := '{}';
  v_window timestamptz;
  v_checks jsonb;
begin
  perform public.coffee_rebalance();
  select * into c from public.coffee_campaign where id = 'early-contributors';
  select * into part from public.coffee_participants where id = p_participant for update;
  if not found then
    raise exception 'not_participating';
  end if;
  v_window := public.coffee_window_start(part.user_id) - interval '1 day';

  foreach v_step in array array['contribute', 'new_place', 'spread'] loop
    if not v_step = any (coalesce(p_steps, '{}')) then
      continue;
    end if;
    if not public.coffee_step_open(part, v_step)
       and not (v_step <> 'contribute' and 'contribute' = any (v_accepted)
                and exists (select 1 from public.coffee_rewards r where r.user_id = part.user_id and r.step = v_step
                             and (r.status = 'not_started' or (r.status = 'rejected' and r.attempts < c.max_attempts)))) then
      continue;
    end if;

    -- Signals for the reviewer. They inform the manual decision and never decide on their own.
    v_checks := case v_step
      when 'contribute' then jsonb_build_object(
        'review_found', exists (select 1 from public.reviews r where r.user_id = part.user_id
                                 and r.created_at >= v_window
                                 and char_length(coalesce(r.body, r.pending_body, '')) >= 120),
        'photo_found', exists (select 1 from public.place_photos ph where ph.uploaded_by = part.user_id
                                and ph.created_at >= v_window))
      when 'new_place' then jsonb_build_object(
        'suggestion_found', exists (select 1 from public.place_suggestions s where s.user_id = part.user_id
                                     and s.created_at >= v_window))
      else '{}'::jsonb
    end;

    update public.coffee_rewards
       set status = 'submitted',
           attempts = attempts + 1,
           submitted_at = now(),
           submitted_by = p_by,
           checks = v_checks,
           referral_user_id = null,
           approved_cents = null,
           receipt_fingerprint = null,
           decision_reason = null,
           decision_note = null,
           decided_by = null,
           decided_at = null
     where user_id = part.user_id and step = v_step;
    v_accepted := v_accepted || v_step;
  end loop;

  if cardinality(v_accepted) = 0 then
    raise exception 'nothing_to_submit';
  end if;
  if 'contribute' = any (v_accepted) then
    update public.coffee_participants set spot_status = 'held', reserved_until = null where id = part.id;
    perform public.coffee_flag_reviews(part.user_id);
  end if;
  return v_accepted;
end;
$$;

revoke all on function public.coffee_record_sent(uuid, text[], text) from public, anon, authenticated;

create or replace function public.coffee_mark_sent(p_steps text[], p_channel text, p_handle text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_handle text := regexp_replace(trim(coalesce(p_handle, '')), '^@+', '');
  v_participant uuid;
begin
  if v_uid is null then
    raise exception 'not_signed_in';
  end if;
  if p_channel is null or p_channel not in ('instagram', 'tiktok', 'x') then
    raise exception 'invalid_channel';
  end if;
  if v_handle !~ '^[A-Za-z0-9._]{1,40}$' then
    raise exception 'invalid_handle';
  end if;
  select id into v_participant from public.coffee_participants where user_id = v_uid;
  if not found then
    raise exception 'not_participating';
  end if;
  update public.coffee_participants set social_channel = p_channel, social_handle = v_handle where id = v_participant;
  perform public.coffee_record_sent(v_participant, p_steps, 'participant');
  return public.coffee_my_status();
end;
$$;

revoke all on function public.coffee_mark_sent(text[], text, text) from public, anon;
grant execute on function public.coffee_mark_sent(text[], text, text) to authenticated;

create or replace function public.coffee_iban_valid(p_iban text)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v text;
  v_digits text := '';
  v_ch text;
  v_rem integer := 0;
begin
  if p_iban !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$' then
    return false;
  end if;
  v := substr(p_iban, 5) || substr(p_iban, 1, 4);
  for i in 1 .. length(v) loop
    v_ch := substr(v, i, 1);
    v_digits := v_digits || case when v_ch ~ '[0-9]' then v_ch else (ascii(v_ch) - 55)::text end;
  end loop;
  for i in 1 .. length(v_digits) loop
    v_rem := (v_rem * 10 + substr(v_digits, i, 1)::integer) % 97;
  end loop;
  return v_rem = 1;
end;
$$;

-- Payout details are only requested once a reward was approved.
create or replace function public.coffee_save_payout_details(
  p_method text,
  p_account_holder text,
  p_paypal_email text default null,
  p_iban text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_iban text := nullif(upper(regexp_replace(coalesce(p_iban, ''), '\s', '', 'g')), '');
  v_email text := nullif(lower(trim(coalesce(p_paypal_email, ''))), '');
begin
  if v_uid is null then
    raise exception 'not_signed_in';
  end if;
  if not exists (select 1 from public.coffee_rewards where user_id = v_uid and status = 'approved') then
    raise exception 'no_approved_reward';
  end if;
  if p_method not in ('paypal', 'sepa') then
    raise exception 'invalid_method';
  end if;
  if p_method = 'sepa' and (v_iban is null or not public.coffee_iban_valid(v_iban)) then
    raise exception 'invalid_iban';
  end if;
  if p_method = 'paypal' and (v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'invalid_email';
  end if;
  if char_length(trim(coalesce(p_account_holder, ''))) < 2 then
    raise exception 'invalid_name';
  end if;
  insert into public.coffee_payout_details (user_id, method, account_holder, paypal_email, iban)
  values (v_uid, p_method, trim(p_account_holder),
          case when p_method = 'paypal' then v_email end,
          case when p_method = 'sepa' then v_iban end)
  on conflict (user_id) do update
    set method = excluded.method,
        account_holder = excluded.account_holder,
        paypal_email = excluded.paypal_email,
        iban = excluded.iban;
end;
$$;

revoke all on function public.coffee_save_payout_details(text, text, text, text) from public, anon;
grant execute on function public.coffee_save_payout_details(text, text, text, text) to authenticated;

create or replace function public.coffee_withdraw()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_signed_in';
  end if;
  perform pg_advisory_xact_lock(hashtext('coffee_campaign'));
  update public.coffee_participants
     set spot_status = 'released', released_reason = 'withdrawn', released_at = now(), reserved_until = null
   where user_id = v_uid and spot_status <> 'released';
  update public.coffee_rewards
     set status = 'rejected', decision_reason = 'withdrawn', decided_at = now()
   where user_id = v_uid and status in ('submitted', 'under_review');
  perform public.coffee_rebalance();
end;
$$;

revoke all on function public.coffee_withdraw() from public, anon;
grant execute on function public.coffee_withdraw() to authenticated;

-- ---------------------------------------------------------------------------
-- Admin RPCs
-- ---------------------------------------------------------------------------

create or replace function public.coffee_reason_valid(p_reason text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_reason in (
    'low_effort', 'not_authentic', 'proof_not_received', 'evidence_missing', 'receipt_invalid', 'receipt_reused',
    'not_coffee', 'place_exists', 'place_inaccurate', 'referral_invalid', 'post_invalid',
    'base_not_eligible', 'campaign_full', 'other'
  );
$$;

create or replace function public.coffee_require_admin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_allowed';
  end if;
end;
$$;

revoke all on function public.coffee_require_admin() from public, anon, authenticated;

create or replace function public.coffee_admin_overview()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.coffee_require_admin();
  perform public.coffee_rebalance();
  return jsonb_build_object(
    'campaign', (select to_jsonb(c) from public.coffee_campaign c where c.id = 'early-contributors'),
    'spots_taken', public.coffee_spots_taken(),
    'participants', coalesce((select jsonb_object_agg(spot_status, n) from (
        select spot_status, count(*) n from public.coffee_participants group by spot_status) s), '{}'::jsonb),
    'rewards', coalesce((select jsonb_object_agg(status, n) from (
        select status, count(*) n from public.coffee_rewards where status <> 'not_started' group by status) s), '{}'::jsonb),
    'approved_unpaid_cents', coalesce((select sum(approved_cents) from public.coffee_rewards where status = 'approved'), 0),
    'paid_cents', coalesce((select sum(amount_cents) from public.coffee_payouts), 0),
    'unsent_notices', (select count(*) from public.coffee_notices where sent_at is null and attempts < 5)
  );
end;
$$;

create or replace function public.coffee_admin_list()
returns table (
  participant_id uuid,
  user_id uuid,
  email text,
  display_name text,
  spot_status text,
  reserved_until timestamptz,
  released_reason text,
  joined_at timestamptz,
  rewards jsonb,
  needs_action boolean,
  last_submitted_at timestamptz,
  code text,
  social_channel text,
  social_handle text
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.coffee_require_admin();
  return query
    select p.id, p.user_id, u.email::text, pr.display_name, p.spot_status, p.reserved_until, p.released_reason, p.joined_at,
           coalesce((select jsonb_object_agg(r.step, r.status) from public.coffee_rewards r where r.participant_id = p.id), '{}'::jsonb),
           exists (select 1 from public.coffee_rewards r where r.participant_id = p.id and r.status in ('submitted', 'under_review', 'approved')),
           (select max(r.submitted_at) from public.coffee_rewards r where r.participant_id = p.id),
           p.code, p.social_channel, p.social_handle
      from public.coffee_participants p
      join auth.users u on u.id = p.user_id
      left join public.profiles pr on pr.id = p.user_id
     order by 10 desc, 11 asc nulls last, p.joined_at;
end;
$$;

create or replace function public.coffee_admin_get(p_participant uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  p public.coffee_participants;
  v_window timestamptz;
begin
  perform public.coffee_require_admin();
  select * into p from public.coffee_participants where id = p_participant;
  if not found then
    raise exception 'not_found';
  end if;
  v_window := public.coffee_window_start(p.user_id) - interval '1 day';
  return jsonb_build_object(
    'participant', to_jsonb(p) || jsonb_build_object(
      'email', (select email from auth.users where id = p.user_id),
      'display_name', (select display_name from public.profiles where id = p.user_id),
      'account_created_at', (select created_at from auth.users where id = p.user_id)
    ),
    'rewards', coalesce((select jsonb_agg(to_jsonb(r) || jsonb_build_object(
        'referral_email', (select email from auth.users where id = r.referral_user_id),
        'can_record', public.coffee_step_open(p, r.step))
        order by array_position(array['contribute', 'new_place', 'spread'], r.step))
      from public.coffee_rewards r where r.participant_id = p.id), '[]'::jsonb),
    'reviews', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'place_name', pl.name, 'place_slug', pl.slug, 'rating', r.rating,
        'body', coalesce(r.body, r.pending_body), 'status', r.status, 'created_at', r.created_at,
        'coffee_program', r.coffee_program) order by r.created_at desc)
      from public.reviews r join public.places pl on pl.id = r.place_id
      where r.user_id = p.user_id and r.created_at >= v_window), '[]'::jsonb),
    'photos', (select count(*) from public.place_photos ph where ph.uploaded_by = p.user_id and ph.created_at >= v_window),
    'suggestions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'city', coalesce(ci.name, s.city_text), 'status', s.status, 'created_at', s.created_at)
        order by s.created_at desc)
      from public.place_suggestions s left join public.cities ci on ci.id = s.city_id
      where s.user_id = p.user_id and s.created_at >= v_window), '[]'::jsonb),
    'payout_details', (
      select to_jsonb(d) from public.coffee_payout_details d where d.user_id = p.user_id
    ),
    'payouts', coalesce((select jsonb_agg(to_jsonb(x) order by x.paid_at) from public.coffee_payouts x where x.user_id = p.user_id), '[]'::jsonb)
  );
end;
$$;

-- p_decision: 'received' (proof arrived by direct message but the participant did not mark it as
-- sent) | 'under_review' | 'approve' | 'reject'. Approval needs the amount (max €5) and the
-- receipt details, which form a fingerprint that can only ever be approved once. A Step 3
-- referral is approved with the friend's account email, which is only used for the lookup.
create or replace function public.coffee_admin_decide(
  p_reward uuid,
  p_decision text,
  p_reason text default null,
  p_note text default null,
  p_approved_cents integer default null,
  p_receipt_merchant text default null,
  p_receipt_date date default null,
  p_receipt_total_cents integer default null,
  p_receipt_number text default null,
  p_referral_email text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  c public.coffee_campaign;
  r public.coffee_rewards;
  part public.coffee_participants;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_fingerprint text;
  v_final boolean;
  v_referral uuid;
  v_referral_created timestamptz;
begin
  perform public.coffee_require_admin();
  if p_decision = 'received' then
    select * into r from public.coffee_rewards where id = p_reward;
    if not found then
      raise exception 'not_found';
    end if;
    perform public.coffee_record_sent(r.participant_id, array[r.step], 'admin');
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('coffee_campaign'));
  select * into c from public.coffee_campaign where id = 'early-contributors';
  select * into r from public.coffee_rewards where id = p_reward for update;
  if not found then
    raise exception 'not_found';
  end if;
  select * into part from public.coffee_participants where id = r.participant_id for update;

  if p_decision = 'under_review' then
    if r.status <> 'submitted' then
      raise exception 'invalid_state';
    end if;
    update public.coffee_rewards set status = 'under_review' where id = r.id;
    return;
  end if;

  if r.status not in ('submitted', 'under_review') then
    raise exception 'invalid_state';
  end if;

  if p_decision = 'approve' then
    if part.spot_status not in ('held', 'confirmed') then
      raise exception 'spot_not_held';
    end if;
    if r.step <> 'contribute' and not exists (
      select 1 from public.coffee_rewards b where b.participant_id = r.participant_id and b.step = 'contribute' and b.status in ('approved', 'paid')
    ) then
      raise exception 'approve_base_first';
    end if;
    if p_approved_cents is null or p_approved_cents < 1 or p_approved_cents > c.max_coffee_cents then
      raise exception 'invalid_amount';
    end if;
    if p_receipt_total_cents is not null and p_approved_cents > p_receipt_total_cents then
      raise exception 'amount_exceeds_receipt';
    end if;
    if nullif(trim(coalesce(p_receipt_merchant, '')), '') is null or p_receipt_date is null or p_receipt_total_cents is null then
      raise exception 'receipt_details_required';
    end if;
    v_fingerprint := lower(regexp_replace(extensions.unaccent(p_receipt_merchant), '[^a-zA-Z0-9]', '', 'g'))
      || '|' || p_receipt_date::text || '|' || p_receipt_total_cents::text
      || '|' || lower(regexp_replace(coalesce(p_receipt_number, ''), '[^a-zA-Z0-9]', '', 'g'));
    if exists (select 1 from public.coffee_rewards x where x.receipt_fingerprint = v_fingerprint and x.status in ('approved', 'paid')) then
      raise exception 'receipt_already_reimbursed';
    end if;
    if r.step = 'spread' and nullif(trim(coalesce(p_referral_email, '')), '') is not null then
      select id, created_at into v_referral, v_referral_created
        from auth.users where lower(email) = lower(trim(p_referral_email)) limit 1;
      if v_referral is null then
        raise exception 'referral_not_found';
      end if;
      if v_referral = r.user_id then
        raise exception 'referral_self';
      end if;
      if v_referral_created < part.joined_at - interval '1 day' then
        raise exception 'referral_too_old';
      end if;
      if exists (select 1 from public.coffee_rewards x where x.referral_user_id = v_referral and x.status <> 'rejected')
         or exists (select 1 from public.coffee_rewards x where x.user_id = v_referral and x.referral_user_id = r.user_id) then
        raise exception 'referral_used';
      end if;
    end if;
    update public.coffee_rewards
       set status = 'approved', approved_cents = p_approved_cents, receipt_fingerprint = v_fingerprint,
           referral_user_id = v_referral,
           checks = case when r.step = 'spread'
                         then checks || jsonb_build_object('mode', case when v_referral is null then 'post' else 'referral' end)
                         else checks end,
           decision_reason = null, decision_note = v_note, decided_by = auth.uid(), decided_at = now()
     where id = r.id;
    if r.step = 'contribute' then
      update public.coffee_participants set spot_status = 'confirmed', confirmed_at = now() where id = part.id;
    end if;
    insert into public.coffee_notices (kind, user_id, step, amount_cents, note)
    values ('reward_approved', r.user_id, r.step, p_approved_cents, v_note);
    return;
  end if;

  if p_decision <> 'reject' then
    raise exception 'invalid_decision';
  end if;
  if p_reason is null or not public.coffee_reason_valid(p_reason) then
    raise exception 'invalid_reason';
  end if;
  if p_reason = 'other' and v_note is null then
    raise exception 'note_required';
  end if;
  v_final := r.attempts >= c.max_attempts or p_reason in ('not_authentic', 'receipt_reused');
  update public.coffee_rewards
     set status = 'rejected', decision_reason = p_reason, decision_note = v_note, decided_by = auth.uid(), decided_at = now(),
         referral_user_id = null, approved_cents = null, receipt_fingerprint = null
   where id = r.id;

  if r.step = 'contribute' then
    if v_final then
      -- Rejected for good: block resubmissions and free the spot.
      update public.coffee_rewards set attempts = greatest(attempts, c.max_attempts) where id = r.id;
      update public.coffee_participants
         set spot_status = 'released', released_reason = 'rejected', released_at = now(), reserved_until = null
       where id = part.id;
      update public.coffee_rewards
         set status = 'rejected', decision_reason = 'base_not_eligible', decided_by = auth.uid(), decided_at = now(),
             referral_user_id = null
       where participant_id = part.id and step <> 'contribute' and status in ('submitted', 'under_review');
    else
      update public.coffee_participants
         set spot_status = 'reserved', reserved_until = now() + make_interval(days => c.resubmit_days)
       where id = part.id and spot_status = 'held';
    end if;
  elsif v_final then
    update public.coffee_rewards set attempts = greatest(attempts, c.max_attempts) where id = r.id;
  end if;

  insert into public.coffee_notices (kind, user_id, step, reason, note, can_resubmit)
  values ('reward_rejected', r.user_id, r.step, p_reason, v_note, not v_final);
  perform public.coffee_rebalance();
end;
$$;

-- Records a payout the admin made by hand. Nothing here moves money.
create or replace function public.coffee_admin_mark_paid(
  p_reward uuid,
  p_paid_cents integer,
  p_method text,
  p_reference text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.coffee_rewards;
  v_payee text;
begin
  perform public.coffee_require_admin();
  select * into r from public.coffee_rewards where id = p_reward for update;
  if not found then
    raise exception 'not_found';
  end if;
  if r.status <> 'approved' then
    raise exception 'invalid_state';
  end if;
  if p_paid_cents is null or p_paid_cents < 1 or p_paid_cents > r.approved_cents then
    raise exception 'invalid_amount';
  end if;
  if p_method not in ('paypal', 'sepa', 'other') then
    raise exception 'invalid_method';
  end if;
  select account_holder into v_payee from public.coffee_payout_details where user_id = r.user_id;
  update public.coffee_rewards set status = 'paid', paid_cents = p_paid_cents, paid_at = now() where id = r.id;
  insert into public.coffee_payouts (reward_id, user_id, step, payee, amount_cents, method, reference, paid_by)
  values (r.id, r.user_id, r.step, coalesce(v_payee, (select email from auth.users where id = r.user_id), 'unknown'),
          p_paid_cents, p_method, nullif(trim(coalesce(p_reference, '')), ''), auth.uid());
  insert into public.coffee_notices (kind, user_id, step, amount_cents) values ('reward_paid', r.user_id, r.step, p_paid_cents);
end;
$$;

-- p_action: 'extend' (reservation + reservation_days), 'disqualify', 'release', 'note'.
create or replace function public.coffee_admin_participant(p_participant uuid, p_action text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.coffee_campaign;
  part public.coffee_participants;
begin
  perform public.coffee_require_admin();
  perform pg_advisory_xact_lock(hashtext('coffee_campaign'));
  select * into c from public.coffee_campaign where id = 'early-contributors';
  select * into part from public.coffee_participants where id = p_participant for update;
  if not found then
    raise exception 'not_found';
  end if;
  if p_note is not null then
    update public.coffee_participants set admin_note = nullif(trim(p_note), '') where id = part.id;
  end if;
  case p_action
    when 'note' then
      null;
    when 'extend' then
      if part.spot_status <> 'reserved' then
        raise exception 'invalid_state';
      end if;
      update public.coffee_participants
         set reserved_until = reserved_until + make_interval(days => c.reservation_days)
       where id = part.id;
    when 'release', 'disqualify' then
      update public.coffee_participants
         set spot_status = 'released',
             released_reason = case when p_action = 'disqualify' then 'disqualified' else 'expired' end,
             released_at = now(), reserved_until = null
       where id = part.id;
      if p_action = 'disqualify' then
        update public.coffee_rewards
           set status = 'rejected', decision_reason = 'not_authentic', decided_by = auth.uid(), decided_at = now(),
               attempts = greatest(attempts, c.max_attempts), referral_user_id = null
         where participant_id = part.id and status in ('submitted', 'under_review', 'approved');
      end if;
      perform public.coffee_rebalance();
    else
      raise exception 'invalid_action';
  end case;
end;
$$;

create or replace function public.coffee_admin_update_campaign(
  p_status text,
  p_max_participants integer,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_submissions_close_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_firm integer;
begin
  perform public.coffee_require_admin();
  perform pg_advisory_xact_lock(hashtext('coffee_campaign'));
  if p_status not in ('draft', 'live', 'paused', 'closed') then
    raise exception 'invalid_status';
  end if;
  select count(*) into v_firm from public.coffee_participants where spot_status in ('held', 'confirmed');
  if p_max_participants < v_firm then
    raise exception 'below_committed_spots';
  end if;
  if p_ends_at is not null and p_starts_at is not null and p_ends_at <= p_starts_at then
    raise exception 'invalid_dates';
  end if;
  update public.coffee_campaign
     set status = p_status,
         max_participants = p_max_participants,
         starts_at = case when p_status = 'live' then coalesce(p_starts_at, starts_at, now()) else p_starts_at end,
         ends_at = p_ends_at,
         submissions_close_at = p_submissions_close_at,
         updated_at = now()
   where id = 'early-contributors';
  perform public.coffee_rebalance();
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'coffee_admin_overview()',
    'coffee_admin_list()',
    'coffee_admin_get(uuid)',
    'coffee_admin_decide(uuid, text, text, text, integer, text, date, integer, text, text)',
    'coffee_admin_mark_paid(uuid, integer, text, text)',
    'coffee_admin_participant(uuid, text, text)',
    'coffee_admin_update_campaign(text, integer, timestamptz, timestamptz, timestamptz)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Retention and scheduled work
-- ---------------------------------------------------------------------------

-- Database side of the retention policy in /free-coffee/terms and the privacy policy. The proof
-- itself never reaches this database; it stays in the direct messages (see docs/free-coffee.md).
-- Queued emails are sent by the `coffee-jobs` edge function.
create or replace function public.coffee_housekeeping()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.coffee_rebalance();
  -- Payout details: 30 days after the last approved reward was paid.
  delete from public.coffee_payout_details d
   where not exists (select 1 from public.coffee_rewards r where r.user_id = d.user_id and r.status = 'approved')
     and coalesce((select max(paid_at) from public.coffee_rewards r where r.user_id = d.user_id), d.updated_at) < now() - interval '30 days';
  -- Social handle: 90 days after the last decision, once nothing is waiting for a review or payment.
  update public.coffee_participants p
     set social_channel = null, social_handle = null
   where p.social_handle is not null
     and not exists (select 1 from public.coffee_rewards r where r.participant_id = p.id and r.status in ('submitted', 'under_review', 'approved'))
     and coalesce((select max(coalesce(r.paid_at, r.decided_at)) from public.coffee_rewards r where r.participant_id = p.id), p.updated_at) < now() - interval '90 days';
  delete from public.coffee_notices where sent_at < now() - interval '1 year';
end;
$$;

revoke all on function public.coffee_housekeeping() from public, anon, authenticated;

select cron.schedule('cosurfing-coffee-housekeeping', '17 * * * *', $$select public.coffee_housekeeping()$$);
select cron.schedule(
  'cosurfing-coffee-jobs',
  '*/10 * * * *',
  $$select public.invoke_crawler('coffee-jobs')
     where exists (select 1 from public.coffee_notices where sent_at is null and attempts < 5)$$
);
