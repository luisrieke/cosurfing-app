import { env } from './env';
import { functionUrl } from './supabase';

export interface CancellationInput {
  name: string;
  email: string;
  kind: 'ordinary' | 'extraordinary';
  reason?: string;
  /** YYYY-MM-DD, or null for the earliest possible date. */
  date: string | null;
}

/** Sends a cancellation (§ 312k BGB). Works without signing in; returns the time we received it. */
export async function submitCancellation(input: CancellationInput): Promise<{ receivedAt: string }> {
  const res = await fetch(functionUrl('cancel'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: env.supabaseAnonKey },
    body: JSON.stringify(input),
  });
  const json = (await res.json().catch(() => ({}))) as { receivedAt?: string; error?: string };
  if (!res.ok || !json.receivedAt) throw new Error(json.error ?? 'server_error');
  return { receivedAt: json.receivedAt };
}
