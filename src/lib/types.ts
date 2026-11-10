export type CityStatus = 'active' | 'waitlist';
export type PlaceCategory = 'coworking' | 'cafe' | 'library' | 'coliving';
export type SeasonValue = 'year_round' | 'seasonal' | 'unknown';
export type PlaceStatus = 'draft' | 'published' | 'needs_review' | 'archived';
export type PlaceReviewReason = 'website_parked' | 'website_dead' | 'reported_closed';
export type WifiValue = 'yes' | 'no' | 'unknown';
export type WifiCommunityValue = 'yes' | 'unreliable' | 'no';
export type PowerValue = 'plenty' | 'some' | 'none' | 'unknown';
export type FocusValue = 'great' | 'okay' | 'poor' | 'unknown';
export type CallsValue = 'yes' | 'limited' | 'no' | 'unknown';
export type InternetFeeValue = 'no' | 'yes' | 'customers' | 'unknown';
export type YesNoUnknown = 'yes' | 'no' | 'unknown';
export type Continent = 'AF' | 'AS' | 'EU' | 'NA' | 'SA' | 'OC' | 'AN';
export type CrawlStatus = 'pending' | 'running' | 'done' | 'failed';
export type WebCrawlStatus = 'pending' | 'running' | 'done' | 'failed' | 'blocked' | 'skipped' | 'parked' | 'dead';

export interface City {
  id: string;
  slug: string;
  name: string;
  country_code: string;
  country_name: string;
  lat: number;
  lng: number;
  zoom: number;
  status: CityStatus;
  created_at: string;
  geonames_id: number | null;
  population: number | null;
  continent: Continent | null;
  region: string | null;
  timezone: string | null;
  is_hotspot: boolean;
  cover_url: string | null;
  cover_thumb_url: string | null;
  cover_attribution: string | null;
  cover_source_url: string | null;
  crawl_status: CrawlStatus;
  crawled_at: string | null;
  crawl_error: string | null;
  crawl_radius_km: number;
  place_count: number;
  coworking_count: number;
  cafe_count: number;
  library_count: number;
  /** Not part of place_count: colivings are listed on their own tab. */
  coliving_count: number;
  review_count: number;
  speed_test_count: number;
  median_download_mbps: number | null;
  top_score: number | null;
  city_score: number | null;
}

/** One fact read from the venue's own website, with the sentence it came from. */
export interface WebFact<T = unknown> {
  value: T;
  snippet: string | null;
  url: string;
}

export interface WebFacts {
  day_pass?: WebFact<{ amount: number; currency: string }>;
  advertised_mbps?: WebFact<number>;
  phone_booths?: WebFact<true>;
  meeting_rooms?: WebFact<true>;
  open_24_7?: WebFact<true>;
  wifi_mentioned?: WebFact<true>;
  laptops?: WebFact<'welcome' | 'not_allowed'>;
  opening_hours?: WebFact<string>;
  price_range?: WebFact<string>;
  description?: WebFact<string>;
  _checked?: WebFact<string>;
}

/** Hard facts members can add or correct (see place_facts). */
export type FactKey =
  | 'open_24_7'
  | 'meeting_rooms'
  | 'phone_booths'
  | 'wifi'
  | 'laptops'
  | 'opening_hours'
  | 'price_range'
  | 'day_pass';

export interface DayPassValue {
  amount: number;
  currency: string;
}

/** Booleans for yes/no facts (wifi also 'unreliable'), 1–4 for price_range, 'welcome' | 'not_allowed' for laptops. */
export type FactValue = boolean | number | string | DayPassValue;

export type FactInput = Partial<Record<FactKey, FactValue>>;

/** Row of `get_place_facts`. */
export interface PlaceFactEntry {
  key: FactKey;
  value: FactValue;
  pending_value: FactValue | null;
  status: 'pending' | 'approved' | 'rejected';
  pending_delete: boolean;
  /** `null` for visitors without an account. */
  author_name: string | null;
  is_own: boolean;
  updated_at: string;
}

export type MenuKind = 'menu' | 'hours';

/** Row of `get_place_menus`: a member's photo of the menu, price list or opening hours sign. */
export interface PlaceMenu {
  id: string;
  path: string;
  kind: MenuKind;
  /** `null` for visitors without an account. */
  author_name: string | null;
  is_own: boolean;
  created_at: string;
  status: 'pending' | 'approved' | 'rejected';
}

/** Row of `get_place_wifi_notes`; content and author are `null` for visitors without an account. */
export interface PlaceWifiNote {
  id: string;
  body: string | null;
  photo_path: string | null;
  /** Signed URL of the photo, filled in client-side for members. */
  photo_url: string | null;
  has_photo: boolean;
  is_locked: boolean;
  author_name: string | null;
  is_own: boolean;
  created_at: string;
}

export type OfferKind = 'deal' | 'referral';

/** Row of `get_place_offers`; link, code and author are `null` for visitors without an account. */
export interface PlaceOffer {
  id: string;
  kind: OfferKind;
  title: string;
  details: string | null;
  url: string | null;
  code: string | null;
  /** The offer has a link or code that is hidden until the visitor signs up. */
  is_locked: boolean;
  expires_on: string | null;
  author_name: string | null;
  is_own: boolean;
  created_at: string;
  status: 'pending' | 'approved' | 'rejected';
}

/** Each part is on a 0–10 scale; `score` is the weighted total (see compute_place_score). */
export interface ScoreBreakdown {
  score: number;
  reviews: number;
  wifi: number;
  facts: number;
  completeness: number;
  category: number;
}

export interface Place {
  id: string;
  city_id: string;
  slug: string;
  name: string;
  category: PlaceCategory;
  status: PlaceStatus;
  description: string | null;
  address: string | null;
  lat: number;
  lng: number;
  website: string | null;
  opening_hours: string | null;
  price_level: number | null;
  day_pass_price_cents: number | null;
  wifi: WifiValue;
  power_outlets: PowerValue;
  focus: FocusValue;
  calls: CallsValue;
  laptop_rules: string | null;
  last_verified_at: string | null;
  is_example: boolean;
  review_count: number;
  rating_avg: number | null;
  created_at: string;
  updated_at: string;
  source: 'osm' | 'user' | 'admin';
  osm_type: 'node' | 'way' | 'relation' | null;
  osm_id: number | null;
  osm_tags: Record<string, string> | null;
  osm_seen_at: string | null;
  name_local: string | null;
  phone: string | null;
  internet_fee: InternetFeeValue;
  outdoor_seating: YesNoUnknown;
  wheelchair: 'yes' | 'limited' | 'no' | 'unknown';
  web_facts: WebFacts;
  web_crawl_status: WebCrawlStatus;
  web_crawled_at: string | null;
  locked_fields: string[];
  review_reason: PlaceReviewReason | null;
  /** Website that was removed because it was parked or dead. */
  flagged_website: string | null;
  website_status: 'ok' | 'parked' | 'dead' | null;
  website_fail_count: number;
  download_median_mbps: number | null;
  upload_median_mbps: number | null;
  ping_median_ms: number | null;
  speed_test_count: number;
  last_speed_test_at: string | null;
  mobile_download_median_mbps: number | null;
  mobile_upload_median_mbps: number | null;
  mobile_ping_median_ms: number | null;
  mobile_speed_test_count: number;
  /** Combined member answer to the `wifi` fact; lowers the score when 'unreliable'. */
  wifi_community: WifiCommunityValue | null;
  text_review_count: number;
  work_score: number;
  score_breakdown: ScoreBreakdown | null;
  season: SeasonValue;
  season_note: string | null;
  /** Whether people who do not stay there can work there (colivings). */
  non_guest_work: YesNoUnknown;
  non_guest_note: string | null;
  min_stay: string | null;
}

/** Row of `list_cities`. */
export interface CityListItem {
  id: string;
  slug: string;
  name: string;
  country_code: string;
  country_name: string;
  region: string | null;
  continent: Continent | null;
  population: number | null;
  is_hotspot: boolean;
  cover_url: string | null;
  cover_thumb_url: string | null;
  cover_attribution: string | null;
  crawl_status: CrawlStatus;
  place_count: number;
  coworking_count: number;
  cafe_count: number;
  library_count: number;
  review_count: number;
  speed_test_count: number;
  median_download_mbps: number | null;
  top_score: number | null;
  city_score: number | null;
  total_count: number;
}

export type CitySort = 'score' | 'name' | 'places' | 'wifi' | 'reviews' | 'population';
export type RankingSort = 'score' | 'rating' | 'wifi' | 'reviews' | 'name';

/** Row of `get_city_ranking`. */
export interface RankedPlace {
  id: string;
  slug: string;
  name: string;
  name_local: string | null;
  category: PlaceCategory;
  address: string | null;
  lat: number;
  lng: number;
  website: string | null;
  opening_hours: string | null;
  price_level: number | null;
  day_pass_price_cents: number | null;
  wifi: WifiValue;
  power_outlets: PowerValue;
  calls: CallsValue;
  focus: FocusValue;
  internet_fee: InternetFeeValue;
  outdoor_seating: YesNoUnknown;
  web_day_pass: WebFact<{ amount: number; currency: string }> | null;
  download_median_mbps: number | null;
  upload_median_mbps: number | null;
  speed_test_count: number;
  rating_avg: number | null;
  review_count: number;
  text_review_count: number;
  work_score: number;
  score_rank: number;
  cover_preview_url: string | null;
  cover_full_url: string | null;
  total_count: number;
}

export interface RankingFilters {
  category: PlaceCategory | 'all';
  sort: RankingSort;
  wifi: boolean;
  power: boolean;
  calls: boolean;
  q: string;
}

export const defaultRankingFilters: RankingFilters = {
  category: 'all',
  sort: 'score',
  wifi: false,
  power: false,
  calls: false,
  q: '',
};

/** Detail averages; only readable with an account. */
export interface PlaceRatingStats {
  place_id: string;
  wifi_avg: number | null;
  power_avg: number | null;
  quiet_avg: number | null;
  comfort_avg: number | null;
  value_avg: number | null;
  calls_ok_count: number;
  calls_answers: number;
}

export type NetworkType = 'wifi' | 'cellular' | 'unknown';

export type SpeedTestVerification = 'verified' | 'too_far' | 'low_accuracy' | 'no_location' | 'cellular';

/** What a test measured: the venue's Wi‑Fi or the member's own mobile data (hotspot). */
export type SpeedTestKind = 'wifi' | 'mobile';

export interface SpeedTest {
  id: string;
  download_mbps: number;
  upload_mbps: number | null;
  ping_ms: number | null;
  on_site: boolean;
  created_at: string;
  is_own: boolean;
  author_name: string | null;
  note: string | null;
  kind: SpeedTestKind;
  carrier: string | null;
}

export interface CityContributor {
  rank: number;
  user_id: string;
  display_name: string | null;
  avatar_path: string | null;
  points: number;
  points_pending: number;
  is_guide: boolean;
  city_reviews: number;
}

export interface PlaceToRate {
  id: string;
  slug: string;
  name: string;
  category: PlaceCategory;
  address: string | null;
  work_score: number;
  review_count: number;
}

export interface PlacePhoto {
  id: string;
  place_id: string;
  sort_order: number;
  preview_url: string;
  full_path: string;
  full_url: string | null;
}

export interface PlaceReview {
  id: string;
  place_id: string;
  user_id: string | null;
  rating: number;
  body: string | null;
  author_name: string | null;
  author_points: number | null;
  /** Set for signed-in viewers so the name can open a profile. */
  author_id: string | null;
  author_avatar_path: string | null;
  author_points_pending: number | null;
  author_is_guide: boolean;
  /** The author's edit of an already live review, visible to them and admins. */
  edit_status: 'pending' | 'rejected' | null;
  wifi_rating: number | null;
  power_rating: number | null;
  quiet_rating: number | null;
  comfort_rating: number | null;
  value_rating: number | null;
  calls_ok: boolean | null;
  visited_at: string | null;
  /** True when the review has text, also for locked reviews (text itself is then null). */
  has_body: boolean;
  created_at: string;
  updated_at: string;
  /** Visitor without an account: author and detail ratings are hidden too. */
  is_locked: boolean;
  /** The review has text the caller has not unlocked yet. */
  body_locked: boolean;
  is_own: boolean;
  status: 'visible' | 'hidden' | 'pending' | 'rejected';
  /** Written in the Early Contributors coffee program; must be labelled as incentivized. */
  coffee_program: boolean;
}

export interface ReviewUnlockQuota {
  daily_limit: number;
  used_today: number;
  remaining: number;
  /** Plus and admins read every review without using unlocks. */
  unlimited: boolean;
}

export interface ReviewInput {
  rating: number;
  body: string;
  wifi_rating: number | null;
  power_rating: number | null;
  quiet_rating: number | null;
  comfort_rating: number | null;
  value_rating: number | null;
  calls_ok: boolean | null;
}

export interface Profile {
  id: string;
  display_name: string | null;
  created_at: string;
  points: number;
  /** Points inside `points` that are not confirmed yet. */
  points_pending: number;
  /** Earned or manually granted Local Guide. */
  is_guide: boolean;
  review_count: number;
  speed_test_count: number;
  home_city_id: string | null;
  city_ids: string[];
  avatar_path: string | null;
  onboarded_at: string | null;
}

export interface PublicProfile {
  id: string;
  display_name: string;
  avatar_path: string | null;
  points: number;
  points_pending: number;
  is_guide: boolean;
  review_count: number;
  photo_count: number;
  /** Only true for admins, and only when auto-publish was turned off. */
  guide_revoked: boolean;
}

export interface ProfilePlace {
  id: string;
  slug: string;
  name: string;
  category: PlaceCategory;
  lat: number;
  lng: number;
  rating: number | null;
  review_status: 'visible' | 'pending' | 'rejected' | null;
}

export interface ProfileReviewRow {
  id: string;
  place_id: string;
  place_slug: string;
  place_name: string;
  place_category: PlaceCategory;
  rating: number;
  body: string | null;
  has_body: boolean;
  created_at: string;
  status: 'visible' | 'hidden' | 'pending' | 'rejected';
  edit_status: 'pending' | 'rejected' | null;
  is_own: boolean;
  body_locked: boolean;
}

export interface ProfilePhotoRow {
  id: string;
  place_id: string;
  place_slug: string;
  place_name: string;
  preview_path: string;
  full_path: string;
  status: string;
  created_at: string;
}

export interface PendingContribution {
  kind: 'review' | 'photo' | 'suggestion' | 'fact' | 'menu' | 'offer';
  id: string | null;
  place_id: string | null;
  user_id: string;
  author_name: string;
  avatar_path: string | null;
  place_name: string;
  place_slug: string | null;
  created_at: string;
  summary: string;
  fact_key: string | null;
  image_path: string | null;
}

export interface Entitlement {
  user_id: string;
  status: 'active' | 'inactive';
  source: 'stripe' | 'revenuecat' | 'dev' | 'manual';
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  updated_at: string;
}

export interface Favorite {
  user_id: string;
  place_id: string;
  created_at: string;
}

export interface PlaceSuggestion {
  id: string;
  user_id: string;
  city_id: string | null;
  city_text: string | null;
  name: string;
  category: PlaceCategory;
  address: string | null;
  website: string | null;
  notes: string | null;
  status: 'pending' | 'approved' | 'rejected';
  place_id: string | null;
  created_at: string;
}

export interface PlaceReport {
  id: string;
  place_id: string;
  user_id: string;
  body: string;
  kind: 'other' | 'closed';
  status: 'open' | 'resolved';
  created_at: string;
}

export type ReportTargetType = 'review' | 'photo' | 'menu' | 'offer' | 'wifi_note' | 'profile';
export type ContentReportReason = 'illegal' | 'personal_data' | 'copyright' | 'spam' | 'offensive' | 'inaccurate' | 'other';
export type ModerationReason = 'rules' | 'illegal' | 'personal_data' | 'copyright' | 'spam' | 'offensive' | 'inaccurate' | 'duplicate';

export interface ContentReport {
  id: string;
  target_type: ReportTargetType;
  target_id: string;
  reason: ContentReportReason;
  body: string;
  status: 'open' | 'removed' | 'kept';
  decision_reason: ModerationReason | null;
  decision_note: string | null;
  decided_at: string | null;
  created_at: string;
  reporter_is_user: boolean;
  place_name: string | null;
  place_slug: string | null;
  author_id: string | null;
  author_name: string | null;
  content_text: string | null;
  content_image: string | null;
  content_exists: boolean;
}

export interface WaitlistEntry {
  id: string;
  city_id: string;
  email: string;
  first_name: string | null;
  status: 'pending' | 'verified' | 'left';
  verified_at: string | null;
  ambassador_email_status: 'not_sent' | 'sent' | 'failed';
  ambassador_email_error: string | null;
  ambassador_email_sent_at: string | null;
  created_at: string;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface MapCity {
  slug: string;
  name: string;
  lat: number;
  lng: number;
  zoom: number;
  place_count: number;
}

export interface MapPlace {
  id: string;
  slug: string;
  name: string;
  category: PlaceCategory;
  lat: number;
  lng: number;
  address: string | null;
  work_score: number;
  review_count: number;
  rating_avg: number | null;
  city: { slug: string; name: string } | null;
}

export interface CitySearchResult {
  name: string;
  countryCode: string;
  countryName: string;
  lat: number;
  lng: number;
  /** Region / state, used only to disambiguate in the UI. */
  region?: string;
}
