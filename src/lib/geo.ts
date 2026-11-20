import { Linking, Platform } from 'react-native';

import type { LatLng } from './types';

const EARTH_RADIUS_KM = 6371;

export function distanceKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

export function directionsUrl(target: LatLng, label: string): string {
  const q = `${target.lat},${target.lng}`;
  const encodedLabel = encodeURIComponent(label);
  if (Platform.OS === 'ios') {
    return `maps://?daddr=${q}&q=${encodedLabel}`;
  }
  if (Platform.OS === 'android') {
    return `geo:0,0?q=${q}(${encodedLabel})`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${q}`;
}

export async function openDirections(target: LatLng, label: string): Promise<void> {
  const url = directionsUrl(target, label);
  const fallback = `https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}`;
  try {
    const supported = Platform.OS === 'web' ? true : await Linking.canOpenURL(url);
    await Linking.openURL(supported ? url : fallback);
  } catch {
    await Linking.openURL(fallback);
  }
}

/**
 * Center and web-map zoom that fit a box into a viewport of the given size (a phone by default), for
 * links that can only carry a center and a zoom.
 */
export function boundsView(
  b: { south: number; north: number; west: number; east: number },
  size: { width: number; height: number } = { width: 360, height: 480 },
): { center: LatLng; zoom: number } {
  const center = { lat: (b.south + b.north) / 2, lng: (b.west + b.east) / 2 };
  const lngSpan = Math.max(b.east - b.west, 0.01);
  const latSpan = Math.max(b.north - b.south, 0.01);
  const zoomLng = Math.log2((360 * size.width) / (256 * lngSpan));
  const zoomLat = Math.log2((360 * Math.cos((center.lat * Math.PI) / 180) * size.height) / (256 * latSpan));
  const zoom = Math.min(13, Math.max(3, Math.min(zoomLng, zoomLat)));
  return { center, zoom: Math.floor(zoom * 10) / 10 };
}

/** Rough bounding box around a center for quick "in city" checks. */
export function withinKm(center: LatLng, point: LatLng, km: number): boolean {
  return distanceKm(center, point) <= km;
}
