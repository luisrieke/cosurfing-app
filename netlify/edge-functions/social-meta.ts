import type { Config, Context } from '@netlify/edge-functions';

// The site is a client-rendered SPA, so link-preview crawlers (Instagram, WhatsApp, iMessage,
// Slack, ...) only ever see the static index.html. This swaps its default title, description
// and image for the city or place behind the URL.

const APP_ROUTES = new Set(['map', 'welcome', 'suggest', 'terms', 'admin', 'account', 'plus', 'auth', 'waitlist', 'place']);
const LOOKUP_TIMEOUT_MS = 1500;

interface Meta {
  title: string;
  description: string;
  image: string | null;
  imageAlt: string;
}

interface CityRow {
  name: string;
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

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);

  let lookup: ((supabaseUrl: string, anonKey: string) => Promise<Meta | null>) | null = null;
  if (segments.length === 1 && !APP_ROUTES.has(segments[0]!) && !segments[0]!.includes('.')) {
    lookup = (s, k) => cityMeta(s, k, segments[0]!);
  } else if (segments.length === 2 && segments[0] === 'place') {
    lookup = (s, k) => placeMeta(s, k, segments[1]!);
  }
  if (!lookup) return;

  const supabaseUrl = Netlify.env.get('EXPO_PUBLIC_SUPABASE_URL');
  const anonKey = Netlify.env.get('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) return;

  const [response, meta] = await Promise.all([context.next(), lookup(supabaseUrl, anonKey).catch(() => null)]);
  if (!meta || !(response.headers.get('content-type') ?? '').includes('text/html')) return response;

  const html = injectMeta(await response.text(), meta, url);
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('Netlify-CDN-Cache-Control', 'public, durable, s-maxage=3600, stale-while-revalidate=86400');
  return new Response(html, { status: response.status, headers });
};

async function rest<T>(supabaseUrl: string, anonKey: string, query: string): Promise<T[]> {
  const res = await fetch(`${supabaseUrl}/rest/v1/${query}`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
  return (await res.json()) as T[];
}

async function cityMeta(supabaseUrl: string, anonKey: string, slug: string): Promise<Meta | null> {
  const [city] = await rest<CityRow>(
    supabaseUrl,
    anonKey,
    `cities?select=name,status,cover_url,place_count&slug=eq.${encodeURIComponent(slug)}&limit=1`,
  );
  if (!city) return null;
  if (city.status !== 'active') {
    return {
      title: `Cosurfing in ${city.name} · Waiting list`,
      description: `Join the waiting list and be the first to know the best places to work in ${city.name}.`,
      image: city.cover_url,
      imageAlt: city.name,
    };
  }
  return {
    title: `Best places to work in ${city.name} · Cosurfing`,
    description: `${city.place_count} coworking spaces, laptop-friendly cafés and libraries in ${city.name}, ranked by Wi‑Fi speed, power outlets and reviews.`,
    image: city.cover_url,
    imageAlt: city.name,
  };
}

async function placeMeta(supabaseUrl: string, anonKey: string, slug: string): Promise<Meta | null> {
  const [place] = await rest<PlaceRow>(
    supabaseUrl,
    anonKey,
    'places?select=name,description,city:cities(name,cover_url),place_photos(preview_path)' +
      `&slug=eq.${encodeURIComponent(slug)}&status=eq.published` +
      '&place_photos.status=eq.approved&place_photos.order=sort_order.asc&place_photos.limit=1&limit=1',
  );
  if (!place) return null;
  const cityName = place.city?.name ?? '';
  const photo = place.place_photos[0]?.preview_path;
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

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function injectMeta(html: string, meta: Meta, url: URL): string {
  const description = meta.description.length > 300 ? `${meta.description.slice(0, 297)}…` : meta.description;
  const tags: [string, string, string][] = [
    ['name', 'description', description],
    ['property', 'og:title', meta.title],
    ['property', 'og:description', description],
    ['property', 'og:url', `${url.origin}${url.pathname}`],
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

  let out = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeAttr(meta.title)}</title>`);
  for (const [attr, key, value] of tags) {
    out = out.replace(new RegExp(`<meta ${attr}="${key}"[^>]*>`), `<meta ${attr}="${key}" content="${escapeAttr(value)}" />`);
  }
  return out;
}

export const config: Config = {
  path: ['/:city', '/place/:slug'],
  method: ['GET'],
  onError: 'bypass',
  cache: 'manual',
};
