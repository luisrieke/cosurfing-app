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

/** Rough bounding box around a center for quick "in city" checks. */
export function withinKm(center: LatLng, point: LatLng, km: number): boolean {
  return distanceKm(center, point) <= km;
}
