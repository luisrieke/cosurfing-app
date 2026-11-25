// No imports: netlify/edge-functions/seo.ts imports this file under Deno, so crawlers and the app
// get the same titles and descriptions.

/** Categories with their own ranking pages: /rankings/cafes and /lisbon/cafes. */
export type RankingSlug = 'cafes' | 'coworkings' | 'colivings';
export type RankedCategory = 'cafe' | 'coworking' | 'coliving';

export const RANKING_SLUGS: RankingSlug[] = ['cafes', 'coworkings', 'colivings'];

const CATEGORY_BY_SLUG: Record<RankingSlug, RankedCategory> = {
  cafes: 'cafe',
  coworkings: 'coworking',
  colivings: 'coliving',
};

const SLUG_BY_CATEGORY: Record<RankedCategory, RankingSlug> = {
  cafe: 'cafes',
  coworking: 'coworkings',
  coliving: 'colivings',
};

export function categoryFromSlug(slug: string | undefined): RankedCategory | null {
  return slug && (RANKING_SLUGS as string[]).includes(slug) ? CATEGORY_BY_SLUG[slug as RankingSlug] : null;
}

export function slugForCategory(category: string): RankingSlug | null {
  return category === 'cafe' || category === 'coworking' || category === 'coliving' ? SLUG_BY_CATEGORY[category] : null;
}

export const CONTINENT_NAMES: Record<string, string> = {
  EU: 'Europe',
  AS: 'Asia',
  NA: 'North America',
  SA: 'South America',
  AF: 'Africa',
  OC: 'Oceania',
};

interface CategoryCopy {
  /** Tab and card label. */
  label: string;
  /** Plural noun inside sentences. */
  noun: string;
  /** "The best cafés to work from" + " in Lisbon" / " worldwide". */
  best: string;
  cardBody: string;
  intro: (where: string) => string;
}

export const RANKING_COPY: Record<RankedCategory, CategoryCopy> = {
  cafe: {
    label: 'Cafés to work from',
    noun: 'laptop-friendly cafés',
    best: 'The best cafés to work from',
    cardBody: 'Laptop-friendly cafés with Wi‑Fi, outlets and room to stay a while.',
    intro: (where) =>
      `The best laptop-friendly cafés ${where} for remote work, ranked by measured Wi‑Fi speed, power outlets, noise and reviews from people who work there.`,
  },
  coworking: {
    label: 'Coworking spaces',
    noun: 'coworking spaces',
    best: 'The best coworking spaces',
    cardBody: 'Desks, fast internet, meeting rooms and day passes for digital nomads.',
    intro: (where) =>
      `The best coworking spaces ${where} for digital nomads and remote workers, ranked by measured Wi‑Fi speed, day pass prices, quiet and reviews.`,
  },
  coliving: {
    label: 'Colivings',
    noun: 'colivings',
    best: 'The best colivings',
    cardBody: 'Live and work in one place, with a community of remote workers.',
    intro: (where) =>
      `The best colivings ${where} for remote workers: places to live and work with a community, ranked by workspace, Wi‑Fi and reviews.`,
  },
};

/** "worldwide", "in Europe" or "in Lisbon". */
export function rankingWhere(place: string | null): string {
  return place ? `in ${place}` : 'worldwide';
}

export function rankingTitle(category: RankedCategory, place: string | null, year: number): string {
  return `${RANKING_COPY[category].best} ${rankingWhere(place)} (${year})`;
}

export function rankingDescription(category: RankedCategory, place: string | null): string {
  return RANKING_COPY[category].intro(rankingWhere(place));
}

export const RANKINGS_HUB = {
  title: 'Rankings: the best places to work from, worldwide',
  description:
    'The best cafés to work from, coworking spaces and colivings for digital nomads and remote workers, ranked by measured Wi‑Fi, power outlets and reviews.',
};
