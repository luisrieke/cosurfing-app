-- Corrections from the place page say what they are about, so admins can see at a glance whether
-- the name, address, pin position on the map, opening hours or website/contact details are wrong.
-- 'other' and 'closed' keep their meaning; only 'closed' feeds the needs_review trigger.

alter table public.place_reports drop constraint if exists place_reports_kind_check;

alter table public.place_reports
  add constraint place_reports_kind_check
  check (kind in ('other', 'closed', 'name', 'address', 'location', 'hours', 'contact'));
