import type { Config } from '@netlify/edge-functions';

// /sitemap.xml is an index of /sitemaps/pages.xml (static pages, rankings, cities and their category
// pages) and /sitemaps/places-N.xml (every published place, 40k per file).

const PAGE_SIZE = 40000;
const TIMEOUT_MS = 8000;
const STATIC_PATHS = ['/', '/cities', '/rankings', '/rankings/cafes', '/rankings/coworkings', '/rankings/colivings', '/how-rankings-work', '/suggest'];

interface CityEntry {
  s: string;
  u: string | null;
  cafe: number;
  coworking: number;
  coliving: number;
}

export default async (req: Request) => {
  const url = new URL(req.url);
  const supabaseUrl = Netlify.env.get('EXPO_PUBLIC_SUPABASE_URL');
  const anonKey = Netlify.env.get('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) return new Response('Not configured', { status: 503 });

  const sitemap = async <T>(page: number | null) => {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/get_sitemap`, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_page: page, p_page_size: PAGE_SIZE }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}`);
    return (await res.json()) as T;
  };

  const origin = url.origin;
  let body: string;
  if (url.pathname === '/sitemap.xml') {
    const { place_pages } = await sitemap<{ place_pages: number }>(null);
    const files = ['/sitemaps/pages.xml', ...Array.from({ length: place_pages }, (_, i) => `/sitemaps/places-${i + 1}.xml`)];
    body = `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${files
      .map((f) => `<sitemap><loc>${origin}${f}</loc></sitemap>`)
      .join('')}</sitemapindex>`;
  } else if (url.pathname === '/sitemaps/pages.xml') {
    const { cities } = await sitemap<{ cities: CityEntry[] }>(null);
    const entries: [string, string | null][] = STATIC_PATHS.map((p) => [p, null]);
    for (const c of cities) {
      entries.push([`/${c.s}`, c.u]);
      if (c.cafe > 0) entries.push([`/${c.s}/cafes`, c.u]);
      if (c.coworking > 0) entries.push([`/${c.s}/coworkings`, c.u]);
      if (c.coliving > 0) entries.push([`/${c.s}/colivings`, c.u]);
    }
    body = urlset(origin, entries);
  } else {
    const match = /^\/sitemaps\/places-(\d+)\.xml$/.exec(url.pathname);
    if (!match) return;
    const places = await sitemap<{ s: string; u: string | null }[]>(Number(match[1]) - 1);
    if (places.length === 0) return new Response('Not found', { status: 404 });
    body = urlset(
      origin,
      places.map((p) => [`/place/${p.s}`, p.u]),
    );
  }

  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n${body}`, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=21600, stale-while-revalidate=86400',
    },
  });
};

function urlset(origin: string, entries: [string, string | null][]): string {
  return `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries
    .map(([path, updated]) => `<url><loc>${xml(`${origin}${encodeURI(path)}`)}</loc>${updated ? `<lastmod>${updated.slice(0, 10)}</lastmod>` : ''}</url>`)
    .join('')}</urlset>`;
}

function xml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export const config: Config = {
  path: ['/sitemap.xml', '/sitemaps/*'],
  method: ['GET'],
  cache: 'manual',
};
