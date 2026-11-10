/**
 * Weekly opening hours and laptop hours.
 *
 * A schedule stores, per weekday, intervals in minutes after that day's midnight in the place's local
 * time: [[480, 1080]] is 08:00–18:00. An interval may end after midnight (end up to 2880) for
 * overnight hours, so Friday [[1200, 1620]] is Friday 20:00 to Saturday 03:00. An empty day is closed.
 * Same shape as places.hours in the database (migration 20261110180000).
 *
 * This module has no runtime imports so it runs under `node --test`.
 */

export const DAY_KEYS = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'] as const;
export type DayKey = (typeof DAY_KEYS)[number];
export const WEEKDAYS: DayKey[] = ['mo', 'tu', 'we', 'th', 'fr'];
export const WEEKEND: DayKey[] = ['sa', 'su'];

export type Interval = [number, number];
export type WeeklyHours = Record<DayKey, Interval[]>;

export type HoursSource = 'team' | 'community' | 'osm' | 'website' | 'listing';
export type HoursStatus = 'structured' | 'needs_review' | 'text_only';
export type HoursFlag = 'holidays' | 'date_exceptions';

export type LaptopMode = 'all' | 'specific' | 'none' | 'unknown';
export type LaptopDay = { mode: 'all' | 'none' | 'unknown' } | { mode: 'specific'; ranges: Interval[] };
/** A missing day is unknown. */
export type LaptopHours = Partial<Record<DayKey, LaptopDay>>;
export type LaptopSource = 'venue' | 'team' | 'community';

export const DAY_MINUTES = 1440;
export const WEEK_MINUTES = 7 * DAY_MINUTES;
export const MAX_INTERVALS_PER_DAY = 6;

/** Week-minute ranges, half-open: [start, end). */
type Range = [number, number];

export function emptyWeek(): WeeklyHours {
  return { mo: [], tu: [], we: [], th: [], fr: [], sa: [], su: [] };
}

export function dayIndex(day: DayKey): number {
  return DAY_KEYS.indexOf(day);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type IntervalError = 'zero_length' | 'too_long' | 'overlap' | 'too_many' | 'invalid';

/** First problem with one day's intervals, or null. Intervals must already be sorted by start. */
export function dayError(intervals: Interval[]): IntervalError | null {
  if (intervals.length > MAX_INTERVALS_PER_DAY) return 'too_many';
  let prevEnd = -1;
  for (const iv of intervals) {
    const [s, e] = iv;
    if (!Number.isInteger(s) || !Number.isInteger(e) || s < 0 || s >= DAY_MINUTES) return 'invalid';
    if (e === s) return 'zero_length';
    if (e < s || e - s > DAY_MINUTES) return 'too_long';
    if (s < prevEnd) return 'overlap';
    prevEnd = e;
  }
  return null;
}

export function isWeeklyHours(v: unknown): v is WeeklyHours {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  if (Object.keys(o).length !== 7) return false;
  return DAY_KEYS.every((d) => {
    const day = o[d];
    return (
      Array.isArray(day) &&
      day.every((iv) => Array.isArray(iv) && iv.length === 2 && iv.every((n) => typeof n === 'number')) &&
      dayError(day as Interval[]) === null
    );
  });
}

export function isLaptopHours(v: unknown): v is LaptopHours {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  return Object.entries(v as Record<string, unknown>).every(([k, day]) => {
    if (!(DAY_KEYS as readonly string[]).includes(k) || !day || typeof day !== 'object') return false;
    const d = day as { mode?: unknown; ranges?: unknown };
    if (d.mode === 'specific') {
      return (
        Object.keys(d).length === 2 &&
        Array.isArray(d.ranges) &&
        d.ranges.length > 0 &&
        dayError(d.ranges as Interval[]) === null
      );
    }
    return Object.keys(d).length === 1 && (d.mode === 'all' || d.mode === 'none' || d.mode === 'unknown');
  });
}

export function sortIntervals(intervals: Interval[]): Interval[] {
  return [...intervals].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

/**
 * Interval from a start and end time of day. An end before the start means the next day
 * ("20:00–03:00"); 00:00 as the end is midnight. Equal times stay a zero-length interval so the
 * editor can point it out.
 */
export function makeInterval(start: number, end: number): Interval {
  if (end === start) return [start, start];
  return [start, end < start ? end + DAY_MINUTES : end];
}

/** Clock time of an interval end: 24:00 stays 1440, the next day's 03:00 is 180. */
export function endClock(end: number): number {
  return end === DAY_MINUTES ? DAY_MINUTES : end % DAY_MINUTES;
}

/** Sorted intervals on every day, as stored. */
export function normalizeWeek(hours: WeeklyHours): WeeklyHours {
  const out = emptyWeek();
  for (const d of DAY_KEYS) out[d] = sortIntervals(hours[d]);
  return out;
}

/** First invalid day of a schedule being edited, with the problem. */
export function weekError(hours: WeeklyHours): { day: DayKey; error: IntervalError } | null {
  for (const d of DAY_KEYS) {
    const error = dayError(sortIntervals(hours[d]));
    if (error) return { day: d, error };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Time input
// ---------------------------------------------------------------------------

/**
 * Reads what people type into a time field: "8", "830", "0830", "8:30", "8.30", "20h", "8pm",
 * "24:00". Returns minutes after midnight (1440 for 24:00) or null.
 */
export function parseTimeInput(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, '');
  const m = /^(\d{1,2})(?:[:.h]?(\d{2}))?h?(am|pm|a|p)?$/.exec(t);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (min > 59) return null;
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (m[3].startsWith('p') ? 12 : 0);
  }
  const total = h * 60 + min;
  return total > DAY_MINUTES ? null : total;
}

/** "08:30". Minutes past midnight of the next day show as clock time; 1440 alone is "24:00". */
export function formatMinute(min: number): string {
  const m = min === DAY_MINUTES ? DAY_MINUTES : ((min % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function formatInterval([s, e]: Interval): string {
  if (s === 0 && e === DAY_MINUTES) return '00:00–24:00';
  return `${formatMinute(s)}–${formatMinute(e)}`;
}

export function isAllDay(intervals: Interval[]): boolean {
  return intervals.length === 1 && intervals[0]![0] === 0 && intervals[0]![1] === DAY_MINUTES;
}

// ---------------------------------------------------------------------------
// Local time
// ---------------------------------------------------------------------------

const WEEKDAY_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
const formatters = new Map<string, Intl.DateTimeFormat | null>();

function formatterFor(timeZone: string): Intl.DateTimeFormat | null {
  if (!formatters.has(timeZone)) {
    let f: Intl.DateTimeFormat | null = null;
    try {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      });
    } catch {
      f = null;
    }
    formatters.set(timeZone, f);
  }
  return formatters.get(timeZone) ?? null;
}

/**
 * Minute of the week (Monday 00:00 = 0) at `date` in an IANA time zone. Daylight saving time comes
 * from the platform's zone rules. null when the zone is missing or unknown.
 */
export function localWeekMinute(date: Date, timeZone: string | null | undefined): number | null {
  if (!timeZone) return null;
  const f = formatterFor(timeZone);
  if (!f) return null;
  let weekday: string | undefined;
  let hour: number | undefined;
  let minute: number | undefined;
  if (typeof f.formatToParts === 'function') {
    for (const p of f.formatToParts(date)) {
      if (p.type === 'weekday') weekday = p.value;
      else if (p.type === 'hour') hour = Number(p.value);
      else if (p.type === 'minute') minute = Number(p.value);
    }
  } else {
    const m = /(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\D*(\d{1,2}):(\d{2})/.exec(f.format(date));
    if (m) {
      weekday = m[1];
      hour = Number(m[2]);
      minute = Number(m[3]);
    }
  }
  const d = weekday === undefined ? undefined : WEEKDAY_INDEX[weekday];
  if (d === undefined || hour === undefined || minute === undefined || Number.isNaN(hour + minute)) return null;
  // Some engines print midnight as "24" even with h23.
  return d * DAY_MINUTES + (hour % 24) * 60 + minute;
}

/** "14:05" in the place's time zone, or null. */
export function localClock(date: Date, timeZone: string | null | undefined): string | null {
  const m = localWeekMinute(date, timeZone);
  return m === null ? null : formatMinute(m % DAY_MINUTES);
}

export function dayOfWeekMinute(minute: number): DayKey {
  return DAY_KEYS[Math.floor(minute / DAY_MINUTES) % 7]!;
}

// ---------------------------------------------------------------------------
// Week ranges
// ---------------------------------------------------------------------------

function mergeRanges(ranges: Range[]): Range[] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: Range[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else out.push([r[0], r[1]]);
  }
  return out;
}

function dayRanges(day: number, intervals: Interval[]): Range[] {
  const out: Range[] = [];
  for (const [s, e] of intervals) {
    const start = day * DAY_MINUTES + s;
    const end = day * DAY_MINUTES + e;
    out.push([start, Math.min(end, WEEK_MINUTES)]);
    if (end > WEEK_MINUTES) out.push([0, end - WEEK_MINUTES]);
  }
  return out;
}

/** Opening hours as merged minute-of-week ranges; Sunday night wraps to Monday morning. */
export function weekRanges(hours: WeeklyHours): Range[] {
  return mergeRanges(DAY_KEYS.flatMap((d, i) => dayRanges(i, hours[d] ?? [])));
}

/**
 * When laptops are welcome, as week ranges, or null when nothing is known. Coworking spaces are
 * workspaces by design, so without a stated policy laptops are fine whenever they are open. Every
 * other place needs an explicit answer: being open never means laptops are welcome.
 */
export function laptopWeekRanges(
  laptop: LaptopHours | null | undefined,
  hours: WeeklyHours | null | undefined,
  category: string,
): Range[] | null {
  if (!laptop) return category === 'coworking' && hours ? weekRanges(hours) : null;
  const out: Range[] = [];
  DAY_KEYS.forEach((d, i) => {
    const day = laptop[d];
    if (day?.mode === 'all' && hours) out.push(...dayRanges(i, hours[d]));
    else if (day?.mode === 'specific') out.push(...dayRanges(i, day.ranges));
  });
  return mergeRanges(out);
}

/** The schedule seen from minute `m`: ranges on a two-week timeline so wrap-around is seamless. */
function doubled(ranges: Range[]): Range[] {
  return mergeRanges([...ranges, ...ranges.map(([s, e]): Range => [s + WEEK_MINUTES, e + WEEK_MINUTES])]);
}

function rangeAt(ranges: Range[], m: number): Range | undefined {
  return doubled(ranges).find(([s, e]) => s <= m && m < e);
}

function nextStart(ranges: Range[], m: number): number | null {
  const r = doubled(ranges).find(([s]) => s > m);
  return r ? r[0] : null;
}

export function isOpenAt(hours: WeeklyHours, minute: number): boolean {
  return rangeAt(weekRanges(hours), minute) !== undefined;
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/** `at` is a minute of the week (may be past the end of the week for "next Monday"). */
export type OpenStatus =
  | { kind: 'unknown' }
  | { kind: 'always' }
  | { kind: 'open'; closesAt: number; minutesLeft: number }
  | { kind: 'closed'; opensAt: number | null; minutesUntil: number | null };

export function openStatus(hours: WeeklyHours | null | undefined, minute: number | null): OpenStatus {
  if (!hours || minute === null) return { kind: 'unknown' };
  const ranges = weekRanges(hours);
  if (ranges.length === 1 && ranges[0]![0] === 0 && ranges[0]![1] === WEEK_MINUTES) return { kind: 'always' };
  const r = rangeAt(ranges, minute);
  if (r) return { kind: 'open', closesAt: r[1], minutesLeft: r[1] - minute };
  const next = nextStart(ranges, minute);
  return { kind: 'closed', opensAt: next, minutesUntil: next === null ? null : next - minute };
}

export type WorkStatus =
  /** Open and laptops are welcome now, until `until` (minute of the week). */
  | { kind: 'allowed'; until: number; byDesign: boolean }
  /** Open, laptops welcome later today/at `from`. */
  | { kind: 'later'; from: number }
  /** Open, but laptops are not welcome now. */
  | { kind: 'not_now' }
  | { kind: 'closed' }
  /** Open hours or the laptop policy for now are unknown. Never shown as allowed. */
  | { kind: 'unknown' };

export function laptopDay(laptop: LaptopHours | null | undefined, day: DayKey): LaptopDay {
  return laptop?.[day] ?? { mode: 'unknown' };
}

export function workStatus(
  hours: WeeklyHours | null | undefined,
  laptop: LaptopHours | null | undefined,
  category: string,
  minute: number | null,
): WorkStatus {
  const open = openStatus(hours, minute);
  if (open.kind === 'unknown' || minute === null || !hours) return { kind: 'unknown' };
  if (open.kind === 'closed') return { kind: 'closed' };
  const laptopRanges = laptopWeekRanges(laptop, hours, category);
  if (!laptopRanges) return { kind: 'unknown' };
  const openRange = rangeAt(weekRanges(hours), minute)!;
  const lr = rangeAt(laptopRanges, minute);
  if (lr) return { kind: 'allowed', until: Math.min(lr[1], openRange[1]), byDesign: !laptop };
  // The "day" whose rules apply: an overnight interval belongs to the day it started on.
  const startDay = dayOfWeekMinute(openRange[0] % WEEK_MINUTES);
  if (laptopDay(laptop, startDay).mode === 'unknown' && laptop) return { kind: 'unknown' };
  const next = nextStart(laptopRanges, minute);
  if (next !== null && next < openRange[1]) return { kind: 'later', from: next };
  return { kind: 'not_now' };
}

/**
 * The "Open now" / "Work here now" filters, the same rule as the server: open now, and for work
 * also laptops explicitly welcome now. Unknown never matches.
 */
export function matchesTimeFilter(
  hours: WeeklyHours | null | undefined,
  laptop: LaptopHours | null | undefined,
  category: string,
  minute: number | null,
  filter: { openNow: boolean; workNow: boolean },
): boolean {
  if (filter.workNow) return workStatus(hours, laptop, category, minute).kind === 'allowed';
  if (filter.openNow) {
    const k = openStatus(hours, minute).kind;
    return k === 'open' || k === 'always';
  }
  return true;
}

/** Week minute -> day and time of day, e.g. { day: 'sa', time: 600 }. */
export function splitWeekMinute(m: number): { day: DayKey; time: number } {
  const w = ((m % WEEK_MINUTES) + WEEK_MINUTES) % WEEK_MINUTES;
  return { day: dayOfWeekMinute(w), time: w % DAY_MINUTES };
}

/** How far ahead `target` is from `now`, in days on the calendar (0 = today, 1 = tomorrow). */
export function dayOffset(now: number, target: number): number {
  return Math.floor(target / DAY_MINUTES) - Math.floor(now / DAY_MINUTES);
}

// ---------------------------------------------------------------------------
// Editing helpers
// ---------------------------------------------------------------------------

export function copyDay<T>(week: Record<DayKey, T>, from: DayKey, to: DayKey[], clone: (v: T) => T): Record<DayKey, T> {
  const next = { ...week };
  for (const d of to) if (d !== from) next[d] = clone(week[from]);
  return next;
}

export function cloneIntervals(intervals: Interval[]): Interval[] {
  return intervals.map(([s, e]): Interval => [s, e]);
}

export function cloneLaptopDay(day: LaptopDay): LaptopDay {
  return day.mode === 'specific' ? { mode: 'specific', ranges: cloneIntervals(day.ranges) } : { mode: day.mode };
}

export function sameIntervals(a: Interval[], b: Interval[]): boolean {
  return a.length === b.length && a.every((iv, i) => iv[0] === b[i]![0] && iv[1] === b[i]![1]);
}

export function sameWeek(a: WeeklyHours | null | undefined, b: WeeklyHours | null | undefined): boolean {
  if (!a || !b) return a === b;
  return DAY_KEYS.every((d) => sameIntervals(a[d], b[d]));
}

export function hasAnyHours(hours: WeeklyHours): boolean {
  return DAY_KEYS.some((d) => hours[d].length > 0);
}

/** Fills every day of a laptop schedule; missing days become 'unknown'. */
export function fullLaptopWeek(laptop: LaptopHours | null | undefined): Record<DayKey, LaptopDay> {
  const out = {} as Record<DayKey, LaptopDay>;
  for (const d of DAY_KEYS) out[d] = cloneLaptopDay(laptopDay(laptop, d));
  return out;
}

/** What gets stored: unknown days are left out; nothing known at all is null. */
export function compactLaptopWeek(week: Record<DayKey, LaptopDay>): LaptopHours | null {
  const out: LaptopHours = {};
  for (const d of DAY_KEYS) {
    const day = week[d];
    if (day.mode === 'unknown') continue;
    out[d] = day.mode === 'specific' ? { mode: 'specific', ranges: sortIntervals(day.ranges) } : { mode: day.mode };
  }
  return Object.keys(out).length ? out : null;
}

/** The simple yes/no laptops fact implied by a laptop schedule, if any. */
export function laptopsAnswer(laptop: LaptopHours | null | undefined): 'welcome' | 'not_allowed' | null {
  const days = DAY_KEYS.map((d) => laptopDay(laptop, d).mode).filter((m) => m !== 'unknown');
  if (!days.length) return null;
  if (days.some((m) => m === 'all' || m === 'specific')) return 'welcome';
  return 'not_allowed';
}

/** Groups consecutive days with the same intervals: [{ days: ['mo', …, 'fr'], intervals }]. */
export function groupDays(hours: WeeklyHours): { days: DayKey[]; intervals: Interval[] }[] {
  const groups: { days: DayKey[]; intervals: Interval[] }[] = [];
  for (const d of DAY_KEYS) {
    const last = groups[groups.length - 1];
    if (last && sameIntervals(last.intervals, hours[d])) last.days.push(d);
    else groups.push({ days: [d], intervals: hours[d] });
  }
  return groups;
}

const OSM_DAY: Record<DayKey, string> = { mo: 'Mo', tu: 'Tu', we: 'We', th: 'Th', fr: 'Fr', sa: 'Sa', su: 'Su' };

/** OpenStreetMap opening_hours text for a schedule, e.g. "Mo-Fr 08:00-18:00; Sa 09:00-14:00". */
export function toOsm(hours: WeeklyHours): string {
  if (DAY_KEYS.every((d) => isAllDay(hours[d]))) return '24/7';
  const time = (m: number) => (m === DAY_MINUTES ? '24:00' : formatMinute(m));
  return groupDays(hours)
    .filter((g) => g.intervals.length)
    .map((g) => {
      const first = OSM_DAY[g.days[0]!];
      const days = g.days.length === 1 ? first : `${first}-${OSM_DAY[g.days[g.days.length - 1]!]}`;
      return `${days} ${g.intervals.map(([s, e]) => `${time(s)}-${time(e)}`).join(',')}`;
    })
    .join('; ');
}

// ---------------------------------------------------------------------------
// Starting points for the editor (offered, never saved on their own)
// ---------------------------------------------------------------------------

export type HoursPreset = 'weekdays' | 'daily' | 'cafe' | 'late' | 'always';

export function presetHours(preset: HoursPreset): WeeklyHours {
  const week = emptyWeek();
  const set = (days: DayKey[], intervals: Interval[]) => days.forEach((d) => (week[d] = cloneIntervals(intervals)));
  switch (preset) {
    case 'weekdays':
      set(WEEKDAYS, [[540, 1080]]);
      break;
    case 'daily':
      set([...DAY_KEYS], [[480, 1200]]);
      break;
    case 'cafe':
      set(WEEKDAYS, [[480, 1080]]);
      set(WEEKEND, [[540, 1020]]);
      break;
    case 'late':
      set(['mo', 'tu', 'we', 'th'], [[600, 1380]]);
      set(['fr', 'sa'], [[600, 1560]]);
      set(['su'], [[600, 1320]]);
      break;
    case 'always':
      set([...DAY_KEYS], [[0, DAY_MINUTES]]);
      break;
  }
  return week;
}

/** The preset shown first for a category. */
export function defaultPreset(category: string): HoursPreset {
  if (category === 'cafe') return 'cafe';
  if (category === 'coliving') return 'always';
  return 'weekdays';
}

/** A sensible interval to add after the existing ones on a day. */
export function nextIntervalFor(intervals: Interval[]): Interval | null {
  if (!intervals.length) return [540, 1080];
  const lastEnd = intervals[intervals.length - 1]![1];
  if (lastEnd >= DAY_MINUTES - 60 || intervals.length >= MAX_INTERVALS_PER_DAY) return null;
  const start = Math.min(lastEnd + 60, DAY_MINUTES - 60);
  return [start, Math.min(start + 180, DAY_MINUTES)];
}
