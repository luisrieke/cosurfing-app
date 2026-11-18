import type { IconName } from '@/components/ui/Icon';
import { strings } from '@/lib/strings';
import type { Place, PlaceContacts, PlaceReportKind } from '@/lib/types';

interface ReportKindInfo {
  label: string;
  icon: IconName;
  placeholder: string;
  /** What the place page shows today, so the reporter can see what they are correcting. */
  current?: (place: Place, contacts: PlaceContacts | null) => string | null;
}

const s = strings.report;

export const REPORT_KINDS: Record<PlaceReportKind, ReportKindInfo> = {
  name: { label: s.kindName, icon: 'type', placeholder: s.namePlaceholder, current: (p) => p.name },
  address: { label: s.kindAddress, icon: 'home', placeholder: s.addressPlaceholder, current: (p) => p.address },
  location: { label: s.kindLocation, icon: 'map-pin', placeholder: s.locationPlaceholder },
  hours: { label: s.kindHours, icon: 'clock', placeholder: s.hoursPlaceholder, current: (p) => p.opening_hours },
  contact: {
    label: s.kindContact,
    icon: 'globe',
    placeholder: s.contactPlaceholder,
    current: (p, c) =>
      [p.website, c?.phone ?? p.phone, c?.email, c?.instagram ? `@${c.instagram}` : null].filter(Boolean).join(' · ') || null,
  },
  closed: { label: s.kindClosed, icon: 'x-circle', placeholder: s.closedPlaceholder },
  other: { label: s.kindOther, icon: 'edit-3', placeholder: s.placeholder },
};

export const REPORT_KIND_ORDER = Object.keys(REPORT_KINDS) as PlaceReportKind[];

export function isReportKind(value: unknown): value is PlaceReportKind {
  return typeof value === 'string' && value in REPORT_KINDS;
}
