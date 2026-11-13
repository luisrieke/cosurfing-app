-- Members can say how easy it is to get in: a community fact "access" with one of
-- open | registration | application | members. It goes through the same review as every other fact
-- (trusted members are applied right away, others wait for approval) and the app shows the members'
-- answer instead of places.access once there is one. Keep keys in sync with src/lib/facts.ts.
--
-- NOTE: this replaces place_fact_value_ok on top of 20261113191000_meeting_room_facts.sql. Any later
-- migration that redefines it has to keep the access, pass and meeting room branches below.

create or replace function public.place_fact_value_ok(p_key text, p_value jsonb)
returns boolean
language sql
immutable
as $$
  select case p_key
    when 'access' then p_value in ('"open"'::jsonb, '"registration"'::jsonb, '"application"'::jsonb, '"members"'::jsonb)
    when 'open_24_7' then jsonb_typeof(p_value) = 'boolean'
    when 'meeting_rooms' then jsonb_typeof(p_value) = 'boolean'
    when 'phone_booths' then jsonb_typeof(p_value) = 'boolean'
    when 'wifi' then jsonb_typeof(p_value) = 'boolean' or p_value = '"unreliable"'::jsonb
    when 'laptops' then p_value in ('"welcome"'::jsonb, '"not_allowed"'::jsonb)
    when 'opening_hours' then
      case jsonb_typeof(p_value)
        when 'string' then char_length(p_value #>> '{}') between 3 and 300
        when 'object' then public.opening_hours_valid(p_value)
        else false
      end
    when 'laptop_hours' then
      jsonb_typeof(p_value) = 'object'
      and public.laptop_hours_valid(p_value)
      and exists (select 1 from jsonb_each(p_value) e where e.value ->> 'mode' <> 'unknown')
    when 'price_range' then
      case when jsonb_typeof(p_value) = 'number' then (p_value #>> '{}')::numeric in (1, 2, 3, 4) else false end
    when 'day_pass' then
      case when jsonb_typeof(p_value) = 'object' and jsonb_typeof(p_value -> 'amount') = 'number'
             then (p_value ->> 'amount')::numeric between 0 and 10000 and coalesce(p_value ->> 'currency', '') ~ '^[A-Z]{3}$'
                  and (not (p_value ? 'note') or (jsonb_typeof(p_value -> 'note') = 'string' and char_length(p_value ->> 'note') <= 200))
           else false end
    when 'week_pass', 'month_pass' then
      case when jsonb_typeof(p_value) = 'object' and jsonb_typeof(p_value -> 'amount') = 'number'
             then (p_value ->> 'amount')::numeric > 0 and (p_value ->> 'amount')::numeric <= 10000
                  and coalesce(p_value ->> 'currency', '') ~ '^[A-Z]{3}$'
                  and (not (p_value ? 'note') or (jsonb_typeof(p_value -> 'note') = 'string' and char_length(p_value ->> 'note') <= 200))
           else false end
    -- Price of one hour in a meeting room; 0 means the rooms are free for members.
    when 'meeting_room_hour' then
      case when jsonb_typeof(p_value) = 'object' and jsonb_typeof(p_value -> 'amount') = 'number'
             then (p_value ->> 'amount')::numeric between 0 and 10000 and coalesce(p_value ->> 'currency', '') ~ '^[A-Z]{3}$'
           else false end
    when 'meeting_room_details' then
      jsonb_typeof(p_value) = 'string' and char_length(btrim(p_value #>> '{}')) between 3 and 300
    else false
  end;
$$;

revoke all on function public.place_fact_value_ok(text, jsonb) from public, anon, authenticated;
