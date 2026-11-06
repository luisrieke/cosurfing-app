/**
 * City cover photos from Wikimedia Commons. Wikidata's main image (P18) of many cities is the infobox
 * montage (several photos glued into one, like a postcard). Those are detected by file name and Commons
 * category and replaced by a single photo: first Wikidata's view properties, then the photos of the
 * city's English Wikipedia article in page order (the infobox photos come first).
 */

export const USER_AGENT = 'CosurfingBot/1.0 (https://cosurfing.app; luis@cosurfing.app)';

const COLLAGE_PATTERN = /montage|montaje|montagem|montaggio|monta[zž]|collage|kolla[zž]|kola[zż]|mosaic|composite|photomontage|fotomonta/i;
// Maps, flags, seals, logos, diagrams and charts are never a city photo.
const NOT_A_PHOTO_PATTERN =
  /\bmap\b|_map|map_|locator|location|flag|seal|coat[ _]of[ _]arms|wappen|escudo|bandera|logo|emblem|symbol|icon|diagram|chart|graph|census|population|signature|\bplan\b|stamp|banknote|coin|\biss\d|planet labs|landsat|sentinel|satellite|astronaut|\bbw\b|detail|детал|portrait|\bcar\b|stadium|stadion|estadio/i;
// Wikidata: other images of the item (aerial, general, night and winter view).
const VIEW_PROPERTIES = ['P8592', 'P8517', 'P3451', 'P5252', 'P18'];
const MIN_WIDTH = 1000;
const MIN_ASPECT = 1.15;
const MAX_ASPECT = 2.4;
const MIN_YEAR = 1990;

export async function sparql(query) {
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/sparql-results+json' } });
    if (res.ok) return (await res.json()).results.bindings;
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  throw new Error('Wikidata query failed');
}

async function getJson(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (res.ok) return res.json();
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  throw new Error(`Request failed: ${url}`);
}

function stripHtml(value) {
  return (value ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;[^&]*&gt;/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function foldText(value) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function normalizeFileName(name) {
  return decodeURIComponent(name).replace(/^File:/, '').replace(/_/g, ' ');
}

export function fileNameFromCommonsUrl(url) {
  return normalizeFileName(url.split('/Special:FilePath/')[1] ?? url.split('/wiki/File:')[1] ?? '');
}

/**
 * Commons metadata for each file: cover fields for the cities table plus what is needed to judge it
 * (size, mime type, categories, date taken).
 */
export async function commonsInfo(fileNames, { progress = false } = {}) {
  const info = new Map();
  const unique = [...new Set(fileNames.map(normalizeFileName))];
  for (let i = 0; i < unique.length; i += 40) {
    const batch = unique.slice(i, i + 40);
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      prop: 'imageinfo|categories',
      iiprop: 'url|size|mime|extmetadata',
      iiurlwidth: '1280',
      cllimit: 'max',
      clshow: '!hidden',
      titles: batch.map((f) => `File:${f}`).join('|'),
    });
    let json;
    try {
      json = await getJson(`https://commons.wikimedia.org/w/api.php?${params}`);
    } catch {
      continue;
    }
    const normalized = new Map((json.query?.normalized ?? []).map((n) => [n.to, n.from]));
    for (const page of Object.values(json.query?.pages ?? {})) {
      const ii = page.imageinfo?.[0];
      if (!ii?.thumburl) continue;
      const meta = ii.extmetadata ?? {};
      const artist = stripHtml(meta.Artist?.value).slice(0, 120) || 'Unknown author';
      const license = stripHtml(meta.LicenseShortName?.value) || 'see source';
      const original = normalizeFileName(normalized.get(page.title) ?? page.title);
      const url = ii.thumburl.split('?')[0];
      const year = Number(stripHtml(meta.DateTimeOriginal?.value).match(/\b(1[89]\d\d|20\d\d)\b/)?.[1]) || null;
      const entry = {
        cover_url: url,
        // Commons only serves a fixed set of thumbnail widths (500 is one of them).
        cover_thumb_url: url.replace(/\/1280px-/, '/500px-'),
        cover_attribution: `Photo: ${artist}, ${license}, via Wikimedia Commons`,
        cover_source_url: ii.descriptionurl,
        file: original,
        width: ii.width,
        height: ii.height,
        mime: ii.mime,
        year,
        categories: (page.categories ?? []).map((c) => c.title.replace(/^Category:/, '')),
      };
      info.set(original, entry);
      // Pages can also be reached under their normalized title (redirects, case).
      info.set(normalizeFileName(page.title), entry);
    }
    if (progress) process.stdout.write(`\rCommons metadata: ${Math.min(i + 40, unique.length)}/${unique.length}`);
  }
  if (progress) process.stdout.write('\n');
  return info;
}

/** The columns of public.cities that hold the cover. */
export function coverFields(entry) {
  const { cover_url, cover_thumb_url, cover_attribution, cover_source_url } = entry;
  return { cover_url, cover_thumb_url, cover_attribution, cover_source_url };
}

export function isCollage(entry) {
  if (!entry) return false;
  return COLLAGE_PATTERN.test(entry.file) || entry.categories.some((c) => COLLAGE_PATTERN.test(c));
}

/** A single landscape photo that is large and recent enough for a city card. */
export function isGoodCover(entry) {
  if (!entry || isCollage(entry)) return false;
  if (entry.mime !== 'image/jpeg') return false;
  if (NOT_A_PHOTO_PATTERN.test(entry.file) || entry.categories.some((c) => /maps? of|flags of|coats of arms/i.test(c))) {
    return false;
  }
  if (!(entry.width >= MIN_WIDTH)) return false;
  const aspect = entry.width / entry.height;
  if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) return false;
  if (entry.year && entry.year < MIN_YEAR) return false;
  return true;
}

/** Wikidata view images and the English Wikipedia title for each item id. */
async function wikidataEntities(qids) {
  const out = new Map();
  for (let i = 0; i < qids.length; i += 50) {
    const params = new URLSearchParams({
      action: 'wbgetentities',
      format: 'json',
      ids: qids.slice(i, i + 50).join('|'),
      props: 'claims|sitelinks',
      sitefilter: 'enwiki',
    });
    const json = await getJson(`https://www.wikidata.org/w/api.php?${params}`);
    for (const [qid, entity] of Object.entries(json.entities ?? {})) {
      const files = [];
      for (const prop of VIEW_PROPERTIES) {
        for (const claim of entity.claims?.[prop] ?? []) {
          const value = claim.mainsnak?.datavalue?.value;
          if (typeof value === 'string') files.push(normalizeFileName(value));
        }
      }
      out.set(qid, { files, enwiki: entity.sitelinks?.enwiki?.title ?? null });
    }
  }
  return out;
}

async function articleImages(title) {
  const params = new URLSearchParams({ action: 'parse', format: 'json', page: title, prop: 'images', redirects: '1' });
  try {
    const json = await getJson(`https://en.wikipedia.org/w/api.php?${params}`);
    return (json.parse?.images ?? []).filter((f) => /\.jpe?g$/i.test(f)).map(normalizeFileName);
  } catch {
    return [];
  }
}

/**
 * Picks a single-photo cover for cities whose current cover is a collage.
 * `cities` items: { key, label, name, qid, wiki? } (wiki = English Wikipedia title, falls back to the item's
 * sitelink, then to the city name). Among the first usable photos, one that mentions the city in file name or category wins.
 * Returns Map key -> commons info entry of the replacement.
 */
export async function replaceCollages(cities, { log = console.log } = {}) {
  const entities = await wikidataEntities([...new Set(cities.map((c) => c.qid).filter(Boolean))]);
  const result = new Map();
  for (const [index, city] of cities.entries()) {
    const label = city.label ?? String(city.key);
    const entity = entities.get(city.qid);
    const title = city.wiki ?? entity?.enwiki ?? city.name;
    const candidates = [...new Set([...(entity?.files ?? []), ...(title ? (await articleImages(title)).slice(0, 25) : [])])];
    const info = candidates.length ? await commonsInfo(candidates) : new Map();
    const good = candidates.map((f) => info.get(f)).filter(isGoodCover);
    // "Acapulco de Juárez" is mostly called Acapulco in file names.
    const name = city.name ? foldText(city.name.split(/,| de /)[0].trim()) : null;
    const mentionsCity = (e) => name && [e.file, ...e.categories].some((t) => foldText(t).includes(name));
    // Further down the article photos get more specific (stadiums, statues), so only the first few compete.
    const pick = good.slice(0, 3).find(mentionsCity) ?? good[0];
    if (pick) {
      result.set(city.key, pick);
      log(`  [${index + 1}/${cities.length}] ${label}: ${pick.file}`);
    } else {
      log(`  [${index + 1}/${cities.length}] ${label}: no single photo among ${candidates.length} candidates`);
    }
  }
  return result;
}

/** Wikidata items whose main image (P18) is one of the given Commons files. */
export async function itemsForImages(fileNames) {
  const out = new Map();
  for (let i = 0; i < fileNames.length; i += 100) {
    const values = fileNames
      .slice(i, i + 100)
      .map((f) => `<http://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(f)}>`)
      .join(' ');
    // Only items with coordinates, so montages that are also the image of a region's item still map to a place.
    const rows = await sparql(`SELECT ?img ?item WHERE { VALUES ?img { ${values} } ?item wdt:P18 ?img; wdt:P625 []. }`);
    for (const r of rows) {
      const file = fileNameFromCommonsUrl(r.img.value);
      if (!out.has(file)) out.set(file, r.item.value.split('/').pop());
    }
  }
  return out;
}
