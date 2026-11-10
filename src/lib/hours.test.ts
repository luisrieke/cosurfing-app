/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  compactLaptopWeek,
  copyDay,
  cloneIntervals,
  dayError,
  emptyWeek,
  formatInterval,
  fullLaptopWeek,
  isLaptopHours,
  isWeeklyHours,
  laptopsAnswer,
  laptopWeekRanges,
  localWeekMinute,
  makeInterval,
  matchesTimeFilter,
  openStatus,
  parseTimeInput,
  presetHours,
  toOsm,
  weekRanges,
  workStatus,
  type LaptopHours,
  type WeeklyHours,
} from './hours.ts';

const H = (h: number, m = 0) => h * 60 + m;
const MON = 0;
const TUE = 1440;
const FRI = 4 * 1440;
const SAT = 5 * 1440;
const SUN = 6 * 1440;

function week(partial: Partial<WeeklyHours>): WeeklyHours {
  return { ...emptyWeek(), ...partial };
}

describe('localWeekMinute', () => {
  it('uses the zone, not the device clock', () => {
    // Monday 2026-11-09 09:00 UTC
    const d = new Date('2026-11-09T09:00:00Z');
    assert.equal(localWeekMinute(d, 'Europe/Berlin'), MON + H(10));
    assert.equal(localWeekMinute(d, 'Asia/Makassar'), MON + H(17));
    assert.equal(localWeekMinute(d, 'America/Mexico_City'), MON + H(3));
  });

  it('follows daylight saving time', () => {
    // Berlin switches to summer time on Sunday 2026-03-29.
    assert.equal(localWeekMinute(new Date('2026-03-28T11:00:00Z'), 'Europe/Berlin'), SAT + H(12));
    assert.equal(localWeekMinute(new Date('2026-03-29T11:00:00Z'), 'Europe/Berlin'), SUN + H(13));
    // Sydney leaves summer time (UTC+11 -> UTC+10) at 03:00 on Sunday 2026-04-05.
    assert.equal(localWeekMinute(new Date('2026-04-04T10:00:00Z'), 'Australia/Sydney'), SAT + H(21));
    assert.equal(localWeekMinute(new Date('2026-04-05T10:00:00Z'), 'Australia/Sydney'), SUN + H(20));
  });

  it('handles local midnight and unknown zones', () => {
    assert.equal(localWeekMinute(new Date('2026-11-08T23:00:00Z'), 'Europe/Berlin'), MON);
    assert.equal(localWeekMinute(new Date(), 'Mars/Olympus'), null);
    assert.equal(localWeekMinute(new Date(), null), null);
  });
});

describe('openStatus', () => {
  const office = week({ mo: [[H(8), H(18)]], tu: [[H(8), H(18)]], fr: [[H(8), H(12)], [H(14), H(18)]] });

  it('reports open with the closing time', () => {
    assert.deepEqual(openStatus(office, MON + H(9)), { kind: 'open', closesAt: MON + H(18), minutesLeft: 9 * 60 });
  });

  it('reports when it opens next, across days and the week end', () => {
    assert.deepEqual(openStatus(office, MON + H(19)), { kind: 'closed', opensAt: TUE + H(8), minutesUntil: 13 * 60 });
    assert.deepEqual(openStatus(office, FRI + H(13)), { kind: 'closed', opensAt: FRI + H(14), minutesUntil: 60 });
    const sat = openStatus(office, SAT + H(10));
    assert.equal(sat.kind, 'closed');
    assert.equal(sat.kind === 'closed' && sat.opensAt, 7 * 1440 + H(8)); // next Monday
  });

  it('keeps overnight hours open after midnight, including Sunday into Monday', () => {
    const bar = week({ fr: [[H(20), H(27)]], su: [[H(22), H(26)]] });
    assert.equal(openStatus(bar, SAT + H(2)).kind, 'open');
    assert.equal(openStatus(bar, SAT + H(4)).kind, 'closed');
    assert.deepEqual(openStatus(bar, MON + H(1)), { kind: 'open', closesAt: MON + H(2), minutesLeft: 60 });
    assert.deepEqual(openStatus(bar, SUN + H(23)), { kind: 'open', closesAt: 7 * 1440 + H(2), minutesLeft: 180 });
  });

  it('knows 24/7, closed weeks and unknown', () => {
    assert.deepEqual(openStatus(presetHours('always'), FRI), { kind: 'always' });
    assert.deepEqual(openStatus(emptyWeek(), FRI), { kind: 'closed', opensAt: null, minutesUntil: null });
    assert.deepEqual(openStatus(null, FRI), { kind: 'unknown' });
    assert.deepEqual(openStatus(office, null), { kind: 'unknown' });
  });
});

describe('workStatus', () => {
  const cafe = week({ mo: [[H(8), H(20)]], sa: [[H(9), H(17)]] });

  it('never treats an open cafe as a work spot without a policy', () => {
    assert.deepEqual(workStatus(cafe, null, 'cafe', MON + H(10)), { kind: 'unknown' });
  });

  it('treats coworking spaces as work spots while open', () => {
    assert.deepEqual(workStatus(cafe, null, 'coworking', MON + H(10)), { kind: 'allowed', until: MON + H(20), byDesign: true });
  });

  it('applies specific laptop hours inside opening hours', () => {
    const laptop: LaptopHours = { mo: { mode: 'specific', ranges: [[H(8), H(12)]] }, sa: { mode: 'none' } };
    assert.deepEqual(workStatus(cafe, laptop, 'cafe', MON + H(10)), { kind: 'allowed', until: MON + H(12), byDesign: false });
    assert.deepEqual(workStatus(cafe, laptop, 'cafe', MON + H(13)), { kind: 'not_now' });
    assert.deepEqual(workStatus(cafe, laptop, 'cafe', MON + H(7)), { kind: 'closed' });
    assert.deepEqual(workStatus(cafe, laptop, 'cafe', SAT + H(10)), { kind: 'not_now' });
  });

  it('says when laptops are welcome later the same opening', () => {
    const laptop: LaptopHours = { mo: { mode: 'specific', ranges: [[H(14), H(20)]] } };
    assert.deepEqual(workStatus(cafe, laptop, 'cafe', MON + H(10)), { kind: 'later', from: MON + H(14) });
  });

  it('keeps unknown days unknown', () => {
    const laptop: LaptopHours = { mo: { mode: 'all' } };
    assert.deepEqual(workStatus(cafe, laptop, 'cafe', SAT + H(10)), { kind: 'unknown' });
    assert.deepEqual(workStatus(cafe, laptop, 'cafe', MON + H(19)), { kind: 'allowed', until: MON + H(20), byDesign: false });
  });

  it('caps laptop hours at closing time', () => {
    const laptop: LaptopHours = { mo: { mode: 'specific', ranges: [[H(18), H(23)]] } };
    assert.deepEqual(workStatus(cafe, laptop, 'cafe', MON + H(19)), { kind: 'allowed', until: MON + H(20), byDesign: false });
  });

  it('filters like the server: work here now needs open and laptops confirmed', () => {
    const laptop: LaptopHours = { mo: { mode: 'specific', ranges: [[H(8), H(12)]] } };
    const both = { openNow: true, workNow: true };
    assert.equal(matchesTimeFilter(cafe, laptop, 'cafe', MON + H(10), both), true);
    assert.equal(matchesTimeFilter(cafe, laptop, 'cafe', MON + H(13), both), false);
    assert.equal(matchesTimeFilter(cafe, laptop, 'cafe', MON + H(13), { openNow: true, workNow: false }), true);
    assert.equal(matchesTimeFilter(cafe, null, 'cafe', MON + H(10), both), false);
    assert.equal(matchesTimeFilter(cafe, null, 'coworking', MON + H(10), both), true);
    assert.equal(matchesTimeFilter(null, null, 'coworking', MON + H(10), { openNow: true, workNow: false }), false);
    assert.equal(matchesTimeFilter(cafe, laptop, 'cafe', null, { openNow: true, workNow: false }), false);
    assert.equal(matchesTimeFilter(null, null, 'cafe', null, { openNow: false, workNow: false }), true);
  });
});

describe('ranges', () => {
  it('splits Sunday night at the week end', () => {
    assert.deepEqual(weekRanges(week({ su: [[H(22), H(26)]] })), [[0, H(2)], [SUN + H(22), 7 * 1440]]);
  });

  it('merges back-to-back days', () => {
    assert.deepEqual(weekRanges(week({ mo: [[H(20), H(24)]], tu: [[0, H(2)]] })), [[MON + H(20), TUE + H(2)]]);
  });

  it('combines all-hours and specific laptop days', () => {
    const hours = week({ mo: [[H(8), H(20)]], tu: [[H(8), H(20)]] });
    const laptop: LaptopHours = { mo: { mode: 'all' }, tu: { mode: 'specific', ranges: [[H(8), H(10)]] } };
    assert.deepEqual(laptopWeekRanges(laptop, hours, 'cafe'), [[MON + H(8), MON + H(20)], [TUE + H(8), TUE + H(10)]]);
    assert.equal(laptopWeekRanges(null, hours, 'cafe'), null);
  });
});

describe('validation', () => {
  it('accepts valid schedules and rejects broken ones', () => {
    assert.equal(isWeeklyHours(presetHours('cafe')), true);
    assert.equal(isWeeklyHours(presetHours('late')), true);
    assert.equal(isWeeklyHours({ mo: [] }), false);
    assert.equal(isWeeklyHours(week({ mo: [[H(9), H(8)]] })), false);
    assert.equal(dayError([[H(8), H(12)], [H(11), H(14)]]), 'overlap');
    assert.equal(dayError([[H(8), H(8)]]), 'zero_length');
    assert.equal(dayError([[H(8), H(8) + 1441]]), 'too_long');
    assert.equal(dayError([[H(24), H(25)]]), 'invalid');
  });

  it('validates laptop schedules', () => {
    assert.equal(isLaptopHours({ mo: { mode: 'all' }, sa: { mode: 'specific', ranges: [[H(8), H(12)]] } }), true);
    assert.equal(isLaptopHours({ mo: { mode: 'specific', ranges: [] } }), false);
    assert.equal(isLaptopHours({ xx: { mode: 'all' } }), false);
  });
});

describe('input and formatting', () => {
  it('reads typed times', () => {
    assert.equal(parseTimeInput('8'), H(8));
    assert.equal(parseTimeInput('830'), H(8, 30));
    assert.equal(parseTimeInput('0830'), H(8, 30));
    assert.equal(parseTimeInput('8:30'), H(8, 30));
    assert.equal(parseTimeInput('8.30'), H(8, 30));
    assert.equal(parseTimeInput('20h'), H(20));
    assert.equal(parseTimeInput('8pm'), H(20));
    assert.equal(parseTimeInput('12am'), 0);
    assert.equal(parseTimeInput('24:00'), 1440);
    assert.equal(parseTimeInput('25'), null);
    assert.equal(parseTimeInput('8:75'), null);
    assert.equal(parseTimeInput('soon'), null);
  });

  it('builds overnight intervals from clock times', () => {
    assert.deepEqual(makeInterval(H(20), H(3)), [H(20), H(27)]);
    assert.deepEqual(makeInterval(H(18), 0), [H(18), H(24)]);
    assert.deepEqual(makeInterval(H(8), H(18)), [H(8), H(18)]);
    assert.deepEqual(makeInterval(H(8), H(8)), [H(8), H(8)]);
    assert.equal(dayError([makeInterval(H(8), H(8))]), 'zero_length');
  });

  it('formats intervals and OSM text', () => {
    assert.equal(formatInterval([H(20), H(27)]), '20:00–03:00');
    assert.equal(formatInterval([H(18), H(24)]), '18:00–24:00');
    assert.equal(toOsm(presetHours('cafe')), 'Mo-Fr 08:00-18:00; Sa-Su 09:00-17:00');
    assert.equal(toOsm(presetHours('always')), '24/7');
    assert.equal(toOsm(week({ fr: [[H(20), H(27)]] })), 'Fr 20:00-03:00');
  });
});

describe('editing', () => {
  it('copies a day without sharing arrays', () => {
    const w = week({ mo: [[H(8), H(12)]] });
    const next = copyDay(w, 'mo', ['tu', 'we'], cloneIntervals);
    assert.deepEqual(next.we, [[H(8), H(12)]]);
    next.tu[0]![0] = 1;
    assert.deepEqual(next.mo, [[H(8), H(12)]]);
  });

  it('stores only known laptop days and derives the yes/no answer', () => {
    const full = fullLaptopWeek({ mo: { mode: 'none' } });
    assert.equal(full.tu.mode, 'unknown');
    assert.deepEqual(compactLaptopWeek(full), { mo: { mode: 'none' } });
    assert.equal(compactLaptopWeek(fullLaptopWeek(null)), null);
    assert.equal(laptopsAnswer({ mo: { mode: 'none' } }), 'not_allowed');
    assert.equal(laptopsAnswer({ mo: { mode: 'none' }, sa: { mode: 'specific', ranges: [[H(8), H(10)]] } }), 'welcome');
    assert.equal(laptopsAnswer(null), null);
  });
});
