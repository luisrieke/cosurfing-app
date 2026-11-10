-- Structured opening hours and work-friendly (laptop) hours.
--
-- places.hours         Weekly schedule: {"mo":[[480,1080]], ..., "su":[]}. Minutes after the day's
--                      midnight in the place's local time; an empty day is closed. An interval may
--                      run past midnight (end up to 2880) for overnight hours. null = unknown.
-- places.hours_source  Who the schedule comes from: 'team' (entered by the Cosurfing team, never
--                      recomputed), 'community' (member majority), 'osm', 'website' or 'listing'.
-- places.hours_status  'structured' | 'needs_review' (text we could not read with confidence) |
--                      'text_only' (reviewed: the text cannot be expressed as a weekly schedule).
-- places.hours_note    Why the text needs review (a short reason code from parse_opening_hours).
-- places.hours_flags   'holidays' (the text has public/school holiday rules that are not part of
--                      the weekly schedule), 'date_exceptions' (closed on some dates).
-- places.opening_hours stays the original text and is still shown as the fallback.
--
-- places.laptop_hours  Per weekday: {"mo":{"mode":"all"},"tu":{"mode":"specific","ranges":[[480,720]]},
--                      "sa":{"mode":"none"}}. Modes: all opening hours, specific hours, not allowed,
--                      unknown. A missing day is unknown. Being open never implies laptops are fine.
-- places.laptop_source 'venue' (policy stated by the venue), 'team' (observed by the Cosurfing team)
--                      or 'community' (member majority).
--
-- open_ranges / laptop_ranges hold the same schedules as minute-of-week multiranges (Monday 00:00 = 0,
-- a week = 10080), so "open now" and "work here now" are a containment test. Both are maintained by
-- the places_hours trigger.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.places
  add column hours jsonb,
  add column hours_source text check (hours_source in ('team', 'community', 'osm', 'website', 'listing')),
  add column hours_status text check (hours_status in ('structured', 'needs_review', 'text_only')),
  add column hours_note text check (char_length(hours_note) <= 60),
  add column hours_flags text[] not null default '{}',
  add column open_ranges int4multirange,
  add column laptop_hours jsonb,
  add column laptop_source text check (laptop_source in ('venue', 'team', 'community')),
  add column laptop_ranges int4multirange;

-- ---------------------------------------------------------------------------
-- Validation
-- ---------------------------------------------------------------------------

-- Sorted, non-overlapping [start, end] pairs; start within the day, at most 24 hours long.
create or replace function public.hour_intervals_valid(p jsonb)
returns boolean
language plpgsql
immutable
parallel safe
set search_path = public
as $$
declare
  iv jsonb;
  s int;
  e int;
  prev_end int := -1;
  n int := 0;
begin
  if p is null or jsonb_typeof(p) <> 'array' then
    return false;
  end if;
  for iv in select value from jsonb_array_elements(p) loop
    n := n + 1;
    if n > 6 or jsonb_typeof(iv) <> 'array' or jsonb_array_length(iv) <> 2 then
      return false;
    end if;
    if coalesce(iv ->> 0, '') !~ '^\d{1,4}$' or coalesce(iv ->> 1, '') !~ '^\d{1,4}$' then
      return false;
    end if;
    s := (iv ->> 0)::int;
    e := (iv ->> 1)::int;
    if s >= 1440 or e <= s or e - s > 1440 or s < prev_end then
      return false;
    end if;
    prev_end := e;
  end loop;
  return true;
end;
$$;

create or replace function public.opening_hours_valid(p jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = public
as $$
  select coalesce(
    jsonb_typeof(p) = 'object'
    and (select count(*) from jsonb_object_keys(p)) = 7
    and (
      select bool_and(k in ('mo', 'tu', 'we', 'th', 'fr', 'sa', 'su') and public.hour_intervals_valid(p -> k))
        from jsonb_object_keys(p) k
    ),
    false
  );
$$;

create or replace function public.laptop_hours_valid(p jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = public
as $$
  select coalesce(
    jsonb_typeof(p) = 'object'
    and (
      select coalesce(bool_and(
               k in ('mo', 'tu', 'we', 'th', 'fr', 'sa', 'su')
               and jsonb_typeof(p -> k) = 'object'
               and case p -> k ->> 'mode'
                     when 'specific' then (select count(*) from jsonb_object_keys(p -> k)) = 2
                                          and public.hour_intervals_valid(p -> k -> 'ranges')
                                          and jsonb_array_length(p -> k -> 'ranges') > 0
                     when 'all' then (select count(*) from jsonb_object_keys(p -> k)) = 1
                     when 'none' then (select count(*) from jsonb_object_keys(p -> k)) = 1
                     when 'unknown' then (select count(*) from jsonb_object_keys(p -> k)) = 1
                     else false
                   end
             ), true)
        from jsonb_object_keys(p) k
    ),
    false
  );
$$;

alter table public.places
  add constraint places_hours_valid check (hours is null or public.opening_hours_valid(hours)),
  add constraint places_laptop_hours_valid check (laptop_hours is null or public.laptop_hours_valid(laptop_hours));

-- ---------------------------------------------------------------------------
-- Minute-of-week ranges
-- ---------------------------------------------------------------------------

-- Intervals of one weekday (0 = Monday) as minute-of-week ranges; Sunday night wraps to Monday.
create or replace function public.day_week_ranges(p_day int, p_intervals jsonb)
returns int4multirange
language plpgsql
immutable
parallel safe
set search_path = public
as $$
declare
  iv jsonb;
  s int;
  e int;
  out_ranges int4multirange := '{}';
begin
  if p_intervals is null or jsonb_typeof(p_intervals) <> 'array' then
    return out_ranges;
  end if;
  for iv in select value from jsonb_array_elements(p_intervals) loop
    s := p_day * 1440 + (iv ->> 0)::int;
    e := p_day * 1440 + (iv ->> 1)::int;
    out_ranges := out_ranges + int4multirange(int4range(s, least(e, 10080)));
    if e > 10080 then
      out_ranges := out_ranges + int4multirange(int4range(0, e - 10080));
    end if;
  end loop;
  return out_ranges;
end;
$$;

create or replace function public.hours_week_ranges(p_hours jsonb)
returns int4multirange
language plpgsql
immutable
parallel safe
set search_path = public
as $$
declare
  keys constant text[] := array['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'];
  out_ranges int4multirange := '{}';
begin
  if p_hours is null or not public.opening_hours_valid(p_hours) then
    return null;
  end if;
  for d in 1..7 loop
    out_ranges := out_ranges + public.day_week_ranges(d - 1, p_hours -> keys[d]);
  end loop;
  return out_ranges;
end;
$$;

-- When laptops are welcome. Coworking spaces are workspaces by design: without a stated policy
-- laptops are fine whenever they are open. Every other place needs an explicit answer.
create or replace function public.laptop_week_ranges(p_laptop jsonb, p_hours jsonb, p_category text)
returns int4multirange
language plpgsql
immutable
parallel safe
set search_path = public
as $$
declare
  keys constant text[] := array['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'];
  out_ranges int4multirange := '{}';
  hours_ok boolean := p_hours is not null and public.opening_hours_valid(p_hours);
  day jsonb;
begin
  if p_laptop is null or not public.laptop_hours_valid(p_laptop) then
    if p_category = 'coworking' and hours_ok then
      return public.hours_week_ranges(p_hours);
    end if;
    return null;
  end if;
  for d in 1..7 loop
    day := p_laptop -> keys[d];
    if day ->> 'mode' = 'all' and hours_ok then
      out_ranges := out_ranges + public.day_week_ranges(d - 1, p_hours -> keys[d]);
    elsif day ->> 'mode' = 'specific' then
      out_ranges := out_ranges + public.day_week_ranges(d - 1, day -> 'ranges');
    end if;
  end loop;
  return out_ranges;
end;
$$;

-- Current minute of the week (Monday 00:00 = 0) in an IANA time zone; daylight saving time comes
-- from the zone rules. null for an unknown zone.
create or replace function public.local_week_minute(p_tz text, p_at timestamptz default now())
returns integer
language plpgsql
stable
parallel safe
set search_path = public
as $$
declare
  l timestamp;
begin
  if p_tz is null or p_tz = '' then
    return null;
  end if;
  l := p_at at time zone p_tz;
  return (extract(isodow from l)::int - 1) * 1440 + extract(hour from l)::int * 60 + extract(minute from l)::int;
exception when others then
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Parser: opening hours text -> weekly schedule
-- ---------------------------------------------------------------------------
--
-- Reads the OpenStreetMap opening_hours syntax used by the crawler, the website converter and most
-- typed text, plus common variations (English day names, "9am-5pm", "9-17", "/" between days,
-- unicode dashes). Returns {"ok":true,"hours":{...},"flags":[...]} or {"ok":false,"reason":"..."}.
--
-- It never guesses: anything that does not map to one weekly schedule is rejected with a reason so a
-- person can look at it. Rules that are dropped on purpose are reported in flags:
--   holidays         rules for public/school holidays (PH, SH)
--   date_exceptions  date-specific closures such as "Dec 25 off"
-- Days that the text does not mention are closed, as in the OSM syntax.

create or replace function public.oh_word(p_word text)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when p_word in ('mo', 'mon', 'monday') then 'd1'
    when p_word in ('tu', 'tue', 'tues', 'tuesday') then 'd2'
    when p_word in ('we', 'wed', 'weds', 'wednesday') then 'd3'
    when p_word in ('th', 'thu', 'thur', 'thurs', 'thursday') then 'd4'
    when p_word in ('fr', 'fri', 'friday') then 'd5'
    when p_word in ('sa', 'sat', 'saturday') then 'd6'
    when p_word in ('su', 'sun', 'sunday') then 'd7'
    when p_word in ('ph', 'sh') then 'hol'
    when p_word in ('off', 'closed') then 'off'
    when p_word = 'open' then 'open'
    when p_word = 'unknown' then 'unknown'
    when p_word in ('jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
                    'january', 'february', 'march', 'april', 'june', 'july', 'august', 'september',
                    'october', 'november', 'december', 'easter', 'day', 'days') then 'date'
    when p_word in ('week', 'weeks') then 'week'
    when p_word in ('sunrise', 'sunset', 'dawn', 'dusk') then 'variable'
  end;
$$;

-- "08:30", "8:30 pm", "8pm" or a bare hour "8" -> minutes; null when it is not a valid time.
create or replace function public.oh_minutes(p_tok text)
returns integer
language plpgsql
immutable
parallel safe
as $$
declare
  m text[];
  h int;
  mi int;
begin
  m := regexp_match(p_tok, '^(\d{1,2})(?::(\d{2}))?\s*(?:([ap])\.?m\.?)?$');
  if m is null then
    return null;
  end if;
  h := m[1]::int;
  mi := coalesce(m[2]::int, 0);
  if mi > 59 then
    return null;
  end if;
  if m[3] is not null then
    if h < 1 or h > 12 then
      return null;
    end if;
    h := case when m[3] = 'a' then h % 12 else h % 12 + 12 end;
  end if;
  if h * 60 + mi > 2880 then
    return null;
  end if;
  return h * 60 + mi;
end;
$$;

create or replace function public.parse_opening_hours(p_text text)
returns jsonb
language plpgsql
immutable
parallel safe
set search_path = public
as $$
declare
  keys constant text[] := array['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'];
  s text;
  m text[];
  tok text[] := '{}';
  kind text[] := '{}';
  n int;
  i int;
  a int;
  b int;
  j int;
  w text;
  flags text[] := '{}';
  day_ranges int4multirange[] := array_fill('{}'::int4multirange, array[7]);
  set_by int[] := array_fill(0, array[7]); -- 0 untouched, 1 times, 2 closed
  applied int := 0;
  additional boolean;
  next_additional boolean;
  sel_days int[];
  sel_any boolean;
  sel_hol boolean;
  hol_only_rule boolean;
  last_hol boolean;
  d1 int;
  d2 int;
  state text;
  spans int4multirange;
  t1 int;
  t2 int;
  span int4range;
  has_date boolean;
  has_off boolean;
  has_time boolean;
  result jsonb;
begin
  s := lower(btrim(p_text));
  if s is null or s = '' then
    return null;
  end if;
  if char_length(s) > 1000 then
    return jsonb_build_object('ok', false, 'reason', 'too_long');
  end if;

  s := translate(s, E'\u2013\u2014\u2212\u2012\u2010\u2011\uff5e~', '--------');
  s := regexp_replace(s, '(\d)\s*h\M', '\1', 'g');
  s := regexp_replace(s, '[\s,;]+$', '');

  for m in
    select regexp_matches(
      s,
      '(\d{1,2}:\d{2}(?:\s*[ap]\.?m\.?)?|\d{1,2}\s*[ap]\.?m\.?)|(24/7)|("[^"]*"?)|(\|\|)|([a-z]+)|(\d+)|([-;,+\[\]/.:])|(\S)',
      'g'
    )
  loop
    if m[1] is not null then
      tok := tok || m[1]; kind := kind || 'time'::text;
    elsif m[2] is not null then
      tok := tok || m[2]; kind := kind || 't247'::text;
    elsif m[3] is not null then
      return jsonb_build_object('ok', false, 'reason', 'comment');
    elsif m[4] is not null then
      return jsonb_build_object('ok', false, 'reason', 'fallback');
    elsif m[5] is not null then
      w := public.oh_word(m[5]);
      if w is null then
        return jsonb_build_object('ok', false, 'reason', 'unrecognized');
      end if;
      tok := tok || m[5]; kind := kind || w;
    elsif m[6] is not null then
      tok := tok || m[6]; kind := kind || 'num'::text;
    elsif m[7] is not null then
      tok := tok || m[7]; kind := kind || 'p'::text;
    else
      return jsonb_build_object('ok', false, 'reason', 'unrecognized');
    end if;
  end loop;

  n := coalesce(array_length(tok, 1), 0);
  i := 1;

  -- One rule sequence per ";"-separated segment.
  <<segments>>
  while i <= n loop
    a := i;
    b := i;
    while b <= n and tok[b] <> ';' loop
      b := b + 1;
    end loop;
    i := b + 1;
    b := b - 1;
    continue segments when a > b;

    has_date := false;
    has_off := false;
    has_time := false;
    for j in a..b loop
      has_date := has_date or kind[j] = 'date';
      has_off := has_off or kind[j] = 'off';
      has_time := has_time or kind[j] in ('time', 't247');
      if kind[j] = 'week' then
        return jsonb_build_object('ok', false, 'reason', 'week');
      elsif kind[j] = 'variable' then
        return jsonb_build_object('ok', false, 'reason', 'variable_times');
      end if;
    end loop;
    if has_date then
      if has_off and not has_time then
        flags := array_append(array_remove(flags, 'date_exceptions'), 'date_exceptions');
        continue segments;
      end if;
      return jsonb_build_object('ok', false, 'reason', 'seasonal');
    end if;
    for j in a..b loop
      if tok[j] = '[' then
        -- "Sa[2] off" (closed on the second Saturday) is a date closure like "Dec 25 off".
        if has_off and not has_time then
          flags := array_append(array_remove(flags, 'date_exceptions'), 'date_exceptions');
          continue segments;
        end if;
        return jsonb_build_object('ok', false, 'reason', 'nth_weekday');
      end if;
    end loop;

    j := a;
    additional := false;
    <<rules>>
    while j <= b loop
      -- Selector: days, day ranges and holidays separated by "," or "/".
      sel_days := '{}';
      sel_any := false;
      sel_hol := false;
      hol_only_rule := false;
      last_hol := false;
      loop
        if j <= b and kind[j] like 'd_' then
          d1 := substr(kind[j], 2)::int;
          j := j + 1;
          if j + 1 <= b and tok[j] = '-' and kind[j + 1] like 'd_' then
            d2 := substr(kind[j + 1], 2)::int;
            j := j + 2;
            loop
              sel_days := array_append(sel_days, d1);
              exit when d1 = d2;
              d1 := d1 % 7 + 1;
            end loop;
          else
            sel_days := array_append(sel_days, d1);
          end if;
          if last_hol then
            hol_only_rule := true;
          end if;
          last_hol := false;
          sel_any := true;
        elsif j <= b and kind[j] = 'hol' then
          sel_hol := true;
          sel_any := true;
          if cardinality(sel_days) > 0 and j > a and tok[j - 1] not in (',', '/') then
            hol_only_rule := true;
          end if;
          last_hol := true;
          j := j + 1;
        else
          exit;
        end if;
        if j + 1 <= b and tok[j] in (',', '/') and (kind[j + 1] like 'd_' or kind[j + 1] = 'hol') then
          j := j + 1;
          last_hol := false;
        elsif j <= b and (kind[j] like 'd_' or kind[j] = 'hol') then
          -- "PH Mo-Fr" / "Mo-Fr PH": a holiday combined with days narrows the rule to holidays.
          if not (last_hol or kind[j] = 'hol') then
            return jsonb_build_object('ok', false, 'reason', 'unrecognized');
          end if;
        else
          exit;
        end if;
      end loop;
      if j <= b and tok[j] = ':' then
        j := j + 1;
      end if;

          -- Body: times, 24/7, off/closed.
      state := null;
      spans := '{}';
      if j <= b and kind[j] = 't247' then
        spans := '{[0,1440)}';
        state := 'times';
        j := j + 1;
      elsif j <= b and kind[j] in ('time', 'num') then
        loop
          t1 := public.oh_minutes(tok[j]);
          j := j + 1;
          if j <= b and tok[j] = '+' then
            return jsonb_build_object('ok', false, 'reason', 'open_end');
          end if;
          if not (j + 1 <= b and tok[j] = '-' and kind[j + 1] in ('time', 'num')) then
            return jsonb_build_object('ok', false, 'reason', 'unrecognized');
          end if;
          t2 := public.oh_minutes(tok[j + 1]);
          j := j + 2;
          if j <= b and tok[j] = '+' then
            return jsonb_build_object('ok', false, 'reason', 'open_end');
          end if;
          if t1 is null or t2 is null or t1 >= 1440 then
            return jsonb_build_object('ok', false, 'reason', 'invalid_time');
          end if;
          if t2 = t1 then
            return jsonb_build_object('ok', false, 'reason', 'zero_length');
          end if;
          if t2 < t1 then
            t2 := t2 + 1440;
          end if;
          if t2 - t1 > 1440 then
            return jsonb_build_object('ok', false, 'reason', 'invalid_time');
          end if;
          span := int4range(t1, t2);
          if spans && int4multirange(span) then
            return jsonb_build_object('ok', false, 'reason', 'overlap');
          end if;
          spans := spans + int4multirange(span);
          state := 'times';
          if j + 1 <= b and tok[j] = ',' and kind[j + 1] in ('time', 'num') then
            j := j + 1;
            continue;
          end if;
          exit;
        end loop;
        if j <= b and kind[j] = 'open' then
          j := j + 1;
        end if;
      elsif j <= b and kind[j] = 'off' then
        state := 'off';
        j := j + 1;
      elsif j <= b and kind[j] in ('open', 'unknown') then
        state := kind[j];
        j := j + 1;
      end if;

      -- A further rule after "," must start with a day or a holiday.
      next_additional := false;
      if j <= b then
        if j + 1 <= b and tok[j] = ',' and (kind[j + 1] like 'd_' or kind[j + 1] = 'hol') then
          next_additional := true;
          j := j + 1;
        else
          return jsonb_build_object('ok', false, 'reason', 'unrecognized');
        end if;
      end if;

      if sel_hol then
        flags := array_append(array_remove(flags, 'holidays'), 'holidays');
      end if;

      if not (hol_only_rule or (sel_hol and cardinality(sel_days) = 0)) then
        if state is null or state = 'open' then
          return jsonb_build_object('ok', false, 'reason', 'no_times');
        elsif state = 'unknown' then
          return jsonb_build_object('ok', false, 'reason', 'unknown');
        end if;
        if not sel_any then
          if applied > 0 then
            return jsonb_build_object('ok', false, 'reason', 'ambiguous_override');
          end if;
          sel_days := array[1, 2, 3, 4, 5, 6, 7];
        end if;

        foreach d1 in array sel_days loop
          if not additional then
            -- A later rule replaces earlier hours for the same day. When the new hours do not even
            -- overlap the old ones it is unclear whether they replace or add to them.
            if state = 'times' and set_by[d1] = 1 and not (day_ranges[d1] && spans) then
              return jsonb_build_object('ok', false, 'reason', 'ambiguous_override');
            end if;
            day_ranges[d1] := case when state = 'off' then '{}'::int4multirange else spans end;
            set_by[d1] := case when state = 'off' then 2 else 1 end;
          else
            if set_by[d1] = 2 or (state = 'off' and set_by[d1] <> 0) then
              return jsonb_build_object('ok', false, 'reason', 'overlap');
            end if;
            if state = 'times' then
              if day_ranges[d1] && spans then
                return jsonb_build_object('ok', false, 'reason', 'overlap');
              end if;
              day_ranges[d1] := day_ranges[d1] + spans;
              set_by[d1] := 1;
            else
              day_ranges[d1] := '{}';
              set_by[d1] := 2;
            end if;
          end if;
        end loop;
        applied := applied + 1;
      end if;
      additional := next_additional;
    end loop rules;
  end loop segments;

  if applied = 0 then
    return jsonb_build_object('ok', false, 'reason', 'no_weekly_hours');
  end if;
  if not (1 = any(set_by)) then
    return jsonb_build_object('ok', false, 'reason', 'closed_only');
  end if;

  result := '{}';
  for d1 in 1..7 loop
    -- Adjacent spans merge ("08:00-12:00,12:00-15:00"); each day keeps at most six intervals.
    if (select count(*) from unnest(day_ranges[d1])) > 6 then
      return jsonb_build_object('ok', false, 'reason', 'too_many_intervals');
    end if;
    if exists (select 1 from unnest(day_ranges[d1]) r where upper(r) - lower(r) > 1440) then
      return jsonb_build_object('ok', false, 'reason', 'invalid_time');
    end if;
    result := result || jsonb_build_object(keys[d1], coalesce(
      (select jsonb_agg(jsonb_build_array(lower(r), upper(r)) order by lower(r)) from unnest(day_ranges[d1]) r),
      '[]'::jsonb
    ));
  end loop;

  return jsonb_build_object('ok', true, 'hours', result, 'flags', to_jsonb(flags));
end;
$$;

-- ---------------------------------------------------------------------------
-- Deriving the schedule
-- ---------------------------------------------------------------------------
--
-- Precedence: the Cosurfing team > the member majority > the listing text (OSM, website or typed).
-- Members who submitted text we cannot read put the place up for review instead of falling back to
-- the listing, which they were correcting.

create or replace function public.derive_place_hours(
  p_place_id uuid,
  p_text text,
  p_web jsonb,
  p_source text,
  p_locked text[]
)
returns table (hours jsonb, source text, status text, note text, flags text[])
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_any_fact boolean := false;
  v_pick jsonb;
  v_parsed jsonb;
  v_src text;
begin
  if p_place_id is not null then
    select exists (
      select 1 from public.place_facts f
       where f.place_id = p_place_id and f.key = 'opening_hours' and f.status = 'approved'
    ) into v_any_fact;
  end if;

  if v_any_fact then
    select x.r into v_pick
      from (
        select r, count(*) as cnt, max(at) as latest
          from (
            select case when jsonb_typeof(f.value) = 'object'
                          then case when public.opening_hours_valid(f.value)
                                      then jsonb_build_object('ok', true, 'hours', f.value, 'flags', '[]'::jsonb)
                                    end
                        else public.parse_opening_hours(f.value #>> '{}')
                   end as r,
                   f.updated_at as at
              from public.place_facts f
             where f.place_id = p_place_id and f.key = 'opening_hours' and f.status = 'approved'
          ) facts
         where (r ->> 'ok')::boolean
         group by r
         order by cnt desc, latest desc
         limit 1
      ) x;
    if v_pick is not null then
      return query select v_pick -> 'hours', 'community'::text, 'structured'::text, null::text,
                          array(select jsonb_array_elements_text(v_pick -> 'flags'));
    else
      return query select null::jsonb, 'community'::text, 'needs_review'::text, 'community_unreadable'::text, '{}'::text[];
    end if;
    return;
  end if;

  if p_text is null or btrim(p_text) = '' then
    return query select null::jsonb, null::text, null::text, null::text, '{}'::text[];
    return;
  end if;

  v_src := case
    when p_web -> 'opening_hours' ->> 'value' is not null
         and left(p_web -> 'opening_hours' ->> 'value', 300) = p_text then 'website'
    when p_source = 'osm' and not ('opening_hours' = any(coalesce(p_locked, '{}'))) then 'osm'
    else 'listing'
  end;
  v_parsed := public.parse_opening_hours(p_text);
  if (v_parsed ->> 'ok')::boolean then
    return query select v_parsed -> 'hours', v_src, 'structured'::text, null::text,
                        array(select jsonb_array_elements_text(v_parsed -> 'flags'));
  else
    return query select null::jsonb, v_src, 'needs_review'::text, left(v_parsed ->> 'reason', 60), '{}'::text[];
  end if;
end;
$$;

-- Member majority of the approved laptop_hours facts; ties go to the most recent answer.
create or replace function public.community_laptop_hours(p_place_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select x.value
    from (
      select f.value, count(*) as cnt, max(f.updated_at) as latest
        from public.place_facts f
       where f.place_id = p_place_id and f.key = 'laptop_hours' and f.status = 'approved'
         and public.laptop_hours_valid(f.value)
       group by f.value
       order by cnt desc, latest desc
       limit 1
    ) x;
$$;

-- Runs before places_score (triggers fire in name order), so the score sees the new hours.
create or replace function public.places_derive_hours()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d record;
begin
  if new.hours_source = 'team' and new.hours is null then
    new.hours_source := null;
  end if;

  if new.hours_source = 'team' then
    if tg_op = 'INSERT' or old.hours_source is distinct from 'team' or new.hours is distinct from old.hours then
      new.hours_status := 'structured';
      new.hours_note := null;
      new.hours_flags := '{}';
    end if;
  elsif tg_op = 'INSERT'
     or new.opening_hours is distinct from old.opening_hours
     or (new.web_facts -> 'opening_hours') is distinct from (old.web_facts -> 'opening_hours')
     or new.hours_source is distinct from old.hours_source
     or new.locked_fields is distinct from old.locked_fields then
    select * into d from public.derive_place_hours(
      case when tg_op = 'INSERT' then null else new.id end,
      new.opening_hours, new.web_facts, new.source, new.locked_fields
    );
    new.hours := d.hours;
    -- "Keep as text" survives re-deriving the same unreadable text.
    new.hours_status := case
      when tg_op = 'UPDATE' and d.status = 'needs_review' and new.hours_status = 'text_only'
       and new.opening_hours is not distinct from old.opening_hours
       and d.source is not distinct from old.hours_source then 'text_only'
      else d.status end;
    new.hours_source := d.source;
    new.hours_note := d.note;
    new.hours_flags := coalesce(d.flags, '{}');
  end if;

  -- Laptop hours without a source, or a source without hours, fall back to the member majority.
  if new.laptop_source is not null and new.laptop_hours is null then
    new.laptop_source := null;
  end if;
  if new.laptop_source is null then
    if tg_op = 'INSERT' then
      new.laptop_hours := null;
    elsif old.laptop_source is not null or new.laptop_hours is distinct from old.laptop_hours then
      new.laptop_hours := public.community_laptop_hours(new.id);
      new.laptop_source := case when new.laptop_hours is not null then 'community' end;
    end if;
  end if;

  if tg_op = 'INSERT' or new.hours is distinct from old.hours then
    new.open_ranges := public.hours_week_ranges(new.hours);
  end if;
  if tg_op = 'INSERT' or new.hours is distinct from old.hours
     or new.laptop_hours is distinct from old.laptop_hours or new.category is distinct from old.category then
    new.laptop_ranges := public.laptop_week_ranges(new.laptop_hours, new.hours, new.category);
  end if;
  return new;
end;
$$;

-- Recomputes a place's schedules after member facts change. Team hours and venue/team laptop
-- policies are left alone.
create or replace function public.refresh_place_hours(p_place uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.places%rowtype;
  d record;
begin
  select * into p from public.places where id = p_place;
  if not found or p.hours_source = 'team' then
    return;
  end if;
  select * into d from public.derive_place_hours(p.id, p.opening_hours, p.web_facts, p.source, p.locked_fields);
  update public.places
     set hours = d.hours,
         hours_source = d.source,
         hours_status = case when d.status = 'needs_review' and p.hours_status = 'text_only'
                              and p.hours_source is not distinct from d.source then 'text_only' else d.status end,
         hours_note = d.note,
         hours_flags = coalesce(d.flags, '{}')
   where id = p_place
     and (hours is distinct from d.hours
       or hours_source is distinct from d.source
       or hours_note is distinct from d.note
       or hours_flags is distinct from coalesce(d.flags, '{}')
       or (hours_status is distinct from d.status and not (hours_status = 'text_only' and d.status = 'needs_review')));
end;
$$;

create or replace function public.refresh_place_laptop(p_place uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb := public.community_laptop_hours(p_place);
begin
  update public.places
     set laptop_hours = v,
         laptop_source = case when v is not null then 'community' end
   where id = p_place
     and laptop_source is distinct from 'venue'
     and laptop_source is distinct from 'team'
     and (laptop_hours is distinct from v or laptop_source is distinct from case when v is not null then 'community' end);
end;
$$;

create or replace function public.place_facts_refresh_hours()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  k text := coalesce(new.key, old.key);
begin
  if k = 'opening_hours' then
    perform public.refresh_place_hours(coalesce(new.place_id, old.place_id));
  elsif k = 'laptop_hours' then
    perform public.refresh_place_laptop(coalesce(new.place_id, old.place_id));
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Community facts: structured schedules
-- ---------------------------------------------------------------------------

-- opening_hours accepts a weekly schedule (the app) and still the old free text (older app
-- versions); laptop_hours is a weekly laptop policy.
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
           else false end
    else false
  end;
$$;

-- ---------------------------------------------------------------------------
-- Score: a structured schedule counts as known opening hours
-- ---------------------------------------------------------------------------

create or replace function public.compute_place_score(p public.places, s public.place_rating_stats)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  c_prior constant numeric := 3;
  m_prior constant numeric := 3.5;
  n numeric := coalesce(p.review_count, 0);
  avg_rating numeric := coalesce(p.rating_avg, m_prior);
  bayes numeric;
  rev numeric;
  wifi numeric;
  power numeric;
  calls numeric;
  facts numeric;
  completeness numeric;
  cat numeric;
  has_price boolean;
  total numeric;
begin
  bayes := (c_prior * m_prior + n * avg_rating) / (c_prior + n);
  rev := greatest(0, least(1, (bayes - 1) / 4));

  if p.download_median_mbps is not null then
    wifi := least(1, ln(1 + p.download_median_mbps) / ln(101));
  elsif s.wifi_avg is not null then
    wifi := (s.wifi_avg - 1) / 4;
  elsif p.wifi_community is not null then
    wifi := case p.wifi_community when 'yes' then 0.5 when 'unreliable' then 0.2 else 0 end;
  elsif p.wifi = 'yes' then
    wifi := 0.5;
  elsif p.wifi = 'no' then
    wifi := 0;
  else
    wifi := 0.25;
  end if;
  -- A fast test on a good moment does not make Wi-Fi that keeps dropping out reliable.
  if p.wifi_community = 'unreliable' then
    wifi := least(wifi, 0.4);
  end if;

  if s.power_avg is not null then
    power := (s.power_avg - 1) / 4;
  else
    power := case p.power_outlets when 'plenty' then 1 when 'some' then 0.6 when 'none' then 0 else 0.3 end;
  end if;

  if s.calls_answers is not null and s.calls_answers > 0 then
    calls := s.calls_ok_count::numeric / s.calls_answers;
  else
    calls := case p.calls when 'yes' then 1 when 'limited' then 0.5 when 'no' then 0 else 0.3 end;
  end if;
  facts := (power + calls) / 2;

  has_price := p.day_pass_price_cents is not null or p.price_level is not null
    or (p.web_facts ? 'day_pass');
  completeness := (
    (case when p.opening_hours is not null or p.hours is not null then 1 else 0 end)
    + (case when p.website is not null then 1 else 0 end)
    + (case when p.address is not null then 1 else 0 end)
    + (case when has_price then 1 else 0 end)
  )::numeric / 4;

  cat := case p.category when 'coworking' then 1 when 'library' then 0.8 when 'coliving' then 0.8 else 0.5 end;

  total := 10 * (0.55 * rev + 0.20 * wifi + 0.10 * facts + 0.10 * completeness + 0.05 * cat);

  return jsonb_build_object(
    'score', round(total, 2),
    'reviews', round(rev * 10, 1),
    'wifi', round(wifi * 10, 1),
    'facts', round(facts * 10, 1),
    'completeness', round(completeness * 10, 1),
    'category', round(cat * 10, 1)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Time zones for hotspot towns imported without a GeoNames match
-- ---------------------------------------------------------------------------

update public.cities c
   set timezone = v.tz
  from (values
    ('seminyak', 'Asia/Makassar'), ('canggu', 'Asia/Makassar'), ('sanur', 'Asia/Makassar'),
    ('uluwatu', 'Asia/Makassar'), ('gili-trawangan', 'Asia/Makassar'), ('kuta-lombok', 'Asia/Makassar'),
    ('arambol', 'Asia/Kolkata'), ('anjuna', 'Asia/Kolkata'), ('manali', 'Asia/Kolkata'),
    ('palolem', 'Asia/Kolkata'), ('rishikesh', 'Asia/Kolkata'), ('tirthan-valley', 'Asia/Kolkata'),
    ('rawai', 'Asia/Bangkok'), ('pai', 'Asia/Bangkok'), ('ko-pha-ngan', 'Asia/Bangkok'),
    ('ko-tao', 'Asia/Bangkok'), ('ao-nang', 'Asia/Bangkok'), ('ko-lanta', 'Asia/Bangkok'),
    ('ko-mak', 'Asia/Bangkok'),
    ('siargao', 'Asia/Manila'), ('moalboal', 'Asia/Manila'),
    ('mirissa', 'Asia/Colombo'), ('ella', 'Asia/Colombo'), ('arugam-bay', 'Asia/Colombo'),
    ('hiriketiya', 'Asia/Colombo'),
    ('costa-adeje', 'Atlantic/Canary'), ('el-medano', 'Atlantic/Canary'), ('corralejo', 'Atlantic/Canary'),
    ('machico', 'Atlantic/Madeira'), ('ponta-do-sol', 'Atlantic/Madeira'), ('calheta', 'Atlantic/Madeira'),
    ('nazare', 'Europe/Lisbon'), ('ericeira', 'Europe/Lisbon'), ('sagres', 'Europe/Lisbon'),
    ('sines', 'Europe/Lisbon'), ('aljezur', 'Europe/Lisbon'), ('odemira', 'Europe/Lisbon'),
    ('comporta', 'Europe/Lisbon'),
    ('sorrento', 'Europe/Rome'), ('polignano-a-mare', 'Europe/Rome'), ('amantea', 'Europe/Rome'),
    ('tursi', 'Europe/Rome'), ('santa-fiora', 'Europe/Rome'),
    ('kas', 'Europe/Istanbul'), ('rovinj', 'Europe/Zagreb'), ('kotor', 'Europe/Podgorica'),
    ('nafplio', 'Europe/Athens'), ('syros', 'Europe/Athens'), ('naxos', 'Europe/Athens'),
    ('paros', 'Europe/Athens'), ('parga', 'Europe/Athens'),
    ('gozo', 'Europe/Malta'), ('bansko', 'Europe/Sofia'), ('himare', 'Europe/Tirane'),
    ('bovec', 'Europe/Ljubljana'), ('glarus', 'Europe/Zurich'), ('adelboden', 'Europe/Zurich'),
    ('voss', 'Europe/Oslo'), ('volda', 'Europe/Oslo'),
    ('briancon', 'Europe/Paris'), ('hossegor', 'Europe/Paris'), ('oloron-sainte-marie', 'Europe/Paris'),
    ('saint-lary-soulan', 'Europe/Paris'), ('saint-jean-d-angely', 'Europe/Paris'),
    ('aulus-les-bains', 'Europe/Paris'),
    ('dahab', 'Africa/Cairo'), ('el-gouna', 'Africa/Cairo'),
    ('taghazout', 'Africa/Casablanca'), ('imsouane', 'Africa/Casablanca'),
    ('djerba', 'Africa/Tunis'), ('diani-beach', 'Africa/Nairobi'), ('paje', 'Africa/Dar_es_Salaam'),
    ('grand-baie', 'Indian/Mauritius'), ('santa-maria', 'Atlantic/Cape_Verde'),
    ('byron-bay', 'Australia/Sydney'), ('noosa-heads', 'Australia/Brisbane'),
    ('queenstown', 'Pacific/Auckland'), ('raglan', 'Pacific/Auckland'),
    ('panajachel', 'America/Guatemala'), ('san-marcos-la-laguna', 'America/Guatemala'),
    ('salento', 'America/Bogota'), ('palomino', 'America/Bogota'),
    ('banos', 'America/Guayaquil'), ('montanita', 'America/Guayaquil'),
    ('boquete', 'America/Panama'), ('bocas-del-toro', 'America/Panama'),
    ('jaco', 'America/Costa_Rica'), ('santa-teresa', 'America/Costa_Rica'),
    ('puerto-viejo-de-talamanca', 'America/Costa_Rica'), ('uvita', 'America/Costa_Rica'),
    ('tamarindo', 'America/Costa_Rica'), ('nosara', 'America/Costa_Rica'),
    ('punta-del-este', 'America/Montevideo'), ('mazunte', 'America/Mexico_City'),
    ('bacalar', 'America/Cancun'), ('sayulita', 'America/Bahia_Banderas'), ('todos-santos', 'America/Mazatlan'),
    ('san-juan-del-sur', 'America/Managua'), ('el-tunco', 'America/El_Salvador'),
    ('caye-caulker', 'America/Belize'), ('pipa', 'America/Fortaleza'), ('jericoacoara', 'America/Fortaleza'),
    ('mancora', 'America/Lima'), ('rincon', 'America/Puerto_Rico'),
    ('cabarete', 'America/Santo_Domingo'), ('las-terrenas', 'America/Santo_Domingo')
  ) as v(slug, tz)
 where c.slug = v.slug
   and c.timezone is null
   and exists (select 1 from pg_timezone_names z where z.name = v.tz);

-- ---------------------------------------------------------------------------
-- Backfill: read the existing text once. updated_at stays as it is.
-- ---------------------------------------------------------------------------

alter table public.places disable trigger places_updated_at;

update public.places p
   set hours = d.hours,
       hours_source = d.source,
       hours_status = d.status,
       hours_note = d.note,
       hours_flags = coalesce(d.flags, '{}'),
       open_ranges = public.hours_week_ranges(d.hours),
       laptop_ranges = public.laptop_week_ranges(null, d.hours, p.category)
  from public.places p2
 cross join lateral public.derive_place_hours(p2.id, p2.opening_hours, p2.web_facts, p2.source, p2.locked_fields) d
 where p2.id = p.id
   and (p2.opening_hours is not null
     or exists (select 1 from public.place_facts f where f.place_id = p2.id and f.key = 'opening_hours' and f.status = 'approved'));

alter table public.places enable trigger places_updated_at;

create trigger places_hours
  before insert or update on public.places
  for each row execute function public.places_derive_hours();

drop trigger if exists place_facts_hours on public.place_facts;
create trigger place_facts_hours
  after insert or update or delete on public.place_facts
  for each row execute function public.place_facts_refresh_hours();

create index places_hours_review_idx on public.places (updated_at desc) where hours_status = 'needs_review';

-- ---------------------------------------------------------------------------
-- City ranking: "Open now" and "Work here now"
-- ---------------------------------------------------------------------------

drop function public.get_city_ranking(uuid, text, text, boolean, boolean, boolean, text, integer, integer);

create function public.get_city_ranking(
  p_city_id uuid,
  p_category text default null,
  p_sort text default 'score',
  p_wifi boolean default false,
  p_power boolean default false,
  p_calls boolean default false,
  p_q text default null,
  p_limit integer default 30,
  p_offset integer default 0,
  p_open_now boolean default false,
  p_work_now boolean default false
)
returns table (
  id uuid, slug text, name text, name_local text, category text, address text, lat double precision,
  lng double precision, website text, opening_hours text, price_level integer, day_pass_price_cents integer,
  wifi text, power_outlets text, calls text, focus text, internet_fee text, outdoor_seating text,
  web_day_pass jsonb, download_median_mbps numeric, upload_median_mbps numeric, speed_test_count integer,
  rating_avg numeric, review_count integer, text_review_count integer, work_score numeric, score_rank bigint,
  cover_preview_path text, cover_full_path text, total_count bigint,
  hours jsonb, hours_status text, laptop_hours jsonb, laptop_source text
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with now_local as (
    select public.local_week_minute(c.timezone) as m from public.cities c where c.id = p_city_id
  ),
  base as (
    select p.*,
           rank() over (order by p.work_score desc) as score_rank
      from public.places p
     where p.city_id = p_city_id
       and p.status = 'published'
       and (p_category is null or p.category = p_category)
  ),
  filtered as (
    select b.* from base b
     where (not p_wifi or b.wifi = 'yes' or b.download_median_mbps is not null)
       and (not p_power or b.power_outlets in ('plenty', 'some'))
       and (not p_calls or b.calls in ('yes', 'limited'))
       and (not (p_open_now or p_work_now) or coalesce(b.open_ranges @> (select m from now_local), false))
       and (not p_work_now or coalesce(b.laptop_ranges @> (select m from now_local), false))
       and (
         nullif(trim(p_q), '') is null
         or lower(extensions.unaccent(b.name)) like '%' || lower(extensions.unaccent(trim(p_q))) || '%'
         or lower(extensions.unaccent(coalesce(b.address, ''))) like '%' || lower(extensions.unaccent(trim(p_q))) || '%'
       )
  )
  select f.id, f.slug, f.name, f.name_local, f.category, f.address, f.lat, f.lng, f.website, f.opening_hours,
         f.price_level, f.day_pass_price_cents, f.wifi, f.power_outlets, f.calls, f.focus, f.internet_fee,
         f.outdoor_seating, f.web_facts -> 'day_pass' as web_day_pass,
         f.download_median_mbps, f.upload_median_mbps, f.speed_test_count,
         f.rating_avg, f.review_count, f.text_review_count, f.work_score, f.score_rank,
         ph.preview_path as cover_preview_path,
         case when f.category <> 'cafe' or public.is_plus() or public.is_admin() then ph.full_path end as cover_full_path,
         count(*) over () as total_count,
         f.hours, f.hours_status, f.laptop_hours, f.laptop_source
    from filtered f
    left join lateral (
      select x.preview_path, x.full_path from public.place_photos x
       where x.place_id = f.id and x.status = 'approved'
       order by x.sort_order asc, x.created_at asc limit 1
    ) ph on true
   order by
     case when p_sort = 'rating' then f.rating_avg end desc nulls last,
     case when p_sort = 'wifi' then f.download_median_mbps end desc nulls last,
     case when p_sort = 'reviews' then f.review_count end desc,
     case when p_sort = 'name' then f.name end asc,
     f.work_score desc,
     f.review_count desc,
     f.name asc
   limit least(greatest(p_limit, 1), 100)
  offset greatest(p_offset, 0);
$$;

revoke all on function public.get_city_ranking(uuid, text, text, boolean, boolean, boolean, text, integer, integer, boolean, boolean) from public;
grant execute on function public.get_city_ranking(uuid, text, text, boolean, boolean, boolean, text, integer, integer, boolean, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Map: places in the viewport, with the same time filters
-- ---------------------------------------------------------------------------

create or replace function public.get_places_in_bounds(
  p_south double precision,
  p_north double precision,
  p_west double precision,
  p_east double precision,
  p_categories text[],
  p_limit integer default 300,
  p_open_now boolean default false,
  p_work_now boolean default false
)
returns table (
  id uuid, slug text, name text, category text, lat double precision, lng double precision, address text,
  work_score numeric, review_count integer, rating_avg numeric, city_slug text, city_name text,
  timezone text, hours jsonb, hours_status text, laptop_hours jsonb, laptop_source text
)
language sql
stable
security definer
set search_path = public
as $$
  with pl as (
    select p.id, p.slug, p.name, p.category, p.lat, p.lng, p.address, p.work_score, p.review_count,
           p.rating_avg, c.slug as city_slug, c.name as city_name, c.timezone, p.hours, p.hours_status,
           p.laptop_hours, p.laptop_source, p.open_ranges, p.laptop_ranges
      from public.places p
      left join public.cities c on c.id = p.city_id
     where p.status = 'published'
       and p.category = any(p_categories)
       and p.lat between p_south and p_north
       and (p_west > p_east or p.lng between p_west and p_east)
       and (not (p_open_now or p_work_now) or p.open_ranges is not null)
       and (not p_work_now or p.laptop_ranges is not null)
  ),
  zones as (
    select z.timezone, public.local_week_minute(z.timezone) as m
      from (select distinct pl.timezone from pl where p_open_now or p_work_now) z
  )
  select pl.id, pl.slug, pl.name, pl.category, pl.lat, pl.lng, pl.address, pl.work_score, pl.review_count,
         pl.rating_avg, pl.city_slug, pl.city_name, pl.timezone, pl.hours, pl.hours_status, pl.laptop_hours,
         pl.laptop_source
    from pl
    left join zones z on z.timezone = pl.timezone
   where (not (p_open_now or p_work_now) or coalesce(pl.open_ranges @> z.m, false))
     and (not p_work_now or coalesce(pl.laptop_ranges @> z.m, false))
   order by pl.work_score desc
   limit least(greatest(p_limit, 1), 500);
$$;

revoke all on function public.get_places_in_bounds(double precision, double precision, double precision, double precision, text[], integer, boolean, boolean) from public;
grant execute on function public.get_places_in_bounds(double precision, double precision, double precision, double precision, text[], integer, boolean, boolean) to anon, authenticated;

-- The admin editor converts pasted text with the same parser.
revoke all on function public.parse_opening_hours(text) from public, anon;
grant execute on function public.parse_opening_hours(text) to authenticated;

revoke all on function public.derive_place_hours(uuid, text, jsonb, text, text[]) from public, anon, authenticated;
revoke all on function public.community_laptop_hours(uuid) from public, anon, authenticated;
revoke all on function public.places_derive_hours() from public, anon, authenticated;
revoke all on function public.refresh_place_hours(uuid) from public, anon, authenticated;
revoke all on function public.refresh_place_laptop(uuid) from public, anon, authenticated;
revoke all on function public.place_facts_refresh_hours() from public, anon, authenticated;

notify pgrst, 'reload schema';
