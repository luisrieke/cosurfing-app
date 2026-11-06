import type { MapCity } from '@/lib/types';

import type { MapBounds, MapCluster } from './types';

/** Grid cell size in screen pixels; cities closer than this on screen share one bubble. */
const CELL_PX = 72;
/** City names are only drawn from this zoom on; below it the labels would overlap. */
const LABEL_MIN_ZOOM = 5;

export function clusterSize(count: number): number {
  return Math.round(Math.min(64, 30 + Math.log10(Math.max(count, 1)) * 12));
}

export function clusterCountLabel(count: number): string {
  if (count < 1000) return String(count);
  return `${(count / 1000).toFixed(count >= 10_000 ? 0 : 1)}k`;
}

/** Web Mercator, normalized to 0..1 on both axes. */
function project(lat: number, lng: number): { x: number; y: number } {
  const s = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999);
  return { x: (lng + 180) / 360, y: 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI) };
}

function unproject(x: number, y: number): { lat: number; lng: number } {
  const n = Math.PI - 2 * Math.PI * y;
  return { lat: (180 / Math.PI) * Math.atan(Math.sinh(n)), lng: x * 360 - 180 };
}

function inBounds(c: MapCity, b: MapBounds): boolean {
  const padLat = (b.north - b.south) * 0.2;
  if (c.lat < b.south - padLat || c.lat > b.north + padLat) return false;
  if (b.west > b.east) return true;
  const padLng = (b.east - b.west) * 0.2;
  return c.lng >= b.west - padLng && c.lng <= b.east + padLng;
}

/**
 * Groups cities into bubbles on a fixed screen-space grid per whole zoom level. The grid is
 * anchored to the world, not the viewport, so bubbles stay put while panning.
 */
export function clusterCities(cities: MapCity[], zoom: number, bounds: MapBounds, detailZoom: number): MapCluster[] {
  const level = Math.max(0, Math.floor(zoom));
  const cell = CELL_PX / (256 * 2 ** level);
  const groups = new Map<string, { x: number; y: number; weight: number; count: number; top: MapCity; cities: number }>();

  for (const c of cities) {
    if (c.place_count <= 0 || !inBounds(c, bounds)) continue;
    const p = project(c.lat, c.lng);
    const key = `${level}:${Math.floor(p.x / cell)}:${Math.floor(p.y / cell)}`;
    const g = groups.get(key);
    if (!g) {
      groups.set(key, { x: p.x * c.place_count, y: p.y * c.place_count, weight: c.place_count, count: c.place_count, top: c, cities: 1 });
      continue;
    }
    g.x += p.x * c.place_count;
    g.y += p.y * c.place_count;
    g.weight += c.place_count;
    g.count += c.place_count;
    g.cities += 1;
    if (c.place_count > g.top.place_count) g.top = c;
  }

  return [...groups.entries()].map(([id, g]) => {
    const center = unproject(g.x / g.weight, g.y / g.weight);
    const single = g.cities === 1;
    const label = level < LABEL_MIN_ZOOM ? null : single ? g.top.name : `${g.top.name} +${g.cities - 1}`;
    const target = single
      ? { lat: g.top.lat, lng: g.top.lng, zoom: Math.max(g.top.zoom || 12, detailZoom + 2) }
      : { ...center, zoom: Math.min(level + 3, detailZoom + 2) };
    return { id, lat: center.lat, lng: center.lng, count: g.count, label, target };
  });
}
