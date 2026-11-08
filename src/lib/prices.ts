import type { PlaceCategory, PlacePriceEntry, PriceItem, WebFacts } from './types';

/** Order of the price list. Keep in sync with the place_prices check constraint. */
export const PRICE_ITEMS: PriceItem[] = [
  'coffee',
  'tea',
  'lunch',
  'week_pass',
  'flex_desk_month',
  'fixed_desk_month',
  'meeting_room_hour',
  'membership_year',
];

const PRICE_CATEGORIES: Record<PriceItem, PlaceCategory[]> = {
  coffee: ['coworking', 'cafe', 'library'],
  tea: ['cafe'],
  lunch: ['cafe', 'library'],
  week_pass: ['coworking'],
  flex_desk_month: ['coworking'],
  fixed_desk_month: ['coworking'],
  meeting_room_hour: ['coworking'],
  membership_year: ['library'],
};

/** Items the costs form asks about for this kind of place. */
export function priceAppliesTo(item: PriceItem, category: PlaceCategory): boolean {
  return PRICE_CATEGORIES[item].includes(category);
}

const EURO_COUNTRIES = new Set([
  'AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK',
  'AD', 'MC', 'ME', 'SM', 'VA', 'XK',
]);

const COUNTRY_CURRENCY: Record<string, string> = {
  AE: 'AED', AR: 'ARS', AU: 'AUD', BG: 'BGN', BR: 'BRL', CA: 'CAD', CH: 'CHF', CL: 'CLP', CN: 'CNY', CO: 'COP',
  CZ: 'CZK', DK: 'DKK', EG: 'EGP', GB: 'GBP', GE: 'GEL', HK: 'HKD', HU: 'HUF', ID: 'IDR', IL: 'ILS', IN: 'INR',
  IS: 'ISK', JP: 'JPY', KE: 'KES', KR: 'KRW', MA: 'MAD', MX: 'MXN', MY: 'MYR', NG: 'NGN', NO: 'NOK', NZ: 'NZD',
  PE: 'PEN', PH: 'PHP', PL: 'PLN', RO: 'RON', RS: 'RSD', SE: 'SEK', SG: 'SGD', TH: 'THB', TR: 'TRY', TW: 'TWD',
  UA: 'UAH', US: 'USD', VN: 'VND', ZA: 'ZAR',
};

/** Currency suggested for new entries: the venue website's, else the country's, else euros. */
export function defaultCurrency(web: WebFacts, countryCode: string | null | undefined): string {
  if (web.day_pass?.value.currency) return web.day_pass.value.currency;
  const cc = (countryCode ?? '').toUpperCase();
  if (EURO_COUNTRIES.has(cc)) return 'EUR';
  return COUNTRY_CURRENCY[cc] ?? 'EUR';
}

export interface PriceSummary {
  item: PriceItem;
  /** Median of the entries in the most used currency. */
  amount: number;
  currency: string;
  /** Entries that went into the median. */
  count: number;
  min: number;
  max: number;
  latest: string;
  entries: PlacePriceEntry[];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const m = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return Math.round(m * 100) / 100;
}

/** One summary per item with entries, in list order. */
export function summarizePrices(entries: PlacePriceEntry[]): PriceSummary[] {
  const out: PriceSummary[] = [];
  for (const item of PRICE_ITEMS) {
    const own = entries.filter((e) => e.item === item);
    if (own.length === 0) continue;
    const byCurrency = new Map<string, number>();
    for (const e of own) byCurrency.set(e.currency, (byCurrency.get(e.currency) ?? 0) + 1);
    const currency = [...byCurrency.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    const amounts = own.filter((e) => e.currency === currency).map((e) => e.amount);
    out.push({
      item,
      amount: median(amounts),
      currency,
      count: amounts.length,
      min: Math.min(...amounts),
      max: Math.max(...amounts),
      latest: own.reduce((a, e) => (e.updated_at > a ? e.updated_at : a), own[0]!.updated_at),
      entries: own,
    });
  }
  return out;
}
