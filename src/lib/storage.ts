import AsyncStorage from '@react-native-async-storage/async-storage';

import { env } from './env';
import { supabase } from './supabase';

export const PREVIEW_BUCKET = 'place-previews';
export const PHOTO_BUCKET = 'place-photos';
export const AVATAR_BUCKET = 'avatars';
export const MENU_BUCKET = 'place-menus';
export const WIFI_BUCKET = 'place-wifi';
export const CITY_COVER_BUCKET = 'city-covers';

export function previewUrl(path: string): string {
  return `${env.supabaseUrl}/storage/v1/object/public/${PREVIEW_BUCKET}/${path}`;
}

export function avatarUrl(path: string): string {
  return `${env.supabaseUrl}/storage/v1/object/public/${AVATAR_BUCKET}/${path}`;
}

export function menuUrl(path: string): string {
  return `${env.supabaseUrl}/storage/v1/object/public/${MENU_BUCKET}/${path}`;
}

/** Member-submitted city covers; once approved this URL becomes `cities.cover_url`. */
export function cityCoverFileUrl(path: string): string {
  return `${env.supabaseUrl}/storage/v1/object/public/${CITY_COVER_BUCKET}/${path}`;
}

/** City covers are hosted on Wikimedia or (member submissions) Supabase Storage; serving them through our Netlify Image CDN keeps visitors' IPs away from third parties. Only hosts allowed in netlify.toml `remote_images` work. */
export function coverUrl(url: string, width: number): string {
  return `${env.siteUrl.replace(/\/$/, '')}/.netlify/images?url=${encodeURIComponent(url)}&w=${width}&q=75`;
}

/** Uploaded objects get random, never-reused paths, so their content never changes. */
export const UPLOAD_CACHE_CONTROL = '31536000';

/**
 * Signed URLs for full-resolution photos. Storage RLS only signs objects the caller may read
 * (approved photos of published places, plus the caller's own uploads).
 * URLs are reused across fetches and app restarts: every new signature is a new URL, which
 * would bypass the browser and expo-image caches and download the photo again.
 */
export async function signedPhotoUrls(paths: string[]): Promise<Map<string, string>> {
  return signedUrls(PHOTO_BUCKET, paths, 7 * 24 * 3600, true);
}

/** Wi-Fi photos (QR codes, password signs) are only readable for signed-in members, so their URLs are never persisted. */
export async function signedWifiUrls(paths: string[]): Promise<Map<string, string>> {
  return signedUrls(WIFI_BUCKET, paths, 3600, false);
}

interface SignedEntry {
  url: string;
  expiresAt: number;
}

const PERSIST_KEY = 'signed-photo-urls-v1';
const MAX_PERSISTED = 1000;
/** A URL that expires sooner than this is re-signed, so an open page never ends up with a dead image. */
const MIN_REMAINING_MS = 30 * 60 * 1000;

const signedCache = new Map<string, SignedEntry>();
let persistedLoaded: Promise<void> | null = null;

function loadPersisted(): Promise<void> {
  persistedLoaded ??= AsyncStorage.getItem(PERSIST_KEY)
    .then((raw) => {
      if (!raw) return;
      const now = Date.now();
      for (const [key, entry] of Object.entries(JSON.parse(raw) as Record<string, SignedEntry>)) {
        if (entry.expiresAt > now && !signedCache.has(key)) signedCache.set(key, entry);
      }
    })
    .catch(() => undefined);
  return persistedLoaded;
}

function savePersisted(): void {
  const now = Date.now();
  const prefix = `${PHOTO_BUCKET}/`;
  const entries = [...signedCache].filter(([key, e]) => key.startsWith(prefix) && e.expiresAt > now).slice(-MAX_PERSISTED);
  AsyncStorage.setItem(PERSIST_KEY, JSON.stringify(Object.fromEntries(entries))).catch(() => undefined);
}

async function signedUrls(bucket: string, paths: string[], expiresIn: number, persist: boolean): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!supabase || paths.length === 0) return map;
  if (persist) await loadPersisted();

  const minExpiry = Date.now() + MIN_REMAINING_MS;
  const missing: string[] = [];
  for (const path of new Set(paths)) {
    const cached = signedCache.get(`${bucket}/${path}`);
    if (cached && cached.expiresAt > minExpiry) map.set(path, cached.url);
    else missing.push(path);
  }
  if (missing.length === 0) return map;

  const expiresAt = Date.now() + expiresIn * 1000;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(missing, expiresIn);
  if (error || !data) return map;
  for (const item of data) {
    if (!item.path || !item.signedUrl || item.error) continue;
    map.set(item.path, item.signedUrl);
    signedCache.delete(`${bucket}/${item.path}`);
    signedCache.set(`${bucket}/${item.path}`, { url: item.signedUrl, expiresAt });
  }
  if (persist) savePersisted();
  return map;
}
