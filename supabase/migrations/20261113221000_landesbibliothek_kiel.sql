-- Schleswig-Holstein state library (Kulturspeicher), Kiel: a public "third place" library with
-- a café (Loppokaffee), open reading and work areas, laptops welcome.
-- Source: https://www.kulturspeicher-sh.de (checked 2026-11-13); wheelchair access from Google
-- Maps; coordinates decoded from Plus Code 84CV+M3 Kiel (about 10 m accuracy).
--
-- Hours are the library and café opening hours, not the service desk hours (Mo-Th 10-16, Fr 10-13).
-- Idempotent; never touches places that are not ours.

insert into public.places (
  city_id, slug, name, category, status, source, description, address, lat, lng, website,
  opening_hours, hours_source, day_pass_price_cents, wheelchair, access, access_note, last_verified_at
)
select c.id,
       'kulturspeicher-landesbibliothek-kiel',
       'Kulturspeicher – Schleswig-Holstein State Library',
       'library',
       'published',
       'admin',
       'A public library in the converted Sartori & Berger warehouse on the Kiel fjord. Meter-high, interlocking bookshelves frame the central Forum, and there are quiet reading and work areas, a lounge with magazines, and a café (Loppokaffee) with a view of the water. Bring your laptop and work here, free of charge.',
       'Wall 47/51, 24103 Kiel',
       54.3216875,
       10.1426875,
       'https://www.kulturspeicher-sh.de',
       'Mo-Fr 09:30-18:00; Sa,Su 10:00-17:00',
       'website',
       0,
       'yes',
       'open',
       'Open to everyone, no registration needed. Library and café share the same hours.',
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
 where places.category = 'library' and places.source = 'admin';
