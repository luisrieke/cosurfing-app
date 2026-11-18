import type { City, Place } from '@/lib/types';

// Tally fills hidden fields (and fields with a matching pre-populate name) from query params.
export function tallyUrl(base: string, params: Record<string, string>) {
  const query = Object.entries(params)
    .filter(([, v]) => v)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return `${base}${base.includes('?') ? '&' : '?'}${query}`;
}

export function placeFormParams(
  place: Place & { city: City },
  user: { id: string; email?: string | null } | null,
): Record<string, string> {
  return {
    place_id: place.id,
    place_slug: place.slug,
    place_name: place.name,
    city: place.city.name,
    user_id: user?.id ?? '',
    email: user?.email ?? '',
  };
}
