-- Cancellation button (§ 312k BGB): anyone can cancel a web subscription at /cancel without
-- signing in. The `cancel` edge function records every request here and emails a confirmation.

create table public.cancellation_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null check (char_length(email) <= 254),
  name text not null check (char_length(name) between 1 and 120),
  kind text not null check (kind in ('ordinary', 'extraordinary')),
  reason text check (reason is null or char_length(reason) <= 2000),
  requested_date date,
  user_id uuid references auth.users (id) on delete set null,
  outcome text not null check (outcome in ('scheduled', 'store', 'no_subscription', 'failed')),
  effective_at timestamptz,
  created_at timestamptz not null default now()
);

create index cancellation_requests_created_idx on public.cancellation_requests (created_at desc);

-- Service role only; admins may read.
alter table public.cancellation_requests enable row level security;

create policy "admins read cancellation requests" on public.cancellation_requests
  for select to authenticated using ((select public.is_admin()));

create or replace function public.find_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select id from auth.users where lower(email) = lower(trim(p_email)) limit 1;
$$;

revoke all on function public.find_user_id_by_email(text) from public, anon, authenticated;

-- Retention promised in the privacy policy: 3 years after the end of the year of the cancellation.
create or replace function public.purge_expired_cancellations()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.cancellation_requests
   where created_at < date_trunc('year', now()) - interval '3 years';
$$;

revoke all on function public.purge_expired_cancellations() from public, anon, authenticated;

select cron.schedule('cosurfing-purge-cancellations', '47 3 * * *', $$select public.purge_expired_cancellations()$$);
