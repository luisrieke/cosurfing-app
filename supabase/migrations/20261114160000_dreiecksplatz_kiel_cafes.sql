-- Three places around Dreiecksplatz, Kiel: Don's Café & Bistro, Veganam and the Kopiton roastery.
-- Coordinates: OSM nodes 430545311 (Don's), 9890647465 (Veganam), 12101832924 (Kopiton) (ODbL).
-- Sources (checked 2026-11-14):
--   Don's   https://www.happycow.net/reviews/dons-cafe-and-bistro-kiel-472591, ilovecoffee.de (hours 09/2026),
--           the menu board photographed on site (prices).
--   Veganam https://veganam-kiel.eatbu.com (hours, phone, step-free access, outdoor seating).
--   Kopiton https://kopiton.de (hours, phone); wheelchair "no" from OSM.
--
-- Idempotent; never touches places that are not ours.

with items(slug, name, description, address, lat, lng, website, phone, opening_hours, hours_source,
           price_level, wheelchair, outdoor_seating, access_note) as (
  values
    ('dons-cafe-bistro-kiel',
     'Don''s Café & Bistro',
     'Small café and bistro on Dreiecksplatz with a warm, cosy interior. Known for its cinnamon rolls (a different kind every day) and bagels made to order, vegan ones included; cake on weekends. Oat, coconut and cow''s milk, every drink also iced. A few tables outside.',
     'Dreiecksplatz 10, 24103 Kiel',
     54.3284947, 10.1346887,
     'https://www.instagram.com/dons.cafe.bistro/',
     '+49 178 9303643',
     'We-Fr 10:00-18:00; Sa,Su 11:00-18:00',
     'listing',
     2, 'unknown', 'yes',
     'Closed Monday and Tuesday.'),
    ('veganam-kiel',
     'Veganam',
     'Fully vegan Asian and Vietnamese restaurant on Dreiecksplatz, open from lunch until late. Guests recommend the crispy vegan duck and the homemade lemonades (mango, passion fruit). More a place for a lunch break than a long laptop session: it can get loud at peak times. Wooden tables outside, step-free access, pets welcome.',
     'Dreiecksplatz 9, 24103 Kiel',
     54.3285563, 10.1348766,
     'https://veganam-kiel.eatbu.com',
     '+49 431 12841368',
     'Tu-Su 12:00-22:00',
     'website',
     2, 'yes', 'yes',
     'Closed Monday. Tables can be reserved on the website.'),
    ('kopiton-kiel',
     'Kopiton Rösterei',
     'Small specialty coffee roastery with a café: watch the beans being roasted and have a light-roast espresso or filter coffee with breakfast and small treats. Guests praise the masala chai and the calm atmosphere for studying. Barista and latte art courses, beans to take home.',
     'Brunswiker Straße 61, 24103 Kiel',
     54.3285795, 10.1351035,
     'https://kopiton.de',
     '+49 431 53022730',
     'Mo-Fr 10:00-17:00; Sa 11:00-17:00',
     'website',
     1, 'no', 'yes',
     'Closed Sunday.')
)
insert into public.places (
  city_id, slug, name, category, status, source, description, address, lat, lng, website, phone,
  opening_hours, hours_source, price_level, wheelchair, outdoor_seating, access, access_note, last_verified_at
)
select c.id, i.slug, i.name, 'cafe', 'published', 'admin', i.description, i.address, i.lat, i.lng, i.website, i.phone,
       i.opening_hours, i.hours_source, i.price_level, i.wheelchair, i.outdoor_seating, 'open', i.access_note,
       date '2026-11-14'
  from items i
  join public.cities c on c.slug = 'kiel'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  address = excluded.address,
  lat = excluded.lat,
  lng = excluded.lng,
  website = excluded.website,
  phone = excluded.phone,
  opening_hours = excluded.opening_hours,
  hours_source = excluded.hours_source,
  price_level = excluded.price_level,
  wheelchair = excluded.wheelchair,
  outdoor_seating = excluded.outdoor_seating,
  access = excluded.access,
  access_note = excluded.access_note,
  last_verified_at = excluded.last_verified_at
 where places.category = 'cafe' and places.source = 'admin';
