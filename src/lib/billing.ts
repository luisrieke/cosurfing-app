import { env } from './env';
import { functionUrl, requireSupabase } from './supabase';

export class BillingApiError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
    this.name = 'BillingApiError';
  }
}

export type PlusPlan = 'weekly' | 'yearly';

export interface BillingStatus {
  stripe: boolean;
  plans: Record<PlusPlan, boolean>;
  devAllowed: boolean;
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data } = await requireSupabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new BillingApiError('unauthorized');
  let res: Response;
  try {
    res = await fetch(functionUrl('billing'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.supabaseAnonKey,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new BillingApiError('network');
  }
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new BillingApiError(json.error ?? 'server_error');
  return json;
}

/** Which server-side billing options exist. Never trust this for access decisions; it only shapes the UI. */
export function getBillingStatus(): Promise<BillingStatus> {
  return call<BillingStatus>({ action: 'status' });
}

/** Creates a Stripe Checkout session (web) and returns its URL. */
export function createCheckout(plan: PlusPlan): Promise<{ url: string }> {
  return call<{ url: string }>({ action: 'checkout', platform: 'web', plan });
}

/** Opens the Stripe customer portal for subscription management (web). */
export function createPortal(): Promise<{ url: string }> {
  return call<{ url: string }>({ action: 'portal' });
}

/**
 * Development only: asks the server to set a simulated entitlement.
 * The server refuses unless ALLOW_DEV_ENTITLEMENTS=true. This is never a purchase.
 */
export function setDevEntitlement(enabled: boolean): Promise<{ status: 'active' | 'inactive' }> {
  return call<{ status: 'active' | 'inactive' }>({ action: 'dev_toggle', enabled });
}
