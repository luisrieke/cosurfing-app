import AsyncStorage from '@react-native-async-storage/async-storage';

import { strings } from './strings';
import { requireSupabase, supabase } from './supabase';

/** Bump together with coffee_campaign.terms_version whenever /free-coffee/terms changes. */
export const COFFEE_TERMS_VERSION = '2026-11-11';
export const COFFEE_TERMS_UPDATED = 'November 11, 2026';

export type CoffeeStep = 'contribute' | 'new_place' | 'spread';
export type CoffeeRewardStatus = 'not_started' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'paid';
export type CoffeeSpotStatus = 'reserved' | 'held' | 'confirmed' | 'waitlisted' | 'released';
export type CoffeeCampaignStatus = 'draft' | 'live' | 'paused' | 'closed';

export const COFFEE_STEPS: CoffeeStep[] = ['contribute', 'new_place', 'spread'];

export type CoffeeChannel = 'instagram' | 'tiktok' | 'x';

/** Where participants send their proof as a direct message. */
export const COFFEE_CHANNELS: { id: CoffeeChannel; label: string; handle: string; url: string }[] = [
  { id: 'instagram', label: 'Instagram', handle: '@luisbuildsinpublic', url: 'https://ig.me/m/luisbuildsinpublic' },
  { id: 'tiktok', label: 'TikTok', handle: '@luisbuildsinpublic', url: 'https://www.tiktok.com/@luisbuildsinpublic' },
  { id: 'x', label: 'X', handle: '@luisbu1lds', url: 'https://x.com/luisbu1lds' },
];

export interface CoffeeCampaign {
  status: CoffeeCampaignStatus;
  max_participants: number;
  spots_taken: number;
  max_coffee_cents: number;
  reservation_days: number;
  starts_at: string | null;
  ends_at: string | null;
  submissions_close_at: string | null;
  terms_version: string;
}

export interface CoffeeReward {
  step: CoffeeStep;
  status: CoffeeRewardStatus;
  attempts: number;
  approved_cents: number | null;
  paid_cents: number | null;
  decision_reason: string | null;
  decision_note: string | null;
  submitted_at: string | null;
  paid_at: string | null;
  can_submit: boolean;
}

export interface CoffeeStatus {
  campaign: CoffeeCampaign;
  participant: {
    code: string;
    social_channel: CoffeeChannel | null;
    social_handle: string | null;
    spot_status: CoffeeSpotStatus;
    reserved_until: string | null;
    released_reason: 'expired' | 'rejected' | 'disqualified' | 'withdrawn' | 'campaign_closed' | null;
    waitlist_position: number | null;
    joined_at: string;
    can_rejoin: boolean;
  } | null;
  rewards: CoffeeReward[];
  payout?: { needed: boolean; method: 'paypal' | 'sepa' | null; hint: string | null };
}

export function spotsLeft(c: CoffeeCampaign): number {
  return Math.max(0, c.max_participants - c.spots_taken);
}

export function isCampaignOpen(c: CoffeeCampaign | null | undefined): boolean {
  return Boolean(c && c.status === 'live');
}

export function formatEuros(cents: number | null | undefined): string {
  return `€${((cents ?? 0) / 100).toFixed(2).replace(/\.00$/, '')}`;
}

let publicCache: { at: number; promise: Promise<CoffeeCampaign | null> } | null = null;

/** Public campaign state (status and spots), cached for a minute. Null without a backend. */
export function getCoffeeCampaign(force = false): Promise<CoffeeCampaign | null> {
  if (!supabase) return Promise.resolve(null);
  if (!force && publicCache && Date.now() - publicCache.at < 60_000) return publicCache.promise;
  const promise = (async () => {
    const { data, error } = await requireSupabase().rpc('coffee_campaign_public');
    if (error) throw new Error(error.message);
    return (data as CoffeeCampaign | null) ?? null;
  })();
  publicCache = { at: Date.now(), promise };
  promise.catch(() => {
    publicCache = null;
  });
  return promise;
}

export async function getCoffeeStatus(): Promise<CoffeeStatus> {
  const { data, error } = await requireSupabase().rpc('coffee_my_status');
  if (error) throw new Error(error.message);
  const status = data as CoffeeStatus;
  if (status.participant) void rememberParticipation();
  return status;
}

export async function joinCoffeeCampaign(): Promise<CoffeeStatus> {
  const { data, error } = await requireSupabase().rpc('coffee_join', { p_terms_version: COFFEE_TERMS_VERSION });
  if (error) throw new Error(error.message);
  publicCache = null;
  void rememberParticipation();
  return data as CoffeeStatus;
}

export async function withdrawFromCoffeeCampaign(): Promise<void> {
  const { error } = await requireSupabase().rpc('coffee_withdraw');
  if (error) throw new Error(error.message);
  publicCache = null;
}

/** Records that the proof for these steps went out as a direct message, so the spot is held while it is reviewed. */
export async function markCoffeeSent(steps: CoffeeStep[], channel: CoffeeChannel, handle: string): Promise<CoffeeStatus> {
  const { data, error } = await requireSupabase().rpc('coffee_mark_sent', { p_steps: steps, p_channel: channel, p_handle: handle });
  if (error) throw new Error(error.message);
  return data as CoffeeStatus;
}

export async function saveCoffeePayoutDetails(input: {
  method: 'paypal' | 'sepa';
  accountHolder: string;
  paypalEmail?: string;
  iban?: string;
}): Promise<void> {
  const { error } = await requireSupabase().rpc('coffee_save_payout_details', {
    p_method: input.method,
    p_account_holder: input.accountHolder,
    p_paypal_email: input.method === 'paypal' ? input.paypalEmail ?? null : null,
    p_iban: input.method === 'sepa' ? input.iban ?? null : null,
  });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Guest popup: device-local flags only (see privacy policy, "Storage on your device")
// ---------------------------------------------------------------------------

const PARTICIPATED_KEY = 'cosurfing.coffee.participated';
const PROMO_DISMISSED_KEY = 'cosurfing.coffee.promoDismissedAt';
const PROMO_PAUSE_MS = 14 * 24 * 60 * 60 * 1000;

async function rememberParticipation(): Promise<void> {
  try {
    await AsyncStorage.setItem(PARTICIPATED_KEY, '1');
  } catch {
    // not critical
  }
}

/** The coffee popup replaces the sign-up popup while the program is open, never for people who already take part on this device. */
export async function canShowCoffeePromo(): Promise<boolean> {
  try {
    const [participated, dismissedAt] = await Promise.all([
      AsyncStorage.getItem(PARTICIPATED_KEY),
      AsyncStorage.getItem(PROMO_DISMISSED_KEY),
    ]);
    if (participated) return false;
    const at = Number(dismissedAt ?? '0');
    if (at && Date.now() - at < PROMO_PAUSE_MS) return false;
  } catch {
    // storage unavailable: fall through to the campaign check
  }
  const campaign = await getCoffeeCampaign().catch(() => null);
  return isCampaignOpen(campaign) && spotsLeft(campaign!) > 0;
}

export async function dismissCoffeePromo(): Promise<void> {
  try {
    await AsyncStorage.setItem(PROMO_DISMISSED_KEY, String(Date.now()));
  } catch {
    // not critical
  }
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export interface CoffeeAdminOverview {
  campaign: CoffeeCampaign & { reservation_days: number; resubmit_days: number; max_attempts: number; updated_at: string };
  spots_taken: number;
  participants: Partial<Record<CoffeeSpotStatus, number>>;
  rewards: Partial<Record<CoffeeRewardStatus, number>>;
  approved_unpaid_cents: number;
  paid_cents: number;
  unsent_notices: number;
}

export interface CoffeeAdminRow {
  participant_id: string;
  user_id: string;
  email: string;
  display_name: string | null;
  spot_status: CoffeeSpotStatus;
  reserved_until: string | null;
  released_reason: string | null;
  joined_at: string;
  rewards: Partial<Record<CoffeeStep, CoffeeRewardStatus>>;
  needs_action: boolean;
  last_submitted_at: string | null;
  code: string;
  social_channel: CoffeeChannel | null;
  social_handle: string | null;
}

export interface CoffeeAdminReward {
  id: string;
  step: CoffeeStep;
  status: CoffeeRewardStatus;
  attempts: number;
  submitted_at: string | null;
  submitted_by: 'participant' | 'admin' | null;
  can_record: boolean;
  checks: Record<string, boolean | string>;
  referral_user_id: string | null;
  referral_email: string | null;
  approved_cents: number | null;
  decision_reason: string | null;
  decision_note: string | null;
  decided_at: string | null;
  paid_cents: number | null;
  paid_at: string | null;
}

export interface CoffeeAdminDetail {
  participant: {
    id: string;
    user_id: string;
    code: string;
    social_channel: CoffeeChannel | null;
    social_handle: string | null;
    email: string;
    display_name: string | null;
    account_created_at: string;
    spot_status: CoffeeSpotStatus;
    reserved_until: string | null;
    released_reason: string | null;
    joined_at: string;
    terms_version: string;
    admin_note: string | null;
  };
  rewards: CoffeeAdminReward[];
  reviews: { id: string; place_name: string; place_slug: string; rating: number; body: string | null; status: string; created_at: string; coffee_program: boolean }[];
  photos: number;
  suggestions: { id: string; name: string; city: string | null; status: string; created_at: string }[];
  payout_details: { method: 'paypal' | 'sepa'; account_holder: string; paypal_email: string | null; iban: string | null } | null;
  payouts: { id: string; step: string; amount_cents: number; method: string; reference: string | null; paid_at: string }[];
}

/** Human-readable message for an error raised by a coffee_admin_* RPC. */
export function coffeeAdminError(e: unknown): string {
  const code = e instanceof Error ? e.message : 'server_error';
  const known: Record<string, string> = {
    approve_base_first: 'Approve Step 1 first. Bonus steps need an approved base contribution.',
    amount_exceeds_receipt: 'The amount is higher than the receipt total.',
    invalid_amount: 'Enter an amount between €0.01 and the maximum per coffee.',
    receipt_details_required: 'Enter the venue, date and total from the receipt.',
    receipt_already_reimbursed: 'This receipt (same venue, date, total and number) was already reimbursed.',
    note_required: 'Add a note that explains the reason.',
    nothing_to_submit: 'This step cannot be recorded right now (already sent, Step 1 missing, or no active spot).',
    referral_not_found: 'No Cosurfing account uses this email. Approve without an email if it is a public post.',
    referral_self: 'That is the participant’s own account.',
    referral_too_old: 'The friend’s account was created before the participant joined.',
    referral_used: 'This friend was already used for a referral.',
    invalid_state: 'This step changed in the meantime. Reload the page.',
    spot_not_held: 'The participant has no active spot.',
    below_committed_spots: 'Max participants cannot be lower than the number of held and confirmed spots.',
    invalid_dates: 'The end date must be after the start date.',
    not_allowed: strings.admin.notAllowed,
  };
  return known[code] ?? `${strings.common.somethingWentWrong} (${code})`;
}

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await requireSupabase().rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const coffeeAdmin = {
  overview: () => rpc<CoffeeAdminOverview>('coffee_admin_overview'),
  list: () => rpc<CoffeeAdminRow[]>('coffee_admin_list'),
  get: (participantId: string) => rpc<CoffeeAdminDetail>('coffee_admin_get', { p_participant: participantId }),
  updateCampaign: (input: {
    status: CoffeeCampaignStatus;
    maxParticipants: number;
    startsAt: string | null;
    endsAt: string | null;
    submissionsCloseAt: string | null;
  }) =>
    rpc<void>('coffee_admin_update_campaign', {
      p_status: input.status,
      p_max_participants: input.maxParticipants,
      p_starts_at: input.startsAt,
      p_ends_at: input.endsAt,
      p_submissions_close_at: input.submissionsCloseAt,
    }),
  markReceived: (rewardId: string) => rpc<void>('coffee_admin_decide', { p_reward: rewardId, p_decision: 'received' }),
  markUnderReview: (rewardId: string) => rpc<void>('coffee_admin_decide', { p_reward: rewardId, p_decision: 'under_review' }),
  approve: (
    rewardId: string,
    input: { cents: number; note: string; merchant: string; date: string; totalCents: number; receiptNumber: string; referralEmail?: string },
  ) =>
    rpc<void>('coffee_admin_decide', {
      p_reward: rewardId,
      p_decision: 'approve',
      p_note: input.note || null,
      p_approved_cents: input.cents,
      p_receipt_merchant: input.merchant,
      p_receipt_date: input.date,
      p_receipt_total_cents: input.totalCents,
      p_receipt_number: input.receiptNumber || null,
      p_referral_email: input.referralEmail || null,
    }),
  reject: (rewardId: string, reason: string, note: string) =>
    rpc<void>('coffee_admin_decide', { p_reward: rewardId, p_decision: 'reject', p_reason: reason, p_note: note || null }),
  markPaid: (rewardId: string, cents: number, method: 'paypal' | 'sepa' | 'other', reference: string) =>
    rpc<void>('coffee_admin_mark_paid', { p_reward: rewardId, p_paid_cents: cents, p_method: method, p_reference: reference || null }),
  participant: (participantId: string, action: 'extend' | 'release' | 'disqualify' | 'note', note?: string) =>
    rpc<void>('coffee_admin_participant', { p_participant: participantId, p_action: action, p_note: note ?? null }),
};
