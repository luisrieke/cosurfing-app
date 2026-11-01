export function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatEuroCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '';
  const euros = cents / 100;
  return Number.isInteger(euros) ? `€${euros}` : `€${euros.toFixed(2)}`;
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

/** Day pass from the admin-entered price (EUR cents) or, failing that, the venue website. */
export function dayPassLabel(
  cents: number | null | undefined,
  web: { value: { amount: number; currency: string } } | null | undefined,
): string | null {
  if (cents !== null && cents !== undefined) return formatEuroCents(cents);
  if (web?.value) return formatMoney(web.value.amount, web.value.currency);
  return null;
}

export function formatMbps(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const n = Number(value);
  return n >= 100 ? `${Math.round(n)} Mbps` : `${n.toFixed(n < 10 ? 1 : 0)} Mbps`;
}

export function formatRating(avg: number | null | undefined): string {
  if (avg === null || avg === undefined) return '';
  return Number(avg).toFixed(1);
}

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function titleFromSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

export function normalizeWebsite(value: string | null | undefined): string | null {
  const v = (value ?? '').trim();
  if (!v) return null;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

/** The venue website, unless the crawler found it dead (it stays stored for the recheck). */
export function liveWebsite(place: { website: string | null; web_crawl_status?: string | null }): string | null {
  return place.web_crawl_status === 'dead' ? null : place.website;
}

export function hostFromUrl(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}
