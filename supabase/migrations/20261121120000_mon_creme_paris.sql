-- Mon Crème, Paris 2e (64-66 Rue Montmartre, between Bourse, Sentier and Les Halles).
-- Added from a member's Google Maps listing, checked against the venue's own site.
-- Sources (checked 2026-11-21):
--   https://moncreme.cafe/ (name, address, phone, daily hours 07:00-02:00, Instagram mon_creme_paris,
--     Zenchef booking widget rid 364205).
--   The Google Maps listing in the request (kitchen until 00:00, homemade cordon bleu with mussel
--     pasta, indoor music). Apple Maps and Cylex list the same address, phone and daily hours.
-- Coordinates: midpoint of the French national address base (BAN) housenumbers 64 and 66
--   Rue Montmartre. 64 is 48.865640, 2.344868; 66 is 48.865718, 2.344834.
-- Wi-Fi, outlets and laptop rules are not stated, so those stay unknown.
-- Hours are team-checked. The venue site has no machine-readable schedule, so a website crawl
-- would otherwise drop the source back to "listing". 07:00-02:00 is 420 to 1560 minutes.
-- Idempotent; never touches places that are not ours.

insert into public.places (
  city_id, slug, name, category, status, source, description, address, lat, lng, website, phone,
  opening_hours, hours, hours_source, access, access_note, last_verified_at
)
select c.id,
       'mon-creme-paris',
       'Mon Crème',
       'cafe',
       'published',
       'admin',
       'All-day café and bistro on Rue Montmartre in the 2nd arrondissement, a short walk from Bourse, Sentier, Étienne Marcel and Les Halles. Open every day from 07:00 to 02:00. Mornings are French breakfast and weekend brunch (viennoiserie, eggs, waffles, savoury toasts); lunch is classic bistro food, including burgers, salads, steaks, tartare and vegetarian plates; evenings shift to cocktails, wine, beer and shared plates, with the kitchen open until midnight. The venue describes a flower-filled room on a quiet street with background music. Google Maps visitors single out the homemade cordon bleu with mussel pasta, and note that the music can make the indoor room loud.',
       '64-66 Rue Montmartre, 75002 Paris',
       48.865679,
       2.344851,
       'https://moncreme.cafe/',
       '+33 1 40 20 08 52',
       'Mo-Su 07:00-02:00',
       '{"mo":[[420,1560]],"tu":[[420,1560]],"we":[[420,1560]],"th":[[420,1560]],"fr":[[420,1560]],"sa":[[420,1560]],"su":[[420,1560]]}'::jsonb,
       'team',
       'open',
       'Walk-in. Open every day 07:00-02:00; kitchen closes at midnight. Reserve a table on the website.',
       date '2026-11-21'
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
  jsonb_build_object('instagram', 'mon_creme_paris'),
  'website',
  'https://moncreme.cafe/'
)
from public.places p
where p.slug = 'mon-creme-paris' and p.source = 'admin';

select public.refresh_city_stats(c.id) from public.cities c where c.slug = 'paris';
