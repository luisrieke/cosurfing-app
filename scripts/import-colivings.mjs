#!/usr/bin/env node
/**
 * Turns the curated coliving list in scripts/data/colivings.json into one idempotent SQL statement
 * (run it in the Supabase SQL editor or through the Supabase MCP). Colivings are not in
 * OpenStreetMap in any consistent way, so they are researched by hand from each operator's own
 * website; every entry keeps the pages it was checked on in `sources`.
 *
 *   node scripts/import-colivings.mjs > /tmp/colivings.sql
 *   node scripts/import-colivings.mjs --status draft > /tmp/colivings.sql   # import unpublished
 *
 * Each coliving goes to the nearest active city within MAX_CITY_KM. Entries without such a city
 * are skipped and listed in the `skipped` column of the result: add their town to
 * scripts/data/nomad-hotspots.json and import it with import-cities.mjs first.
 * Re-running updates existing colivings (matched by slug) and never touches other places.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const statusArg = args.indexOf('--status');
const STATUS = statusArg >= 0 ? args[statusArg + 1] : 'published';
const MAX_CITY_KM = 40;

if (!['published', 'draft'].includes(STATUS)) throw new Error('--status must be published or draft');

function slugify(input) {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
}

const SEASONS = new Set(['year_round', 'seasonal', 'unknown']);
const ACCESS = new Set(['yes', 'no', 'unknown']);

const entries = JSON.parse(readFileSync(path.join(root, 'scripts/data/colivings.json'), 'utf8'));
const seen = new Set();
const items = entries.map((e) => {
  const town = slugify(e.town);
  let slug = slugify(e.name).includes(town) ? slugify(e.name) : slugify(`${e.name} ${e.town}`);
  if (!/coliv|co-liv/.test(slug)) slug = `${slug}-coliving`;
  if (seen.has(slug)) throw new Error(`Duplicate slug ${slug}`);
  seen.add(slug);
  if (!Number.isFinite(e.lat) || !Number.isFinite(e.lng)) throw new Error(`${e.name}: no coordinates`);
  if (!SEASONS.has(e.season) || !ACCESS.has(e.non_guest_work)) throw new Error(`${e.name}: bad season or access value`);
  return {
    slug,
    name: e.name.slice(0, 120),
    description: e.description ?? null,
    address: e.address ?? (e.region ? `${e.town}, ${e.region}` : e.town),
    lat: e.lat,
    lng: e.lng,
    website: e.website ?? null,
    season: e.season,
    season_note: e.season_note ?? null,
    non_guest_work: e.non_guest_work,
    non_guest_note: e.non_guest_note ?? null,
    min_stay: e.min_stay ?? null,
    checked_on: e.checked_on,
  };
});

const json = JSON.stringify(items).replace(/'/g, "''");

process.stdout.write(`with items as (
  select * from jsonb_to_recordset('${json}'::jsonb) as x(
    slug text, name text, description text, address text, lat double precision, lng double precision,
    website text, season text, season_note text, non_guest_work text, non_guest_note text, min_stay text,
    checked_on date
  )
),
located as (
  select i.*, c.id as city_id
    from items i
    left join lateral (
      select c.id from public.cities c
       where c.status = 'active'
         and public.approx_distance_km(c.lat, c.lng, i.lat, i.lng) <= ${MAX_CITY_KM}
       order by public.approx_distance_km(c.lat, c.lng, i.lat, i.lng)
       limit 1
    ) c on true
),
upserted as (
  insert into public.places (
    city_id, slug, name, category, status, source, description, address, lat, lng, website,
    season, season_note, non_guest_work, non_guest_note, min_stay, last_verified_at
  )
  select city_id, slug, name, 'coliving', '${STATUS}', 'admin', description, address, lat, lng, website,
         season, season_note, non_guest_work, non_guest_note, min_stay, checked_on
    from located
   where city_id is not null
  on conflict (slug) do update set
    city_id = excluded.city_id,
    name = excluded.name,
    description = excluded.description,
    address = excluded.address,
    lat = excluded.lat,
    lng = excluded.lng,
    website = excluded.website,
    season = excluded.season,
    season_note = excluded.season_note,
    non_guest_work = excluded.non_guest_work,
    non_guest_note = excluded.non_guest_note,
    min_stay = excluded.min_stay,
    last_verified_at = excluded.last_verified_at
   where places.category = 'coliving' and places.source = 'admin'
  returning slug
)
select (select count(*) from upserted) as upserted,
       (select coalesce(json_agg(l.slug), '[]'::json) from located l where l.city_id is null) as skipped,
       (select coalesce(json_agg(l.slug), '[]'::json) from located l
         where l.city_id is not null and not exists (select 1 from upserted u where u.slug = l.slug)) as slug_taken;
`);
