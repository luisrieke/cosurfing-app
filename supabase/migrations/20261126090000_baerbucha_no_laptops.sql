-- Café Bärbucha, Berlin (Eisenacher Str. 73): the venue wrote to us on 2026-11-26 that guests with
-- laptops are not welcome. It is a kombucha fermentery and workshop with few seats, used for
-- advice and sales, and it does not want to be listed as a place to work.
-- A venue-stated "none" on every day makes the app draw the place grey and faded and show a
-- "working here is not allowed" warning (workForbidden in src/lib/hours.ts).
-- Idempotent.

update public.places
   set laptop_hours = '{"mo":{"mode":"none"},"tu":{"mode":"none"},"we":{"mode":"none"},"th":{"mode":"none"},"fr":{"mode":"none"},"sa":{"mode":"none"},"su":{"mode":"none"}}'::jsonb,
       laptop_source = 'venue',
       laptop_rules = 'No laptops. The venue told us it is a kombucha fermentery and workshop with limited seating for advice and sales, not a place to work.',
       locked_fields = (select array_agg(distinct f) from unnest(locked_fields || array['laptop_hours', 'laptop_rules']) f),
       last_verified_at = date '2026-11-26'
 where slug = 'cafe-barbucha-berlin';
