/**
 * RevenueCat wrapper for iOS/Android. The native module is loaded lazily so the web
 * bundle and Expo Go (no native module) never crash at import time. Entitlements are
 * written to Supabase by the RevenueCat webhook only; the client never sets Plus itself.
 */
import { Platform } from 'react-native';

import type { PlusPlan } from './billing';
import { env, isNativePaymentsConfigured } from './env';

export const PLUS_ENTITLEMENT_ID = 'plus';

export interface PlanOffer {
  identifier: string;
  priceString: string;
  title: string;
}

interface OfferingLike {
  weekly: PackageLike | null;
  annual: PackageLike | null;
  availablePackages: PackageLike[];
}

interface PurchasesModule {
  configure(opts: { apiKey: string; appUserID?: string | null }): void;
  isConfigured(): Promise<boolean>;
  logIn(appUserID: string): Promise<unknown>;
  logOut(): Promise<unknown>;
  getOfferings(): Promise<{ current: OfferingLike | null }>;
  purchasePackage(pkg: PackageLike): Promise<{ customerInfo: CustomerInfoLike }>;
  restorePurchases(): Promise<CustomerInfoLike>;
  getCustomerInfo(): Promise<CustomerInfoLike>;
  syncPurchases(): Promise<void>;
}

interface PackageLike {
  identifier: string;
  packageType?: string;
  product: { priceString: string; title: string };
}

interface CustomerInfoLike {
  entitlements: { active: Record<string, unknown> };
  managementURL: string | null;
}

export class PurchasesUnavailableError extends Error {
  constructor() {
    super('In-app purchases are not available in this build.');
    this.name = 'PurchasesUnavailableError';
  }
}

let mod: PurchasesModule | null | undefined;
let configuredFor: string | null = null;

function load(): PurchasesModule {
  if (mod === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const required = require('react-native-purchases') as { default?: PurchasesModule } & PurchasesModule;
      mod = (required.default ?? required) as PurchasesModule;
    } catch {
      mod = null;
    }
  }
  if (!mod) throw new PurchasesUnavailableError();
  return mod;
}

function apiKey(): string {
  return Platform.OS === 'ios' ? env.revenueCatIosKey : Platform.OS === 'android' ? env.revenueCatAndroidKey : '';
}

/** True when this platform has a RevenueCat key configured. Does not guarantee the native module exists. */
export const purchasesConfigured = isNativePaymentsConfigured;

/** Configure RevenueCat with the Supabase user id as app user id so webhooks can map purchases. */
export async function configurePurchases(userId: string): Promise<void> {
  if (!purchasesConfigured) throw new PurchasesUnavailableError();
  const P = load();
  try {
    if (configuredFor === null) {
      P.configure({ apiKey: apiKey(), appUserID: userId });
    } else if (configuredFor !== userId) {
      await P.logIn(userId);
    }
    configuredFor = userId;
  } catch (e) {
    throw wrap(e);
  }
}

function packageFor(offering: OfferingLike | null, plan: PlusPlan): PackageLike | null {
  if (!offering) return null;
  const type = plan === 'weekly' ? 'WEEKLY' : 'ANNUAL';
  return (
    (plan === 'weekly' ? offering.weekly : offering.annual) ??
    offering.availablePackages.find((p) => p.packageType === type) ??
    null
  );
}

/** Localized store prices for the plans the current offering contains. */
export async function getPlanOffers(): Promise<Partial<Record<PlusPlan, PlanOffer>>> {
  const P = load();
  try {
    const { current } = await P.getOfferings();
    const offers: Partial<Record<PlusPlan, PlanOffer>> = {};
    for (const plan of ['weekly', 'yearly'] as const) {
      const pkg = packageFor(current, plan);
      if (pkg) offers[plan] = { identifier: pkg.identifier, priceString: pkg.product.priceString, title: pkg.product.title };
    }
    return offers;
  } catch (e) {
    throw wrap(e);
  }
}

/** Returns true when the purchase completed and the Plus entitlement is active on the RevenueCat side. */
export async function purchasePlan(plan: PlusPlan): Promise<boolean> {
  const P = load();
  try {
    const offerings = await P.getOfferings();
    const pkg = packageFor(offerings.current, plan);
    if (!pkg) throw new Error('This plan is not configured in the store yet.');
    const { customerInfo } = await P.purchasePackage(pkg);
    return Boolean(customerInfo.entitlements.active[PLUS_ENTITLEMENT_ID]);
  } catch (e) {
    const err = e as { userCancelled?: boolean };
    if (err?.userCancelled) return false;
    throw wrap(e);
  }
}

export async function restorePurchases(): Promise<boolean> {
  const P = load();
  try {
    const info = await P.restorePurchases();
    return Boolean(info.entitlements.active[PLUS_ENTITLEMENT_ID]);
  } catch (e) {
    throw wrap(e);
  }
}

export async function getManagementUrl(): Promise<string | null> {
  const P = load();
  try {
    const info = await P.getCustomerInfo();
    return info.managementURL;
  } catch {
    return null;
  }
}

function wrap(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e);
  if (/native module|RNPurchases|null is not an object|not linked/i.test(msg)) return new PurchasesUnavailableError();
  return e instanceof Error ? e : new Error(msg);
}
