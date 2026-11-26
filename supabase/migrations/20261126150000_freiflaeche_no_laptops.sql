-- Bistro FreiFläche, Berlin (Bülowstraße 90): the venue replied to our outreach email on 2026-11-26.
-- The bistro and its laptop space are closed for construction work, with no reopening date yet.
-- They asked to be removed from our mailing list and not to be contacted again.
-- A venue-stated "none" on every day makes the app draw the place grey and faded and show a
-- "working here is not allowed" warning (workForbidden in src/lib/hours.ts), same as Café Bärbucha.
-- Idempotent.

update public.places
   set laptop_hours = '{"mo":{"mode":"none"},"tu":{"mode":"none"},"we":{"mode":"none"},"th":{"mode":"none"},"fr":{"mode":"none"},"sa":{"mode":"none"},"su":{"mode":"none"}}'::jsonb,
       laptop_source = 'venue',
       laptop_rules = 'No laptop work. The venue told us the bistro and its laptop space are closed for construction, with no reopening date yet.',
       locked_fields = (select array_agg(distinct f) from unnest(locked_fields || array['laptop_hours', 'laptop_rules']) f),
       last_verified_at = date '2026-11-26'
 where slug = 'bistro-freiflache-berlin';

-- Outreach: they replied and asked us not to follow up.
insert into public.place_outreach (place_id, stage, notes, last_contacted_at, next_follow_up_at)
select id, 'replied',
       'Replied 2026-11-26: closed for construction, reopening unknown. Asked to be removed from the mailing list. Do not contact again; they will reach out if needed.',
       timestamptz '2026-11-26 14:02:00+00', null
  from public.places
 where slug = 'bistro-freiflache-berlin'
on conflict (place_id) do update
   set stage = excluded.stage,
       notes = excluded.notes,
       next_follow_up_at = null;
