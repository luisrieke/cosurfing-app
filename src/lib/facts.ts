import { formatMoney } from './format';
import { strings } from './strings';
import type { DayPassValue, FactKey, FactValue, PlaceCategory, PlaceFactEntry, WebFact, WebFacts } from './types';

/** Order of the facts list. Keep in sync with the place_facts check constraint. */
export const FACT_KEYS: FactKey[] = [
  'opening_hours',
  'open_24_7',
  'day_pass',
  'price_range',
  'wifi',
  'laptops',
  'meeting_rooms',
  'phone_booths',
];

const FACT_CATEGORIES: Record<FactKey, PlaceCategory[]> = {
  opening_hours: ['coworking', 'cafe', 'library'],
  open_24_7: ['coworking', 'library'],
  day_pass: ['coworking'],
  price_range: ['cafe', 'library'],
  wifi: ['coworking', 'cafe', 'library'],
  laptops: ['cafe'],
  meeting_rooms: ['coworking', 'library'],
  phone_booths: ['coworking', 'library'],
};

/** Facts the review form asks about for this kind of place. */
export function factAppliesTo(key: FactKey, category: PlaceCategory): boolean {
  return FACT_CATEGORIES[key].includes(category);
}

export interface FactSource {
  /** Unique within a fact's sources. */
  id: string;
  from: 'web' | 'user';
  value: FactValue;
  author: string | null;
  isOwn: boolean;
  at: string | null;
  snippet: string | null;
  url: string | null;
}

export interface FactSummary {
  key: FactKey;
  value: FactValue;
  display: string;
  /** How the value was combined: the mean for prices, the most common answer otherwise. */
  method: 'average' | 'majority';
  /** Sources that went into the average, or that agree with the majority answer. */
  agreeing: number;
  sources: FactSource[];
}

const PRICE_SYMBOLS = /^\s*([$€£¥₹])\1{0,3}\s*$/;

function priceLevel(value: string): { level: number; symbol: string } | null {
  const m = value.match(PRICE_SYMBOLS);
  return m ? { level: value.trim().length, symbol: m[1]! } : null;
}

function isDayPass(v: FactValue): v is DayPassValue {
  return typeof v === 'object' && v !== null && typeof v.amount === 'number';
}

function webSource(key: FactKey, web: WebFacts): FactSource | null {
  const f: WebFact | undefined = key === 'wifi' ? web.wifi_mentioned : web[key];
  if (!f) return null;
  let value = f.value as FactValue;
  if (key === 'price_range' && typeof value === 'string') value = priceLevel(value)?.level ?? value;
  return { id: 'web', from: 'web', value, author: null, isOwn: false, at: null, snippet: f.snippet, url: f.url };
}

/** Currency for day pass entries: the one on the venue website, otherwise euros. */
export function dayPassCurrency(web: WebFacts): string {
  return web.day_pass?.value.currency ?? 'EUR';
}

function priceSymbol(web: WebFacts): string {
  const raw = web.price_range?.value;
  return (raw && priceLevel(raw)?.symbol) || '€';
}

export function formatFactValue(key: FactKey, value: FactValue, web: WebFacts): string {
  const s = strings.place;
  if (typeof value === 'boolean') return value ? strings.common.yes : strings.common.no;
  if (key === 'laptops') return value === 'welcome' ? s.laptopsWelcome : s.laptopsNotAllowed;
  if (key === 'price_range' && typeof value === 'number') return priceSymbol(web).repeat(Math.min(4, Math.max(1, Math.round(value))));
  if (isDayPass(value)) return formatMoney(value.amount, value.currency);
  return String(value);
}

function majority(sources: FactSource[]): { value: FactValue; count: number } {
  const groups = new Map<string, { value: FactValue; count: number; latest: number }>();
  for (const src of sources) {
    const id = JSON.stringify(src.value);
    const at = src.at ? new Date(src.at).getTime() : -Infinity;
    const g = groups.get(id);
    if (g) {
      g.count += 1;
      g.latest = Math.max(g.latest, at);
    } else {
      groups.set(id, { value: src.value, count: 1, latest: at });
    }
  }
  // Ties go to the answer confirmed most recently; the website counts as the oldest source.
  const best = [...groups.values()].sort((a, b) => b.count - a.count || b.latest - a.latest)[0]!;
  return { value: best.value, count: best.count };
}

function average(key: FactKey, sources: FactSource[], web: WebFacts): { value: FactValue; count: number } | null {
  if (key === 'price_range') {
    const levels = sources.map((s) => s.value).filter((v): v is number => typeof v === 'number');
    if (levels.length === 0) return null;
    return { value: levels.reduce((a, b) => a + b, 0) / levels.length, count: levels.length };
  }
  if (key === 'day_pass') {
    const currency = dayPassCurrency(web);
    const amounts = sources
      .map((s) => s.value)
      .filter((v): v is DayPassValue => isDayPass(v) && v.currency === currency)
      .map((v) => v.amount);
    if (amounts.length === 0) return null;
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    return { value: { amount: Math.round(mean * 100) / 100, currency }, count: amounts.length };
  }
  return null;
}

/** Combines the venue website with everything members entered, one summary per known fact. */
export function summarizeFacts(web: WebFacts, entries: PlaceFactEntry[]): FactSummary[] {
  const out: FactSummary[] = [];
  for (const key of FACT_KEYS) {
    const sources: FactSource[] = entries
      .filter((e) => e.key === key)
      .map((e, i) => ({
        id: `user-${i}`,
        from: 'user' as const,
        value: e.value,
        author: e.author_name,
        isOwn: e.is_own,
        at: e.updated_at,
        snippet: null,
        url: null,
      }));
    const fromWeb = webSource(key, web);
    if (fromWeb) sources.push(fromWeb);
    if (sources.length === 0) continue;

    const avg = average(key, sources, web);
    const combined = avg ?? majority(sources);
    out.push({
      key,
      value: combined.value,
      display: formatFactValue(key, combined.value, web),
      method: avg ? 'average' : 'majority',
      agreeing: combined.count,
      sources,
    });
  }
  return out;
}

/** The combined value of a fact, but only once a member confirmed or corrected it. */
export function communityFact(summaries: FactSummary[], key: FactKey): FactSummary | null {
  const s = summaries.find((f) => f.key === key);
  return s && s.sources.some((src) => src.from === 'user') ? s : null;
}
