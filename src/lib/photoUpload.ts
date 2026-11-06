/**
 * Photo pipeline: pick -> resize to 1600px (full, private bucket) and 24px (blurred
 * preview, public bucket) -> upload both -> insert the place_photos row.
 * Admin uploads are published right away. User uploads go to {place}/{user}/… and stay
 * 'pending' until an admin approves them; storage RLS only allows users their own folder.
 * Re-encoding to JPEG drops EXIF data (including GPS) from user photos.
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { AVATAR_BUCKET, PHOTO_BUCKET, PREVIEW_BUCKET } from './storage';
import { requireSupabase } from './supabase';
import { TERMS_VERSION } from './terms';

export const FULL_WIDTH = 1600;
export const PREVIEW_WIDTH = 24;
export const MAX_USER_PHOTOS_PER_UPLOAD = 5;
export const AVATAR_SIZE = 512;

export async function pickImage(): Promise<string | null> {
  const [uri] = await pickImages(1);
  return uri ?? null;
}

export async function pickImages(limit: number): Promise<string[]> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error('Photo library access was denied.');
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
    exif: false,
  });
  if (result.canceled) return [];
  return result.assets.slice(0, limit).map((a) => a.uri);
}

async function resizeToJpeg(uri: string, width: number, compress: number): Promise<string> {
  const image = await ImageManipulator.manipulate(uri).resize({ width }).renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress });
  return saved.uri;
}

async function readBytes(uri: string): Promise<ArrayBuffer> {
  const res = await fetch(uri);
  return res.arrayBuffer();
}

function randomId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface UploadedPhoto {
  id: string;
  full_path: string;
  preview_path: string;
  sort_order: number;
}

export interface UploadAsUser {
  /** Uploading user; the photo is stored in their folder and waits for review. */
  userId: string;
  /** When the user accepted the Terms (usage rights for the photo). */
  rightsAcceptedAt: string;
}

export async function uploadPlacePhoto(
  placeId: string,
  sourceUri: string,
  sortOrder: number,
  asUser?: UploadAsUser,
): Promise<UploadedPhoto> {
  const sb = requireSupabase();
  const [fullUri, previewUri] = await Promise.all([
    resizeToJpeg(sourceUri, FULL_WIDTH, 0.82),
    resizeToJpeg(sourceUri, PREVIEW_WIDTH, 0.6),
  ]);
  const [fullBytes, previewBytes] = await Promise.all([readBytes(fullUri), readBytes(previewUri)]);
  const path = asUser ? `${placeId}/${asUser.userId}/${randomId()}.jpg` : `${placeId}/${randomId()}.jpg`;

  const full = await sb.storage.from(PHOTO_BUCKET).upload(path, fullBytes, { contentType: 'image/jpeg', upsert: false });
  if (full.error) throw new Error(full.error.message);
  const preview = await sb.storage.from(PREVIEW_BUCKET).upload(path, previewBytes, { contentType: 'image/jpeg', upsert: false });
  if (preview.error) {
    await sb.storage.from(PHOTO_BUCKET).remove([path]);
    throw new Error(preview.error.message);
  }

  const row: Record<string, unknown> = { place_id: placeId, full_path: path, preview_path: path, sort_order: sortOrder };
  if (asUser) {
    row.uploaded_by = asUser.userId;
    row.status = 'pending';
    row.rights_accepted_at = asUser.rightsAcceptedAt;
    row.terms_version = TERMS_VERSION;
  }
  const { data, error } = await sb.from('place_photos').insert(row).select('id, full_path, preview_path, sort_order').single();
  if (error) {
    await Promise.all([sb.storage.from(PHOTO_BUCKET).remove([path]), sb.storage.from(PREVIEW_BUCKET).remove([path])]);
    throw new Error(error.message);
  }
  return data as UploadedPhoto;
}

/** Center-crops to a square, uploads to avatars/{user}/… and returns the storage path. */
export async function uploadAvatar(userId: string, sourceUri: string): Promise<string> {
  const sb = requireSupabase();
  const original = await ImageManipulator.manipulate(sourceUri).renderAsync();
  const side = Math.min(original.width, original.height);
  const image = await ImageManipulator.manipulate(sourceUri)
    .crop({ originX: (original.width - side) / 2, originY: (original.height - side) / 2, width: side, height: side })
    .resize({ width: Math.min(side, AVATAR_SIZE) })
    .renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
  const bytes = await readBytes(saved.uri);
  const path = `${userId}/${randomId()}.jpg`;
  const { error } = await sb.storage.from(AVATAR_BUCKET).upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

export async function deleteAvatar(path: string): Promise<void> {
  await requireSupabase().storage.from(AVATAR_BUCKET).remove([path]);
}

export async function deletePlacePhoto(photo: { id: string; full_path: string; preview_path: string }): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from('place_photos').delete().eq('id', photo.id);
  if (error) throw new Error(error.message);
  await Promise.all([
    sb.storage.from(PHOTO_BUCKET).remove([photo.full_path]),
    sb.storage.from(PREVIEW_BUCKET).remove([photo.preview_path]),
  ]);
}
