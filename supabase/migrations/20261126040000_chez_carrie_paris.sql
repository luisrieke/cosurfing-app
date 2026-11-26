-- Chez Carrie, Paris 2e (14 Rue Léopold Bellan, Montorgueil): Californian-Mediterranean
-- neighbourhood bistro with brunch, run by the American chef Carrie Solomon.
-- Not in OpenStreetMap as a café, so the Paris café import never picked it up.
-- Sources (checked 2026-11-26):
--   https://www.chezcarrie.com/ (name, address, phone +33 7 43 63 81 39, email, cuisine, bar counter)
--   https://www.lessentiel.fr/paris/bonnes-adresses/2026-11-20/nous-avons-teste-chez-carrie-la-californie-tendance-dans-le-2e
-- Hours (footer of the official site, gift card and Thanksgiving pages, and the press review):
--   Tue-Fri 11:00-13:00 and 18:00-22:00, Sat 10:00-22:00, Sun 10:00-17:00, Monday closed.
--   The intro block on the home page still shows older hours (Mon-Fri to 15:00); the footer wins.
--   660 to 780 is 11:00-13:00, 1080 to 1320 is 18:00-22:00, 600 to 1320 is 10:00-22:00,
--   600 to 1020 is 10:00-17:00.
-- Coordinates: French national address base (BAN) housenumber 14 Rue Léopold Bellan,
--   48.866593, 2.346042.
-- Wi-Fi, outlets and laptop rules are not stated, so those stay unknown.
-- Idempotent; never touches places that are not ours.

insert into public.places (
  city_id, slug, name, category, status, source, description, address, lat, lng, website, phone,
  opening_hours, hours, hours_source, access, access_note, last_verified_at
)
select c.id,
       'chez-carrie-paris',
       'Chez Carrie',
       'cafe',
       'published',
       'admin',
       'Californian-Mediterranean neighbourhood bistro on a pedestrian street off Rue Montorgueil in the 2nd arrondissement, run by the American chef Carrie Solomon. Mostly vegetable-led, with fermented dishes, natural wine and kombucha, and a wrap-around wooden bar counter that suits walk-ins and solo guests. Lunch and dinner on weekdays, all-day brunch at the weekend. It is a place for a proper meal rather than for laptop work, and Wi-Fi and laptop rules are not stated.',
       '14 Rue Léopold Bellan, 75002 Paris',
       48.866593,
       2.346042,
       'https://www.chezcarrie.com/',
       '+33 7 43 63 81 39',
       'Mo off; Tu-Fr 11:00-13:00,18:00-22:00; Sa 10:00-22:00; Su 10:00-17:00',
       '{"mo":[],"tu":[[660,780],[1080,1320]],"we":[[660,780],[1080,1320]],"th":[[660,780],[1080,1320]],"fr":[[660,780],[1080,1320]],"sa":[[600,1320]],"su":[[600,1020]]}'::jsonb,
       'team',
       'open',
       'Walk-in, reservations accepted (groups of more than 6 by email to bonjour@chezcarrie.com). Open Tuesday to Friday 11:00-13:00 and 18:00-22:00, Saturday 10:00-22:00, Sunday 10:00-17:00, closed Monday.',
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
  jsonb_build_object('email', 'bonjour@chezcarrie.com'),
  'website',
  'https://www.chezcarrie.com/'
)
from public.places p
where p.slug = 'chez-carrie-paris' and p.source = 'admin';

select public.refresh_city_stats(c.id) from public.cities c where c.slug = 'paris';
