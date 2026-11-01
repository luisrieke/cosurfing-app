// Crawls places to work for queued cities from OpenStreetMap and merges them into public.places.
// Primary source is the QLever OSM planet SPARQL endpoint (fast, full tags); the public Overpass API
// is the fallback. Called every minute by pg_cron (public.invoke_crawler) and processes jobs until its
// time budget is used up. Deployed with verify_jwt = false; callers send the crawler secret from Vault.
//
// Data: © OpenStreetMap contributors, ODbL 1.0. Attribution is shown on every city and place page.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const USER_AGENT = 'CosurfingBot/1.0 (+https://cosurfing.app; luis@cosurfing.app)';
// Edge requests are cut off at 150 s; a job may start until START_BUDGET_MS and take up to ~90 s.
const START_BUDGET_MS = 50_000;
const QLEVER_ENDPOINT = 'https://qlever.dev/api/osm-planet';
const OVERPASS_ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

interface Job {
  job_id: string;
  city_id: string;
  city_slug: string;
  city_name: string;
  country_code: string;
  lat: number;
  lng: number;
  radius_km: number;
  is_hotspot: boolean;
  population: number | null;
}

interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// QLever (SPARQL over the OSM planet, osm2rdf)
// ---------------------------------------------------------------------------

const KEY_PREFIX = 'https://www.openstreetmap.org/wiki/Key:';
const WIFI_VALUES = '"wlan","yes","wifi","public","customers","wired"';

// In Italy the neighbourhood café is an amenity=bar, so bars count as cafés there.
const BAR_COUNTRIES = new Set(['IT']);

function qleverQuery(lat: number, lng: number, radiusKm: number, allCafes: boolean, bars: boolean): string {
  const clause = (amenity: string) =>
    allCafes
      ? `{ ?osm osmkey:amenity "${amenity}" }`
      : `{ ?osm osmkey:amenity "${amenity}" . ?osm osmkey:internet_access ?ia . FILTER(?ia IN (${WIFI_VALUES})) }`;
  const cafe = bars ? `${clause('cafe')} UNION ${clause('bar')}` : clause('cafe');
  return `PREFIX osmkey: <${KEY_PREFIX}>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
PREFIX geof: <http://www.opengis.net/def/function/geosparql/>
SELECT ?osm ?wkt ?key ?val WHERE {
  {
    { ?osm osmkey:amenity "coworking_space" } UNION { ?osm osmkey:office "coworking" } UNION { ?osm osmkey:amenity "library" } UNION
    ${cafe}
    ?osm osmkey:name ?n .
    ?osm geo:hasGeometry/geo:asWKT ?wkt .
    FILTER(geof:distance(?wkt, "POINT(${lng} ${lat})"^^geo:wktLiteral) < ${radiusKm})
  }
  ?osm ?key ?val .
  FILTER(STRSTARTS(STR(?key), "${KEY_PREFIX}"))
}`;
}

/** Centroid of a WKT geometry: points as-is, otherwise the mean of all vertices (good enough for a pin). */
function wktCenter(wkt: string): { lat: number; lon: number } | null {
  const nums = wkt.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/gi);
  if (!nums || nums.length < 2) return null;
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    sx += Number(nums[i]);
    sy += Number(nums[i + 1]);
    n++;
  }
  return n ? { lon: sx / n, lat: sy / n } : null;
}

async function fetchQlever(job: Job, allCafes: boolean): Promise<OsmElement[]> {
  const res = await fetchWithTimeout(
    QLEVER_ENDPOINT,
    {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/sparql-results+json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `query=${encodeURIComponent(
        qleverQuery(job.lat, job.lng, Number(job.radius_km), allCafes, BAR_COUNTRIES.has(job.country_code)),
      )}`,
    },
    50_000,
  );
  if (!res.ok) throw new Error(`qlever: ${res.status}`);
  const body = (await res.json()) as {
    results?: { bindings?: { osm: { value: string }; wkt: { value: string }; key: { value: string }; val: { value: string } }[] };
  };
  const bindings = body.results?.bindings;
  if (!bindings) throw new Error('qlever: malformed response');

  const byId = new Map<string, OsmElement>();
  for (const b of bindings) {
    let el = byId.get(b.osm.value);
    if (!el) {
      const m = b.osm.value.match(/\/(node|way|relation)\/(\d+)$/);
      if (!m) continue;
      const center = wktCenter(b.wkt.value);
      if (!center) continue;
      el = { type: m[1] as OsmElement['type'], id: Number(m[2]), center, tags: {} };
      byId.set(b.osm.value, el);
    }
    el.tags![b.key.value.slice(KEY_PREFIX.length)] = b.val.value;
  }
  return [...byId.values()];
}

// ---------------------------------------------------------------------------
// Overpass (fallback)
// ---------------------------------------------------------------------------

function overpassQuery(lat: number, lng: number, radiusM: number, allCafes: boolean, bars: boolean): string {
  const a = `(around:${radiusM},${lat},${lng})`;
  const wifi = allCafes ? '' : '["internet_access"~"^(wlan|yes|wifi|public|customers|wired)$"]';
  return `[out:json][timeout:60];
(
  nwr["amenity"="coworking_space"]${a};
  nwr["office"="coworking"]${a};
  nwr["amenity"="cafe"]${wifi}${a};${bars ? `\n  nwr["amenity"="bar"]${wifi}${a};` : ''}
  nwr["amenity"="library"]${a};
);
out center tags;`;
}

async function fetchOverpass(job: Job, allCafes: boolean): Promise<OsmElement[]> {
  const query = overpassQuery(
    job.lat,
    job.lng,
    Math.round(Number(job.radius_km) * 1000),
    allCafes,
    BAR_COUNTRIES.has(job.country_code),
  );
  let lastError = 'overpass: no endpoint reachable';
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetchWithTimeout(
        endpoint,
        {
          method: 'POST',
          headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `data=${encodeURIComponent(query)}`,
        },
        20_000,
      );
      if (!res.ok) {
        lastError = `${endpoint}: ${res.status}`;
        continue;
      }
      const body = (await res.json()) as { elements?: OsmElement[]; remark?: string };
      if (body.remark && /runtime error|timed out|out of memory/i.test(body.remark)) {
        lastError = `${endpoint}: ${body.remark}`;
        continue;
      }
      return body.elements ?? [];
    } catch (e) {
      lastError = `${endpoint}: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  throw new Error(lastError);
}

// Below this many results (small towns, where cafés rarely tag wifi) all named cafés are included;
// their wifi stays "unknown" until someone reports it.
const SMALL_RESULT = 15;
// Small nomad hotspots always get every named café: people go there to work, but cafés rarely tag wifi.
const SMALL_HOTSPOT_POPULATION = 100_000;

async function fetchFromSources(job: Job, allCafes: boolean): Promise<{ elements: OsmElement[]; source: string }> {
  try {
    return { elements: await fetchQlever(job, allCafes), source: 'qlever' };
  } catch (e) {
    const qleverError = e instanceof Error ? e.message : String(e);
    try {
      return { elements: await fetchOverpass(job, allCafes), source: 'overpass' };
    } catch (e2) {
      throw new Error(`${qleverError}; ${e2 instanceof Error ? e2.message : String(e2)}`);
    }
  }
}

async function fetchElements(job: Job): Promise<{ elements: OsmElement[]; source: string; all_cafes: boolean }> {
  if (job.is_hotspot && (job.population ?? 0) < SMALL_HOTSPOT_POPULATION) {
    return { ...(await fetchFromSources(job, true)), all_cafes: true };
  }
  const first = await fetchFromSources(job, false);
  if (first.elements.length >= SMALL_RESULT) return { ...first, all_cafes: false };
  try {
    const wide = await fetchFromSources(job, true);
    if (wide.elements.length > first.elements.length) return { ...wide, all_cafes: true };
  } catch {
    // keep the first result
  }
  return { ...first, all_cafes: false };
}

// ---------------------------------------------------------------------------
// Mapping OSM tags to Cosurfing facts (only what is tagged; nothing is guessed)
// ---------------------------------------------------------------------------

const KEPT_TAG = /^(amenity|office|name(:en)?|brand|operator|internet_access(:.*)?|opening_hours|website|contact:(website|phone|email|instagram)|phone|addr:.*|outdoor_seating|indoor_seating|wheelchair|cuisine|fee|capacity|socket(:.*)?|description(:en)?|check_date(:.*)?|survey:date|level|access|diet:.*)$/;

// Names in non-Latin scripts get the English name (if tagged) for display; the original stays as name_local.
const NON_LATIN = /[^\p{Script=Latin}\p{N}\p{P}\p{S}\s]/u;

function cleanUrl(value: string | undefined): string | null {
  if (!value) return null;
  const first = value.split(';')[0]!.trim();
  if (!first) return null;
  const url = /^https?:\/\//i.test(first) ? first : `https://${first}`;
  try {
    const u = new URL(url);
    if (!['http:', 'https:'].includes(u.protocol)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function address(t: Record<string, string>): string | null {
  if (t['addr:full']) return t['addr:full'];
  const street = [t['addr:street'] ?? t['addr:place'], t['addr:housenumber']].filter(Boolean).join(' ');
  if (!(t['addr:street'] ?? t['addr:place'])) return null;
  const city = [t['addr:postcode'], t['addr:city']].filter(Boolean).join(' ');
  const parts = [street, city].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

function mapElement(el: OsmElement) {
  const t = el.tags ?? {};
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  const rawName = (t.name ?? '').trim();
  if (!rawName || lat === undefined || lng === undefined) return null;
  if (t.access === 'private' || t.access === 'no') return null;

  const category =
    t.amenity === 'coworking_space' || t.office === 'coworking' ? 'coworking' : t.amenity === 'library' ? 'library' : 'cafe';

  const en = t['name:en']?.trim();
  const name = NON_LATIN.test(rawName) && en ? en : rawName;

  const ia = t.internet_access;
  const wifi = ia ? (['wlan', 'yes', 'wifi', 'public', 'customers'].includes(ia) ? 'yes' : ia === 'no' ? 'no' : 'unknown') : 'unknown';
  const feeRaw = t['internet_access:fee'];
  const internet_fee = feeRaw === 'no' || feeRaw === 'yes' || feeRaw === 'customers' ? feeRaw : 'unknown';
  const outdoor = t.outdoor_seating === 'yes' || t.outdoor_seating === 'no' ? t.outdoor_seating : 'unknown';
  const wheelchair = ['yes', 'limited', 'no'].includes(t.wheelchair ?? '') ? t.wheelchair : 'unknown';

  const tags: Record<string, string> = {};
  for (const [k, v] of Object.entries(t)) if (KEPT_TAG.test(k)) tags[k] = v.slice(0, 300);

  return {
    osm_type: el.type,
    osm_id: el.id,
    name: name.slice(0, 120),
    name_local: name !== rawName ? rawName.slice(0, 120) : null,
    category,
    lat,
    lng,
    address: address(t),
    website: cleanUrl(t.website ?? t['contact:website'] ?? t.url),
    phone: (t.phone ?? t['contact:phone'] ?? '').split(';')[0]!.trim() || null,
    opening_hours: t.opening_hours?.slice(0, 300) ?? null,
    wifi,
    internet_fee,
    outdoor_seating: outdoor,
    wheelchair,
    tags,
  };
}

// ---------------------------------------------------------------------------
// Job loop
// ---------------------------------------------------------------------------

async function crawlOne(sb: SupabaseClient, job: Job) {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  try {
    const { elements, source, all_cafes } = await fetchElements(job);
    const seen = new Set<string>();
    const items = [];
    for (const el of elements) {
      const item = mapElement(el);
      if (!item) continue;
      const key = `${item.osm_type}/${item.osm_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
    const { data, error } = await sb.rpc('upsert_osm_places', {
      p_city_id: job.city_id,
      p_items: items,
      p_started_at: startedAt,
    });
    if (error) throw new Error(error.message);
    const stats = {
      ...(data as Record<string, number>),
      source,
      all_cafes,
      osm_elements: elements.length,
      radius_km: Number(job.radius_km),
      ms: Date.now() - t0,
    };
    await sb.rpc('finish_crawl_job', { p_job_id: job.job_id, p_ok: true, p_error: null, p_stats: stats });
    return { city: job.city_slug, ok: true, ...stats };
  } catch (e) {
    const message = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    await sb.rpc('finish_crawl_job', { p_job_id: job.job_id, p_ok: false, p_error: message, p_stats: null });
    return { city: job.city_slug, ok: false, error: message };
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const secret = req.headers.get('x-crawler-secret') ?? '';
  const { data: ok } = await sb.rpc('check_crawler_secret', { p_secret: secret });
  if (!secret || ok !== true) return json({ error: 'unauthorized' }, 401);

  const started = Date.now();
  const results = [];
  // Small cities finish in seconds, so keep claiming jobs while there is time left.
  while (Date.now() - started < START_BUDGET_MS) {
    const { data, error } = await sb.rpc('claim_crawl_job');
    if (error) return json({ error: error.message, results }, 500);
    const job = (data as Job[] | null)?.[0];
    if (!job) break;
    results.push(await crawlOne(sb, job));
  }
  return json({ ok: true, processed: results.length, ms: Date.now() - started, results });
});
