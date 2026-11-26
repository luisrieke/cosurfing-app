-- Bistrot Gisèle, Paris 2e (204 Rue Saint-Denis, Sentier / Bonne-Nouvelle): all-day bistro of the
-- Gisèle group, open from 07:00 with a brunch served daily, plus a terrace and bar.
-- Missing on the map: the Paris café import never picked it up.
-- Sources (checked 2026-11-26):
--   https://bistrotgisele.com/fr and /fr/faq (name, address 204 rue Saint-Denis, phone +33 1 80 86 41 62,
--     kitchen non-stop, brunch every day 08:00-18:00, terrace, bar, happy hour, family and pet friendly,
--     open every day including public holidays, walk-ins welcome).
--   https://fr.mappy.com/poi/683d120634c91012e8f97b99 (per-day hours).
--   OpenStreetMap node 2234105655 (coordinates 48.8674094, 2.3516806).
-- Hours: Mon, Tue, Thu 07:00-01:00, Wed 07:00-24:00, Fri-Sun 07:00-02:00.
--   07:00 is 420, 24:00 is 1440, 01:00 is 1500, 02:00 is 1560.
--   The official site collapses its hours table and shows only "07:00-01:00", so the per-day listing wins.
-- Wi-Fi, outlets and laptop rules are not stated, so those stay unknown.
-- Idempotent; never touches places that are not ours.

insert into public.places (
  city_id, slug, name, category, status, source, description, address, lat, lng, website, phone,
  opening_hours, hours, hours_source, outdoor_seating, access, access_note, last_verified_at
)
select c.id,
       'bistrot-gisele-paris',
       'Bistrot Gisèle',
       'cafe',
       'published',
       'admin',
       'All-day neighbourhood bistro on Rue Saint-Denis in the Sentier, part of the Gisèle group. It opens at 07:00 every day of the year, serves a build-your-own brunch from 08:00 to 18:00 and keeps the kitchen running non-stop with a bistro menu and tapas, then turns into a bar with a happy hour in the evening. There is a terrace, vegetarian and gluten-free options, and families and pets are welcome. Wi-Fi and laptop rules are not stated.',
       '204 Rue Saint-Denis, 75002 Paris',
       48.8674094,
       2.3516806,
       'https://bistrotgisele.com/fr',
       '+33 1 80 86 41 62',
       'Mo 07:00-01:00; Tu 07:00-01:00; We 07:00-24:00; Th 07:00-01:00; Fr-Su 07:00-02:00',
       '{"mo":[[420,1500]],"tu":[[420,1500]],"we":[[420,1440]],"th":[[420,1500]],"fr":[[420,1560]],"sa":[[420,1560]],"su":[[420,1560]]}'::jsonb,
       'team',
       'yes',
       'open',
       'Walk-in, no reservation needed. Open from 07:00 every day, late on weekends. Laptop rules are not stated, so ask when you arrive.',
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
  'https://bistrotgisele.com/fr'
)
from public.places p
where p.slug = 'bistrot-gisele-paris' and p.source = 'admin';

select public.refresh_city_stats(c.id) from public.cities c where c.slug = 'paris';
