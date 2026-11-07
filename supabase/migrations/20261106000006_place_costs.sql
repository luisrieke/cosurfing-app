-- Costs: what members paid at a place (one amount per item and member) and offers they share,
-- like discounts or referral links. Keep price items in sync with src/lib/prices.ts.

create table public.place_prices (
  place_id uuid not null references public.places (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  item text not null check (item in (
    'coffee', 'tea', 'lunch',
    'week_pass', 'flex_desk_month', 'fixed_desk_month', 'meeting_room_hour',
    'membership_year'
  )),
  amount numeric(10, 2) not null check (amount between 0 and 100000),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (place_id, user_id, item)
);

create index place_prices_user_idx on public.place_prices (user_id);

alter table public.place_prices enable row level security;

-- Members read their own entries directly; everyone else reads through get_place_prices.
create policy "read own prices" on public.place_prices
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "admins delete prices" on public.place_prices
  for delete to authenticated using ((select public.is_admin()));

create or replace function public.get_place_prices(p_place_id uuid)
returns table (
  item text,
  amount numeric,
  currency text,
  author_name text,
  is_own boolean,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select pp.item,
         pp.amount,
         pp.currency,
         case when auth.uid() is not null then coalesce(pr.display_name, 'Cosurfer') end,
         coalesce(pp.user_id = auth.uid(), false),
         pp.updated_at
    from public.place_prices pp
    join public.places p on p.id = pp.place_id and (p.status = 'published' or public.is_admin())
    left join public.profiles pr on pr.id = pp.user_id
   where pp.place_id = p_place_id
   order by pp.updated_at desc;
$$;

-- Replaces the caller's prices for a place: items missing from p_prices (or null) are removed.
-- p_prices: { "<item>": { "amount": 3.5, "currency": "EUR" }, ... }
create or replace function public.save_place_prices(p_place_id uuid, p_prices jsonb)
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
  if jsonb_typeof(p_prices) is distinct from 'object' then
    raise exception 'invalid prices';
  end if;
  if not exists (select 1 from public.places where id = p_place_id and status = 'published') then
    raise exception 'place not found';
  end if;
  if exists (
    select 1 from jsonb_each(p_prices) e
     where jsonb_typeof(e.value) <> 'null'
       and (jsonb_typeof(e.value) <> 'object' or jsonb_typeof(e.value -> 'amount') <> 'number')
  ) then
    raise exception 'invalid prices';
  end if;

  delete from public.place_prices pp
   where pp.place_id = p_place_id
     and pp.user_id = v_uid
     and coalesce(jsonb_typeof(p_prices -> pp.item), 'null') = 'null';

  insert into public.place_prices (place_id, user_id, item, amount, currency)
  select p_place_id, v_uid, e.key, (e.value ->> 'amount')::numeric, upper(coalesce(e.value ->> 'currency', ''))
    from jsonb_each(p_prices) e
   where jsonb_typeof(e.value) <> 'null'
  on conflict (place_id, user_id, item) do update
    set amount = excluded.amount, currency = excluded.currency, updated_at = now()
    where place_prices.amount is distinct from excluded.amount
       or place_prices.currency is distinct from excluded.currency;
end;
$$;

revoke all on function public.get_place_prices(uuid) from public;
grant execute on function public.get_place_prices(uuid) to anon, authenticated;
revoke all on function public.save_place_prices(uuid, jsonb) from public, anon;
grant execute on function public.save_place_prices(uuid, jsonb) to authenticated;

-- Offers: a discount anyone can use, or a member's referral link (both sides get a bonus).
create table public.place_offers (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('deal', 'referral')),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  details text check (details is null or char_length(details) <= 1000),
  url text check (url is null or (url ~* '^https?://[^\s]+$' and char_length(url) <= 500)),
  code text check (code is null or char_length(btrim(code)) between 1 and 60),
  expires_on date,
  created_at timestamptz not null default now()
);

create index place_offers_place_idx on public.place_offers (place_id, created_at desc);
create index place_offers_user_idx on public.place_offers (user_id);

alter table public.place_offers enable row level security;

create policy "read own offers" on public.place_offers
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "members add offers to published places" on public.place_offers
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.places p where p.id = place_id and p.status = 'published')
  );
create policy "members and admins delete offers" on public.place_offers
  for delete to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));

-- At most 3 offers per member and place, so a place does not fill up with one person's links.
create or replace function public.place_offers_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.place_offers o where o.place_id = new.place_id and o.user_id = new.user_id) >= 3 then
    raise exception 'offer_limit_reached';
  end if;
  return new;
end;
$$;

create trigger place_offers_limit
  before insert on public.place_offers
  for each row execute function public.place_offers_limit();

-- Offers that have not expired. Link, code and author stay hidden from visitors without an account.
create or replace function public.get_place_offers(p_place_id uuid)
returns table (
  id uuid,
  kind text,
  title text,
  details text,
  url text,
  code text,
  is_locked boolean,
  expires_on date,
  author_name text,
  is_own boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select o.id,
         o.kind,
         o.title,
         o.details,
         case when auth.uid() is not null then o.url end,
         case when auth.uid() is not null then o.code end,
         auth.uid() is null and (o.url is not null or o.code is not null),
         o.expires_on,
         case when auth.uid() is not null then coalesce(pr.display_name, 'Cosurfer') end,
         coalesce(o.user_id = auth.uid(), false),
         o.created_at
    from public.place_offers o
    join public.places p on p.id = o.place_id and (p.status = 'published' or public.is_admin())
    left join public.profiles pr on pr.id = o.user_id
   where o.place_id = p_place_id
     and (o.expires_on is null or o.expires_on >= current_date)
   order by (o.kind = 'deal') desc, o.created_at desc;
$$;

revoke all on function public.get_place_offers(uuid) from public;
grant execute on function public.get_place_offers(uuid) to anon, authenticated;
revoke all on function public.place_offers_limit() from public, anon, authenticated;
