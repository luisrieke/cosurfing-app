-- Example places for local development.
-- Every row is flagged is_example = true, carries "Example" in its name and says so in the description.
-- They are hidden in the app unless EXPO_PUBLIC_SHOW_EXAMPLE_PLACES=true, and the admin area has a
-- one-click "Delete example places" action. Nothing here describes a real business.

insert into public.places
  (city_id, slug, name, category, status, description, address, lat, lng, website, opening_hours,
   price_level, day_pass_price_cents, wifi, power_outlets, focus, calls, laptop_rules, last_verified_at, is_example)
select c.id, v.slug, v.name, v.category, v.status, v.description, v.address, v.lat, v.lng, v.website, v.opening_hours,
       v.price_level, v.day_pass_price_cents, v.wifi, v.power_outlets, v.focus, v.calls, v.laptop_rules, v.last_verified_at::date, true
from (
  values
    ('berlin', 'example-coworking-mitte', 'Example Coworking Mitte', 'coworking', 'published',
     'Example data for development. This is not a real place. A bright coworking floor with fixed and flex desks.',
     'Examplestraße 1, 10115 Berlin', 52.5262, 13.4015, 'https://example.com', 'Mon–Fri 08:00–20:00',
     2, 2500, 'yes', 'plenty', 'great', 'yes', null, '2026-10-01'),
    ('berlin', 'example-cafe-kreuzberg', 'Example Café Kreuzberg', 'cafe', 'published',
     'Example data for development. This is not a real place. Quiet back room, big tables, good filter coffee.',
     'Beispielufer 12, 10997 Berlin', 52.4993, 13.4208, null, 'Daily 09:00–18:00',
     2, null, 'yes', 'some', 'okay', 'limited', 'Laptops welcome on weekdays. No laptops at weekends after 12:00.', '2026-09-20'),
    ('berlin', 'example-cafe-prenzlauer-berg', 'Example Café Prenzlauer Berg', 'cafe', 'published',
     'Example data for development. This is not a real place. Small neighbourhood café, few outlets.',
     'Musterallee 7, 10405 Berlin', 52.5391, 13.4132, null, null,
     1, null, 'unknown', 'none', 'poor', 'no', 'Two hour limit per order at busy times.', null),
    ('berlin', 'example-coworking-neukoelln', 'Example Coworking Neukölln', 'coworking', 'published',
     'Example data for development. This is not a real place. Community-run space with a call booth.',
     'Beispielstraße 44, 12047 Berlin', 52.4812, 13.4352, 'https://example.com', 'Mon–Sat 09:00–22:00',
     1, 1800, 'yes', 'plenty', 'great', 'limited', null, '2026-10-10'),
    ('berlin', 'example-draft-place', 'Example Draft Place', 'cafe', 'draft',
     'Example data for development. Draft used to test the admin area. This is not a real place.',
     'Entwurfsweg 3, 10243 Berlin', 52.5100, 13.4500, null, null,
     null, null, 'unknown', 'unknown', 'unknown', 'unknown', null, null),
    ('parga', 'example-coworking-parga-harbour', 'Example Coworking Parga Harbour', 'coworking', 'published',
     'Example data for development. This is not a real place. Sea view desks and a shaded terrace.',
     'Example Harbour Road 2, Parga', 39.2841, 20.3998, 'https://example.com', 'Mon–Fri 09:00–19:00',
     2, 2000, 'yes', 'plenty', 'great', 'yes', null, '2026-09-15'),
    ('parga', 'example-cafe-parga-old-town', 'Example Café Parga Old Town', 'cafe', 'published',
     'Example data for development. This is not a real place. Shaded square, long mornings, slow afternoons.',
     'Example Square 5, Parga', 39.2862, 20.4021, null, 'Daily 08:00–23:00',
     1, null, 'yes', 'some', 'okay', 'limited', 'Fine before 12:00, busy with lunch guests after.', '2026-09-15')
) as v(city_slug, slug, name, category, status, description, address, lat, lng, website, opening_hours,
       price_level, day_pass_price_cents, wifi, power_outlets, focus, calls, laptop_rules, last_verified_at)
join public.cities c on c.slug = v.city_slug
on conflict (slug) do nothing;
