import { env } from './env';
import { functionUrl, supabase } from './supabase';

export type JoinStatus = 'pending_sent' | 'pending_resent' | 'already_verified' | 'city_active';
export type WaitlistError =
  | 'invalid_email'
  | 'missing_city'
  | 'missing_country'
  | 'rate_limited'
  | 'email_not_configured'
  | 'email_failed'
  | 'invalid_token'
  | 'server_error'
  | 'network';

export class WaitlistApiError extends Error {
  code: WaitlistError;
  constructor(code: WaitlistError) {
    super(code);
    this.code = code;
  }
}

async function call<T>(body: Record<string, unknown>, withSession = false): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: env.supabaseAnonKey,
  };
  if (withSession && supabase) {
    const { data } = await supabase.auth.getSession();
    if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  let res: Response;
  try {
    res = await fetch(functionUrl('waitlist'), { method: 'POST', headers, body: JSON.stringify(body) });
  } catch {
    throw new WaitlistApiError('network');
  }
  const json = (await res.json().catch(() => ({}))) as { error?: WaitlistError } & T;
  if (!res.ok) throw new WaitlistApiError(json.error ?? 'server_error');
  return json;
}

export interface JoinInput {
  email: string;
  city: string;
  country: string;
  countryCode: string;
  firstName?: string;
  lat?: number;
  lng?: number;
  /** Honeypot. Must stay empty for humans. */
  website: string;
}

export function joinWaitlist(input: JoinInput) {
  return call<{ status: JoinStatus; city?: { slug: string; name: string } }>({ action: 'join', ...input });
}

export function confirmWaitlist(token: string) {
  return call<{
    status: 'verified' | 'already_verified';
    city: { slug: string; name: string; status: 'active' | 'waitlist' };
    ambassadorEmail?: 'sent' | 'failed' | 'skipped';
  }>({ action: 'confirm', token });
}

export function leaveWaitlist(token: string) {
  return call<{ status: 'left'; city: { slug: string; name: string } | null }>({ action: 'leave', token });
}

export function retryAmbassadorEmail(entryId: string) {
  return call<{ status: 'sent' | 'failed' | 'skipped' }>({ action: 'retry_ambassador', entryId }, true);
}
