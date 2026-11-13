#!/usr/bin/env node
/**
 * Turns scripts/data/flex-offices.json (locations of flexible-office chains such as Design Offices
 * and WeWork, taken from each operator's own website and geocoded) into one idempotent SQL
 * statement (run it in the Supabase SQL editor or through the Supabase MCP).
 *
 *   node scripts/import-flex-offices.mjs > /tmp/flex-offices.sql
 *   node scripts/import-flex-offices.mjs some-other-list.json > /tmp/flex-offices.sql
 *
 * A location that is already on the map (a place within 250 m whose name looks like the chain, or
 * with the same street address) is left alone. The rest is added as a published coworking space
 * with access "members", in the nearest active city within MAX_CITY_KM. Entries without such a
 * city are listed in the `skipped` column of the result. Re-running never changes places that
 * exist already.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_CITY_KM = 40;

/** What the name of an existing place looks like, and the note shown on the place page, per chain. */
const CHAINS = {
  'design-offices': {
    name_re: '(design ?offices|macherei)',
    note: 'Memberships, flexible desks and offices are booked with the operator. Ask about day passes before you come.',
  },
  wework: {
    name_re: '(we ?work)',
    note: 'Memberships, day passes and offices are booked through WeWork. Check the app or website before you come.',
  },
};

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

const entries = JSON.parse(readFileSync(process.argv[2] ?? path.join(root, 'scripts/data/flex-offices.json'), 'utf8'));
const seen = new Set();
const items = entries.map((e) => {
  if (!CHAINS[e.chain]) throw new Error(`${e.name}: unknown chain ${e.chain}`);
  if (!Number.isFinite(e.lat) || !Number.isFinite(e.lng)) throw new Error(`${e.name}: no coordinates`);
  const slug = slugify(e.name);
  if (seen.has(slug)) throw new Error(`Duplicate slug ${slug}`);
  seen.add(slug);
  return {
    slug,
    chain: e.chain,
    name: e.name.slice(0, 120),
    address: `${e.street}, ${[e.postal, e.town].filter(Boolean).join(' ')}`,
    street_key: slugify(e.street).replace(/-/g, ''),
    lat: e.lat,
    lng: e.lng,
    website: e.website ?? null,
    checked_on: e.checked_on,
  };
});

const json = JSON.stringify(items).replace(/'/g, "''");
const chainsJson = JSON.stringify(Object.entries(CHAINS).map(([chain, c]) => ({ chain, ...c }))).replace(/'/g, "''");

process.stdout.write(`with chains as (
  select * from jsonb_to_recordset('${chainsJson}'::jsonb) as x(chain text, name_re text, note text)
),
items as (
  select x.*, c.name_re as chain_re, c.note as access_note
    from jsonb_to_recordset('${json}'::jsonb) as x(
      slug text, chain text, name text, address text, street_key text, lat double precision,
      lng double precision, website text, checked_on date
    )
    join chains c on c.chain = x.chain
),
fresh as (
  select i.* from items i
   where not exists (
     select 1 from public.places p
      where p.name ~* ('^' || i.chain_re)
        and (
          public.approx_distance_km(p.lat, p.lng, i.lat, i.lng) <= 0.25
          or regexp_replace(replace(lower(extensions.unaccent(coalesce(p.address, ''))), 'ß', 'ss'), '[^a-z0-9]', '', 'g') like '%' || i.street_key || '%'
        )
   )
),
located as (
  select f.*, c.id as city_id
    from fresh f
    left join lateral (
      select c.id from public.cities c
       where c.status = 'active'
         and public.approx_distance_km(c.lat, c.lng, f.lat, f.lng) <= ${MAX_CITY_KM}
       order by public.approx_distance_km(c.lat, c.lng, f.lat, f.lng)
       limit 1
    ) c on true
),
inserted as (
  insert into public.places (
    city_id, slug, name, category, status, source, address, lat, lng, website, access, access_note, last_verified_at
  )
  select city_id, slug, name, 'coworking', 'published', 'admin', address, lat, lng, website, 'members', access_note, checked_on
    from located
   where city_id is not null
  on conflict (slug) do nothing
  returning slug
)
select (select count(*) from items) as listed,
       (select count(*) from fresh) as missing_on_map,
       (select coalesce(json_agg(i.slug), '[]'::json) from inserted i) as inserted,
       (select coalesce(json_agg(l.slug), '[]'::json) from located l where l.city_id is null) as skipped;
`);
