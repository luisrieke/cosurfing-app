-- Le Petit Bal, Paris 2e (36 Rue Léopold Bellan, Bourse / Sentier).
-- Not in OpenStreetMap as a café, so the Paris café import never picked it up.
-- Sources (checked 2026-11-26):
--   Le Guide du Renard, Bienvenue à ma table, InTravel, Privateaser and Pages Jaunes give the same
--     address; phone +33 1 45 08 45 83; Instagram lepetitbalparis; Facebook lepetitbal75002;
--     Provençal / Mediterranean kitchen, terrace, around 25 EUR per person.
--   Hours (Google-based listings agree): Mon-Fri 12:00-15:00 and 18:30-02:00, Sat 12:00-02:00,
--     Sunday closed. The Pages Jaunes 09:00-01:00 range is a generic registry entry and is ignored.
-- Coordinates: French national address base (BAN) housenumber 36 Rue Léopold Bellan,
--   48.866746, 2.344792.
-- No official website found, so website stays empty and the contact links carry the socials.
-- Wi-Fi, outlets and laptop rules are not stated, so those stay unknown.
-- Hours are team-checked. 12:00-15:00 is 720 to 900, 18:30-02:00 is 1110 to 1560, Saturday is 720 to 1560.
-- Idempotent; never touches places that are not ours.

insert into public.places (
  city_id, slug, name, category, status, source, description, address, lat, lng, phone,
  opening_hours, hours, hours_source, outdoor_seating, access, access_note, last_verified_at
)
select c.id,
       'le-petit-bal-paris',
       'Le Petit Bal',
       'cafe',
       'published',
       'admin',
       'Festive Provençal restaurant and bar on Rue Léopold Bellan in the 2nd arrondissement, next to Bourse and Sentier. Open Monday to Friday for lunch (12:00 to 15:00) and from 18:30 to 02:00, on Saturday from 12:00 to 02:00, closed on Sunday. Generous southern French and Mediterranean plates with a modern touch, about 25 EUR per person, and a terrace. The room is lively and loud in the evening, so it is a place for a long lunch or an after-work drink rather than for focused laptop work.',
       '36 Rue Léopold Bellan, 75002 Paris',
       48.866746,
       2.344792,
       '+33 1 45 08 45 83',
       'Mo-Fr 12:00-15:00,18:30-02:00; Sa 12:00-02:00; Su off',
       '{"mo":[[720,900],[1110,1560]],"tu":[[720,900],[1110,1560]],"we":[[720,900],[1110,1560]],"th":[[720,900],[1110,1560]],"fr":[[720,900],[1110,1560]],"sa":[[720,1560]],"su":[]}'::jsonb,
       'team',
       'yes',
       'open',
       'Walk-in. Open Monday to Friday 12:00-15:00 and 18:30-02:00, Saturday 12:00-02:00, closed Sunday. Booking by phone or via the venue''s social pages.',
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
  jsonb_build_object(
    'instagram', 'lepetitbalparis',
    'facebook', 'https://www.facebook.com/lepetitbal75002'
  ),
  'website',
  'https://www.instagram.com/lepetitbalparis/'
)
from public.places p
where p.slug = 'le-petit-bal-paris' and p.source = 'admin';

select public.refresh_city_stats(c.id) from public.cities c where c.slug = 'paris';
