import QRCode from 'qrcode';

import { env } from './env';

/** Review link for venues to share or print; `src=venue` tracks reviews that come from it. */
export function venueReviewUrl(slug: string): string {
  return `${env.siteUrl.replace(/\/$/, '')}/place/${slug}/review?src=venue`;
}

/** Single-use link that makes whoever opens it (signed in) an owner of the place. */
export function ownerInviteUrl(token: string): string {
  return `${env.siteUrl.replace(/\/$/, '')}/owner/invite/${token}`;
}

export function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#2A211A', light: '#FFFFFF' } });
}

export function svgDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
