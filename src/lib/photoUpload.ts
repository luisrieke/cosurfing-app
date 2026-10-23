/**
 * Admin photo pipeline: pick -> resize to 1600px (full, private bucket) and 24px (blurred
 * preview, public bucket) -> upload both -> insert the place_photos row.
 * Storage RLS restricts uploads to admins; the tiny preview is what free users see for cafés.
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { PHOTO_BUCKET, PREVIEW_BUCKET } from './storage';
import { requireSupabase } from './supabase';

export const FULL_WIDTH = 1600;
export const PREVIEW_WIDTH = 24;

export async function pickImage(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error('Photo library access was denied.');
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    allowsMultipleSelection: false,
    exif: false,
  });
  if (result.canceled || !result.assets[0]) return null;
  return result.assets[0].uri;
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

export async function uploadPlacePhoto(placeId: string, sourceUri: string, sortOrder: number): Promise<UploadedPhoto> {
  const sb = requireSupabase();
  const [fullUri, previewUri] = await Promise.all([
    resizeToJpeg(sourceUri, FULL_WIDTH, 0.82),
    resizeToJpeg(sourceUri, PREVIEW_WIDTH, 0.6),
  ]);
  const [fullBytes, previewBytes] = await Promise.all([readBytes(fullUri), readBytes(previewUri)]);
  const path = `${placeId}/${randomId()}.jpg`;

  const full = await sb.storage.from(PHOTO_BUCKET).upload(path, fullBytes, { contentType: 'image/jpeg', upsert: false });
  if (full.error) throw new Error(full.error.message);
  const preview = await sb.storage.from(PREVIEW_BUCKET).upload(path, previewBytes, { contentType: 'image/jpeg', upsert: false });
  if (preview.error) {
    await sb.storage.from(PHOTO_BUCKET).remove([path]);
    throw new Error(preview.error.message);
  }

  const { data, error } = await sb
    .from('place_photos')
    .insert({ place_id: placeId, full_path: path, preview_path: path, sort_order: sortOrder })
    .select('id, full_path, preview_path, sort_order')
    .single();
  if (error) {
    await Promise.all([sb.storage.from(PHOTO_BUCKET).remove([path]), sb.storage.from(PREVIEW_BUCKET).remove([path])]);
    throw new Error(error.message);
  }
  return data as UploadedPhoto;
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
