-- Offers from the venue itself (day pass, monthly membership, meeting room, coliving stay …), each
-- with an optional price and booking link. Managed by the place's owners and admins, public on
-- published places. Unlike place_offers (deals and referral links shared by members) these are
-- not moderated and never hidden behind sign-up.

create table public.place_venue_offers (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 80),
  description text check (description is null or char_length(description) <= 300),
  price_cents integer check (price_cents is null or price_cents between 0 and 10000000),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  -- What the price is for; null = one-off price or no price.
  price_unit text check (price_unit is null or price_unit in ('hour', 'day', 'week', 'month', 'night')),
  booking_url text check (booking_url is null or (booking_url ~* '^https?://[^\s/]+\.[^\s]+$' and char_length(booking_url) <= 500)),
  sort_order integer not null default 0,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index place_venue_offers_place_idx on public.place_venue_offers (place_id, sort_order);

alter table public.place_venue_offers enable row level security;

create policy "venue offers of published places are public" on public.place_venue_offers
  for select to anon, authenticated using (
    exists (select 1 from public.places p where p.id = place_venue_offers.place_id and p.status = 'published')
  );

create policy "owners and admins manage venue offers" on public.place_venue_offers
  for all to authenticated
  using ((select public.is_admin()) or public.is_place_owner(place_id))
  with check ((select public.is_admin()) or public.is_place_owner(place_id));

-- At most 12 offers per place; keeps updated_at current; logs owner edits for the admin.
create or replace function public.place_venue_offers_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_place uuid := coalesce(new.place_id, old.place_id);
  v_change jsonb;
begin
  if tg_op = 'INSERT' and (select count(*) from public.place_venue_offers where place_id = new.place_id) >= 12 then
    raise exception 'venue_offer_limit_reached';
  end if;
  if tg_op = 'UPDATE' then
    new.place_id := old.place_id;
    new.updated_at := now();
    -- Reordering alone is not worth a log entry.
    if (to_jsonb(new) - 'sort_order' - 'updated_at') = (to_jsonb(old) - 'sort_order' - 'updated_at') then
      return new;
    end if;
  end if;
  if public.is_place_owner(v_place) then
    v_change := case tg_op
      when 'INSERT' then jsonb_build_object('offer_added', jsonb_build_object('from', null, 'to', new.title))
      when 'UPDATE' then jsonb_build_object('offer_changed', jsonb_build_object('from', old.title, 'to', new.title))
      else jsonb_build_object('offer_removed', jsonb_build_object('from', old.title, 'to', null))
    end;
    insert into public.place_owner_changes (place_id, user_id, changes) values (v_place, auth.uid(), v_change);
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.place_venue_offers_guard() from public, anon, authenticated;

create trigger place_venue_offers_guard
  before insert or update or delete on public.place_venue_offers
  for each row execute function public.place_venue_offers_guard();

notify pgrst, 'reload schema';
