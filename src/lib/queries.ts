import { previewUrl, signedPhotoUrls } from './storage';
import { requireSupabase } from './supabase';
import { TERMS_VERSION } from './terms';
import type {
  City,
  CityContributor,
  CityListItem,
  CitySort,
  Continent,
  Entitlement,
  FactInput,
  MapCity,
  MapPlace,
  NetworkType,
  Place,
  PlaceFactEntry,
  PlaceStatus,
  PlaceCategory,
  PlacePhoto,
  PlaceRatingStats,
  PlaceReport,
  PlaceReview,
  PlaceSuggestion,
  PlaceToRate,
  Profile,
  RankedPlace,
  RankingFilters,
  ReviewInput,
  ReviewUnlockQuota,
  SpeedTest,
  SpeedTestVerification,
  WaitlistEntry,
} from './types';

function throwIf(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export interface Page<T> {
  items: T[];
  total: number;
}

// ---------------------------------------------------------------------------
// Rankings (public RPCs; gating happens in the database)
// ---------------------------------------------------------------------------

export async function listCities(input: {
  q?: string;
  continent?: Continent | null;
  sort?: CitySort;
  limit?: number;
  offset?: number;
}): Promise<Page<CityListItem>> {
  const { data, error } = await requireSupabase().rpc('list_cities', {
    p_q: input.q?.trim() || null,
    p_continent: input.continent ?? null,
    p_sort: input.sort ?? 'score',
    p_limit: input.limit ?? 48,
    p_offset: input.offset ?? 0,
  });
  throwIf(error);
  const items = (data ?? []) as CityListItem[];
  return { items, total: items.length ? Number(items[0]!.total_count) : 0 };
}

type RankedRow = Omit<RankedPlace, 'cover_preview_url' | 'cover_full_url'> & {
  cover_preview_path: string | null;
  cover_full_path: string | null;
};

export async function getCityRanking(
  cityId: string,
  filters: RankingFilters,
  limit = 30,
  offset = 0,
): Promise<Page<RankedPlace>> {
  const { data, error } = await requireSupabase().rpc('get_city_ranking', {
    p_city_id: cityId,
    p_category: filters.category === 'all' ? null : filters.category,
    p_sort: filters.sort,
    p_wifi: filters.wifi,
    p_power: filters.power,
    p_calls: filters.calls,
    p_q: filters.q.trim() || null,
    p_limit: limit,
    p_offset: offset,
  });
  throwIf(error);
  const rows = (data ?? []) as RankedRow[];
  const signed = await signedPhotoUrls(rows.map((r) => r.cover_full_path).filter((p): p is string => Boolean(p)));
  const items = rows.map(({ cover_preview_path, cover_full_path, ...r }) => ({
    ...r,
    score_rank: Number(r.score_rank),
    total_count: Number(r.total_count),
    cover_preview_url: cover_preview_path ? previewUrl(cover_preview_path) : null,
    cover_full_url: cover_full_path ? (signed.get(cover_full_path) ?? null) : null,
  }));
  return { items, total: items.length ? items[0]!.total_count : 0 };
}

export async function getCityContributors(cityId: string, limit = 5): Promise<CityContributor[]> {
  const { data, error } = await requireSupabase().rpc('get_city_contributors', { p_city_id: cityId, p_limit: limit });
  throwIf(error);
  return ((data ?? []) as CityContributor[]).map((c) => ({ ...c, city_reviews: Number(c.city_reviews) }));
}

export async function requestCityCrawl(cityId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('request_city_crawl', { p_city_id: cityId });
  throwIf(error);
}

/** Detail averages. Row-level security returns nothing for visitors without an account. */
export async function getPlaceRatingStats(placeId: string): Promise<PlaceRatingStats | null> {
  const { data, error } = await requireSupabase()
    .from('place_rating_stats')
    .select('*')
    .eq('place_id', placeId)
    .maybeSingle();
  throwIf(error);
  return (data as PlaceRatingStats | null) ?? null;
}

/** Individual speed tests; empty for visitors without an account. */
export async function getPlaceSpeedTests(placeId: string): Promise<SpeedTest[]> {
  const { data, error } = await requireSupabase().rpc('get_place_speed_tests', { p_place_id: placeId });
  throwIf(error);
  return (data ?? []) as SpeedTest[];
}

/** Saves a test; the server checks the location and network and decides whether it counts. */
export async function saveSpeedTest(input: {
  placeId: string;
  downloadMbps: number;
  uploadMbps: number | null;
  pingMs: number | null;
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  networkType: NetworkType;
}): Promise<{ verification: SpeedTestVerification; distanceM: number | null }> {
  const { data, error } = await requireSupabase().rpc('submit_speed_test', {
    p_place_id: input.placeId,
    p_download_mbps: input.downloadMbps,
    p_upload_mbps: input.uploadMbps,
    p_ping_ms: input.pingMs === null ? null : Math.round(input.pingMs),
    p_lat: input.lat,
    p_lng: input.lng,
    p_accuracy_m: input.accuracyM,
    p_network_type: input.networkType,
  });
  if (error?.message.includes('speed_test_rate_limited')) throw new Error('speed_test_rate_limited');
  throwIf(error);
  const row = (data as { verification: SpeedTestVerification; distance_m: number | null }[] | null)?.[0];
  return { verification: row?.verification ?? 'no_location', distanceM: row?.distance_m ?? null };
}

/** Position of a place in its city's "best for work" ranking. */
export async function getPlaceRank(placeId: string): Promise<number> {
  const { data, error } = await requireSupabase().rpc('get_place_rank', { p_place_id: placeId });
  throwIf(error);
  return Number(data);
}

export async function getPlacesToRate(cityId: string, limit = 6): Promise<PlaceToRate[]> {
  const { data, error } = await requireSupabase().rpc('get_places_to_rate', { p_city_id: cityId, p_limit: limit });
  throwIf(error);
  return (data ?? []) as PlaceToRate[];
}

// ---------------------------------------------------------------------------
// Cities
// ---------------------------------------------------------------------------

export async function getCityById(id: string): Promise<City | null> {
  const { data, error } = await requireSupabase().from('cities').select('*').eq('id', id).maybeSingle();
  throwIf(error);
  return (data as City | null) ?? null;
}

export async function getCitiesByIds(ids: string[]): Promise<City[]> {
  if (ids.length === 0) return [];
  const { data, error } = await requireSupabase().from('cities').select('*').in('id', ids);
  throwIf(error);
  const byId = new Map(((data ?? []) as City[]).map((c) => [c.id, c]));
  return ids.map((id) => byId.get(id)).filter((c): c is City => Boolean(c));
}

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

export async function getPlaceBySlug(slug: string): Promise<(Place & { city: City }) | null> {
  const { data, error } = await requireSupabase()
    .from('places')
    .select('*, city:cities(*)')
    .eq('slug', slug)
    .maybeSingle();
  throwIf(error);
  return (data as (Place & { city: City }) | null) ?? null;
}

/** Every live city that has places, for the zoomed-out map overview (paged: the API caps rows at 1,000). */
export async function getMapCities(): Promise<MapCity[]> {
  const pageSize = 1000;
  const all: MapCity[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await requireSupabase()
      .from('cities')
      .select('slug, name, lat, lng, zoom, place_count')
      .eq('status', 'active')
      .gt('place_count', 0)
      .order('id')
      .range(from, from + pageSize - 1);
    throwIf(error);
    const rows = (data ?? []) as MapCity[];
    all.push(...rows);
    if (rows.length < pageSize) return all;
  }
}

/** Published places inside a map area, best work score first. Colivings only when asked for. */
export async function getPlacesInBounds(
  bounds: { north: number; south: number; east: number; west: number },
  limit = 300,
  withColivings = false,
): Promise<MapPlace[]> {
  let query = requireSupabase()
    .from('places')
    .select('id, slug, name, category, lat, lng, address, work_score, review_count, rating_avg, city:cities(slug, name)')
    .eq('status', 'published')
    .gte('lat', bounds.south)
    .lte('lat', bounds.north);
  if (!withColivings) query = query.neq('category', 'coliving');
  // A view that crosses the antimeridian has west > east; skip the longitude filter there.
  if (bounds.west <= bounds.east) query = query.gte('lng', bounds.west).lte('lng', bounds.east);
  const { data, error } = await query.order('work_score', { ascending: false }).limit(limit);
  throwIf(error);
  return ((data ?? []) as unknown as MapPlace[]).map((p) => ({ ...p, work_score: Number(p.work_score) }));
}

export async function getPlaceById(id: string): Promise<Place | null> {
  const { data, error } = await requireSupabase().from('places').select('*').eq('id', id).maybeSingle();
  throwIf(error);
  return (data as Place | null) ?? null;
}

export async function getPlacePhotos(placeId: string): Promise<PlacePhoto[]> {
  const { data, error } = await requireSupabase().rpc('get_place_photos', { p_place_id: placeId });
  throwIf(error);
  const rows = (data ?? []) as { id: string; sort_order: number; preview_path: string; full_path: string }[];
  const signed = await signedPhotoUrls(rows.map((r) => r.full_path));
  return rows.map((r) => ({
    id: r.id,
    place_id: placeId,
    sort_order: r.sort_order,
    preview_url: previewUrl(r.preview_path),
    full_path: r.full_path,
    full_url: signed.get(r.full_path) ?? null,
  }));
}

export async function getPlaceReviews(placeId: string): Promise<PlaceReview[]> {
  const { data, error } = await requireSupabase().rpc('get_place_reviews', { p_place_id: placeId });
  throwIf(error);
  return (data ?? []) as PlaceReview[];
}

export class UnlockLimitError extends Error {
  constructor() {
    super('unlock_limit_reached');
    this.name = 'UnlockLimitError';
  }
}

/** Signed-in users only; `null` for visitors. */
export async function getReviewUnlockQuota(): Promise<ReviewUnlockQuota | null> {
  const { data, error } = await requireSupabase().rpc('get_review_unlock_quota');
  throwIf(error);
  return ((data ?? []) as ReviewUnlockQuota[])[0] ?? null;
}

/** Uses one of today's free unlocks (no-op for Plus, own and already unlocked reviews). */
export async function unlockReview(reviewId: string): Promise<ReviewUnlockQuota> {
  const { data, error } = await requireSupabase().rpc('unlock_review', { p_review_id: reviewId });
  if (error?.message.includes('unlock_limit_reached')) throw new UnlockLimitError();
  throwIf(error);
  return ((data ?? []) as ReviewUnlockQuota[])[0]!;
}

/** Facts members added to a place; author names stay hidden from visitors without an account. */
export async function getPlaceFacts(placeId: string): Promise<PlaceFactEntry[]> {
  const { data, error } = await requireSupabase().rpc('get_place_facts', { p_place_id: placeId });
  throwIf(error);
  return (data ?? []) as PlaceFactEntry[];
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

export async function upsertReview(userId: string, placeId: string, input: ReviewInput): Promise<void> {
  const body = input.body.trim();
  const { error } = await requireSupabase()
    .from('reviews')
    .upsert(
      {
        user_id: userId,
        place_id: placeId,
        rating: input.rating,
        body: body || null,
        wifi_rating: input.wifi_rating,
        power_rating: input.power_rating,
        quiet_rating: input.quiet_rating,
        comfort_rating: input.comfort_rating,
        value_rating: input.value_rating,
        calls_ok: input.calls_ok,
        rights_accepted_at: new Date().toISOString(),
        terms_version: TERMS_VERSION,
      },
      { onConflict: 'place_id,user_id' },
    );
  throwIf(error);
}

export async function getMyReview(userId: string, placeId: string): Promise<(ReviewInput & { id: string }) | null> {
  const { data, error } = await requireSupabase()
    .from('reviews')
    .select('id, rating, body, wifi_rating, power_rating, quiet_rating, comfort_rating, value_rating, calls_ok')
    .eq('user_id', userId)
    .eq('place_id', placeId)
    .maybeSingle();
  throwIf(error);
  if (!data) return null;
  return { ...(data as ReviewInput & { id: string }), body: (data.body as string | null) ?? '' };
}

export async function getMyFacts(userId: string, placeId: string): Promise<FactInput> {
  const { data, error } = await requireSupabase()
    .from('place_facts')
    .select('key, value')
    .eq('user_id', userId)
    .eq('place_id', placeId);
  throwIf(error);
  return Object.fromEntries(((data ?? []) as { key: string; value: unknown }[]).map((r) => [r.key, r.value])) as FactInput;
}

/** Replaces the user's facts for a place; facts left out are removed. */
export async function savePlaceFacts(placeId: string, facts: FactInput): Promise<void> {
  const { error } = await requireSupabase().rpc('save_place_facts', { p_place_id: placeId, p_facts: facts });
  throwIf(error);
}

export async function updateProfile(
  userId: string,
  patch: {
    display_name?: string | null;
    home_city_id?: string | null;
    city_ids?: string[];
    avatar_path?: string | null;
    onboarded_at?: string | null;
  },
): Promise<void> {
  const { error } = await requireSupabase().from('profiles').update(patch).eq('id', userId);
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
  category: PlaceCategory;
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

export async function createReport(
  userId: string,
  placeId: string,
  body: string,
  kind: PlaceReport['kind'] = 'other',
): Promise<void> {
  const { error } = await requireSupabase()
    .from('place_reports')
    .insert({ user_id: userId, place_id: placeId, body: body.trim(), kind });
  if (error?.code === '23505') return;
  throwIf(error);
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export async function adminSearchPlaces(input: {
  q: string;
  status: PlaceStatus | 'all';
  limit?: number;
}): Promise<Page<Place & { city: Pick<City, 'id' | 'name' | 'slug'> }>> {
  let query = requireSupabase()
    .from('places')
    .select('*, city:cities(id, name, slug)', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .limit(input.limit ?? 50);
  const term = input.q.trim().replace(/[%_,()]/g, '');
  if (term) query = query.ilike('name', `%${term}%`);
  if (input.status !== 'all') query = query.eq('status', input.status);
  const { data, error, count } = await query;
  throwIf(error);
  return { items: (data ?? []) as (Place & { city: Pick<City, 'id' | 'name' | 'slug'> })[], total: count ?? 0 };
}

export async function adminCountExamplePlaces(): Promise<number> {
  const { count, error } = await requireSupabase()
    .from('places')
    .select('id', { count: 'exact', head: true })
    .eq('is_example', true);
  throwIf(error);
  return count ?? 0;
}

export async function adminGetPlace(id: string): Promise<Place | null> {
  const { data, error } = await requireSupabase().from('places').select('*').eq('id', id).maybeSingle();
  throwIf(error);
  return (data as Place | null) ?? null;
}

export const PLACE_INPUT_FIELDS = [
  'city_id',
  'slug',
  'name',
  'name_local',
  'category',
  'status',
  'description',
  'address',
  'lat',
  'lng',
  'website',
  'phone',
  'opening_hours',
  'price_level',
  'day_pass_price_cents',
  'wifi',
  'internet_fee',
  'power_outlets',
  'focus',
  'calls',
  'outdoor_seating',
  'wheelchair',
  'laptop_rules',
  'last_verified_at',
  'is_example',
  'locked_fields',
  'season',
  'season_note',
  'non_guest_work',
  'non_guest_note',
  'min_stay',
] as const;

/** Fields an admin can edit. Scores, counters and crawler state are maintained by the database. */
export type PlaceInput = Pick<Place, (typeof PLACE_INPUT_FIELDS)[number]>;

export function toPlaceInput(place: Place): PlaceInput {
  const out = {} as Record<string, unknown>;
  for (const k of PLACE_INPUT_FIELDS) out[k] = place[k];
  return out as PlaceInput;
}

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

export interface PendingPhoto {
  id: string;
  place_id: string;
  full_path: string;
  preview_path: string;
  created_at: string;
  rights_accepted_at: string | null;
  place: Pick<Place, 'id' | 'name' | 'slug'> | null;
  uploader: { display_name: string | null } | null;
}

export async function adminGetPendingPhotos(): Promise<PendingPhoto[]> {
  const { data, error } = await requireSupabase()
    .from('place_photos')
    .select('id, place_id, full_path, preview_path, created_at, rights_accepted_at, place:places(id, name, slug), uploader:profiles(display_name)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(100);
  throwIf(error);
  return (data ?? []) as unknown as PendingPhoto[];
}

export async function adminApprovePhoto(id: string): Promise<void> {
  const { error } = await requireSupabase().rpc('approve_place_photo', { p_photo_id: id });
  throwIf(error);
}

export type PlaceToVerify = Place & {
  city: Pick<City, 'id' | 'name' | 'slug'> | null;
  closed_reports: { count: number }[];
};

export async function adminGetPlacesToVerify(): Promise<PlaceToVerify[]> {
  const { data, error } = await requireSupabase()
    .from('places')
    .select('*, city:cities(id, name, slug), closed_reports:place_reports(count)')
    .eq('status', 'needs_review')
    .eq('closed_reports.kind', 'closed')
    .eq('closed_reports.status', 'open')
    .order('updated_at', { ascending: false })
    .limit(200);
  throwIf(error);
  return (data ?? []) as PlaceToVerify[];
}

export async function adminReviewPlace(placeId: string, decision: 'exists' | 'closed', website?: string): Promise<void> {
  const { error } = await requireSupabase().rpc('review_place', {
    p_place_id: placeId,
    p_decision: decision,
    p_website: website?.trim() || null,
  });
  throwIf(error);
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

export async function adminSearchCities(q: string, limit = 60): Promise<City[]> {
  let query = requireSupabase().from('cities').select('*');
  const term = q.trim();
  if (term) query = query.ilike('name', `%${term.replace(/[%_]/g, '')}%`);
  const { data, error } = await query.order('population', { ascending: false, nullsFirst: false }).limit(limit);
  throwIf(error);
  return (data ?? []) as City[];
}

export async function adminGetCrawlOverview(): Promise<{ status: string; count: number }[]> {
  const sb = requireSupabase();
  const statuses = ['pending', 'running', 'done', 'failed'] as const;
  const results = await Promise.all(
    statuses.map((s) => sb.from('cities').select('id', { count: 'exact', head: true }).eq('crawl_status', s)),
  );
  return statuses.map((status, i) => {
    throwIf(results[i]!.error);
    return { status, count: results[i]!.count ?? 0 };
  });
}

export async function adminRequeueCity(cityId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('admin_requeue_city', { p_city_id: cityId });
  throwIf(error);
}

export async function adminRequeueEnrich(cityId: string): Promise<number> {
  const { data, error } = await requireSupabase().rpc('admin_requeue_enrich', { p_city_id: cityId });
  throwIf(error);
  return Number(data ?? 0);
}

export interface AdminSpeedTest {
  id: string;
  place_id: string;
  user_id: string;
  download_mbps: number;
  upload_mbps: number | null;
  ping_ms: number | null;
  on_site: boolean;
  distance_m: number | null;
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
  network_type: NetworkType;
  verification: SpeedTestVerification | null;
  ip_hash: string | null;
  status: 'visible' | 'hidden';
  created_at: string;
  place: Pick<Place, 'id' | 'name' | 'slug'> | null;
}

export async function adminGetSpeedTests(): Promise<AdminSpeedTest[]> {
  const { data, error } = await requireSupabase()
    .from('speed_tests')
    .select('*, place:places(id, name, slug)')
    .order('created_at', { ascending: false })
    .limit(200);
  throwIf(error);
  return (data ?? []) as AdminSpeedTest[];
}

export async function adminSetSpeedTestStatus(id: string, status: 'visible' | 'hidden'): Promise<void> {
  const { error } = await requireSupabase().from('speed_tests').update({ status }).eq('id', id);
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

export async function adminGetCounts(): Promise<{
  suggestions: number;
  reports: number;
  drafts: number;
  toVerify: number;
  pendingPhotos: number;
}> {
  const sb = requireSupabase();
  const [s, r, d, v, p] = await Promise.all([
    sb.from('place_suggestions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    sb.from('place_reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    sb.from('places').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
    sb.from('places').select('id', { count: 'exact', head: true }).eq('status', 'needs_review'),
    sb.from('place_photos').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);
  for (const res of [s, r, d, v, p]) throwIf(res.error);
  return {
    suggestions: s.count ?? 0,
    reports: r.count ?? 0,
    drafts: d.count ?? 0,
    toVerify: v.count ?? 0,
    pendingPhotos: p.count ?? 0,
  };
}
