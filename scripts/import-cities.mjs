#!/usr/bin/env node
/**
 * Imports every city with at least 500,000 inhabitants (GeoNames, CC BY 4.0) plus the curated
 * nomad hotspots in scripts/data/nomad-hotspots.json, with cover photos from Wikimedia Commons
 * (found through Wikidata P18), and queues them for the place crawler.
 *
 *   CRAWLER_SECRET=... node scripts/import-cities.mjs            # import
 *   node scripts/import-cities.mjs --dry-run                      # only write scripts/data/cities.generated.json
 *   node scripts/import-cities.mjs --min-population 300000        # different threshold
 *   node scripts/import-cities.mjs --country DE --min-population 20000 --dedupe-km 6   # one country, small towns
 *   node scripts/import-cities.mjs --hotspots-only                # only the curated hotspots
 *
 * Hotspots are only merged into a GeoNames city with the same name or within HOTSPOT_MERGE_KM, so small
 * nomad towns next to big cities (Canggu next to Denpasar) stay separate. An optional `radius_km` in the
 * hotspot file overrides the population-based crawl radius.
 * The crawler secret is stored in Supabase Vault (`crawler_secret`); the import-cities edge function
 * checks it. SUPABASE_URL defaults to EXPO_PUBLIC_SUPABASE_URL from .env.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const minPopArg = args.indexOf('--min-population');
const MIN_POPULATION = minPopArg >= 0 ? Number(args[minPopArg + 1]) : 500_000;
const countryArg = args.indexOf('--country');
const COUNTRY = countryArg >= 0 ? args[countryArg + 1].toUpperCase() : null;
const dedupeArg = args.indexOf('--dedupe-km');
const DEDUPE_KM = dedupeArg >= 0 ? Number(args[dedupeArg + 1]) : 12;
const HOTSPOTS_ONLY = args.includes('--hotspots-only');
const HOTSPOT_MERGE_KM = 3;
// A GeoNames city with the hotspot's name counts as the same place only within this distance.
const SAME_NAME_KM = 25;
// Distance between a hotspot's coordinates and its Wikidata item above which the import warns.
const COORD_WARN_KM = 10;
const USER_AGENT = 'CosurfingBot/1.0 (https://cosurfing.app; luis@cosurfing.app)';

function readDotEnv() {
  const file = path.join(root, '.env');
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]),
  );
}

const dotenv = readDotEnv();
const SUPABASE_URL = (process.env.SUPABASE_URL ?? dotenv.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const CRAWLER_SECRET = process.env.CRAWLER_SECRET ?? '';

// ---------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------

const cacheDir = path.join(tmpdir(), 'cosurfing-geonames');
mkdirSync(cacheDir, { recursive: true });

async function download(url, file) {
  const target = path.join(cacheDir, file);
  if (existsSync(target)) return target;
  console.log(`Downloading ${url}`);
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  writeFileSync(target, Buffer.from(await res.arrayBuffer()));
  return target;
}

function slugify(input) {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/ł/g, 'l')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

function distanceKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Search radius for the place crawler: grows with the square root of the population, 3-25 km. */
function crawlRadiusKm(population) {
  const r = 3 + 2.2 * Math.sqrt((population ?? 0) / 100_000);
  return Math.round(Math.min(25, Math.max(3, r)) * 10) / 10;
}

function zoomFor(radiusKm) {
  if (radiusKm <= 4) return 14;
  if (radiusKm <= 8) return 13;
  if (radiusKm <= 15) return 12;
  return 11;
}

// Feature codes that are not cities in their own right (sections, abandoned, historical, ...).
const EXCLUDED_CODES = new Set(['PPLX', 'PPLH', 'PPLQ', 'PPLW', 'PPLCH', 'PPLR', 'STLMT']);

async function loadGeoNames(minPopulation) {
  const zip = await download('https://download.geonames.org/export/dump/cities15000.zip', 'cities15000.zip');
  const countryFile = await download('https://download.geonames.org/export/dump/countryInfo.txt', 'countryInfo.txt');
  const admin1File = await download('https://download.geonames.org/export/dump/admin1CodesASCII.txt', 'admin1.txt');

  const countries = new Map();
  for (const line of readFileSync(countryFile, 'utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const c = line.split('\t');
    countries.set(c[0], { name: c[4], continent: c[8] });
  }
  const admin1 = new Map();
  for (const line of readFileSync(admin1File, 'utf8').split('\n')) {
    if (!line) continue;
    const c = line.split('\t');
    admin1.set(c[0], c[1]);
  }

  const text = execFileSync('unzip', ['-p', zip, 'cities15000.txt'], { maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    const c = line.split('\t');
    const population = Number(c[14]);
    if (c[6] !== 'P' || EXCLUDED_CODES.has(c[7]) || !(population >= minPopulation)) continue;
    if (COUNTRY && c[8] !== COUNTRY) continue;
    const country = countries.get(c[8]);
    if (!country) continue;
    rows.push({
      geonames_id: Number(c[0]),
      name: c[1],
      country_code: c[8],
      country_name: country.name,
      continent: country.continent,
      region: admin1.get(`${c[8]}.${c[10]}`) ?? null,
      lat: Number(c[4]),
      lng: Number(c[5]),
      population,
      timezone: c[17] || null,
      is_hotspot: false,
      wiki: null,
    });
  }
  return { rows, countries };
}

// ---------------------------------------------------------------------------
// Covers: Wikidata P18 -> Wikimedia Commons (license + author for attribution)
// ---------------------------------------------------------------------------

async function sparql(query) {
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/sparql-results+json' } });
    if (res.ok) return (await res.json()).results.bindings;
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  throw new Error('Wikidata query failed');
}

function fileNameFromCommonsUrl(url) {
  return decodeURIComponent(url.split('/Special:FilePath/')[1] ?? '').replace(/_/g, ' ');
}

async function findImages(cities) {
  const images = new Map(); // key -> commons file name
  const byGeonames = cities.filter((c) => c.geonames_id);
  for (let i = 0; i < byGeonames.length; i += 150) {
    const batch = byGeonames.slice(i, i + 150);
    const values = batch.map((c) => `"${c.geonames_id}"`).join(' ');
    const rows = await sparql(`SELECT ?gn ?img WHERE { VALUES ?gn { ${values} } ?item wdt:P1566 ?gn; wdt:P18 ?img. }`);
    for (const r of rows) {
      const key = `gn:${r.gn.value}`;
      if (!images.has(key)) images.set(key, fileNameFromCommonsUrl(r.img.value));
    }
    process.stdout.write(`\rWikidata images: ${Math.min(i + 150, byGeonames.length)}/${byGeonames.length}`);
  }
  process.stdout.write('\n');
  // Fallback: English Wikipedia article with the city's name (GeoNames ids are missing on some items).
  for (const c of cities) {
    if (!c.wiki && !images.has(`gn:${c.geonames_id}`)) c.wiki = c.name;
  }
  const byWiki = cities.filter((c) => c.wiki && (c.is_hotspot || !images.has(`gn:${c.geonames_id}`)));
  for (let i = 0; i < byWiki.length; i += 50) {
    const batch = byWiki.slice(i, i + 50);
    const values = batch.map((c) => `"${c.wiki.replace(/"/g, '\\"')}"@en`).join(' ');
    const rows = await sparql(
      `SELECT ?title ?img WHERE { VALUES ?title { ${values} } ?article schema:about ?item; schema:isPartOf <https://en.wikipedia.org/>; schema:name ?title. ?item wdt:P18 ?img. }`,
    );
    for (const r of rows) {
      const key = `wiki:${r.title.value}`;
      if (!images.has(key)) images.set(key, fileNameFromCommonsUrl(r.img.value));
    }
  }
  return images;
}

function stripHtml(value) {
  return (value ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function commonsInfo(fileNames) {
  const info = new Map();
  const unique = [...new Set(fileNames)];
  for (let i = 0; i < unique.length; i += 40) {
    const batch = unique.slice(i, i + 40);
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      prop: 'imageinfo',
      iiprop: 'url|extmetadata',
      iiurlwidth: '1280',
      titles: batch.map((f) => `File:${f}`).join('|'),
    });
    const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) continue;
    const json = await res.json();
    const normalized = new Map((json.query?.normalized ?? []).map((n) => [n.to, n.from]));
    for (const page of Object.values(json.query?.pages ?? {})) {
      const ii = page.imageinfo?.[0];
      if (!ii?.thumburl) continue;
      const meta = ii.extmetadata ?? {};
      const artist = stripHtml(meta.Artist?.value).slice(0, 120) || 'Unknown author';
      const license = stripHtml(meta.LicenseShortName?.value) || 'see source';
      const original = (normalized.get(page.title) ?? page.title).replace(/^File:/, '');
      const url = ii.thumburl.split('?')[0];
      info.set(original.replace(/_/g, ' '), {
        cover_url: url,
        // Commons only serves a fixed set of thumbnail widths (500 is one of them).
        cover_thumb_url: url.replace(/\/1280px-/, '/500px-'),
        cover_attribution: `Photo: ${artist}, ${license}, via Wikimedia Commons`,
        cover_source_url: ii.descriptionurl,
      });
    }
    process.stdout.write(`\rCommons metadata: ${Math.min(i + 40, unique.length)}/${unique.length}`);
  }
  process.stdout.write('\n');
  return info;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/** Warns about hotspots whose coordinates are far from their Wikidata item (typos, namesakes). */
async function checkHotspotCoordinates(hotspots) {
  const coords = new Map();
  for (let i = 0; i < hotspots.length; i += 50) {
    const values = hotspots
      .slice(i, i + 50)
      .map((h) => `"${h.wiki.replace(/"/g, '\\"')}"@en`)
      .join(' ');
    const rows = await sparql(
      `SELECT ?title ?coord WHERE { VALUES ?title { ${values} } ?article schema:about ?item; schema:isPartOf <https://en.wikipedia.org/>; schema:name ?title. ?item wdt:P625 ?coord. }`,
    );
    for (const r of rows) {
      const m = r.coord.value.match(/Point\(([-\d.e]+) ([-\d.e]+)\)/i);
      if (m && !coords.has(r.title.value)) coords.set(r.title.value, { lat: Number(m[2]), lng: Number(m[1]) });
    }
  }
  let warnings = 0;
  for (const h of hotspots) {
    const c = coords.get(h.wiki);
    if (!c) {
      console.warn(`  ! ${h.name} (${h.country_code}): no Wikidata coordinates for "${h.wiki}"`);
      warnings += 1;
    } else if (distanceKm(c, h) > COORD_WARN_KM) {
      console.warn(`  ! ${h.name} (${h.country_code}): ${distanceKm(c, h).toFixed(1)} km from Wikidata (${c.lat}, ${c.lng})`);
      warnings += 1;
    }
  }
  console.log(`Hotspot coordinates: ${hotspots.length - warnings}/${hotspots.length} match Wikidata`);
}

async function main() {
  const { rows, countries } = await loadGeoNames(HOTSPOTS_ONLY ? 0 : MIN_POPULATION);
  rows.sort((a, b) => b.population - a.population);

  // Drop boroughs/suburbs that GeoNames lists as separate places (e.g. Brooklyn next to New York):
  // anything inside the crawl area of a bigger city is already covered by that city's ranking.
  const kept = [];
  if (!HOTSPOTS_ONLY) {
    const nameKeys = new Set();
    for (const row of rows) {
      const key = `${row.name.toLowerCase()}|${row.country_code}`;
      if (nameKeys.has(key)) continue;
      if (kept.some((k) => distanceKm(k, row) < Math.max(DEDUPE_KM, 0.8 * crawlRadiusKm(k.population)))) continue;
      kept.push(row);
      nameKeys.add(key);
    }
    console.log(`GeoNames: ${rows.length} places >= ${MIN_POPULATION}, ${kept.length} after removing duplicates and suburbs`);
  }

  const hotspots = JSON.parse(readFileSync(path.join(root, 'scripts/data/nomad-hotspots.json'), 'utf8')).filter(
    (h) => !COUNTRY || h.country_code === COUNTRY,
  );
  await checkHotspotCoordinates(hotspots);

  // In hotspots-only mode every GeoNames place is a merge candidate, so existing cities keep their GeoNames id.
  const candidates = HOTSPOTS_ONLY ? rows : kept;
  let added = 0;
  for (const h of hotspots) {
    const sameCountry = candidates.filter((k) => k.country_code === h.country_code);
    const byName = sameCountry.find(
      (k) => k.name.toLowerCase() === h.name.toLowerCase() && distanceKm(k, h) < SAME_NAME_KM,
    );
    if (byName) {
      byName.is_hotspot = true;
      byName.wiki = h.wiki;
      if (h.radius_km) byName.radius_km = h.radius_km;
      if (!kept.includes(byName)) kept.push(byName);
      continue;
    }
    // A GeoNames place right next to the hotspot (usually the same town under another spelling) only
    // lends its id, so an existing city row is found again; name and centre stay the hotspot's.
    const nearby = sameCountry
      .filter((k) => distanceKm(k, h) < HOTSPOT_MERGE_KM)
      .sort((a, b) => distanceKm(a, h) - distanceKm(b, h))[0];
    if (nearby) {
      console.log(`  ${h.name} (${h.country_code}) uses GeoNames id of "${nearby.name}"`);
      if (kept.includes(nearby)) kept.splice(kept.indexOf(nearby), 1);
    }
    const country = countries.get(h.country_code);
    kept.push({
      geonames_id: nearby?.geonames_id ?? null,
      name: h.name,
      country_code: h.country_code,
      country_name: country?.name ?? h.country_code,
      continent: country?.continent ?? null,
      region: nearby?.region ?? null,
      lat: h.lat,
      lng: h.lng,
      population: h.population,
      timezone: nearby?.timezone ?? null,
      is_hotspot: true,
      wiki: h.wiki,
      radius_km: h.radius_km,
    });
    added += 1;
  }
  console.log(`Hotspots: ${hotspots.length} (${added} added, ${hotspots.length - added} matched by name)`);

  const slugs = new Set();
  for (const c of kept) {
    let slug = slugify(c.name) || `city-${c.geonames_id}`;
    if (slugs.has(slug)) slug = `${slug}-${c.country_code.toLowerCase()}`;
    if (slugs.has(slug)) slug = `${slug}-${c.geonames_id ?? slugs.size}`;
    slugs.add(slug);
    c.slug = slug;
    c.crawl_radius_km = c.radius_km ?? crawlRadiusKm(c.population);
    c.zoom = zoomFor(c.crawl_radius_km);
  }

  const images = await findImages(kept);
  const info = await commonsInfo([...images.values()]);
  let withCover = 0;
  for (const c of kept) {
    // Hotspots borrow GeoNames ids of nearby places, so their own Wikipedia article picks the photo.
    const wikiFile = c.wiki ? images.get(`wiki:${c.wiki}`) : undefined;
    const gnFile = images.get(`gn:${c.geonames_id}`);
    const file = c.is_hotspot ? (wikiFile ?? gnFile) : (gnFile ?? wikiFile);
    const cover = file ? info.get(file) : undefined;
    if (cover) {
      Object.assign(c, cover);
      withCover += 1;
    }
  }
  console.log(`Covers: ${withCover}/${kept.length}`);

  const out = kept.map(({ wiki: _wiki, radius_km: _radius, ...c }) => c);
  const suffix = `${HOTSPOTS_ONLY ? '.hotspots' : ''}${COUNTRY ? `.${COUNTRY.toLowerCase()}` : ''}`;
  const outFile = path.join(root, `scripts/data/cities${suffix}.generated.json`);
  writeFileSync(outFile, JSON.stringify(out, null, 1));
  console.log(`Wrote ${out.length} cities to ${path.relative(root, outFile)}`);
  if (dryRun) return;

  if (!SUPABASE_URL || !CRAWLER_SECRET) {
    throw new Error('Set CRAWLER_SECRET (and SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL in .env) to import.');
  }
  for (let i = 0; i < out.length; i += 200) {
    const batch = out.slice(i, i + 200);
    const res = await fetch(`${SUPABASE_URL}/functions/v1/import-cities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-crawler-secret': CRAWLER_SECRET },
      body: JSON.stringify({ cities: batch }),
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`Import failed (${res.status}): ${body}`);
    console.log(`Imported ${Math.min(i + 200, out.length)}/${out.length}: ${body}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
