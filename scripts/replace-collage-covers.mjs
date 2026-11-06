#!/usr/bin/env node
/**
 * Replaces collage covers ("postcard" montages) of cities that are already imported with a single photo
 * and writes the updates as SQL for the Supabase SQL editor.
 *
 *   node scripts/replace-collage-covers.mjs --input cities.json      # rows exported from public.cities
 *   node scripts/replace-collage-covers.mjs                          # reads public.cities with the anon key from .env
 *
 * Input rows need slug, name, country_code, geonames_id and cover_source_url
 * (select slug, name, country_code, geonames_id, cover_source_url from public.cities where cover_source_url is not null).
 * Output: scripts/data/collage-covers.generated.sql
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  commonsInfo,
  coverFields,
  fileNameFromCommonsUrl,
  isCollage,
  itemsForImages,
  replaceCollages,
  sparql,
} from './lib/covers.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const inputArg = args.indexOf('--input');

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

async function loadCities() {
  if (inputArg >= 0) return JSON.parse(readFileSync(args[inputArg + 1], 'utf8'));
  const env = { ...readDotEnv(), ...process.env };
  const url = (env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
  const key = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Pass --input or set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.');
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(
      `${url}/rest/v1/cities?select=slug,name,country_code,geonames_id,cover_source_url&cover_source_url=not.is.null&order=slug`,
      { headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + 999}` } },
    );
    if (!res.ok) throw new Error(`Reading cities failed (${res.status}): ${await res.text()}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

const sqlText = (v) => `'${String(v).replace(/'/g, "''")}'`;

async function main() {
  const cities = (await loadCities()).filter((c) => c.cover_source_url);
  for (const c of cities) c.file = fileNameFromCommonsUrl(c.cover_source_url);
  console.log(`Cities with a cover: ${cities.length}`);

  const info = await commonsInfo(
    cities.map((c) => c.file),
    { progress: true },
  );
  const collages = cities.filter((c) => isCollage(info.get(c.file)));
  console.log(`Collage covers: ${collages.length}`);

  const qids = new Map();
  const withGeonames = collages.filter((c) => c.geonames_id);
  for (let i = 0; i < withGeonames.length; i += 150) {
    const values = withGeonames
      .slice(i, i + 150)
      .map((c) => `"${c.geonames_id}"`)
      .join(' ');
    const rows = await sparql(`SELECT ?gn ?item ?img WHERE { VALUES ?gn { ${values} } ?item wdt:P1566 ?gn; wdt:P18 ?img. }`);
    for (const r of rows) {
      const city = withGeonames.find((c) => String(c.geonames_id) === r.gn.value);
      if (city && fileNameFromCommonsUrl(r.img.value) === city.file) qids.set(city.slug, r.item.value.split('/').pop());
    }
  }
  const byImage = await itemsForImages(collages.filter((c) => !qids.has(c.slug)).map((c) => c.file));
  for (const c of collages) if (!qids.has(c.slug) && byImage.has(c.file)) qids.set(c.slug, byImage.get(c.file));

  const replacements = await replaceCollages(
    collages.map((c) => ({ key: c.slug, label: `${c.name} (${c.country_code})`, name: c.name, qid: qids.get(c.slug) })),
  );

  const rows = [...replacements].map(([slug, entry]) => {
    const f = coverFields(entry);
    return `  (${[slug, f.cover_url, f.cover_thumb_url, f.cover_attribution, f.cover_source_url].map(sqlText).join(', ')})`;
  });
  const sql =
    'update public.cities c set cover_url = v.url, cover_thumb_url = v.thumb, cover_attribution = v.attribution, ' +
    'cover_source_url = v.source\nfrom (values\n' +
    `${rows.join(',\n')}\n) as v(slug, url, thumb, attribution, source)\nwhere c.slug = v.slug;\n`;
  const outFile = path.join(root, 'scripts/data/collage-covers.generated.sql');
  writeFileSync(outFile, rows.length ? sql : '-- no collage covers to replace\n');
  console.log(`Replaced ${replacements.size}/${collages.length} collages, wrote ${path.relative(root, outFile)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
