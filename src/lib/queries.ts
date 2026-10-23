import { env } from './env';
import { previewUrl, signedPhotoUrls } from './storage';
import { requireSupabase } from './supabase';
import type {
  City,
  Entitlement,
  Place,
  PlaceFilters,
  PlacePhoto,
  PlaceReport,
  PlaceReview,
  PlaceSuggestion,
  Profile,
  PublicPlace,
  WaitlistEntry,
} from './types';

function throwIf(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Cities
// ---------------------------------------------------------------------------

export async function getActiveCities(): Promise<City[]> {
  const { data, error } = await requireSupabase()
    .from('cities')
    .select('*')
    .eq('status', 'active')
    .order('name');
  throwIf(error);
  return (data ?? []) as City[];
}

export async function getAllCities(): Promise<City[]> {
  const { data, error } = await requireSupabase().from('cities').select('*').order('name');
  throwIf(error);
  return (data ?? []) as City[];
}

export async function getCityBySlug(slug: string): Promise<City | null> {
  const { data, error } = await requireSupabase()
    .from('cities')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  throwIf(error);
  return (data as City | null) ?? null;
}

export async function findCityByNameAndCountry(name: string, countryCode: string): Promise<City | null> {
  const { data, error } = await requireSupabase()
    .from('cities')
    .select('*')
    .ilike('name', name.trim())
    .eq('country_code', countryCode.toUpperCase())
    .maybeSingle();
  throwIf(error);
  return (data as City | null) ?? null;
}

// ---------------------------------------------------------------------------
// Places
// ---------------------------------------------------------------------------

interface PlaceRowWithPhotos extends Place {
  place_photos: { id: string; preview_path: string; full_path: string; sort_order: number }[];
}

function toPublicPlace(row: PlaceRowWithPhotos, fullUrls: Map<string, string>, canSeeCafePhotos: boolean): PublicPlace {
  const photos = [...(row.place_photos ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const cover = photos[0];
  const { place_photos: _photos, ...place } = row;
  const locked = row.category === 'cafe' && !canSeeCafePhotos;
  const full = cover ? fullUrls.get(cover.full_path) : undefined;
  return {
    ...place,
    cover_preview_url: cover ? previewUrl(cover.preview_path) : null,
    cover_full_url: !locked && full ? full : null,
    cover_photo_locked: Boolean(cover) && locked,
  };
}

export async function getPlacesForCity(
  cityId: string,
  filters: PlaceFilters,
  canSeeCafePhotos: boolean,
): Promise<PublicPlace[]> {
  let query = requireSupabase()
    .from('places')
    .select('*, place_photos(id, preview_path, full_path, sort_order)')
    .eq('city_id', cityId)
    .eq('status', 'published')
    .order('name');
  if (!env.showExamplePlaces) query = query.eq('is_example', false);
  if (filters.category !== 'all') query = query.eq('category', filters.category);
  if (filters.wifi) query = query.eq('wifi', 'yes');
  if (filters.power) query = query.in('power_outlets', ['plenty', 'some']);
  if (filters.calls) query = query.in('calls', ['yes', 'limited']);
  const { data, error } = await query;
  throwIf(error);
  const rows = (data ?? []) as PlaceRowWithPhotos[];
  const pathsToSign = rows
    .filter((r) => r.place_photos?.length && (r.category === 'coworking' || canSeeCafePhotos))
    .map((r) => [...r.place_photos].sort((a, b) => a.sort_order - b.sort_order)[0]!.full_path);
  const fullUrls = await signedPhotoUrls(pathsToSign);
  return rows.map((r) => toPublicPlace(r, fullUrls, canSeeCafePhotos));
}

export async function getPlaceBySlug(slug: string): Promise<(Place & { city: City }) | null> {
  const { data, error } = await requireSupabase()
    .from('places')
    .select('*, city:cities(*)')
    .eq('slug', slug)
    .maybeSingle();
  throwIf(error);
  return (data as (Place & { city: City }) | null) ?? null;
}

export async function getPlaceById(id: string): Promise<Place | null> {
  const { data, error } = await requireSupabase().from('places').select('*').eq('id', id).maybeSingle();
  throwIf(error);
  return (data as Place | null) ?? null;
}

export async function getPlacePhotos(placeId: string): Promise<PlacePhoto[]> {
  const { data, error } = await requireSupabase().rpc('get_place_photos', { p_place_id: placeId });
  throwIf(error);
  const rows = (data ?? []) as {
    id: string;
    sort_order: number;
    preview_path: string;
    full_path: string | null;
    locked: boolean;
  }[];
  const signed = await signedPhotoUrls(rows.map((r) => r.full_path).filter((p): p is string => Boolean(p)));
  return rows.map((r) => ({
    id: r.id,
    place_id: placeId,
    sort_order: r.sort_order,
    preview_url: previewUrl(r.preview_path),
    full_path: r.full_path,
    full_url: r.full_path ? (signed.get(r.full_path) ?? null) : null,
    locked: r.locked,
  }));
}

export async function getPlaceReviews(placeId: string): Promise<PlaceReview[]> {
  const { data, error } = await requireSupabase().rpc('get_place_reviews', { p_place_id: placeId });
  throwIf(error);
  return (data ?? []) as PlaceReview[];
}

// ---------------------------------------------------------------------------
// Profile, favorites, reviews, suggestions, reports (signed-in users)
// ---------------------------------------------------------------------------

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await requireSupabase().from('profiles').select('*').eq('id', userId).maybeSingle();
  throwIf(error);
  return (data as Profile | null) ?? null;
}

export async function updateDisplayName(userId: string, displayName: string): Promise<void> {
  const { error } = await requireSupabase()
    .from('profiles')
    .update({ display_name: displayName.trim() || null })
    .eq('id', userId);
  throwIf(error);
}

export async function getEntitlement(userId: string): Promise<Entitlement | null> {
  const { data, error } = await requireSupabase()
    .from('entitlements')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  throwIf(error);
  return (data as Entitlement | null) ?? null;
}

export async function getFavoriteIds(userId: string): Promise<Set<string>> {
  const { data, error } = await requireSupabase().from('favorites').select('place_id').eq('user_id', userId);
  throwIf(error);
  return new Set((data ?? []).map((r) => r.place_id as string));
}

export async function getFavoritePlaces(userId: string): Promise<Place[]> {
  const { data, error } = await requireSupabase()
    .from('favorites')
    .select('created_at, place:places(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  throwIf(error);
  return (data ?? [])
    .map((r) => r.place as unknown as Place | null)
    .filter((p): p is Place => Boolean(p) && p!.status === 'published');
}

export async function setFavorite(userId: string, placeId: string, on: boolean): Promise<void> {
  const sb = requireSupabase();
  if (on) {
    const { error } = await sb.from('favorites').upsert({ user_id: userId, place_id: placeId });
    throwIf(error);
  } else {
    const { error } = await sb.from('favorites').delete().eq('user_id', userId).eq('place_id', placeId);
    throwIf(error);
  }
}

export async function upsertReview(
  userId: string,
  placeId: string,
  rating: number,
  body: string,
): Promise<void> {
  const { error } = await requireSupabase()
    .from('reviews')
    .upsert({ user_id: userId, place_id: placeId, rating, body: body.trim() }, { onConflict: 'place_id,user_id' });
  throwIf(error);
}

export async function deleteReview(userId: string, placeId: string): Promise<void> {
  const { error } = await requireSupabase().from('reviews').delete().eq('user_id', userId).eq('place_id', placeId);
  throwIf(error);
}

export async function getMyReviews(userId: string): Promise<(PlaceReview & { place: Place })[]> {
  const { data, error } = await requireSupabase()
    .from('reviews')
    .select('*, place:places(*)')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  throwIf(error);
  return (data ?? []) as unknown as (PlaceReview & { place: Place })[];
}

export async function createSuggestion(input: {
  userId: string;
  cityId: string | null;
  cityText: string | null;
  name: string;
  category: 'coworking' | 'cafe';
  address: string | null;
  website: string | null;
  notes: string | null;
}): Promise<void> {
  const { error } = await requireSupabase().from('place_suggestions').insert({
    user_id: input.userId,
    city_id: input.cityId,
    city_text: input.cityText,
    name: input.name.trim(),
    category: input.category,
    address: input.address,
    website: input.website,
    notes: input.notes,
  });
  throwIf(error);
}

export async function createReport(userId: string, placeId: string, body: string): Promise<void> {
  const { error } = await requireSupabase()
    .from('place_reports')
    .insert({ user_id: userId, place_id: placeId, body: body.trim() });
  throwIf(error);
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export async function adminGetPlaces(): Promise<(Place & { city: City })[]> {
  const { data, error } = await requireSupabase()
    .from('places')
    .select('*, city:cities(*)')
    .order('updated_at', { ascending: false });
  throwIf(error);
  return (data ?? []) as (Place & { city: City })[];
}

export async function adminGetPlace(id: string): Promise<Place | null> {
  const { data, error } = await requireSupabase().from('places').select('*').eq('id', id).maybeSingle();
  throwIf(error);
  return (data as Place | null) ?? null;
}

export type PlaceInput = Omit<Place, 'id' | 'created_at' | 'updated_at' | 'review_count' | 'rating_avg'>;

export async function adminSavePlace(id: string | null, input: PlaceInput): Promise<string> {
  const sb = requireSupabase();
  if (id) {
    const { error } = await sb.from('places').update(input).eq('id', id);
    throwIf(error);
    return id;
  }
  const { data, error } = await sb.from('places').insert(input).select('id').single();
  throwIf(error);
  return data!.id as string;
}

export async function adminDeletePlace(id: string): Promise<void> {
  const { error } = await requireSupabase().from('places').delete().eq('id', id);
  throwIf(error);
}

export async function adminDeleteExamplePlaces(): Promise<number> {
  const { data, error } = await requireSupabase().from('places').delete().eq('is_example', true).select('id');
  throwIf(error);
  return data?.length ?? 0;
}

export async function adminGetPhotoRows(placeId: string) {
  const { data, error } = await requireSupabase()
    .from('place_photos')
    .select('*')
    .eq('place_id', placeId)
    .order('sort_order');
  throwIf(error);
  return (data ?? []) as { id: string; place_id: string; sort_order: number; full_path: string; preview_path: string }[];
}

export async function adminGetSuggestions(): Promise<(PlaceSuggestion & { city: City | null })[]> {
  const { data, error } = await requireSupabase()
    .from('place_suggestions')
    .select('*, city:cities(*)')
    .order('created_at', { ascending: false });
  throwIf(error);
  return (data ?? []) as (PlaceSuggestion & { city: City | null })[];
}

export async function adminSetSuggestionStatus(id: string, status: 'rejected' | 'pending'): Promise<void> {
  const { error } = await requireSupabase().from('place_suggestions').update({ status }).eq('id', id);
  throwIf(error);
}

export async function adminApproveSuggestion(id: string, slug: string, lat: number, lng: number): Promise<string> {
  const { data, error } = await requireSupabase().rpc('approve_suggestion', {
    p_id: id,
    p_slug: slug,
    p_lat: lat,
    p_lng: lng,
  });
  throwIf(error);
  return data as string;
}

export async function adminGetReports(): Promise<(PlaceReport & { place: Place | null })[]> {
  const { data, error } = await requireSupabase()
    .from('place_reports')
    .select('*, place:places(*)')
    .order('created_at', { ascending: false });
  throwIf(error);
  return (data ?? []) as (PlaceReport & { place: Place | null })[];
}

export async function adminSetReportStatus(id: string, status: 'open' | 'resolved'): Promise<void> {
  const { error } = await requireSupabase().from('place_reports').update({ status }).eq('id', id);
  throwIf(error);
}

export interface AdminReview {
  id: string;
  place_id: string;
  user_id: string;
  rating: number;
  body: string;
  status: 'visible' | 'hidden';
  created_at: string;
  place: Place | null;
}

export async function adminGetReviews(): Promise<AdminReview[]> {
  const { data, error } = await requireSupabase()
    .from('reviews')
    .select('*, place:places(*)')
    .order('created_at', { ascending: false })
    .limit(200);
  throwIf(error);
  return (data ?? []) as AdminReview[];
}

export async function adminSetReviewStatus(id: string, status: 'visible' | 'hidden'): Promise<void> {
  const { error } = await requireSupabase().from('reviews').update({ status }).eq('id', id);
  throwIf(error);
}

export async function adminSetCityStatus(id: string, status: 'active' | 'waitlist'): Promise<void> {
  const { error } = await requireSupabase().from('cities').update({ status }).eq('id', id);
  throwIf(error);
}

export async function adminUpdatePhotoOrder(ids: string[]): Promise<void> {
  const sb = requireSupabase();
  await Promise.all(
    ids.map((id, index) => sb.from('place_photos').update({ sort_order: index }).eq('id', id).then(({ error }) => throwIf(error))),
  );
}

export interface WaitlistCitySummary {
  city: City;
  verified: number;
  pending: number;
  left: number;
  failedEmails: number;
}

export async function adminGetWaitlistSummary(): Promise<WaitlistCitySummary[]> {
  const sb = requireSupabase();
  const [citiesRes, entriesRes] = await Promise.all([
    sb.from('cities').select('*').order('name'),
    sb.from('city_waitlist_entries').select('city_id, status, ambassador_email_status'),
  ]);
  throwIf(citiesRes.error);
  throwIf(entriesRes.error);
  const byCity = new Map<string, WaitlistCitySummary>();
  for (const city of (citiesRes.data ?? []) as City[]) {
    byCity.set(city.id, { city, verified: 0, pending: 0, left: 0, failedEmails: 0 });
  }
  for (const e of (entriesRes.data ?? []) as { city_id: string; status: string; ambassador_email_status: string }[]) {
    const s = byCity.get(e.city_id);
    if (!s) continue;
    if (e.status === 'verified') s.verified += 1;
    else if (e.status === 'pending') s.pending += 1;
    else if (e.status === 'left') s.left += 1;
    if (e.ambassador_email_status === 'failed') s.failedEmails += 1;
  }
  return [...byCity.values()].sort((a, b) => b.verified - a.verified || a.city.name.localeCompare(b.city.name));
}

export async function adminGetWaitlistEntries(cityId: string): Promise<WaitlistEntry[]> {
  const { data, error } = await requireSupabase()
    .from('city_waitlist_entries')
    .select(
      'id, city_id, email, first_name, status, verified_at, ambassador_email_status, ambassador_email_error, ambassador_email_sent_at, created_at',
    )
    .eq('city_id', cityId)
    .order('created_at', { ascending: false });
  throwIf(error);
  return (data ?? []) as WaitlistEntry[];
}

export async function adminGetCounts(): Promise<{ suggestions: number; reports: number; drafts: number }> {
  const sb = requireSupabase();
  const [s, r, d] = await Promise.all([
    sb.from('place_suggestions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    sb.from('place_reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    sb.from('places').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
  ]);
  throwIf(s.error);
  throwIf(r.error);
  throwIf(d.error);
  return { suggestions: s.count ?? 0, reports: r.count ?? 0, drafts: d.count ?? 0 };
}
