-- Open Co-Learning at the Seeburg (CAU Kiel project), Kiel. Free learning and working space run
-- together with the Digital Learning Campus Schleswig-Holstein.
-- Source: https://dlc.sh/lernangebot/849 (checked 2026-11-13). Coordinates: OSM Nominatim (ODbL).
--
-- Filed as coworking: anyone can use it to study, write or work, laptops included. Access is
-- "registration" because the offer is booked per session on dlc.sh (30 seats per session).
-- Hours are the weekly pattern of the listed sessions (Mon, Wed, Fri); the listing is the source,
-- not the venue's own opening-hours page. Idempotent; never touches places that are not ours.

insert into public.places (
  city_id, slug, name, category, status, source, description, address, lat, lng, website,
  opening_hours, hours_source, day_pass_price_cents, wheelchair, access, access_note, last_verified_at
)
select c.id,
       'co-learning-seeburg-kiel',
       'Open Co-Learning at the Seeburg',
       'coworking',
       'published',
       'admin',
       'Free learning and working space in the glass annex of the Seeburg on the Kiel fjord. Write a thesis, prepare a talk, do group work or take a self-paced course, alone or with others. Someone is always on site to help. Smartboards, extra screens and tablets, plus tea, coffee and water, are free; you can also try the 3D printer and VR headsets.',
       'Düsternbrooker Weg 2, 24105 Kiel',
       54.3279965,
       10.1466335,
       'https://dlc.sh/lernangebot/849',
       'Mo 15:00-20:00; We,Fr 09:00-14:00',
       'listing',
       0,
       'yes',
       'registration',
       'Free, but book a seat for each session on dlc.sh (30 seats). Sessions run Mon 15-20, Wed and Fri 9-14; check the dates there before you come.',
       date '2026-11-13'
  from public.cities c
 where c.slug = 'kiel'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  address = excluded.address,
  lat = excluded.lat,
  lng = excluded.lng,
  website = excluded.website,
  opening_hours = excluded.opening_hours,
  hours_source = excluded.hours_source,
  day_pass_price_cents = excluded.day_pass_price_cents,
  wheelchair = excluded.wheelchair,
  access = excluded.access,
  access_note = excluded.access_note,
  last_verified_at = excluded.last_verified_at
 where places.category = 'coworking' and places.source = 'admin';
