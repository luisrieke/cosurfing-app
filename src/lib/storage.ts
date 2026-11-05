import { env } from './env';
import { supabase } from './supabase';

export const PREVIEW_BUCKET = 'place-previews';
export const PHOTO_BUCKET = 'place-photos';
export const AVATAR_BUCKET = 'avatars';

export function previewUrl(path: string): string {
  return `${env.supabaseUrl}/storage/v1/object/public/${PREVIEW_BUCKET}/${path}`;
}

export function avatarUrl(path: string): string {
  return `${env.supabaseUrl}/storage/v1/object/public/${AVATAR_BUCKET}/${path}`;
}

/**
 * Signed URLs for full-resolution photos. Storage RLS only signs objects the caller may read
 * (approved photos of published places, plus the caller's own uploads).
 */
export async function signedPhotoUrls(paths: string[], expiresIn = 3600): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!supabase || paths.length === 0) return map;
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, expiresIn);
  if (error || !data) return map;
  for (const item of data) {
    if (item.path && item.signedUrl && !item.error) map.set(item.path, item.signedUrl);
  }
  return map;
}
