import {
  DAY_KEYS,
  type DayKey,
  dayOffset,
  formatInterval,
  formatMinute,
  groupDays,
  type Interval,
  isAllDay,
  type LaptopHours,
  laptopDay,
  type OpenStatus,
  splitWeekMinute,
  type WeeklyHours,
  type WorkStatus,
} from './hours';
import { strings } from './strings';

const h = strings.hours;

export type StatusTone = 'success' | 'warning' | 'danger' | 'muted';

/** "08:00–12:00, 14:00–18:00", "Closed" or "Open 24 hours". */
export function formatDayIntervals(intervals: Interval[]): string {
  if (!intervals.length) return h.closed;
  if (isAllDay(intervals)) return h.allDay;
  return intervals.map(formatInterval).join(', ');
}

function dayRange(days: DayKey[]): string {
  if (days.length === 1) return h.day[days[0]!];
  return `${h.day[days[0]!]}–${h.day[days[days.length - 1]!]}`;
}

/** One line for a whole week: "Mon–Fri 08:00–18:00 · Sat 09:00–14:00 · Sun Closed". */
export function formatWeekSummary(hours: WeeklyHours): string {
  if (DAY_KEYS.every((d) => isAllDay(hours[d]))) return h.always;
  return groupDays(hours)
    .map((g) => `${dayRange(g.days)} ${formatDayIntervals(g.intervals)}`)
    .join(' · ');
}

/** What one day of a laptop policy says: "Whenever open", "08:00–12:00", "No laptops", "Unknown". */
export function formatLaptopDay(laptop: LaptopHours | null | undefined, day: DayKey): string {
  const d = laptopDay(laptop, day);
  if (d.mode === 'specific') return d.ranges.map(formatInterval).join(', ');
  return h.laptopDay[d.mode];
}

export function formatLaptopWeekSummary(laptop: LaptopHours): string {
  const groups: { days: DayKey[]; text: string }[] = [];
  for (const d of DAY_KEYS) {
    const text = formatLaptopDay(laptop, d);
    const last = groups[groups.length - 1];
    if (last && last.text === text) last.days.push(d);
    else groups.push({ days: [d], text });
  }
  return groups
    .filter((g) => g.text !== h.laptopDay.unknown)
    .map((g) => `${dayRange(g.days)} ${g.text}`)
    .join(' · ');
}

/** "09:00", "tomorrow 09:00" or "Saturday 09:00" for a week minute seen from `now`. */
function when(now: number, target: number): { offset: number; day: DayKey; time: string } {
  const { day, time } = splitWeekMinute(target);
  return { offset: dayOffset(now, target), day, time: formatMinute(time) };
}

export interface StatusText {
  label: string;
  detail: string | null;
  tone: StatusTone;
}

export function openStatusText(status: OpenStatus, now: number | null): StatusText {
  switch (status.kind) {
    case 'unknown':
      return { label: h.unknown, detail: null, tone: 'muted' };
    case 'always':
      return { label: h.always, detail: null, tone: 'success' };
    case 'open': {
      const detail =
        status.minutesLeft <= 60 ? h.closesIn(status.minutesLeft) : h.closesAt(formatMinute(status.closesAt % 1440));
      return { label: h.open, detail, tone: status.minutesLeft <= 60 ? 'warning' : 'success' };
    }
    case 'closed': {
      if (status.opensAt === null || now === null) return { label: h.closedForNow, detail: null, tone: 'danger' };
      const w = when(now, status.opensAt);
      const detail =
        w.offset === 0 ? h.opensAt(w.time) : w.offset === 1 ? h.opensTomorrow(w.time) : h.opensOn(h.dayLong[w.day], w.time);
      return { label: h.closedForNow, detail, tone: 'danger' };
    }
  }
}

/** Laptop line for a place that is open; null when there is nothing worth saying (closed). */
export function workStatusText(status: WorkStatus, now: number | null): StatusText | null {
  switch (status.kind) {
    case 'allowed':
      return { label: h.work.allowed(formatMinute(status.until % 1440)), detail: null, tone: 'success' };
    case 'later': {
      const t = now === null ? formatMinute(status.from % 1440) : when(now, status.from).time;
      return { label: h.work.later(t), detail: null, tone: 'warning' };
    }
    case 'not_now':
      return { label: h.work.notNow, detail: null, tone: 'danger' };
    case 'unknown':
      return { label: h.work.unknown, detail: null, tone: 'muted' };
    case 'closed':
      return null;
  }
}
