import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Href } from 'expo-router';

import type { TestContext } from './speedtest';
import type { PlaceCategory, SpeedTestKind } from './types';

const VIEWS_KEY = 'cosurfing.funnel.placeViews';
const DISMISSED_KEY = 'cosurfing.funnel.interstitialDismissedAt';
const INTERSTITIAL_PAUSE_MS = 3 * 24 * 60 * 60 * 1000;

let bannerDismissedThisSession = false;
let interstitialShownThisSession = false;

export function signUpHref(redirect?: string, mode: 'signup' | 'login' = 'signup'): Href {
  return {
    pathname: '/auth/sign-in',
    params: { ...(redirect ? { redirect } : {}), ...(mode === 'login' ? { mode } : {}) },
  } as Href;
}

export function isBannerDismissed(): boolean {
  return bannerDismissedThisSession;
}

export function dismissBanner(): void {
  bannerDismissedThisSession = true;
}

/** Counts place page views of visitors without an account. */
export async function recordPlaceView(): Promise<number> {
  try {
    const n = Number((await AsyncStorage.getItem(VIEWS_KEY)) ?? '0') + 1;
    await AsyncStorage.setItem(VIEWS_KEY, String(n));
    return n;
  } catch {
    return 0;
  }
}

/** The interstitial shows once per session at most, and pauses for 3 days after "Maybe later". */
export async function canShowInterstitial(): Promise<boolean> {
  if (interstitialShownThisSession) return false;
  try {
    const at = Number((await AsyncStorage.getItem(DISMISSED_KEY)) ?? '0');
    return !at || Date.now() - at > INTERSTITIAL_PAUSE_MS;
  } catch {
    return true;
  }
}

export function markInterstitialShown(): void {
  interstitialShownThisSession = true;
}

const PENDING_TEST_KEY = 'cosurfing.funnel.pendingSpeedTest';
const PENDING_TEST_MAX_AGE_MS = 30 * 60 * 1000;

export interface PendingSpeedTest {
  placeId: string;
  kind: SpeedTestKind;
  downloadMbps: number;
  uploadMbps: number | null;
  pingMs: number | null;
  context: TestContext;
  at: number;
}

/** Keeps a visitor's speed test result across sign-up so it can still be saved. */
export async function stashSpeedTest(test: Omit<PendingSpeedTest, 'at'>): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_TEST_KEY, JSON.stringify({ ...test, at: Date.now() }));
  } catch {
    // not critical
  }
}

export async function takeStashedSpeedTest(placeId: string, kind: SpeedTestKind): Promise<PendingSpeedTest | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_TEST_KEY);
    if (!raw) return null;
    const test = JSON.parse(raw) as PendingSpeedTest;
    if (test.placeId !== placeId || !test.context || (test.kind ?? 'wifi') !== kind) return null;
    await AsyncStorage.removeItem(PENDING_TEST_KEY);
    return Date.now() - test.at < PENDING_TEST_MAX_AGE_MS ? test : null;
  } catch {
    return null;
  }
}

const SUGGESTION_DRAFT_KEY = 'cosurfing.funnel.suggestionDraft';

export interface SuggestionDraft {
  /** A known city, or `id: null` for a free-text city that is not in our list yet. */
  city: { id: string | null; label: string } | null;
  name: string;
  category: PlaceCategory;
  address: string;
  website: string;
  notes: string;
  /** Set when a visitor finished the form and went to create an account to send it. */
  awaitingAccount: boolean;
}

/** Keeps a visitor's place suggestion across reloads and sign-up. */
export async function saveSuggestionDraft(draft: SuggestionDraft): Promise<void> {
  try {
    await AsyncStorage.setItem(SUGGESTION_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // not critical
  }
}

export async function loadSuggestionDraft(): Promise<SuggestionDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(SUGGESTION_DRAFT_KEY);
    return raw ? (JSON.parse(raw) as SuggestionDraft) : null;
  } catch {
    return null;
  }
}

export async function clearSuggestionDraft(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SUGGESTION_DRAFT_KEY);
  } catch {
    // not critical
  }
}

export async function dismissInterstitial(): Promise<void> {
  interstitialShownThisSession = true;
  try {
    await AsyncStorage.setItem(DISMISSED_KEY, String(Date.now()));
  } catch {
    // storage unavailable (private mode); the session flag still applies
  }
}
