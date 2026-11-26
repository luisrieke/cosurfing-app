-- Brasserie Dubillot, Paris 2e (222 Rue Saint-Denis, near Strasbourg-Saint-Denis): modern French
-- brasserie of the Nouvelle Garde group, open every day from 09:00 to midnight with breakfast, a
-- charcoal grill and a street-side terrace.
-- Missing on the map: the Paris café import never picked it up.
-- Sources (checked 2026-11-26):
--   https://lanouvellegarde.com/fr/brasserie-dubillot/ (name, group, hours, phone 01 88 61 51 24,
--     breakfast 09:00-11:00, lunch 12:00-14:30, "limo et trouvailles" service 14:30-19:00, dinner from 19:00).
--   https://www.timeout.fr/paris/restaurants/brasserie-dubillot (address 222 rue Saint-Denis,
--     metro Strasbourg-Saint-Denis, open daily 09:00-00:00, prices, opened 2021).
--   https://okoin.fr/paris/brasserie-dubillot/ and the venue's Facebook page (open daily 09:00-24:00).
--   Business listing (coordinates 48.868079, 2.351985, street-side terrace).
-- Hours: every day 09:00-24:00. 09:00 is 540, 24:00 is 1440.
-- Wi-Fi, outlets and laptop rules are not stated, so those stay unknown.
-- Idempotent; never touches places that are not ours.

insert into public.places (
  city_id, slug, name, category, status, source, description, address, lat, lng, website, phone,
  opening_hours, hours, hours_source, outdoor_seating, access, access_note, last_verified_at
)
select c.id,
       'brasserie-dubillot-paris',
       'Brasserie Dubillot',
       'cafe',
       'published',
       'admin',
       'Colourful modern French brasserie on Rue Saint-Denis in the 2nd arrondissement, the second venue of the Nouvelle Garde group. It is open every day from 09:00 to midnight: breakfast until 11:00, lunch, an all-afternoon drinks and snacks service from 14:30 to 19:00, then dinner with charcoal-grilled meat and fish. The big teal dining room has marble tables and a counter, and there is a terrace on the street. Wi-Fi and laptop rules are not stated.',
       '222 Rue Saint-Denis, 75002 Paris',
       48.868079,
       2.351985,
       'https://lanouvellegarde.com/fr/brasserie-dubillot/',
       '+33 1 88 61 51 24',
       'Mo-Su 09:00-24:00',
       '{"mo":[[540,1440]],"tu":[[540,1440]],"we":[[540,1440]],"th":[[540,1440]],"fr":[[540,1440]],"sa":[[540,1440]],"su":[[540,1440]]}'::jsonb,
       'team',
       'yes',
       'open',
       'Walk-in, reservations accepted. Open from 09:00 every day, with an afternoon drinks and snacks service between lunch and dinner. Laptop rules are not stated, so ask when you arrive.',
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
  outdoor_seating = excluded.outdoor_seating,
  access = excluded.access,
  access_note = excluded.access_note,
  last_verified_at = excluded.last_verified_at
 where places.category = 'cafe' and places.source = 'admin';

select public.merge_place_contacts(
  p.id,
  '{}'::jsonb,
  'website',
  'https://lanouvellegarde.com/fr/brasserie-dubillot/'
)
from public.places p
where p.slug = 'brasserie-dubillot-paris' and p.source = 'admin';

select public.refresh_city_stats(c.id) from public.cities c where c.slug = 'paris';
