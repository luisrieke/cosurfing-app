-- New access level "application": you cannot book, sign up or walk in; you have to apply and be
-- accepted first (founder residencies such as The Sandbox in Berlin).
-- Keep in sync with src/lib/types.ts (PlaceAccess).

alter table public.places drop constraint if exists places_access_check;
alter table public.places
  add constraint places_access_check
  check (access in ('open', 'registration', 'application', 'members', 'unknown'));

update public.places
   set access = 'application',
       access_note = 'Applications are always open; no booking, no drop-in. Desks are for full-time builders aiming for a 100bn€ company, not for part-time or bootstrapped side projects.'
 where slug = 'the-sandbox-berlin';

notify pgrst, 'reload schema';
