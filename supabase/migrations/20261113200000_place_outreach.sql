-- Admin todo list: email every published place and double-check that our information is correct.
-- One row per place holds the stage. A place without a row counts as 'to_contact', so places
-- published later show up on the list without any backfill.

create table public.place_outreach (
  place_id uuid primary key references public.places (id) on delete cascade,
  stage text not null default 'to_contact'
    check (stage in ('to_contact', 'emailed', 'replied', 'confirmed', 'no_response')),
  updated_at timestamptz not null default now()
);

create trigger place_outreach_updated_at
  before update on public.place_outreach
  for each row execute function public.set_updated_at();

alter table public.place_outreach enable row level security;

create policy "admins manage place outreach" on public.place_outreach
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
