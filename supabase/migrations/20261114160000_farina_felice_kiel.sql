-- Farina Felice, Kiel (Knooper Weg, near the Stadtpark): a small pizzeria that works as a laptop
-- spot for a couple of hours. Very few seats; the best ones are at the window.
-- Source: tip from a member who worked there, plus Google Maps (address, phone, website).
-- Coordinates: OSM Nominatim (ODbL). Opening hours are not entered: the only thing we know is
-- that it closes at 23:00, not the weekly schedule. Idempotent; never touches places that are not ours.

insert into public.places (
  city_id, slug, name, category, status, source, description, address, lat, lng, website, phone,
  access, access_note, last_verified_at
)
select c.id,
       'farina-felice-kiel',
       'Farina Felice',
       'cafe',
       'published',
       'admin',
       'A small pizzeria on Knooper Weg, a short walk from the Stadtpark. It is not a classic work café, but it is fine to settle in for a couple of hours with your laptop. There are very few seats, and the ones at the window are the nicest. Come outside the lunch and dinner rush, and order something while you work.',
       'Knooper Weg 44, 24103 Kiel',
       54.3258719,
       10.1278674,
       'https://farinafelice.de',
       '+49 431 53646592',
       'open',
       'Open to everyone, no booking needed. Very few seats, so go off-peak and take a window seat.',
       date '2026-11-14'
  from public.cities c
 where c.slug = 'kiel'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  address = excluded.address,
  lat = excluded.lat,
  lng = excluded.lng,
  website = excluded.website,
  phone = excluded.phone,
  access = excluded.access,
  access_note = excluded.access_note,
  last_verified_at = excluded.last_verified_at
 where places.category = 'cafe' and places.source = 'admin';
