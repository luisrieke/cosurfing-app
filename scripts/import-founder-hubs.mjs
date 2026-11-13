#!/usr/bin/env node
/**
 * Turns the curated list of founder hubs in scripts/data/founder-hubs.json (startup campuses and
 * founder communities such as STATION F, J floor, Founders House and The Sandbox) into one
 * idempotent SQL statement (run it in the Supabase SQL editor or through the Supabase MCP).
 *
 *   node scripts/import-founder-hubs.mjs > /tmp/founder-hubs.sql
 *
 * Founder hubs are not a category of their own: they are coworking spaces whose `access` is
 * "members" and whose access note says how to get in. They are researched by hand from each hub's
 * own pages; every entry keeps the pages it was checked on in `sources`.
 *
 * - An entry with `existing_slug` updates a place that is on the map already (for example one
 *   found in OpenStreetMap): description, website, access and last check date.
 * - Every other entry is added as a published coworking space in the nearest active city within
 *   MAX_CITY_KM. Entries without such a city are listed in the `skipped` column of the result:
 *   add their town to scripts/data/nomad-hotspots.json and import it with import-cities.mjs first.
 * - Re-running updates the entries again, but only places with source "admin" (or the existing
 *   place named in `existing_slug`); other places are never touched.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_CITY_KM = 40;
const ACCESS = new Set(['open', 'registration', 'application', 'members']);

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

const entries = JSON.parse(readFileSync(path.join(root, 'scripts/data/founder-hubs.json'), 'utf8'));
const seen = new Set();
const items = entries.map((e) => {
  const slug = e.existing_slug ?? e.slug ?? slugify(`${e.name} ${e.town}`);
  if (seen.has(slug)) throw new Error(`Duplicate slug ${slug}`);
  seen.add(slug);
  if (!Number.isFinite(e.lat) || !Number.isFinite(e.lng)) throw new Error(`${e.name}: no coordinates`);
  if (!ACCESS.has(e.access)) throw new Error(`${e.name}: bad access value`);
  if (e.access_note && e.access_note.length > 200) throw new Error(`${e.name}: access_note is longer than 200 characters`);
  return {
    slug,
    existing: Boolean(e.existing_slug),
    name: e.name.slice(0, 120),
    description: e.description ?? null,
    address: e.address,
    lat: e.lat,
    lng: e.lng,
    website: e.website ?? null,
    access: e.access,
    access_note: e.access_note ?? null,
    checked_on: e.checked_on,
  };
});

const json = JSON.stringify(items).replace(/'/g, "''");

process.stdout.write(`with items as (
  select * from jsonb_to_recordset('${json}'::jsonb) as x(
    slug text, existing boolean, name text, description text, address text, lat double precision,
    lng double precision, website text, access text, access_note text, checked_on date
  )
),
updated as (
  update public.places p
     set description = i.description,
         website = i.website,
         access = i.access,
         access_note = i.access_note,
         last_verified_at = i.checked_on
    from items i
   where i.existing and p.slug = i.slug
  returning p.slug
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
   where not i.existing
),
upserted as (
  insert into public.places (
    city_id, slug, name, category, status, source, description, address, lat, lng, website,
    access, access_note, last_verified_at
  )
  select city_id, slug, name, 'coworking', 'published', 'admin', description, address, lat, lng, website,
         access, access_note, checked_on
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
    access = excluded.access,
    access_note = excluded.access_note,
    last_verified_at = excluded.last_verified_at
   where places.category = 'coworking' and places.source = 'admin'
  returning slug
)
select (select coalesce(json_agg(u.slug), '[]'::json) from updated u) as updated,
       (select coalesce(json_agg(u.slug), '[]'::json) from upserted u) as upserted,
       (select coalesce(json_agg(l.slug), '[]'::json) from located l where l.city_id is null) as skipped,
       (select coalesce(json_agg(l.slug), '[]'::json) from located l
         where l.city_id is not null and not exists (select 1 from upserted u where u.slug = l.slug)) as slug_taken;
`);
