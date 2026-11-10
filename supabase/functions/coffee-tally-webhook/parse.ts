// Maps a Tally FORM_RESPONSE payload to the campaign steps. Questions are matched by their exact
// title (case-insensitive), so the labels below must match the form; see docs/free-coffee.md.

export type Step = 'contribute' | 'new_place' | 'spread';
export type EvidenceKind =
  | 'review_screenshot'
  | 'photos_screenshot'
  | 'location_screenshot'
  | 'receipt'
  | 'place_screenshot'
  | 'share_screenshot';

export const LABELS = {
  token: 'token',
  base: 'base',
  place: 'place',
  share: 'share',
  email: 'Email',
  rules: 'Campaign rules',
  reviewScreenshot: 'Review screenshot',
  photosScreenshot: 'Photos screenshot',
  placeReviewed: 'Place reviewed',
  genuineVisit: 'Genuine visit',
  locationScreenshot: 'Location screenshot',
  receipt: 'Receipt',
  visitDate: 'Visit date',
  amount: 'Coffee amount',
  newPlace: 'New place submitted',
  newPlaceScreenshot: 'New place screenshot',
  newPlaceName: 'New place name or link',
  newPlaceReceipt: 'New place receipt',
  newPlaceAmount: 'New place coffee amount',
  share_choice: 'Spread the word',
  friendEmail: "Friend's email",
  friendConsent: 'Friend agreed',
  postUrl: 'Post URL',
  postScreenshot: 'Post screenshot',
  shareReceipt: 'Share receipt',
  shareAmount: 'Share coffee amount',
  confirmation: 'Final confirmation',
} as const;

export interface TallyFile {
  id?: string;
  name?: string;
  url: string;
  mimeType?: string;
  size?: number;
}

interface TallyOption {
  id: string;
  text: string;
}

export interface TallyField {
  key: string;
  label: string | null;
  type: string;
  value: unknown;
  options?: TallyOption[];
}

export interface TallyPayload {
  eventId?: string;
  eventType: string;
  createdAt?: string;
  data: {
    responseId?: string;
    submissionId: string;
    formId: string;
    createdAt?: string;
    fields: TallyField[];
  };
}

export interface ParsedFile {
  step: Step;
  kind: EvidenceKind;
  file: TallyFile;
}

export interface ParsedSubmission {
  submissionId: string;
  formId: string;
  submittedAt: string | null;
  token: string;
  steps: Step[];
  preIgnored: Partial<Record<Step, string>>;
  answers: Record<string, string | number | boolean | null>;
  claimed: Partial<Record<Step, number>>;
  referralEmail: string | null;
  files: ParsedFile[];
}

function norm(label: string | null | undefined): string {
  return (label ?? '').trim().toLowerCase();
}

function byLabel(fields: TallyField[], label: string): TallyField | undefined {
  const want = norm(label);
  // Checkbox questions also arrive as one boolean field per option ("Label (Option)"); prefer the question itself.
  return fields.find((f) => norm(f.label) === want);
}

/** Selected option texts for choice questions, or the plain value as text. */
export function texts(field: TallyField | undefined): string[] {
  if (!field || field.value === null || field.value === undefined) return [];
  const values = Array.isArray(field.value) ? field.value : [field.value];
  return values
    .map((v) => {
      if (typeof v === 'boolean') return v ? 'true' : '';
      const s = String(v);
      return field.options?.find((o) => o.id === s)?.text ?? s;
    })
    .filter((s) => s.trim() !== '');
}

function text(fields: TallyField[], label: string): string | null {
  const t = texts(byLabel(fields, label));
  return t.length ? t.join(', ').trim().slice(0, 500) : null;
}

function checked(fields: TallyField[], label: string): boolean {
  const f = byLabel(fields, label);
  if (!f) return false;
  if (typeof f.value === 'boolean') return f.value;
  return texts(f).length > 0;
}

function files(fields: TallyField[], label: string): TallyFile[] {
  const f = byLabel(fields, label);
  if (!f || !Array.isArray(f.value)) return [];
  return (f.value as unknown[]).filter(
    (v): v is TallyFile => typeof v === 'object' && v !== null && typeof (v as TallyFile).url === 'string',
  );
}

/** Euro amount typed by the participant ("4,20", "4.2", 4.2) in cents; null when unreadable. */
export function cents(value: string | null): number | null {
  const cleaned = (value ?? '').replace(/[^\d.,-]/g, '').replace(',', '.');
  if (!/\d/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0 || n > 1000) return null;
  return Math.round(n * 100);
}

function isoDate(value: string | null): string | null {
  if (!value) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return m ? m[1]! : null;
}

const YES = /^(yes|ja|true)\b/i;

export function parseSubmission(payload: TallyPayload): ParsedSubmission {
  const fields = payload.data.fields ?? [];
  const L = LABELS;
  const steps: Step[] = [];
  const preIgnored: Partial<Record<Step, string>> = {};
  const out: ParsedFile[] = [];
  const add = (step: Step, kind: EvidenceKind, label: string) => {
    for (const file of files(fields, label).slice(0, 5)) out.push({ step, kind, file });
  };

  const rules = checked(fields, L.rules);
  const confirmed = checked(fields, L.confirmation);
  const consent = rules && confirmed;

  // Hidden fields tell which sections were shown; the server checks again either way.
  const baseOpen = text(fields, L.base) === 'open';
  const placeOpen = text(fields, L.place) === 'open';
  const shareOpen = text(fields, L.share) === 'open';

  if (baseOpen) {
    if (!consent || !checked(fields, L.genuineVisit)) preIgnored.contribute = 'consent_missing';
    else if (files(fields, L.receipt).length === 0) preIgnored.contribute = 'receipt_missing';
    else steps.push('contribute');
    add('contribute', 'review_screenshot', L.reviewScreenshot);
    add('contribute', 'photos_screenshot', L.photosScreenshot);
    add('contribute', 'location_screenshot', L.locationScreenshot);
    add('contribute', 'receipt', L.receipt);
  }

  if (placeOpen && YES.test(text(fields, L.newPlace) ?? '')) {
    if (!consent) preIgnored.new_place = 'consent_missing';
    else if (files(fields, L.newPlaceReceipt).length === 0) preIgnored.new_place = 'receipt_missing';
    else steps.push('new_place');
    add('new_place', 'place_screenshot', L.newPlaceScreenshot);
    add('new_place', 'receipt', L.newPlaceReceipt);
  }

  const shareChoice = (text(fields, L.share_choice) ?? '').toLowerCase();
  const mode: 'referral' | 'post' | null = shareChoice.includes('friend')
    ? 'referral'
    : shareChoice.includes('post')
      ? 'post'
      : null;
  let referralEmail: string | null = null;
  if (shareOpen && mode) {
    if (mode === 'referral') {
      // Only used to find the friend's account, never stored; requires the friend's agreement.
      referralEmail = checked(fields, L.friendConsent) ? text(fields, L.friendEmail)?.toLowerCase() ?? null : null;
    }
    if (!consent) preIgnored.spread = 'consent_missing';
    else if (files(fields, L.shareReceipt).length === 0) preIgnored.spread = 'receipt_missing';
    else if (mode === 'referral' && !referralEmail) preIgnored.spread = 'friend_consent_missing';
    else if (mode === 'post' && !text(fields, L.postUrl)) preIgnored.spread = 'post_url_missing';
    else steps.push('spread');
    if (mode === 'post') add('spread', 'share_screenshot', L.postScreenshot);
    add('spread', 'receipt', L.shareReceipt);
  }

  return {
    submissionId: payload.data.submissionId ?? payload.data.responseId ?? '',
    formId: payload.data.formId,
    submittedAt: payload.data.createdAt ?? payload.createdAt ?? null,
    token: text(fields, L.token) ?? '',
    steps,
    preIgnored,
    answers: {
      email: text(fields, L.email),
      place_reviewed: baseOpen ? text(fields, L.placeReviewed) : null,
      visit_date: baseOpen ? isoDate(text(fields, L.visitDate)) : null,
      amount: baseOpen ? text(fields, L.amount) : null,
      new_place: placeOpen ? text(fields, L.newPlaceName) : null,
      new_place_amount: placeOpen ? text(fields, L.newPlaceAmount) : null,
      share_mode: shareOpen ? mode : null,
      post_url: shareOpen && mode === 'post' ? text(fields, L.postUrl) : null,
      share_amount: shareOpen ? text(fields, L.shareAmount) : null,
      friend_consent: shareOpen && mode === 'referral' ? checked(fields, L.friendConsent) : null,
      rules_accepted: rules,
      confirmed,
    },
    claimed: {
      contribute: cents(text(fields, L.amount)) ?? undefined,
      new_place: cents(text(fields, L.newPlaceAmount)) ?? undefined,
      spread: cents(text(fields, L.shareAmount)) ?? undefined,
    },
    referralEmail,
    files: out,
  };
}
