-- Méli Malo, Paris 2e (80 Rue Montmartre, Montorgueil / Grands Boulevards).
-- Not in OpenStreetMap, so the Paris café import never picked it up.
-- Sources (checked 2026-11-26):
--   https://www.melimalo.fr/ (name, address, hours Mon-Sat 11:00-02:00, kitchen 12:00-22:00, terrace,
--     Instagram melimaloparis, email melimaloparis@gmail.com, Facebook page, Zenchef booking rid 385715).
--   https://www.melimalo.fr/nous-rendre-visite (metro: Grands Boulevards, Sentier, Bourse).
--   TchinTchinNow and the Google listing give the same address and hours, Sunday closed.
-- Coordinates: French national address base (BAN) housenumber 80 Rue Montmartre, 48.866485, 2.344507.
-- Wi-Fi, outlets and laptop rules are not stated, so those stay unknown.
-- Hours are team-checked. 11:00-02:00 is 660 to 1560 minutes.
-- Idempotent; never touches places that are not ours.

insert into public.places (
  city_id, slug, name, category, status, source, description, address, lat, lng, website,
  opening_hours, hours, hours_source, outdoor_seating, access, access_note, last_verified_at
)
select c.id,
       'meli-malo-paris',
       'Méli Malo',
       'cafe',
       'published',
       'admin',
       'Family-run neighbourhood bistro on Rue Montmartre in the 2nd arrondissement, between Montorgueil, Sentier and Grands Boulevards. Open Monday to Saturday from 11:00 to 02:00, closed on Sunday. Coffee, juices, bissap, wine, beer, mocktails and house cocktails all day; the kitchen serves homemade bistro starters, mains and desserts from 12:00 to 22:00. There is a terrace that fills up for sunny lunches and after-work drinks.',
       '80 Rue Montmartre, 75002 Paris',
       48.866485,
       2.344507,
       'https://www.melimalo.fr/',
       'Mo-Sa 11:00-02:00; Su off',
       '{"mo":[[660,1560]],"tu":[[660,1560]],"we":[[660,1560]],"th":[[660,1560]],"fr":[[660,1560]],"sa":[[660,1560]],"su":[]}'::jsonb,
       'team',
       'yes',
       'open',
       'Walk-in. Open Monday to Saturday 11:00-02:00, kitchen 12:00-22:00, closed Sunday. Tables can be booked on the website.',
       date '2026-11-26'
  from public.cities c
 where c.slug = 'paris'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  address = excluded.address,
  lat = excluded.lat,
  lng = excluded.lng,
  website = excluded.website,
  opening_hours = excluded.opening_hours,
  hours = excluded.hours,
  hours_source = excluded.hours_source,
  outdoor_seating = excluded.outdoor_seating,
  access = excluded.access,
  access_note = excluded.access_note,
  last_verified_at = excluded.last_verified_at
 where places.category = 'cafe' and places.source = 'admin';

select public.merge_place_contacts(
  p.id,
  jsonb_build_object(
    'instagram', 'melimaloparis',
    'email', 'melimaloparis@gmail.com',
    'facebook', 'https://www.facebook.com/profile.php?id=61588459324091'
  ),
  'website',
  'https://www.melimalo.fr/'
)
from public.places p
where p.slug = 'meli-malo-paris' and p.source = 'admin';

select public.refresh_city_stats(c.id) from public.cities c where c.slug = 'paris';
