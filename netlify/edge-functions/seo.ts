import type { Config, Context } from '@netlify/edge-functions';

import {
  categoryFromSlug,
  RANKING_COPY,
  RANKING_SLUGS,
  type RankedCategory,
  rankingDescription,
  RANKINGS_HUB,
  rankingTitle,
  rankingWhere,
  slugForCategory,
} from '../../src/lib/rankingCategories.ts';

// The site is a client-rendered SPA, so crawlers and link-preview bots (Google, Instagram, WhatsApp,
// iMessage, Slack, ...) first see the static index.html. This swaps its default title, description and
// image for the page behind the URL, adds a canonical link and JSON-LD, and puts the ranked list into
// #root as plain HTML. The app replaces that HTML with the same content when it starts.

const APP_ROUTES = new Set(['cities', 'map', 'welcome', 'suggest', 'terms', 'admin', 'account', 'plus', 'auth', 'waitlist', 'place', 'rankings', 'u']);
const LOOKUP_TIMEOUT_MS = 1500;
const LIST_SIZE = 30;

const STATIC_META: Record<string, Meta> = {
  'free-coffee': {
    title: 'Your next 3 coffees are on me ☕ · Cosurfing Early Contributors',
    description:
      'Cosurfing founder Luis is buying coffee for the first 50 contributors who share honest reviews, photos and new places to work from. Up to 3 coffees, €5 each, after a manual review.',
    image: null,
    imageAlt: '',
  },
  'free-coffee/terms': {
    title: 'Early Contributors program terms · Cosurfing',
    description: 'Terms of the Cosurfing Early Contributors coffee program: eligibility, rewards, review criteria and payout.',
    image: null,
    imageAlt: '',
  },
};

interface Meta {
  title: string;
  description: string;
  image: string | null;
  imageAlt: string;
  /** Plain HTML for #root. */
  body?: string;
  jsonLd?: unknown[];
  noindex?: boolean;
}

interface CityRow {
  id: string;
  slug: string;
  name: string;
  country_name: string;
  status: 'active' | 'waitlist';
  cover_url: string | null;
  place_count: number;
}

interface PlaceRow {
  name: string;
  description: string | null;
  city: { name: string; cover_url: string | null } | null;
  place_photos: { preview_path: string }[];
}

interface RankedRow {
  slug: string;
  name: string;
  category: string;
  address: string | null;
  work_score: number;
  review_count: number;
  download_median_mbps: number | null;
  city_name?: string;
  city_slug?: string;
  country_name?: string;
}

interface CityListRow {
  slug: string;
  name: string;
  country_name: string;
  place_count: number;
}

type Lookup = (api: Api, origin: string) => Promise<Meta | null>;

interface Api {
  rest<T>(query: string): Promise<T[]>;
  rpc<T>(fn: string, args: Record<string, unknown>): Promise<T>;
}

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const lookup = route(segments);
  if (!lookup) return;

  const supabaseUrl = Netlify.env.get('EXPO_PUBLIC_SUPABASE_URL');
  const anonKey = Netlify.env.get('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) return;
  const api = supabaseApi(supabaseUrl, anonKey);

  const [response, meta] = await Promise.all([context.next(), lookup(api, url.origin).catch(() => null)]);
  if (!meta || !(response.headers.get('content-type') ?? '').includes('text/html')) return response;

  const html = injectMeta(await response.text(), meta, url);
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('Netlify-CDN-Cache-Control', 'public, durable, s-maxage=3600, stale-while-revalidate=86400');
  return new Response(html, { status: response.status, headers });
};

function route(segments: string[]): Lookup | null {
  const staticMeta = STATIC_META[segments.join('/')];
  if (staticMeta) return async () => staticMeta;
  const [first, second] = segments;
  if (!first || first.includes('.')) return null;
  if (segments.length === 1 && first === 'cities') return citiesMeta;
  if (segments.length === 1 && first === 'rankings') return rankingsHubMeta;
  if (segments.length === 2 && first === 'rankings') return (api, origin) => globalRankingMeta(api, origin, second!);
  if (segments.length === 2 && first === 'place') return (api) => placeMeta(api, second!);
  if (APP_ROUTES.has(first)) return null;
  if (segments.length === 1) return (api, origin) => cityMeta(api, origin, first, null);
  const category = categoryFromSlug(second);
  if (segments.length === 2 && category) return (api, origin) => cityMeta(api, origin, first, category);
  return null;
}

function supabaseApi(supabaseUrl: string, anonKey: string): Api {
  const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };
  return {
    async rest<T>(query: string) {
      const res = await fetch(`${supabaseUrl}/rest/v1/${query}`, { headers, signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`Supabase ${res.status}`);
      return (await res.json()) as T[];
    },
    async rpc<T>(fn: string, args: Record<string, unknown>) {
      const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
        signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`Supabase ${res.status}`);
      return (await res.json()) as T;
    },
  };
}

const year = () => new Date().getFullYear();

async function citiesMeta(api: Api, origin: string): Promise<Meta> {
  const cities = await api
    .rpc<CityListRow[]>('list_cities', { p_sort: 'score', p_limit: 100, p_offset: 0 })
    .catch(() => [] as CityListRow[]);
  const title = 'The best places to work, ranked in every big city';
  const description =
    'Coworking spaces, laptop-friendly cafés and libraries in 1,000+ cities, ranked by measured Wi‑Fi speed, power outlets and reviews from remote workers.';
  return {
    title: `Cosurfing · ${title}`,
    description,
    image: null,
    imageAlt: '',
    body: page(title, description, [
      globalRankingLinks(),
      `<h2>Cities</h2><ul>${cities
        .map((c) => `<li><a href="/${attr(c.slug)}">${esc(`Best places to work in ${c.name}`)}</a> · ${esc(c.country_name)} · ${c.place_count} places</li>`)
        .join('')}</ul>`,
    ]),
    jsonLd: [breadcrumbs(origin, [['Cities', '/cities']])],
  };
}

async function rankingsHubMeta(api: Api, origin: string): Promise<Meta> {
  const lists = await Promise.all(
    RANKING_SLUGS.map((slug) =>
      api.rpc<RankedRow[]>('get_global_ranking', { p_category: categoryFromSlug(slug), p_limit: 10, p_offset: 0 }).catch(() => []),
    ),
  );
  const sections = RANKING_SLUGS.map((slug, i) => {
    const category = categoryFromSlug(slug)!;
    return `<h2><a href="/rankings/${slug}">${esc(`${RANKING_COPY[category].best} ${rankingWhere(null)}`)}</a></h2>${placeList(lists[i]!, true)}`;
  });
  return {
    title: `${RANKINGS_HUB.title} · Cosurfing`,
    description: RANKINGS_HUB.description,
    image: null,
    imageAlt: '',
    body: page(RANKINGS_HUB.title, RANKINGS_HUB.description, sections),
    jsonLd: [breadcrumbs(origin, [['Rankings', '/rankings']])],
  };
}

async function globalRankingMeta(api: Api, origin: string, slug: string): Promise<Meta> {
  const category = categoryFromSlug(slug);
  if (!category) return notFound();
  const places = await api.rpc<RankedRow[]>('get_global_ranking', { p_category: category, p_limit: LIST_SIZE, p_offset: 0 });
  const title = rankingTitle(category, null, year());
  const description = rankingDescription(category, null);
  const cities = [...new Map(places.filter((p) => p.city_slug).map((p) => [p.city_slug!, p])).values()];
  return {
    title: `${title} · Cosurfing`,
    description,
    image: null,
    imageAlt: '',
    body: page(title, description, [
      categoryLinks(category, (s) => `/rankings/${s}`, null),
      placeList(places, true),
      cities.length
        ? `<h2>Rankings by city</h2><ul>${cities
            .map((p) => `<li><a href="/${attr(p.city_slug!)}/${slug}">${esc(`${RANKING_COPY[category].best} in ${p.city_name}`)}</a></li>`)
            .join('')}</ul>`
        : '',
    ]),
    jsonLd: [
      itemList(origin, title, places),
      breadcrumbs(origin, [
        ['Rankings', '/rankings'],
        [RANKING_COPY[category].label, `/rankings/${slug}`],
      ]),
    ],
  };
}

async function cityMeta(api: Api, origin: string, slug: string, category: RankedCategory | null): Promise<Meta | null> {
  const [city] = await api.rest<CityRow>(
    `cities?select=id,slug,name,country_name,status,cover_url,place_count&slug=eq.${encodeURIComponent(slug)}&limit=1`,
  );
  if (!city) return category ? notFound() : null;
  if (city.status !== 'active') {
    return {
      title: `Cosurfing in ${city.name} · Waiting list`,
      description: `Join the waiting list and be the first to know the best places to work in ${city.name}.`,
      image: city.cover_url,
      imageAlt: city.name,
      noindex: Boolean(category),
    };
  }
  const places = await api
    .rpc<RankedRow[]>('get_city_ranking', { p_city_id: city.id, p_category: category, p_limit: LIST_SIZE, p_offset: 0 })
    .catch(() => [] as RankedRow[]);
  const title = category ? rankingTitle(category, city.name, year()) : `Best places to work in ${city.name}`;
  const description = category
    ? rankingDescription(category, city.name)
    : `${city.place_count} coworking spaces, laptop-friendly cafés and libraries in ${city.name}, ranked by Wi‑Fi speed, power outlets and reviews.`;
  const categorySlug = category ? slugForCategory(category) : null;
  return {
    title: `${title} · Cosurfing`,
    description,
    image: city.cover_url,
    imageAlt: city.name,
    body: page(title, description, [
      categoryLinks(category, (s) => `/${city.slug}/${s}`, city.name),
      placeList(places, false),
      globalRankingLinks(),
    ]),
    jsonLd: [
      itemList(origin, title, places),
      breadcrumbs(origin, [
        ['Cities', '/cities'],
        [city.name, `/${city.slug}`],
        ...(category && categorySlug ? [[RANKING_COPY[category].label, `/${city.slug}/${categorySlug}`] as [string, string]] : []),
      ]),
    ],
  };
}

async function placeMeta(api: Api, slug: string): Promise<Meta | null> {
  const [place] = await api.rest<PlaceRow>(
    'places?select=name,description,city:cities(name,cover_url),place_photos(preview_path)' +
      `&slug=eq.${encodeURIComponent(slug)}&status=eq.published` +
      '&place_photos.status=eq.approved&place_photos.order=sort_order.asc&place_photos.limit=1&limit=1',
  );
  if (!place) return null;
  const cityName = place.city?.name ?? '';
  const photo = place.place_photos[0]?.preview_path;
  const supabaseUrl = Netlify.env.get('EXPO_PUBLIC_SUPABASE_URL');
  return {
    title: cityName ? `${place.name} · ${cityName} · Cosurfing` : `${place.name} · Cosurfing`,
    description:
      place.description ??
      `${place.name}${cityName ? ` in ${cityName}` : ''}: Wi‑Fi, power outlets, opening hours and reviews from remote workers.`,
    image: photo
      ? `${supabaseUrl}/storage/v1/object/public/place-previews/${photo.split('/').map(encodeURIComponent).join('/')}`
      : (place.city?.cover_url ?? null),
    imageAlt: place.name,
  };
}

function notFound(): Meta {
  return { title: 'Page not found · Cosurfing', description: 'This page does not exist on Cosurfing.', image: null, imageAlt: '', noindex: true };
}

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function attr(value: string): string {
  return esc(value).replace(/"/g, '&quot;');
}

function page(h1: string, intro: string, sections: string[]): string {
  return (
    '<main style="font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,sans-serif;color:#2A211A;background:#F4EFE6;max-width:960px;margin:0 auto;padding:24px 16px;line-height:1.5">' +
    '<nav><a href="/">Cosurfing</a> · <a href="/cities">Cities</a> · <a href="/rankings">Rankings</a></nav>' +
    `<h1>${esc(h1)}</h1><p>${esc(intro)}</p>${sections.join('')}</main>`
  );
}

function categoryLinks(active: RankedCategory | null, href: (slug: string) => string, city: string | null): string {
  return `<nav><ul>${RANKING_SLUGS.map((s) => {
    const c = categoryFromSlug(s)!;
    const label = `${RANKING_COPY[c].best} ${rankingWhere(city)}`;
    return `<li>${c === active ? `<strong>${esc(label)}</strong>` : `<a href="${attr(href(s))}">${esc(label)}</a>`}</li>`;
  }).join('')}</ul></nav>`;
}

function globalRankingLinks(): string {
  return categoryLinks(null, (s) => `/rankings/${s}`, null);
}

function placeList(places: RankedRow[], withCity: boolean): string {
  if (places.length === 0) return '<p>Nothing ranked here yet.</p>';
  return `<ol>${places
    .map((p) => {
      const facts = [
        withCity && p.city_name ? `${p.city_name}${p.country_name ? `, ${p.country_name}` : ''}` : p.address,
        `Work score ${Number(p.work_score).toFixed(1)}/10`,
        p.download_median_mbps !== null ? `${Math.round(Number(p.download_median_mbps))} Mbps Wi‑Fi` : null,
        p.review_count > 0 ? `${p.review_count} ${p.review_count === 1 ? 'review' : 'reviews'}` : null,
      ].filter(Boolean) as string[];
      return `<li><a href="/place/${attr(p.slug)}">${esc(p.name)}</a> · ${esc(facts.join(' · '))}</li>`;
    })
    .join('')}</ol>`;
}

function itemList(origin: string, name: string, places: RankedRow[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    numberOfItems: places.length,
    itemListOrder: 'https://schema.org/ItemListOrderDescending',
    itemListElement: places.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${origin}/place/${p.slug}`,
      name: p.name,
    })),
  };
}

function breadcrumbs(origin: string, items: [string, string][]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [['Cosurfing', '/'] as [string, string], ...items].map(([name, path], i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name,
      item: `${origin}${path}`,
    })),
  };
}

function injectMeta(html: string, meta: Meta, url: URL): string {
  const description = meta.description.length > 300 ? `${meta.description.slice(0, 297)}…` : meta.description;
  const canonical = `${url.origin}${url.pathname.replace(/\/$/, '') || '/'}`;
  const tags: [string, string, string][] = [
    ['name', 'description', description],
    ['property', 'og:title', meta.title],
    ['property', 'og:description', description],
    ['property', 'og:url', canonical],
    ['name', 'twitter:title', meta.title],
    ['name', 'twitter:description', description],
  ];
  if (meta.image) {
    // Served from our own domain via the Image CDN: Wikimedia rejects Facebook's crawler, and
    // the crop matches the 1200x630 size declared in index.html.
    const image = `${url.origin}/.netlify/images?url=${encodeURIComponent(meta.image)}&w=1200&h=630&fit=cover&fm=jpg&q=80`;
    tags.push(
      ['property', 'og:image', image],
      ['property', 'og:image:alt', meta.imageAlt],
      ['name', 'twitter:image', image],
    );
  }

  let out = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${attr(meta.title)}</title>`);
  for (const [a, key, value] of tags) {
    out = out.replace(new RegExp(`<meta ${a}="${key}"[^>]*>`), `<meta ${a}="${key}" content="${attr(value)}" />`);
  }

  const head = [
    meta.noindex ? '<meta name="robots" content="noindex" />' : `<link rel="canonical" href="${attr(canonical)}" />`,
    ...(meta.jsonLd ?? []).map((d) => `<script type="application/ld+json">${JSON.stringify(d).replace(/</g, '\\u003c')}</script>`),
  ].join('\n    ');
  out = out.replace('</head>', `    ${head}\n  </head>`);
  if (meta.body) out = out.replace('<div id="root"></div>', `<div id="root">${meta.body}</div>`);
  return out;
}

export const config: Config = {
  path: ['/cities', '/rankings', '/rankings/:category', '/:city', '/:city/:category', '/place/:slug', '/free-coffee/terms'],
  method: ['GET'],
  onError: 'bypass',
  cache: 'manual',
};
