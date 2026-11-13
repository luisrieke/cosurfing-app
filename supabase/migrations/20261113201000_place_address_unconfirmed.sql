-- Some places were found through registers, press or social media only, because the place itself
-- publishes no street address. They are on the map with the address we know, and the place page
-- warns visitors that the address is not final. Admins clear the flag once the place confirmed it
-- (for example in the outreach list).
-- Keep in sync with src/lib/types.ts (Place.address_unconfirmed).

alter table public.places
  add column address_unconfirmed boolean not null default false;

-- Neither J floor nor Founders House Stockholm names its address on its own website.
update public.places
   set address_unconfirmed = true
 where slug in ('j-floor-zurich', 'founders-house-stockholm');

notify pgrst, 'reload schema';
