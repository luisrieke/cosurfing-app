-- Plus granted by hand (for example to people on the Plus waiting list while in-app purchases
-- are not live yet). Unlike 'dev' it is a real entitlement and is never removed by the
-- simulated Plus toggle. Keep in sync with src/lib/types.ts.

alter table public.entitlements drop constraint if exists entitlements_source_check;
alter table public.entitlements add constraint entitlements_source_check
  check (source in ('stripe', 'revenuecat', 'dev', 'manual'));
