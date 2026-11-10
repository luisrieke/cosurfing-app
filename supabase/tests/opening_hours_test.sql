-- Tests for 20261110180000_structured_opening_hours.sql. Run with scripts/test-hours-sql.sh.
\set ON_ERROR_STOP on

create or replace function pg_temp.check(p_name text, p_got jsonb, p_want jsonb)
returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'FAIL %: got %, want %', p_name, p_got, p_want;
  end if;
end;
$$;

create or replace function pg_temp.hours(p_text text) returns jsonb language sql as $$
  select case when (r ->> 'ok')::boolean then r -> 'hours' else to_jsonb('review:' || (r ->> 'reason')) end
    from (select public.parse_opening_hours(p_text) r) x;
$$;

create or replace function pg_temp.week(p jsonb) returns jsonb language sql as $$
  select jsonb_build_object('mo', p -> 0, 'tu', p -> 1, 'we', p -> 2, 'th', p -> 3, 'fr', p -> 4, 'sa', p -> 5, 'su', p -> 6);
$$;

-- ---------------------------------------------------------------------------
-- Parser: schedules it reads
-- ---------------------------------------------------------------------------
select pg_temp.check('weekdays', pg_temp.hours('Mo-Fr 08:00-18:00'),
  pg_temp.week('[[[480,1080]],[[480,1080]],[[480,1080]],[[480,1080]],[[480,1080]],[],[]]'));
select pg_temp.check('two rules', pg_temp.hours('Mo-Fr 08:00-18:00; Sa 09:00-14:00'),
  pg_temp.week('[[[480,1080]],[[480,1080]],[[480,1080]],[[480,1080]],[[480,1080]],[[540,840]],[]]'));
select pg_temp.check('split day', pg_temp.hours('Mo-Sa 12:00-15:00,18:00-23:00'),
  pg_temp.week('[[[720,900],[1080,1380]],[[720,900],[1080,1380]],[[720,900],[1080,1380]],[[720,900],[1080,1380]],[[720,900],[1080,1380]],[[720,900],[1080,1380]],[]]'));
select pg_temp.check('24/7', pg_temp.hours('24/7'),
  pg_temp.week('[[[0,1440]],[[0,1440]],[[0,1440]],[[0,1440]],[[0,1440]],[[0,1440]],[[0,1440]]]'));
select pg_temp.check('no days = every day', pg_temp.hours('10:00-22:00'),
  pg_temp.week('[[[600,1320]],[[600,1320]],[[600,1320]],[[600,1320]],[[600,1320]],[[600,1320]],[[600,1320]]]'));
select pg_temp.check('overnight', pg_temp.hours('Fr-Sa 20:00-03:00'),
  pg_temp.week('[[],[],[],[],[[1200,1620]],[[1200,1620]],[]]'));
select pg_temp.check('midnight end', pg_temp.hours('Mo 18:00-24:00; Tu 18:00-00:00'),
  pg_temp.week('[[[1080,1440]],[[1080,1440]],[],[],[],[],[]]'));
select pg_temp.check('extended time', pg_temp.hours('Sa 22:00-26:00'),
  pg_temp.week('[[],[],[],[],[],[[1320,1560]],[]]'));
select pg_temp.check('wrapping day range', pg_temp.hours('Fr-Mo 10:00-16:00'),
  pg_temp.week('[[[600,960]],[],[],[],[[600,960]],[[600,960]],[[600,960]]]'));
select pg_temp.check('day list', pg_temp.hours('Mo,We,Fr 09:00-12:00'),
  pg_temp.week('[[[540,720]],[],[[540,720]],[],[[540,720]],[],[]]'));
select pg_temp.check('slash list', pg_temp.hours('Tu/Th 9-17'),
  pg_temp.week('[[],[[540,1020]],[],[[540,1020]],[],[],[]]'));
select pg_temp.check('additional rule', pg_temp.hours('Mo-Fr 08:00-12:00, We 14:00-18:00'),
  pg_temp.week('[[[480,720]],[[480,720]],[[480,720],[840,1080]],[[480,720]],[[480,720]],[],[]]'));
select pg_temp.check('comma rule list', pg_temp.hours('Mo-Fr 08:00-17:00, Sa 09:00-13:00'),
  pg_temp.week('[[[480,1020]],[[480,1020]],[[480,1020]],[[480,1020]],[[480,1020]],[[540,780]],[]]'));
select pg_temp.check('override', pg_temp.hours('Mo-Su 10:00-22:00; Su 12:00-20:00'),
  pg_temp.week('[[[600,1320]],[[600,1320]],[[600,1320]],[[600,1320]],[[600,1320]],[[600,1320]],[[720,1200]]]'));
select pg_temp.check('closed override', pg_temp.hours('Mo-Su 08:00-20:00; We off'),
  pg_temp.week('[[[480,1200]],[[480,1200]],[],[[480,1200]],[[480,1200]],[[480,1200]],[[480,1200]]]'));
select pg_temp.check('am/pm', pg_temp.hours('Mon-Fri 8am-5:30pm'),
  pg_temp.week('[[[480,1050]],[[480,1050]],[[480,1050]],[[480,1050]],[[480,1050]],[],[]]'));
select pg_temp.check('12am end', pg_temp.hours('Sat 8 PM - 12 AM'),
  pg_temp.week('[[],[],[],[],[],[[1200,1440]],[]]'));
select pg_temp.check('english names', pg_temp.hours('Monday-Friday 09:00-17:00'),
  pg_temp.week('[[[540,1020]],[[540,1020]],[[540,1020]],[[540,1020]],[[540,1020]],[],[]]'));
select pg_temp.check('unicode dash + h suffix', pg_temp.hours('Mo–Fr 12:30h–18:30h'),
  pg_temp.week('[[[750,1110]],[[750,1110]],[[750,1110]],[[750,1110]],[[750,1110]],[],[]]'));
select pg_temp.check('colon after days', pg_temp.hours('Mo-Fr: 09:00-17:00'),
  pg_temp.week('[[[540,1020]],[[540,1020]],[[540,1020]],[[540,1020]],[[540,1020]],[],[]]'));
select pg_temp.check('redundant open', pg_temp.hours('Mo-Th,Sa 09:00-16:45 open'),
  pg_temp.week('[[[540,1005]],[[540,1005]],[[540,1005]],[[540,1005]],[],[[540,1005]],[]]'));
select pg_temp.check('adjacent spans merge', pg_temp.hours('Mo 08:00-12:00,12:00-15:00'),
  pg_temp.week('[[[480,900]],[],[],[],[],[],[]]'));
select pg_temp.check('trailing semicolon', pg_temp.hours('Mo-Fr 08:00-18:00;'),
  pg_temp.week('[[[480,1080]],[[480,1080]],[[480,1080]],[[480,1080]],[[480,1080]],[],[]]'));

-- Holidays and date closures are reported, not folded into the week.
select pg_temp.check('PH off', public.parse_opening_hours('Mo-Fr 09:00-18:00; PH off'),
  jsonb_build_object('ok', true, 'flags', '["holidays"]'::jsonb,
    'hours', pg_temp.week('[[[540,1080]],[[540,1080]],[[540,1080]],[[540,1080]],[[540,1080]],[],[]]')));
select pg_temp.check('Su,PH off', public.parse_opening_hours('Mo-Sa 09:00-18:00; Su,PH off'),
  jsonb_build_object('ok', true, 'flags', '["holidays"]'::jsonb,
    'hours', pg_temp.week('[[[540,1080]],[[540,1080]],[[540,1080]],[[540,1080]],[[540,1080]],[[540,1080]],[]]')));
select pg_temp.check('PH with times', pg_temp.hours('Mo-Fr 09:00-18:00; PH 10:00-14:00'),
  pg_temp.week('[[[540,1080]],[[540,1080]],[[540,1080]],[[540,1080]],[[540,1080]],[],[]]'));
select pg_temp.check('holiday-only rule', pg_temp.hours('Mo-Fr 09:00-18:00; PH Mo-Fr off'),
  pg_temp.week('[[[540,1080]],[[540,1080]],[[540,1080]],[[540,1080]],[[540,1080]],[],[]]'));
select pg_temp.check('Mo-Fr,PH', pg_temp.hours('Mo-Fr,PH 10:00-16:00'),
  pg_temp.week('[[[600,960]],[[600,960]],[[600,960]],[[600,960]],[[600,960]],[],[]]'));
select pg_temp.check('date closure', public.parse_opening_hours('Mo-Fr 09:00-18:00; Dec 25 off; Jan 01 off'),
  jsonb_build_object('ok', true, 'flags', '["date_exceptions"]'::jsonb,
    'hours', pg_temp.week('[[[540,1080]],[[540,1080]],[[540,1080]],[[540,1080]],[[540,1080]],[],[]]')));

select pg_temp.check('nth weekday closure', public.parse_opening_hours('Mo-Su 09:00-19:00; Th[3] off'),
  jsonb_build_object('ok', true, 'flags', '["date_exceptions"]'::jsonb,
    'hours', pg_temp.week('[[[540,1140]],[[540,1140]],[[540,1140]],[[540,1140]],[[540,1140]],[[540,1140]],[[540,1140]]]')));
select pg_temp.check('trailing commas', pg_temp.hours('Mo 09:00-17:00, Tu 09:00-17:00, ,'),
  pg_temp.week('[[[540,1020]],[[540,1020]],[],[],[],[],[]]'));

-- ---------------------------------------------------------------------------
-- Parser: text it sends to review instead of guessing
-- ---------------------------------------------------------------------------
select pg_temp.check('comment', pg_temp.hours('Mo-Fr 09:00-18:00 "by appointment"'), '"review:comment"');
select pg_temp.check('fallback', pg_temp.hours('Mo-Fr 09:00-18:00 || "on call"'), '"review:fallback"');
select pg_temp.check('fallback plain', pg_temp.hours('Mo-Fr 09:00-18:00 || Sa 10:00-12:00'), '"review:fallback"');
select pg_temp.check('seasonal', pg_temp.hours('Apr-Oct: Mo-Su 10:00-20:00'), '"review:seasonal"');
select pg_temp.check('week numbers', pg_temp.hours('week 1-26 Mo-Fr 10:00-12:00'), '"review:week"');
select pg_temp.check('sunset', pg_temp.hours('Mo-Su 08:00-sunset'), '"review:variable_times"');
select pg_temp.check('open end', pg_temp.hours('Fr 18:00+'), '"review:open_end"');
select pg_temp.check('nth weekday', pg_temp.hours('Mo-Fr 09:00-17:00; Sa[1] 10:00-12:00'), '"review:nth_weekday"');
select pg_temp.check('no times', pg_temp.hours('Mo-Fr'), '"review:no_times"');
select pg_temp.check('overlap', pg_temp.hours('Mo 08:00-12:00,11:00-14:00'), '"review:overlap"');
select pg_temp.check('ambiguous override', pg_temp.hours('Mo-Fr 08:00-12:00; Mo-Fr 13:00-18:00'), '"review:ambiguous_override"');
select pg_temp.check('bad time', pg_temp.hours('Mo 25:00-26:00'), '"review:invalid_time"');
select pg_temp.check('bad minutes', pg_temp.hours('Mo 08:75-12:00'), '"review:invalid_time"');
select pg_temp.check('zero length', pg_temp.hours('Mo 08:00-08:00'), '"review:zero_length"');
select pg_temp.check('closed only', pg_temp.hours('off'), '"review:closed_only"');
select pg_temp.check('holidays only', pg_temp.hours('PH off'), '"review:no_weekly_hours"');
select pg_temp.check('local day names', pg_temp.hours('Mi-Fr 11-18:00'), '"review:unrecognized"');
select pg_temp.check('ambiguous Do', pg_temp.hours('Lu-Do 10-18'), '"review:unrecognized"');
select pg_temp.check('prose', pg_temp.hours('Open daily from 9'), '"review:unrecognized"');
select pg_temp.check('missing separator', pg_temp.hours('Mo-Fr 08:00-18:00 Sa 09:00-14:00'), '"review:unrecognized"');
select pg_temp.check('unknown', pg_temp.hours('Mo-Fr unknown'), '"review:unknown"');
select pg_temp.check('empty', public.parse_opening_hours('   '), null);

-- ---------------------------------------------------------------------------
-- Validators and ranges
-- ---------------------------------------------------------------------------
select pg_temp.check('valid hours', to_jsonb(public.opening_hours_valid(pg_temp.week('[[[480,1080]],[],[],[],[],[[1200,1620]],[]]'))), 'true');
select pg_temp.check('missing day', to_jsonb(public.opening_hours_valid('{"mo":[]}')), 'false');
select pg_temp.check('unsorted', to_jsonb(public.opening_hours_valid(pg_temp.week('[[[600,700],[480,500]],[],[],[],[],[],[]]'))), 'false');
select pg_temp.check('too long', to_jsonb(public.opening_hours_valid(pg_temp.week('[[[0,1500]],[],[],[],[],[],[]]'))), 'false');
select pg_temp.check('start at 24', to_jsonb(public.opening_hours_valid(pg_temp.week('[[[1440,1500]],[],[],[],[],[],[]]'))), 'false');
select pg_temp.check('fractional', to_jsonb(public.opening_hours_valid(pg_temp.week('[[[480.5,1080]],[],[],[],[],[],[]]'))), 'false');
select pg_temp.check('laptop valid', to_jsonb(public.laptop_hours_valid('{"mo":{"mode":"all"},"sa":{"mode":"specific","ranges":[[480,720]]},"su":{"mode":"none"}}')), 'true');
select pg_temp.check('laptop specific w/o ranges', to_jsonb(public.laptop_hours_valid('{"mo":{"mode":"specific","ranges":[]}}')), 'false');
select pg_temp.check('laptop bad mode', to_jsonb(public.laptop_hours_valid('{"mo":{"mode":"maybe"}}')), 'false');
select pg_temp.check('laptop extra key', to_jsonb(public.laptop_hours_valid('{"mo":{"mode":"all","ranges":[[1,2]]}}')), 'false');

select pg_temp.check('week ranges wrap', to_jsonb(public.hours_week_ranges(pg_temp.week('[[[480,1080]],[],[],[],[],[],[[1320,1560]]]'))::text),
  '"{[0,120),[480,1080),[9960,10080)}"');
select pg_temp.check('laptop ranges', to_jsonb(public.laptop_week_ranges(
    '{"mo":{"mode":"specific","ranges":[[480,720]]},"tu":{"mode":"all"},"we":{"mode":"none"}}',
    pg_temp.week('[[[480,1200]],[[480,1200]],[[480,1200]],[],[],[],[]]'), 'cafe')::text),
  '"{[480,720),[1920,2640)}"');
select pg_temp.check('cafe without policy', to_jsonb(public.laptop_week_ranges(null, pg_temp.week('[[[480,1200]],[],[],[],[],[],[]]'), 'cafe')), null);
select pg_temp.check('coworking default', to_jsonb(public.laptop_week_ranges(null, pg_temp.week('[[[480,1200]],[],[],[],[],[],[]]'), 'coworking')::text),
  '"{[480,1200)}"');

-- Local week minute follows daylight saving time: 2026-03-29 is the spring switch in Berlin.
select pg_temp.check('berlin winter', to_jsonb(public.local_week_minute('Europe/Berlin', '2026-03-28 11:00:00+00')), to_jsonb(5 * 1440 + 12 * 60));
select pg_temp.check('berlin summer', to_jsonb(public.local_week_minute('Europe/Berlin', '2026-03-30 11:00:00+00')), to_jsonb(13 * 60));
select pg_temp.check('sunday night', to_jsonb(public.local_week_minute('Asia/Makassar', '2026-11-15 16:30:00+00')), to_jsonb(30));
select pg_temp.check('bad zone', to_jsonb(public.local_week_minute('Mars/Olympus', now())), null);

-- ---------------------------------------------------------------------------
-- Trigger: derivation, precedence and filters
-- ---------------------------------------------------------------------------
insert into public.cities (slug, name, timezone) values ('test-town', 'Test Town', 'Europe/Berlin');

insert into public.places (city_id, slug, name, category, source, opening_hours)
select id, 'cafe-a', 'Cafe A', 'cafe', 'osm', 'Mo-Su 08:00-20:00' from public.cities where slug = 'test-town';

select pg_temp.check('derived on insert',
  (select jsonb_build_object('src', hours_source, 'st', hours_status, 'open', open_ranges is not null, 'laptop', laptop_ranges)
     from public.places where slug = 'cafe-a'),
  '{"src":"osm","st":"structured","open":true,"laptop":null}');

-- A cafe that is open is not a place you can work: no laptop policy, no "work here now".
select pg_temp.check('open is not work',
  (select jsonb_build_object('open', open_ranges @> 600, 'work', coalesce(laptop_ranges @> 600, false))
     from public.places where slug = 'cafe-a'),
  '{"open":true,"work":false}');

update public.places set laptop_hours = '{"mo":{"mode":"specific","ranges":[[480,720]]},"tu":{"mode":"all"}}', laptop_source = 'venue'
 where slug = 'cafe-a';
select pg_temp.check('venue laptop policy',
  (select jsonb_build_object('mo10', laptop_ranges @> 600, 'mo13', laptop_ranges @> 780, 'tu19', laptop_ranges @> (1440 + 19 * 60), 'we10', laptop_ranges @> (2880 + 600))
     from public.places where slug = 'cafe-a'),
  '{"mo10":true,"mo13":false,"tu19":true,"we10":false}');

-- Members cannot override a venue policy.
insert into public.place_facts (place_id, key, value)
select id, 'laptop_hours', '{"mo":{"mode":"none"}}' from public.places where slug = 'cafe-a';
select pg_temp.check('venue beats community 2', to_jsonb((select laptop_source from public.places where slug = 'cafe-a')), '"venue"');

-- Clearing the policy falls back to the member majority.
update public.places set laptop_hours = null, laptop_source = null where slug = 'cafe-a';
select pg_temp.check('community laptop', (select jsonb_build_object('src', laptop_source, 'h', laptop_hours) from public.places where slug = 'cafe-a'),
  '{"src":"community","h":{"mo":{"mode":"none"}}}');

-- Member hours beat the listing; unreadable member text asks for review instead of using the listing.
insert into public.place_facts (place_id, key, value)
select id, 'opening_hours', to_jsonb('Mo-Fr 09:00-17:00'::text) from public.places where slug = 'cafe-a';
select pg_temp.check('community hours', (select jsonb_build_object('src', hours_source, 'sa', hours -> 'sa') from public.places where slug = 'cafe-a'),
  '{"src":"community","sa":[]}');
update public.place_facts set value = to_jsonb('Mi-Fr 11-18'::text) where key = 'opening_hours';
select pg_temp.check('community unreadable', (select jsonb_build_object('src', hours_source, 'st', hours_status, 'h', hours, 'o', open_ranges) from public.places where slug = 'cafe-a'),
  '{"src":"community","st":"needs_review","h":null,"o":null}');
delete from public.place_facts where key = 'opening_hours';
select pg_temp.check('back to listing', (select jsonb_build_object('src', hours_source, 'st', hours_status) from public.places where slug = 'cafe-a'),
  '{"src":"osm","st":"structured"}');

-- Team hours stay put when the crawler rewrites the text.
update public.places set hours = pg_temp.week('[[[600,960]],[],[],[],[],[],[]]'), hours_source = 'team' where slug = 'cafe-a';
update public.places set opening_hours = 'Mo-Su 07:00-23:00' where slug = 'cafe-a';
select pg_temp.check('team kept', (select jsonb_build_object('src', hours_source, 'mo', hours -> 'mo', 'text', opening_hours) from public.places where slug = 'cafe-a'),
  '{"src":"team","mo":[[600,960]],"text":"Mo-Su 07:00-23:00"}');
-- Resetting to automatic reads the text again.
update public.places set hours_source = null where slug = 'cafe-a';
select pg_temp.check('reset to automatic', (select jsonb_build_object('src', hours_source, 'mo', hours -> 'mo') from public.places where slug = 'cafe-a'),
  '{"src":"osm","mo":[[420,1380]]}');

-- Invalid team hours are rejected.
do $$
begin
  update public.places set hours = '{"mo":[[900,600]]}', hours_source = 'team' where slug = 'cafe-a';
  raise exception 'FAIL invalid hours accepted';
exception when check_violation then null;
end $$;

-- Text that needs review keeps the place working: text stays, no structured hours, no filter match.
insert into public.places (city_id, slug, name, category, source, opening_hours)
select id, 'bar-b', 'Bar B', 'cafe', 'osm', 'Mo-Fr 09:00-18:00 "except in August"' from public.cities where slug = 'test-town';
select pg_temp.check('needs review', (select jsonb_build_object('st', hours_status, 'note', hours_note, 'text', opening_hours, 'h', hours) from public.places where slug = 'bar-b'),
  '{"st":"needs_review","note":"comment","text":"Mo-Fr 09:00-18:00 \"except in August\"","h":null}');

insert into public.places (city_id, slug, name, category, source, opening_hours)
select id, 'cowork-c', 'Cowork C', 'coworking', 'osm', 'Mo-Fr 08:00-18:00' from public.cities where slug = 'test-town';

-- Filters in the ranking: Monday 10:00 and 19:00 Berlin time (2026-11-09 is a Monday, UTC+1).
create or replace function pg_temp.ranked(p_open boolean, p_work boolean, p_at timestamptz) returns jsonb language sql as $$
  select coalesce(jsonb_agg(p.slug order by p.slug), '[]')
    from public.places p join public.cities c on c.id = p.city_id
   where c.slug = 'test-town'
     and (not (p_open or p_work) or coalesce(p.open_ranges @> public.local_week_minute(c.timezone, p_at), false))
     and (not p_work or coalesce(p.laptop_ranges @> public.local_week_minute(c.timezone, p_at), false));
$$;
select pg_temp.check('open now', pg_temp.ranked(true, false, '2026-11-09 09:00:00+00'), '["cafe-a","cowork-c"]');
-- cafe-a's members say no laptops on Mondays: open, but not a work spot.
select pg_temp.check('work now', pg_temp.ranked(false, true, '2026-11-09 09:00:00+00'), '["cowork-c"]');
select pg_temp.check('open late', pg_temp.ranked(true, false, '2026-11-09 18:00:00+00'), '["cafe-a"]');
update public.places set laptop_hours = '{"mo":{"mode":"all"},"tu":{"mode":"none"}}', laptop_source = 'team' where slug = 'cafe-a';
select pg_temp.check('work now with policy', pg_temp.ranked(false, true, '2026-11-09 09:00:00+00'), '["cafe-a","cowork-c"]');
select pg_temp.check('work now late', pg_temp.ranked(false, true, '2026-11-09 18:00:00+00'), '["cafe-a"]');

select count(*) as ranking_rows from public.get_city_ranking((select id from public.cities where slug = 'test-town'), p_work_now => true);
select count(*) as map_rows from public.get_places_in_bounds(-90, 90, -180, 180, array['cafe', 'coworking'], 300, true, false);

-- Fact values
select pg_temp.check('fact structured hours', to_jsonb(public.place_fact_value_ok('opening_hours', pg_temp.week('[[[480,1080]],[],[],[],[],[],[]]'))), 'true');
select pg_temp.check('fact legacy text', to_jsonb(public.place_fact_value_ok('opening_hours', '"Mo-Fr 9-5"')), 'true');
select pg_temp.check('fact laptop', to_jsonb(public.place_fact_value_ok('laptop_hours', '{"mo":{"mode":"all"}}')), 'true');
select pg_temp.check('fact laptop all unknown', to_jsonb(public.place_fact_value_ok('laptop_hours', '{"mo":{"mode":"unknown"}}')), 'false');

select 'all opening hours tests passed' as result;
