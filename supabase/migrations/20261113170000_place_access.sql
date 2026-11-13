-- How easy is it to get in? Some spaces are open to everyone, others only let you in after you
-- registered (an online account, a booking or a tour first) or are for members only.
-- Keep in sync with src/lib/types.ts (PlaceAccess).
--
--   open          anyone can walk in
--   registration  free or paid, but you have to register first (account, booking, intro)
--   members       members only
--   unknown       nobody checked yet (not shown on the place page)

alter table public.places
  add column access text not null default 'unknown'
    check (access in ('open', 'registration', 'members', 'unknown')),
  add column access_note text check (access_note is null or char_length(access_note) <= 200);

-- Example from the request: Starterkitchen in Kiel only lets you in after registration.
update public.places
   set access = 'registration'
 where slug = 'starterkitchen-de-kiel';

notify pgrst, 'reload schema';
