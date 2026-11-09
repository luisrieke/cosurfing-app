/**
 * Photo pipeline: pick -> resize to 1600px (full, private bucket) and 24px (blurred
 * preview, public bucket) -> upload both -> insert the place_photos row.
 * Admin uploads are published right away. User uploads go to {place}/{user}/… and stay
 * 'pending' until an admin approves them; storage RLS only allows users their own folder.
 * Re-encoding to JPEG drops EXIF data (including GPS) from user photos.
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { AVATAR_BUCKET, MENU_BUCKET, PHOTO_BUCKET, PREVIEW_BUCKET, WIFI_BUCKET } from './storage';
import { requireSupabase } from './supabase';
import { TERMS_VERSION } from './terms';
import type { MenuKind } from './types';

export const FULL_WIDTH = 1600;
export const PREVIEW_WIDTH = 24;
export const MAX_USER_PHOTOS_PER_UPLOAD = 5;
export const AVATAR_SIZE = 512;
/** Wide enough that small print on a menu stays readable. */
export const MENU_WIDTH = 1800;
export const MAX_MENU_PHOTOS_PER_UPLOAD = 5;

/**
 * `onSelected` fires as soon as the user has picked files, before they are read and converted
 * (which can take seconds on web, especially for HEIC), so callers can show a spinner right away.
 */
export async function pickImage(onSelected?: (count: number) => void): Promise<string | null> {
  const [uri] = await pickImages(1, onSelected);
  return uri ?? null;
}

export async function pickImages(limit: number, onSelected?: (count: number) => void): Promise<string[]> {
  if (Platform.OS === 'web') return pickImagesOnWeb(limit, onSelected);
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
  const uris = result.assets.slice(0, limit).map((a) => a.uri);
  if (uris.length > 0) onSelected?.(uris.length);
  return uris;
}

/**
 * Own file input instead of expo-image-picker on web: its `image/*` filter hides .heic files on
 * some systems and it rejects files the browser reports without an image MIME type.
 * HEIC/HEIF is converted to JPEG right away, since only Safari can decode it.
 */
function pickImagesOnWeb(limit: number, onSelected?: (count: number) => void): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.heic,.heif';
    input.multiple = limit > 1;
    input.style.display = 'none';
    const finish = (files: File[]) => {
      input.remove();
      const images = files.filter((f) => f.type.startsWith('image/') || isHeicFile(f)).slice(0, limit);
      if (images.length > 0) onSelected?.(images.length);
      Promise.all(images.map(webImageUri)).then(resolve, reject);
    };
    input.addEventListener('change', () => finish(Array.from(input.files ?? [])));
    input.addEventListener('cancel', () => finish([]));
    document.body.appendChild(input);
    input.click();
  });
}

function isHeicFile(file: File): boolean {
  return /^image\/hei[cf](-sequence)?$/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

/**
 * Copies the photo into memory and checks the browser can decode it. A picked File is only read
 * from disk when used, and files handed over by the macOS photo library or iCloud can be gone
 * by the time the form is submitted.
 */
async function webImageUri(file: File): Promise<string> {
  let image: Blob;
  try {
    if (isHeicFile(file)) {
      // ~3 MB of WebAssembly, so only loaded once someone actually picks a HEIC photo.
      const { heicTo } = await import('heic-to');
      image = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.92 });
    } else {
      image = new Blob([await file.arrayBuffer()], { type: file.type });
    }
    (await createImageBitmap(image)).close();
  } catch {
    throw new Error(`"${file.name}" could not be read. Please export it as JPEG and try again.`);
  }
  return URL.createObjectURL(image);
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

export class MenuLimitError extends Error {
  constructor() {
    super('menu_limit_reached');
    this.name = 'MenuLimitError';
  }
}

/** Uploads a menu or opening hours photo to place-menus/{place}/{user}/… and inserts the place_menus row; live right away. */
export async function uploadPlaceMenu(placeId: string, userId: string, sourceUri: string, kind: MenuKind = 'menu'): Promise<void> {
  const sb = requireSupabase();
  const bytes = await readBytes(await resizeToJpeg(sourceUri, MENU_WIDTH, 0.85));
  const path = `${placeId}/${userId}/${randomId()}.jpg`;
  const upload = await sb.storage.from(MENU_BUCKET).upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
  if (upload.error) throw new Error(upload.error.message);
  const { error } = await sb.from('place_menus').insert({
    place_id: placeId,
    user_id: userId,
    path,
    kind,
    rights_accepted_at: new Date().toISOString(),
    terms_version: TERMS_VERSION,
  });
  if (error) {
    await sb.storage.from(MENU_BUCKET).remove([path]);
    if (error.message.includes('menu_limit_reached')) throw new MenuLimitError();
    throw new Error(error.message);
  }
}

export async function deletePlaceMenu(menu: { id: string; path: string }): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from('place_menus').delete().eq('id', menu.id);
  if (error) throw new Error(error.message);
  await sb.storage.from(MENU_BUCKET).remove([menu.path]);
}

export class WifiNoteLimitError extends Error {
  constructor() {
    super('wifi_note_limit_reached');
    this.name = 'WifiNoteLimitError';
  }
}

/** Uploads the optional photo to place-wifi/{place}/{user}/… and inserts the place_wifi_notes row; live right away. */
export async function createWifiNote(
  placeId: string,
  userId: string,
  input: { body: string | null; photoUri: string | null },
): Promise<void> {
  const sb = requireSupabase();
  let path: string | null = null;
  if (input.photoUri) {
    const bytes = await readBytes(await resizeToJpeg(input.photoUri, MENU_WIDTH, 0.85));
    path = `${placeId}/${userId}/${randomId()}.jpg`;
    const upload = await sb.storage.from(WIFI_BUCKET).upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
    if (upload.error) throw new Error(upload.error.message);
  }
  const { error } = await sb.from('place_wifi_notes').insert({
    place_id: placeId,
    user_id: userId,
    body: input.body,
    photo_path: path,
    rights_accepted_at: new Date().toISOString(),
    terms_version: TERMS_VERSION,
  });
  if (error) {
    if (path) await sb.storage.from(WIFI_BUCKET).remove([path]);
    if (error.message.includes('wifi_note_limit_reached')) throw new WifiNoteLimitError();
    throw new Error(error.message);
  }
}

export async function deleteWifiNote(note: { id: string; photo_path: string | null }): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from('place_wifi_notes').delete().eq('id', note.id);
  if (error) throw new Error(error.message);
  if (note.photo_path) await sb.storage.from(WIFI_BUCKET).remove([note.photo_path]);
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
