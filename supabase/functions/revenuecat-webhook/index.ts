// RevenueCat webhook: turns App Store / Play purchases into Plus entitlements.
// Deployed with verify_jwt = false; authenticity is established by the shared secret that
// RevenueCat sends in the Authorization header (configure the same value as
// REVENUECAT_WEBHOOK_AUTH). The app signs in to RevenueCat with the Supabase user id, so
// app_user_id maps 1:1 to auth.users.id.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const REVENUECAT_WEBHOOK_AUTH = Deno.env.get('REVENUECAT_WEBHOOK_AUTH') ?? '';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RevenueCatEvent {
  type: string;
  app_user_id: string;
  original_app_user_id?: string;
  aliases?: string[];
  expiration_at_ms?: number | null;
  entitlement_ids?: string[] | null;
  transferred_from?: string[];
  transferred_to?: string[];
}

function sb() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

function pickUserId(ids: (string | undefined)[]): string | null {
  for (const id of ids) if (id && UUID_RE.test(id)) return id;
  return null;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function setEntitlement(userId: string, active: boolean, expiresAtMs: number | null | undefined, cancelAtPeriodEnd: boolean, appUserId: string) {
  const { error } = await sb()
    .from('entitlements')
    .upsert(
      {
        user_id: userId,
        status: active ? 'active' : 'inactive',
        source: 'revenuecat',
        revenuecat_app_user_id: appUserId,
        current_period_end: expiresAtMs ? new Date(expiresAtMs).toISOString() : null,
        cancel_at_period_end: cancelAtPeriodEnd,
      },
      { onConflict: 'user_id' },
    );
  if (error) throw new Error(error.message);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  if (!REVENUECAT_WEBHOOK_AUTH) return new Response('revenuecat not configured', { status: 503 });
  const auth = req.headers.get('authorization') ?? '';
  if (!timingSafeEqual(auth, REVENUECAT_WEBHOOK_AUTH) && !timingSafeEqual(auth, `Bearer ${REVENUECAT_WEBHOOK_AUTH}`)) {
    return new Response('unauthorized', { status: 401 });
  }

  let event: RevenueCatEvent;
  try {
    const body = (await req.json()) as { event?: RevenueCatEvent };
    if (!body.event) return new Response('missing event', { status: 400 });
    event = body.event;
  } catch {
    return new Response('invalid json', { status: 400 });
  }

  try {
    const stillValid = typeof event.expiration_at_ms === 'number' ? event.expiration_at_ms > Date.now() : true;
    const userId = pickUserId([event.app_user_id, event.original_app_user_id, ...(event.aliases ?? [])]);

    switch (event.type) {
      case 'TEST':
        break;
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'UNCANCELLATION':
      case 'PRODUCT_CHANGE':
      case 'NON_RENEWING_PURCHASE':
      case 'SUBSCRIPTION_EXTENDED':
        if (userId) await setEntitlement(userId, stillValid, event.expiration_at_ms, false, event.app_user_id);
        break;
      case 'CANCELLATION':
        // Auto-renew turned off: access continues until expiration.
        if (userId) await setEntitlement(userId, stillValid, event.expiration_at_ms, true, event.app_user_id);
        break;
      case 'EXPIRATION':
      case 'SUBSCRIPTION_PAUSED':
        if (userId) await setEntitlement(userId, false, event.expiration_at_ms, false, event.app_user_id);
        break;
      case 'BILLING_ISSUE':
        // Grace handling is left to the store; keep the current state until EXPIRATION arrives.
        break;
      case 'TRANSFER': {
        const from = pickUserId(event.transferred_from ?? []);
        const to = pickUserId(event.transferred_to ?? []);
        if (from) await setEntitlement(from, false, null, false, from);
        if (to) await setEntitlement(to, stillValid, event.expiration_at_ms, false, to);
        break;
      }
      default:
        break;
    }
    if (!userId && event.type !== 'TEST' && event.type !== 'TRANSFER') {
      console.warn('revenuecat webhook: app_user_id is not a Supabase user id', event.app_user_id);
    }
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('revenuecat webhook failed', e instanceof Error ? e.message : e);
    return new Response('handler error', { status: 500 });
  }
});
