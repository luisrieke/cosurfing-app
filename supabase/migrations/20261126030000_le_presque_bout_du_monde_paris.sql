-- Le presque bout du monde, Paris 2e (18 Rue Léopold Bellan, between Sentier and Montorgueil).
-- Not in OpenStreetMap as a café, so the Paris café import never picked it up.
-- Sources (checked 2026-11-26):
--   https://www.lepresqueboutdumonde.com/ and its menu and contact pages (name, address, phone
--     +33 9 56 30 91 71, home-made cuisine, terrace, lunch and dinner formules, Instagram
--     lepresqueboutdumondee, Facebook page).
-- Hours (official website): Mon 12:00-14:00, Tue-Sat 12:00-14:00 and 18:00-23:00, Sunday closed.
--   Google-based listings show slightly different evening hours (18:30) and Monday closed;
--   the venue's own site wins. 12:00-14:00 is 720 to 840, 18:00-23:00 is 1080 to 1380.
-- Coordinates: French national address base (BAN) housenumber 18 Rue Léopold Bellan,
--   48.866632, 2.345824.
-- Wi-Fi, outlets and laptop rules are not stated, so those stay unknown.
-- Idempotent; never touches places that are not ours.

insert into public.places (
  city_id, slug, name, category, status, source, description, address, lat, lng, website, phone,
  opening_hours, hours, hours_source, outdoor_seating, access, access_note, last_verified_at
)
select c.id,
       'le-presque-bout-du-monde-paris',
       'Le presque bout du monde',
       'cafe',
       'published',
       'admin',
       'Traditional French restaurant on Rue Léopold Bellan in the 2nd arrondissement, between Sentier and Montorgueil, with a "travel diary" kitchen of home-made dishes from fresh produce and a terrace. Open for lunch Monday to Saturday (12:00 to 14:00) and for dinner Tuesday to Saturday (18:00 to 23:00), closed on Sunday. Lunch and dinner formules start at 21 EUR (starter and main or main and dessert), 25 EUR with all three courses, and the menu changes weekly. Coffee and wine are served too, but it is a place for a proper meal rather than for laptop work.',
       '18 Rue Léopold Bellan, 75002 Paris',
       48.866632,
       2.345824,
       'https://www.lepresqueboutdumonde.com/',
       '+33 9 56 30 91 71',
       'Mo 12:00-14:00; Tu-Sa 12:00-14:00,18:00-23:00; Su off',
       '{"mo":[[720,840]],"tu":[[720,840],[1080,1380]],"we":[[720,840],[1080,1380]],"th":[[720,840],[1080,1380]],"fr":[[720,840],[1080,1380]],"sa":[[720,840],[1080,1380]],"su":[]}'::jsonb,
       'team',
       'yes',
       'open',
       'Walk-in, reservations accepted by phone. Open Monday 12:00-14:00, Tuesday to Saturday 12:00-14:00 and 18:00-23:00, closed Sunday.',
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
  jsonb_build_object(
    'instagram', 'lepresqueboutdumondee',
    'facebook', 'https://www.facebook.com/people/Le-Presque-bout-du-monde/100083350652124/'
  ),
  'website',
  'https://www.lepresqueboutdumonde.com/'
)
from public.places p
where p.slug = 'le-presque-bout-du-monde-paris' and p.source = 'admin';

select public.refresh_city_stats(c.id) from public.cities c where c.slug = 'paris';
