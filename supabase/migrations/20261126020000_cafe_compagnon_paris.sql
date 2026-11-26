-- Café Compagnon, Paris 2e (22-26 Rue Léopold Bellan, between Sentier and Montorgueil).
-- Not in the Paris café import, so it was missing from the map.
-- Sources (checked 2026-11-26):
--   https://cafecompagnon.com/ and https://cafecompagnon.com/contact (name, address, phone
--     +33 9 77 09 62 24, opening hours, kitchen hours, terrace, in-house coffee roasting,
--     Instagram cafe_compagnon). https://groupe-compagnon.com/restaurants/cafe-compagnon lists
--     the same address, phone and hours.
-- Hours: Mon-Fri 08:00-24:00 (public holidays follow the weekend hours), Sat/Sun 09:00-24:00.
--   08:00-24:00 is 480 to 1440 minutes, 09:00-24:00 is 540 to 1440.
-- Coordinates: midpoint of the French national address base (BAN) housenumbers 22 and 26
--   Rue Léopold Bellan. 22 is 48.866659, 2.345670; 26 is 48.866700, 2.345435.
-- Wi-Fi, outlets and laptop rules are not stated, so those stay unknown.
-- Idempotent; never touches places that are not ours.

insert into public.places (
  city_id, slug, name, category, status, source, description, address, lat, lng, website, phone,
  opening_hours, hours, hours_source, outdoor_seating, access, access_note, last_verified_at
)
select c.id,
       'cafe-compagnon-paris',
       'Café Compagnon',
       'cafe',
       'published',
       'admin',
       'All-day café and restaurant on Rue Léopold Bellan in the 2nd arrondissement, between Sentier and Montorgueil. Open Monday to Friday from 08:00 to midnight and on weekends and public holidays from 09:00 to midnight. The coffee is specialty single-origin, roasted on site; the kitchen serves seasonal plates at lunch (12:00 to 14:30 on weekdays, 12:00 to 15:00 on weekends) and dinner (19:00 to 22:30 or 23:00), and between services there is a tapas, cheese and dessert selection to share with a glass of wine or a coffee. A wide open room facing the street, a quieter back lounge, a long tapas bar and a sunny terrace on the street. Listed in the Michelin Guide selection.',
       '22-26 Rue Léopold Bellan, 75002 Paris',
       48.866680,
       2.345553,
       'https://cafecompagnon.com/',
       '+33 9 77 09 62 24',
       'Mo-Fr 08:00-24:00; Sa-Su 09:00-24:00',
       '{"mo":[[480,1440]],"tu":[[480,1440]],"we":[[480,1440]],"th":[[480,1440]],"fr":[[480,1440]],"sa":[[540,1440]],"su":[[540,1440]]}'::jsonb,
       'team',
       'yes',
       'open',
       'Walk-in, with or without a reservation. Open Monday to Friday 08:00-24:00, weekends and public holidays 09:00-24:00. Reserve a table on the website.',
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
  jsonb_build_object('instagram', 'cafe_compagnon'),
  'website',
  'https://cafecompagnon.com/'
)
from public.places p
where p.slug = 'cafe-compagnon-paris' and p.source = 'admin';

select public.refresh_city_stats(c.id) from public.cities c where c.slug = 'paris';
