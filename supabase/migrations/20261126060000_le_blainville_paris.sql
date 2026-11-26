-- Le Blainville, Paris 2e (183 Rue Saint-Denis, Sentier / Montorgueil): neighbourhood bistro and
-- bar with a terrace on the pedestrian stretch of Rue Saint-Denis, open from the morning for coffee.
-- Missing on the map: the Paris café import never picked it up.
-- Sources (checked 2026-11-26):
--   https://www.timeout.fr/paris/restaurants/le-blainville (name, address 183 rue Saint-Denis,
--     metro Réaumur-Sébastopol, coffee from 08:00 on the terrace, phone +33 1 71 60 87 84).
--   https://mapstr.com/place/Pw6XmpQw5k/le-blainville-paris-bar-restaurant-cafe-bistrot-terrasse
--     (address, phone, reviewers call it a good café to work in, with a room upstairs).
--   Business listing (hours, coordinates 48.86578, 2.35055, Instagram _leblainville_).
-- Hours (business listing): Mon 08:00-24:00, Tue-Fri 08:00-02:00, Sat 09:00-02:00, Sun 09:00-24:00.
--   Time Out lists Mon-Fri 08:00-02:00 and Sat-Sun 09:00-02:00; the more detailed listing wins.
--   08:00 is 480, 09:00 is 540, 24:00 is 1440, 02:00 is 1560.
-- Wi-Fi, outlets and laptop rules are not stated, so those stay unknown.
-- Idempotent; never touches places that are not ours.

insert into public.places (
  city_id, slug, name, category, status, source, description, address, lat, lng, phone,
  opening_hours, hours, hours_source, outdoor_seating, access, access_note, last_verified_at
)
select c.id,
       'le-blainville-paris',
       'Le Blainville',
       'cafe',
       'published',
       'admin',
       'Neighbourhood bistro and bar on the pedestrian part of Rue Saint-Denis in the 2nd arrondissement, near Montorgueil and Réaumur-Sébastopol. It opens at 08:00 for coffee on the terrace with a homemade madeleine or scrambled eggs, then serves a short bistro menu for lunch and dinner and turns into a bar in the evening. Reviewers describe it as a good café to work from in the morning, with a quieter room upstairs. Wi-Fi and laptop rules are not stated.',
       '183 Rue Saint-Denis, 75002 Paris',
       48.86578,
       2.35055,
       '+33 1 71 60 87 84',
       'Mo 08:00-24:00; Tu-Fr 08:00-02:00; Sa 09:00-02:00; Su 09:00-24:00',
       '{"mo":[[480,1440]],"tu":[[480,1560]],"we":[[480,1560]],"th":[[480,1560]],"fr":[[480,1560]],"sa":[[540,1560]],"su":[[540,1440]]}'::jsonb,
       'team',
       'yes',
       'open',
       'Walk-in, reservations accepted. Open from 08:00 for coffee, late on weekends. Laptop rules are not stated, so ask when you arrive.',
       date '2026-11-26'
  from public.cities c
 where c.slug = 'paris'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  address = excluded.address,
  lat = excluded.lat,
  lng = excluded.lng,
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
  jsonb_build_object('instagram', '_leblainville_'),
  'website',
  'https://www.instagram.com/_leblainville_/'
)
from public.places p
where p.slug = 'le-blainville-paris' and p.source = 'admin';

select public.refresh_city_stats(c.id) from public.cities c where c.slug = 'paris';
