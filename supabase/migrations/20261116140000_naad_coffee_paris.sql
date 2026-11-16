-- Naad Coffee, Paris 11e (26 boulevard Jules Ferry, near Goncourt and République): specialty coffee and
-- matcha shop with its own roasting, opened in August 2024. Added from a member's Google Maps listing.
-- Sources (checked 2026-11-16): naad-coffee.com (address), pagesjaunes.fr (address), specialtycoffee.paris
-- (free Wi-Fi, remote-work friendly, rules can change at weekends).
-- Coordinates: OSM node 9962293867 (ODbL), matches the French national address base (BAN).
-- Opening hours are not entered: the sources disagree on the closing days (PagesJaunes: closed Monday;
-- specialtycoffee.paris: closed Wednesday and Thursday; Google Maps: open on a Monday until 18:30).
-- Idempotent; never touches places that are not ours.

insert into public.places (
  city_id, slug, name, category, status, source, description, address, lat, lng, website,
  access, access_note, last_verified_at
)
select c.id,
       'naad-coffee-paris',
       'Naad Coffee',
       'cafe',
       'published',
       'admin',
       'Specialty coffee and matcha shop on Boulevard Jules Ferry in the 11th arrondissement, between République, Oberkampf and Goncourt. The beans are roasted by the Naad Coffee team; the menu has espresso drinks, matcha lattes, plant-based milks and sweet treats such as cinnamon rolls. Free Wi-Fi is reported and the café is described as workable with a laptop, though the rules can change at weekends. Seating inside, and outside when the weather allows. Google Maps shows it is quieter in the early afternoon.',
       '26 Boulevard Jules Ferry, 75011 Paris',
       48.8684718,
       2.3680156,
       'https://naad-coffee.com/',
       'open',
       'Walk-in. Opening days differ between sources (closing time about 18:30): check before going. Laptop rules can change at weekends.',
       date '2026-11-16'
  from public.cities c
 where c.slug = 'paris'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  address = excluded.address,
  lat = excluded.lat,
  lng = excluded.lng,
  website = excluded.website,
  access = excluded.access,
  access_note = excluded.access_note,
  last_verified_at = excluded.last_verified_at
 where places.category = 'cafe' and places.source = 'admin';

select public.refresh_city_stats(c.id) from public.cities c where c.slug = 'paris';
