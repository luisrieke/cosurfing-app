-- Community facts for meeting rooms: the price per hour and free-text details (capacity, equipment,
-- how to book). The yes/no "meeting_rooms" fact already exists. Keep keys in sync with src/lib/facts.ts.
--
-- NOTE: this replaces place_fact_value_ok on top of 20261113190000_week_month_pass_facts.sql. Any later
-- migration that redefines it has to keep the pass and meeting room branches below.

create or replace function public.place_fact_value_ok(p_key text, p_value jsonb)
returns boolean
language sql
immutable
as $$
  select case p_key
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
    when 'week_pass' then
      case when jsonb_typeof(p_value) = 'object' and jsonb_typeof(p_value -> 'amount') = 'number'
             then (p_value ->> 'amount')::numeric > 0 and (p_value ->> 'amount')::numeric <= 10000
                  and coalesce(p_value ->> 'currency', '') ~ '^[A-Z]{3}$'
                  and (not (p_value ? 'note') or (jsonb_typeof(p_value -> 'note') = 'string' and char_length(p_value ->> 'note') <= 200))
           else false end
    when 'month_pass' then
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
