import type { CitySearchResult } from './types';

/**
 * City lookup through Photon (OpenStreetMap data, no API key, generous fair-use limits).
 * Results are limited to populated places so users can pick any city, town or village.
 */
const PHOTON_URL = 'https://photon.komoot.io/api/';

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    country?: string;
    countrycode?: string;
    state?: string;
    county?: string;
    osm_value?: string;
    osm_key?: string;
    type?: string;
  };
}

const allowedTypes = new Set(['city', 'town', 'village', 'municipality', 'borough', 'hamlet']);

export async function searchCities(query: string, signal?: AbortSignal): Promise<CitySearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const params = new URLSearchParams({ q, limit: '10', lang: 'en' });
  // Photon accepts repeated osm_tag params as an include filter.
  const url = `${PHOTON_URL}?${params.toString()}&osm_tag=place:city&osm_tag=place:town&osm_tag=place:village&osm_tag=place:municipality`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`City search failed (${res.status})`);
  const json = (await res.json()) as { features?: PhotonFeature[] };
  const seen = new Set<string>();
  const results: CitySearchResult[] = [];
  for (const f of json.features ?? []) {
    const p = f.properties;
    if (!p.name || !p.countrycode || !p.country) continue;
    if (p.osm_key === 'place' && p.osm_value && !allowedTypes.has(p.osm_value)) continue;
    const key = `${p.name.toLowerCase()}|${p.countrycode.toUpperCase()}|${p.state ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      name: p.name,
      countryCode: p.countrycode.toUpperCase(),
      countryName: p.country,
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
      region: p.state,
    });
    if (results.length >= 6) break;
  }
  return results;
}

/** Small, stable list for the manual fallback (ISO 3166-1 alpha-2). Extend freely. */
export const countries: { code: string; name: string }[] = [
  { code: 'AL', name: 'Albania' },
  { code: 'AR', name: 'Argentina' },
  { code: 'AT', name: 'Austria' },
  { code: 'AU', name: 'Australia' },
  { code: 'BE', name: 'Belgium' },
  { code: 'BG', name: 'Bulgaria' },
  { code: 'BR', name: 'Brazil' },
  { code: 'CA', name: 'Canada' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'CL', name: 'Chile' },
  { code: 'CO', name: 'Colombia' },
  { code: 'CR', name: 'Costa Rica' },
  { code: 'CY', name: 'Cyprus' },
  { code: 'CZ', name: 'Czechia' },
  { code: 'DE', name: 'Germany' },
  { code: 'DK', name: 'Denmark' },
  { code: 'EE', name: 'Estonia' },
  { code: 'EG', name: 'Egypt' },
  { code: 'ES', name: 'Spain' },
  { code: 'FI', name: 'Finland' },
  { code: 'FR', name: 'France' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'GE', name: 'Georgia' },
  { code: 'GR', name: 'Greece' },
  { code: 'HR', name: 'Croatia' },
  { code: 'HU', name: 'Hungary' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'IE', name: 'Ireland' },
  { code: 'IL', name: 'Israel' },
  { code: 'IN', name: 'India' },
  { code: 'IS', name: 'Iceland' },
  { code: 'IT', name: 'Italy' },
  { code: 'JP', name: 'Japan' },
  { code: 'KE', name: 'Kenya' },
  { code: 'KR', name: 'South Korea' },
  { code: 'LT', name: 'Lithuania' },
  { code: 'LU', name: 'Luxembourg' },
  { code: 'LV', name: 'Latvia' },
  { code: 'MA', name: 'Morocco' },
  { code: 'ME', name: 'Montenegro' },
  { code: 'MT', name: 'Malta' },
  { code: 'MX', name: 'Mexico' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'NO', name: 'Norway' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'PE', name: 'Peru' },
  { code: 'PH', name: 'Philippines' },
  { code: 'PL', name: 'Poland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'RO', name: 'Romania' },
  { code: 'RS', name: 'Serbia' },
  { code: 'SE', name: 'Sweden' },
  { code: 'SG', name: 'Singapore' },
  { code: 'SI', name: 'Slovenia' },
  { code: 'SK', name: 'Slovakia' },
  { code: 'TH', name: 'Thailand' },
  { code: 'TR', name: 'Türkiye' },
  { code: 'TW', name: 'Taiwan' },
  { code: 'UA', name: 'Ukraine' },
  { code: 'US', name: 'United States' },
  { code: 'UY', name: 'Uruguay' },
  { code: 'VN', name: 'Vietnam' },
  { code: 'ZA', name: 'South Africa' },
];

export function countryName(code: string): string {
  return countries.find((c) => c.code === code.toUpperCase())?.name ?? code.toUpperCase();
}
