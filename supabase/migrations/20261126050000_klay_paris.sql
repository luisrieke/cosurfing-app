-- Klay, Paris 2e (4 bis Rue Saint-Sauveur, Montorgueil / Sentier). Private sports club with a
-- bar, a café-style lobby and a restaurant (Tékés) that is open to non-members.
-- Not in OpenStreetMap as a café, so the Paris café import never picked it up.
-- Sources (checked 2026-11-26):
--   https://www.klay.fr/ (name, address 4 bis rue Saint Sauveur, 75002 Paris).
--   Petit Futé listing (hours, phone +33 1 40 26 00 00, Wi-Fi, terrace, food).
--   World Wellness Guide and Maison.com (restaurant and bar open to non-members).
--   Time Out Paris (Tékés restaurant inside the club).
-- Hours (Petit Futé, club bar and restaurant): Mon-Thu 07:00-22:30, Fri 07:00-22:00,
--   Sat-Sun 08:00-20:00. 07:00 is 420, 22:30 is 1350, 22:00 is 1320, 08:00 is 480, 20:00 is 1200.
--   The club's own site does not list hours, so these come from the listing.
-- Coordinates: 48.86594, 2.34964 (business listing, matches Rue Saint-Sauveur).
-- Outlets and laptop rules are not stated, so those stay unknown.
-- Idempotent; never touches places that are not ours.

insert into public.places (
  city_id, slug, name, category, status, source, description, address, lat, lng, website, phone,
  opening_hours, hours, hours_source, access, access_note, last_verified_at
)
select c.id,
       'klay-paris',
       'Klay',
       'cafe',
       'published',
       'admin',
       'Private sports club in the 2nd arrondissement (Montorgueil, near Sentier) with a bar, a lobby with a coffee-and-juice-bar feel and a restaurant, Tékés, in a renovated 19th-century building. The bar and restaurant are open to non-members (dinner can be booked), and members use the lobby as a place to hang out or work between classes. The gym, pool and changing rooms are for members only. Wi-Fi is available and there is a covered terrace. Open Monday to Friday from early morning until about 22:30 and until 20:00 on weekends.',
       '4 bis Rue Saint-Sauveur, 75002 Paris',
       48.86594,
       2.34964,
       'https://www.klay.fr/',
       '+33 1 40 26 00 00',
       'Mo-Th 07:00-22:30; Fr 07:00-22:00; Sa-Su 08:00-20:00',
       '{"mo":[[420,1350]],"tu":[[420,1350]],"we":[[420,1350]],"th":[[420,1350]],"fr":[[420,1320]],"sa":[[480,1200]],"su":[[480,1200]]}'::jsonb,
       'team',
       'open',
       'Klay is a private sports club. The bar and restaurant are open to everyone, the gym and pool are for members only. The lobby is a members area, so ask at the entrance before settling in to work.',
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
  phone = excluded.phone,
  opening_hours = excluded.opening_hours,
  hours = excluded.hours,
  hours_source = excluded.hours_source,
  access = excluded.access,
  access_note = excluded.access_note,
  last_verified_at = excluded.last_verified_at
 where places.category = 'cafe' and places.source = 'admin';

select public.merge_place_contacts(
  p.id,
  '{}'::jsonb,
  'website',
  'https://www.klay.fr/'
)
from public.places p
where p.slug = 'klay-paris' and p.source = 'admin';

select public.refresh_city_stats(c.id) from public.cities c where c.slug = 'paris';
