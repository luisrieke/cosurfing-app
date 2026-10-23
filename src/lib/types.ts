export type CityStatus = 'active' | 'waitlist';
export type PlaceCategory = 'coworking' | 'cafe';
export type PlaceStatus = 'draft' | 'published' | 'archived';
export type WifiValue = 'yes' | 'no' | 'unknown';
export type PowerValue = 'plenty' | 'some' | 'none' | 'unknown';
export type FocusValue = 'great' | 'okay' | 'poor' | 'unknown';
export type CallsValue = 'yes' | 'limited' | 'no' | 'unknown';

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
}

/** Published place as shown in lists, with its cover photo resolved for the current viewer. */
export interface PublicPlace extends Place {
  /** Always available: tiny blurred preview (public bucket). */
  cover_preview_url: string | null;
  /** Signed full-resolution URL, only when the viewer may see it. */
  cover_full_url: string | null;
  /** True when a café cover exists but the viewer is on the free plan. */
  cover_photo_locked: boolean;
}

export interface PlacePhoto {
  id: string;
  place_id: string;
  sort_order: number;
  preview_url: string;
  /** `null` when the caller is not allowed to see the full photo. */
  full_path: string | null;
  full_url: string | null;
  locked: boolean;
}

export interface PlaceReview {
  id: string;
  place_id: string;
  user_id: string | null;
  rating: number;
  body: string | null;
  author_name: string | null;
  created_at: string;
  updated_at: string;
  is_locked: boolean;
  is_own: boolean;
  status: 'visible' | 'hidden';
}

export interface Profile {
  id: string;
  display_name: string | null;
  created_at: string;
}

export interface Entitlement {
  user_id: string;
  status: 'active' | 'inactive';
  source: 'stripe' | 'revenuecat' | 'dev';
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
  created_at: string;
}

export interface PlaceReport {
  id: string;
  place_id: string;
  user_id: string;
  body: string;
  status: 'open' | 'resolved';
  created_at: string;
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

export interface PlaceFilters {
  category: PlaceCategory | 'all';
  wifi: boolean;
  power: boolean;
  calls: boolean;
}

export const defaultFilters: PlaceFilters = {
  category: 'all',
  wifi: false,
  power: false,
  calls: false,
};

export interface LatLng {
  lat: number;
  lng: number;
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
