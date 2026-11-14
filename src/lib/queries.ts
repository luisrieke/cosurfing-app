import type { WeeklyHours } from './hours';
import { CITY_COVER_BUCKET, cityCoverFileUrl, previewUrl, signedPhotoUrls, signedWifiUrls } from './storage';
import { requireSupabase } from './supabase';
import { TERMS_VERSION } from './terms';
import type {
  City,
  CityContributor,
  ContentReport,
  ContentReportReason,
  ModerationReason,
  ReportTargetType,
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
  PlaceMenu,
  PlaceOffer,
  PlaceStatus,
  PlaceCategory,
  PlacePhoto,
  PlaceRatingStats,
  PlaceReport,
  PlaceReview,
  PlaceSuggestion,
  PlaceToRate,
  PlaceWifiNote,
  Profile,
  ProfilePhotoRow,
  ProfilePlace,
  ProfileReviewRow,
  PublicProfile,
  PendingContribution,
  RankedPlace,
  RankingFilters,
  ReviewInput,
  ReviewUnlockQuota,
  SpeedTest,
  SpeedTestKind,
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
    ...(filters.reviewed ? { p_reviewed: true } : null),
    p_q: filters.q.trim() || null,
    p_limit: limit,
    p_offset: offset,
    // Only sent when on, so the call also works against a database without the hours migration.
    ...(filters.openNow ? { p_open_now: true } : null),
    ...(filters.workNow ? { p_work_now: true } : null),
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
  return ((data ?? []) as CityContributor[]).map((c) => ({
    ...c,
    city_reviews: Number(c.city_reviews),
    points: Number(c.points),
    points_pending: Number(c.points_pending ?? 0),
    is_guide: Boolean(c.is_guide),
  }));
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
  note: string | null;
  kind: SpeedTestKind;
  carrier: string | null;
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
    p_note: input.note,
    p_kind: input.kind,
    p_carrier: input.carrier,
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

type MapPlaceRow = Omit<MapPlace, 'city'> & { city_slug: string | null; city_name: string | null };

/**
 * Published places of the given categories inside a map area, best work score first. "Open now" and
 * "Work here now" use each place's local time, as in the city ranking. A view that crosses the
 * antimeridian has west > east; the longitude filter is skipped there.
 */
export async function getPlacesInBounds(
  bounds: { north: number; south: number; east: number; west: number },
  categories: PlaceCategory[],
  limit = 300,
  options: { openNow?: boolean; workNow?: boolean; reviewed?: boolean } = {},
): Promise<MapPlace[]> {
  const openNow = Boolean(options.openNow);
  const workNow = Boolean(options.workNow);
  const reviewed = Boolean(options.reviewed);
  if (categories.length === 0) return [];
  const { data, error } = await requireSupabase().rpc('get_places_in_bounds', {
    p_south: bounds.south,
    p_north: bounds.north,
    p_west: bounds.west,
    p_east: bounds.east,
    p_categories: categories,
    p_limit: limit,
    p_open_now: openNow,
    p_work_now: workNow,
    p_reviewed: reviewed,
  });
  // PGRST202: the RPC does not exist yet (database without the hours migration).
  if (error?.code === 'PGRST202' && !openNow && !workNow) return getPlacesInBoundsLegacy(bounds, categories, limit, reviewed);
  throwIf(error);
  return ((data ?? []) as MapPlaceRow[]).map(({ city_slug, city_name, ...p }) => ({
    ...p,
    work_score: Number(p.work_score),
    city: city_slug && city_name ? { slug: city_slug, name: city_name } : null,
  }));
}

async function getPlacesInBoundsLegacy(
  bounds: { north: number; south: number; east: number; west: number },
  categories: PlaceCategory[],
  limit: number,
  reviewed: boolean,
): Promise<MapPlace[]> {
  let query = requireSupabase()
    .from('places')
    .select('id, slug, name, category, lat, lng, address, work_score, review_count, rating_avg, city:cities(slug, name)')
    .eq('status', 'published')
    .in('category', categories)
    .gte('lat', bounds.south)
    .lte('lat', bounds.north);
  if (reviewed) query = query.gt('review_count', 0);
  if (bounds.west <= bounds.east) query = query.gte('lng', bounds.west).lte('lng', bounds.east);
  const { data, error } = await query.order('work_score', { ascending: false }).limit(limit);
  throwIf(error);
  return ((data ?? []) as unknown as Omit<MapPlace, 'timezone' | 'hours' | 'hours_status' | 'laptop_hours' | 'laptop_source'>[]).map(
    (p) => ({
      ...p,
      work_score: Number(p.work_score),
      timezone: null,
      hours: null,
      hours_status: null,
      laptop_hours: null,
      laptop_source: null,
    }),
  );
}

/** Reads opening hours text with the same parser the database uses (admins). */
export async function parseOpeningHoursText(
  text: string,
): Promise<{ ok: true; hours: WeeklyHours; flags: string[] } | { ok: false; reason: string }> {
  const { data, error } = await requireSupabase().rpc('parse_opening_hours', { p_text: text });
  throwIf(error);
  return (data as { ok: true; hours: WeeklyHours; flags: string[] } | { ok: false; reason: string } | null) ?? {
    ok: false,
    reason: 'no_times',
  };
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

/** Offers that have not expired; links and codes are only returned to signed-in users. */
export async function getPlaceOffers(placeId: string): Promise<PlaceOffer[]> {
  const { data, error } = await requireSupabase().rpc('get_place_offers', { p_place_id: placeId });
  throwIf(error);
  return (data ?? []) as PlaceOffer[];
}

/** Menu photos, newest first; author names stay hidden from visitors without an account. */
export async function getPlaceMenus(placeId: string): Promise<PlaceMenu[]> {
  const { data, error } = await requireSupabase().rpc('get_place_menus', { p_place_id: placeId });
  throwIf(error);
  return (data ?? []) as PlaceMenu[];
}

/** Wi-Fi notes, newest first; content stays hidden from visitors without an account. */
export async function getPlaceWifiNotes(placeId: string): Promise<PlaceWifiNote[]> {
  const { data, error } = await requireSupabase().rpc('get_place_wifi_notes', { p_place_id: placeId });
  throwIf(error);
  const notes = (data ?? []) as Omit<PlaceWifiNote, 'photo_url'>[];
  const urls = await signedWifiUrls(notes.flatMap((n) => (n.photo_path ? [n.photo_path] : [])));
  return notes.map((n) => ({ ...n, photo_url: n.photo_path ? (urls.get(n.photo_path) ?? null) : null }));
}

// ---------------------------------------------------------------------------
// Profile, favorites, reviews, suggestions, reports (signed-in users)
// ---------------------------------------------------------------------------

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await requireSupabase().from('profiles').select('*').eq('id', userId).maybeSingle();
  throwIf(error);
  return (data as Profile | null) ?? null;
}

export async function getPublicProfile(userId: string): Promise<PublicProfile | null> {
  const { data, error } = await requireSupabase().rpc('get_public_profile', { p_user: userId });
  throwIf(error);
  const row = ((data ?? []) as PublicProfile[])[0];
  if (!row) return null;
  return {
    ...row,
    points: Number(row.points),
    points_pending: Number(row.points_pending),
    review_count: Number(row.review_count),
    photo_count: Number(row.photo_count),
    is_guide: Boolean(row.is_guide),
    guide_revoked: Boolean(row.guide_revoked),
  };
}

export async function getProfilePlaces(userId: string): Promise<ProfilePlace[]> {
  const { data, error } = await requireSupabase().rpc('get_profile_places', { p_user: userId });
  throwIf(error);
  return (data ?? []) as ProfilePlace[];
}

export async function getProfileReviews(userId: string): Promise<ProfileReviewRow[]> {
  const { data, error } = await requireSupabase().rpc('get_profile_reviews', { p_user: userId });
  throwIf(error);
  return (data ?? []) as ProfileReviewRow[];
}

export async function getProfilePhotos(userId: string): Promise<ProfilePhotoRow[]> {
  const { data, error } = await requireSupabase().rpc('get_profile_photos', { p_user: userId });
  throwIf(error);
  return (data ?? []) as ProfilePhotoRow[];
}

export async function getPendingContributions(): Promise<PendingContribution[]> {
  const { data, error } = await requireSupabase().rpc('get_pending_contributions');
  throwIf(error);
  return (data ?? []) as PendingContribution[];
}

export async function moderateContribution(input: {
  kind: PendingContribution['kind'];
  decision: 'approve' | 'reject';
  id?: string | null;
  placeId?: string | null;
  userId?: string | null;
  key?: string | null;
  reason?: ModerationReason;
}): Promise<void> {
  const { error } = await requireSupabase().rpc('moderate_contribution_with_reason', {
    p_reason: input.reason ?? 'rules',
    p_kind: input.kind,
    p_decision: input.decision,
    p_id: input.id ?? null,
    p_place_id: input.placeId ?? null,
    p_user_id: input.userId ?? null,
    p_key: input.key ?? null,
  });
  throwIf(error);
}

export async function setGuideRevoked(userId: string, revoked: boolean): Promise<void> {
  const { error } = await requireSupabase().rpc('set_guide_revoked', { p_user: userId, p_revoked: revoked });
  throwIf(error);
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
    .select(
      'id, rating, body, wifi_rating, power_rating, quiet_rating, comfort_rating, value_rating, calls_ok, edit_status, pending_rating, pending_body, pending_wifi_rating, pending_power_rating, pending_quiet_rating, pending_comfort_rating, pending_value_rating, pending_calls_ok',
    )
    .eq('user_id', userId)
    .eq('place_id', placeId)
    .maybeSingle();
  throwIf(error);
  if (!data) return null;
  const row = data as ReviewInput & {
    id: string;
    edit_status: string | null;
    pending_rating: number | null;
    pending_body: string | null;
    pending_wifi_rating: number | null;
    pending_power_rating: number | null;
    pending_quiet_rating: number | null;
    pending_comfort_rating: number | null;
    pending_value_rating: number | null;
    pending_calls_ok: boolean | null;
  };
  const pending = row.edit_status === 'pending' && row.pending_rating != null;
  return {
    id: row.id,
    rating: pending ? row.pending_rating! : row.rating,
    body: (pending ? row.pending_body : row.body) ?? '',
    wifi_rating: pending ? row.pending_wifi_rating : row.wifi_rating,
    power_rating: pending ? row.pending_power_rating : row.power_rating,
    quiet_rating: pending ? row.pending_quiet_rating : row.quiet_rating,
    comfort_rating: pending ? row.pending_comfort_rating : row.comfort_rating,
    value_rating: pending ? row.pending_value_rating : row.value_rating,
    calls_ok: pending ? row.pending_calls_ok : row.calls_ok,
  };
}

export async function getMyFacts(userId: string, placeId: string): Promise<FactInput> {
  const { data, error } = await requireSupabase()
    .from('place_facts')
    .select('key, value, pending_value, status, pending_delete')
    .eq('user_id', userId)
    .eq('place_id', placeId);
  throwIf(error);
  const facts: FactInput = {};
  for (const row of (data ?? []) as {
    key: string;
    value: unknown;
    pending_value: unknown | null;
    pending_delete: boolean;
  }[]) {
    if (row.pending_delete) continue;
    facts[row.key as keyof FactInput] = (row.pending_value ?? row.value) as FactInput[keyof FactInput];
  }
  return facts;
}

/** Replaces the user's facts for a place; facts left out are removed. */
export async function savePlaceFacts(placeId: string, facts: FactInput): Promise<void> {
  const { error } = await requireSupabase().rpc('save_place_facts', { p_place_id: placeId, p_facts: facts });
  throwIf(error);
}

/** Members delete their own offers, admins any. */
export async function deleteOffer(offerId: string): Promise<void> {
  const { error } = await requireSupabase().from('place_offers').delete().eq('id', offerId);
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
}): Promise<{ placeSlug: string | null }> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('place_suggestions')
    .insert({
      user_id: input.userId,
      city_id: input.cityId,
      city_text: input.cityText,
      name: input.name.trim(),
      category: input.category,
      address: input.address,
      website: input.website,
      notes: input.notes,
    })
    .select('id')
    .single();
  throwIf(error);
  const { data: row, error: rowError } = await sb
    .from('place_suggestions')
    .select('place_id')
    .eq('id', data!.id)
    .single();
  throwIf(rowError);
  if (!row?.place_id) return { placeSlug: null };
  const { data: place, error: placeError } = await sb.from('places').select('slug').eq('id', row.place_id).maybeSingle();
  throwIf(placeError);
  return { placeSlug: (place?.slug as string | undefined) ?? null };
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
  /** Only places whose opening hours text needs a person to look at it. */
  hoursReview?: boolean;
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
  if (input.hoursReview) query = query.eq('hours_status', 'needs_review');
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
  'hours',
  'hours_source',
  'hours_status',
  'laptop_hours',
  'laptop_source',
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
  'access',
  'access_note',
  'address_unconfirmed',
] as const;

/** Fields an admin can edit. Scores, counters and crawler state are maintained by the database. */
export type PlaceInput = Pick<Place, (typeof PLACE_INPUT_FIELDS)[number]>;

export function toPlaceInput(place: Place): PlaceInput {
  const out = {} as Record<string, unknown>;
  for (const k of PLACE_INPUT_FIELDS) out[k] = place[k];
  return out as PlaceInput;
}

/** `skip` leaves columns as they are on update (e.g. hours the database derives itself). */
export async function adminSavePlace(id: string | null, input: PlaceInput, skip: readonly (keyof PlaceInput)[] = []): Promise<string> {
  const sb = requireSupabase();
  if (id) {
    const patch: Partial<PlaceInput> = { ...input };
    for (const k of skip) delete patch[k];
    const { error } = await sb.from('places').update(patch).eq('id', id);
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

export async function adminGetSuggestions(): Promise<
  (PlaceSuggestion & { city: City | null; place: { id: string; slug: string } | null })[]
> {
  const { data, error } = await requireSupabase()
    .from('place_suggestions')
    .select('*, city:cities(*), place:places(id, slug)')
    .order('created_at', { ascending: false });
  throwIf(error);
  return (data ?? []) as (PlaceSuggestion & { city: City | null; place: { id: string; slug: string } | null })[];
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

export interface PendingCityCover {
  id: string;
  city_id: string;
  full_path: string;
  thumb_path: string;
  created_at: string;
  city: Pick<City, 'id' | 'name' | 'slug' | 'country_name' | 'cover_thumb_url'> | null;
  uploader: { display_name: string | null } | null;
}

export async function adminGetPendingCityCovers(): Promise<PendingCityCover[]> {
  const { data, error } = await requireSupabase()
    .from('city_cover_submissions')
    .select('id, city_id, full_path, thumb_path, created_at, city:cities(id, name, slug, country_name, cover_thumb_url), uploader:profiles(display_name)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(100);
  throwIf(error);
  return (data ?? []) as unknown as PendingCityCover[];
}

export async function approveCityCover(submission: { id: string; full_path: string; thumb_path: string }): Promise<void> {
  const { error } = await requireSupabase().rpc('approve_city_cover', {
    p_submission_id: submission.id,
    p_cover_url: cityCoverFileUrl(submission.full_path),
    p_thumb_url: cityCoverFileUrl(submission.thumb_path),
  });
  throwIf(error);
}

/** Rejected covers are deleted together with their files. */
export async function rejectCityCover(submission: { id: string; full_path: string; thumb_path: string }): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from('city_cover_submissions').delete().eq('id', submission.id);
  throwIf(error);
  await sb.storage.from(CITY_COVER_BUCKET).remove([submission.full_path, submission.thumb_path]);
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

export type OutreachStage = 'to_contact' | 'emailed' | 'replied' | 'confirmed' | 'no_response';

export const OUTREACH_STAGES: OutreachStage[] = ['to_contact', 'emailed', 'replied', 'confirmed', 'no_response'];

export interface OutreachPlace {
  id: string;
  name: string;
  address: string | null;
  website: string | null;
  city: { name: string } | null;
  stage: OutreachStage;
}

// Published places with their outreach stage. A place without a row has not been contacted yet.
export async function adminGetOutreach(): Promise<OutreachPlace[]> {
  const sb = requireSupabase();
  const pageSize = 1000;
  const rows: unknown[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await sb
      .from('places')
      .select('id, name, address, website, city:cities(name), outreach:place_outreach(stage)')
      .eq('status', 'published')
      .order('name', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    throwIf(error);
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) break;
  }
  type Row = Omit<OutreachPlace, 'stage'> & { outreach: { stage: OutreachStage } | { stage: OutreachStage }[] | null };
  return (rows as Row[]).map(
    ({ outreach, ...place }) => {
      const row = Array.isArray(outreach) ? outreach[0] : outreach;
      return { ...place, stage: row?.stage ?? 'to_contact' };
    },
  );
}

export async function adminSetOutreachStage(placeId: string, stage: OutreachStage): Promise<void> {
  const { error } = await requireSupabase().from('place_outreach').upsert({ place_id: placeId, stage }, { onConflict: 'place_id' });
  throwIf(error);
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

export async function adminSetReviewStatus(id: string, status: 'visible' | 'hidden', reason: ModerationReason = 'rules'): Promise<void> {
  const { error } = await requireSupabase().rpc('admin_set_review_status', { p_id: id, p_status: status, p_reason: reason });
  throwIf(error);
}

export async function submitContentReport(input: {
  targetType: ReportTargetType;
  targetId: string;
  reason: ContentReportReason;
  body: string;
  email?: string | null;
}): Promise<void> {
  const { error } = await requireSupabase().rpc('submit_content_report', {
    p_target_type: input.targetType,
    p_target_id: input.targetId,
    p_reason: input.reason,
    p_body: input.body.trim(),
    p_email: input.email?.trim() || null,
  });
  throwIf(error);
}

export async function adminGetContentReports(): Promise<ContentReport[]> {
  const { data, error } = await requireSupabase().rpc('admin_get_content_reports');
  throwIf(error);
  return (data ?? []) as ContentReport[];
}

export async function adminDecideContentReport(id: string, decision: 'remove' | 'keep', reason: ModerationReason, note?: string): Promise<void> {
  const { error } = await requireSupabase().rpc('admin_decide_content_report', {
    p_report_id: id,
    p_decision: decision,
    p_reason: reason,
    p_note: note?.trim() || null,
  });
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
  note: string | null;
  kind: SpeedTestKind;
  carrier: string | null;
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
  pendingCityCovers: number;
  contributions: number;
  outreachOpen: number;
}> {
  const sb = requireSupabase();
  const [s, r, cr, d, v, p, cc, c, pub, done] = await Promise.all([
    sb.from('place_suggestions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    sb.from('place_reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    sb.from('content_reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    sb.from('places').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
    sb.from('places').select('id', { count: 'exact', head: true }).eq('status', 'needs_review'),
    sb.from('place_photos').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    sb.from('city_cover_submissions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    sb.rpc('pending_contribution_count'),
    sb.from('places').select('id', { count: 'exact', head: true }).eq('status', 'published'),
    sb.from('place_outreach').select('place_id, place:places!inner(status)', { count: 'exact', head: true }).eq('stage', 'confirmed').eq('place.status', 'published'),
  ]);
  for (const res of [s, r, cr, d, v, p, cc, pub, done]) throwIf(res.error);
  throwIf(c.error);
  return {
    suggestions: s.count ?? 0,
    reports: (r.count ?? 0) + (cr.count ?? 0),
    drafts: d.count ?? 0,
    toVerify: v.count ?? 0,
    pendingPhotos: p.count ?? 0,
    pendingCityCovers: cc.count ?? 0,
    contributions: Number(c.data ?? 0),
    outreachOpen: Math.max(0, (pub.count ?? 0) - (done.count ?? 0)),
  };
}
