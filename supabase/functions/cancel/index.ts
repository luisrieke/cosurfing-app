// Cancellation button (§ 312k BGB). Public, no sign-in: the request is identified by name and
// email address. Every request is recorded and confirmed by email with the time of receipt and
// the date the contract ends. The response never reveals whether the email has an account.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';

import { emailConfigured, sendEmail } from '../_shared/email.ts';
import { operatorFooterText } from '../_shared/operator.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SITE_URL = (Deno.env.get('SITE_URL') ?? 'https://cosurfing.app').replace(/\/$/, '');
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const RATE_LIMIT_SALT = Deno.env.get('RATE_LIMIT_SALT') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function cleanText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) && value.length <= 254;
}

function clientIp(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-real-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function rateLimit(sb: SupabaseClient, key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const { data, error } = await sb.rpc('consume_rate_limit', { p_key: key, p_limit: limit, p_window_seconds: windowSeconds });
  if (error) return true;
  return Boolean(data);
}

function periodEnd(sub: Stripe.Subscription): number | null {
  const direct = (sub as unknown as { current_period_end?: number }).current_period_end;
  const fromItem = (sub.items?.data?.[0] as unknown as { current_period_end?: number } | undefined)?.current_period_end;
  return direct ?? fromItem ?? null;
}

function formatUtc(d: Date): string {
  return `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

type Outcome = 'scheduled' | 'store' | 'no_subscription' | 'failed';

async function applyCancellation(
  sb: SupabaseClient,
  userId: string | null,
  requestedDate: string | null,
): Promise<{ outcome: Outcome; effectiveAt: Date | null }> {
  if (!userId) return { outcome: 'no_subscription', effectiveAt: null };
  const { data: ent } = await sb
    .from('entitlements')
    .select('status, source, stripe_subscription_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (!ent || ent.status !== 'active') return { outcome: 'no_subscription', effectiveAt: null };
  if (ent.source === 'revenuecat') return { outcome: 'store', effectiveAt: null };
  if (ent.source !== 'stripe' || !ent.stripe_subscription_id || !STRIPE_SECRET_KEY) return { outcome: 'no_subscription', effectiveAt: null };

  const stripe = new Stripe(STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });
  const sub = await stripe.subscriptions.retrieve(ent.stripe_subscription_id);
  const end = periodEnd(sub);
  const requested = requestedDate ? Math.floor(new Date(`${requestedDate}T23:59:59Z`).getTime() / 1000) : null;
  if (requested && end && requested > end) {
    // A later end date than the current period: keep the subscription until then, without proration.
    const updated = await stripe.subscriptions.update(sub.id, { cancel_at: requested, proration_behavior: 'none' });
    return { outcome: 'scheduled', effectiveAt: new Date((updated.cancel_at ?? requested) * 1000) };
  }
  await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
  return { outcome: 'scheduled', effectiveAt: end ? new Date(end * 1000) : null };
}

function confirmationText(input: {
  name: string;
  email: string;
  kind: 'ordinary' | 'extraordinary';
  reason: string;
  requestedDate: string | null;
  receivedAt: Date;
  outcome: Outcome;
  effectiveAt: Date | null;
}): string {
  const lines = [
    `Hi ${input.name},`,
    '',
    'we have received your cancellation of Cosurfing Plus.',
    '',
    `Received: ${formatUtc(input.receivedAt)}`,
    `Type: ${input.kind === 'ordinary' ? 'ordinary cancellation' : 'extraordinary cancellation (for cause)'}`,
    ...(input.reason ? [`Reason: ${input.reason}`] : []),
    `Requested end: ${input.requestedDate ?? 'earliest possible date'}`,
    `Account email: ${input.email}`,
    '',
  ];
  if (input.outcome === 'scheduled') {
    lines.push(
      input.effectiveAt
        ? `Your subscription ends on ${formatUtc(input.effectiveAt)}. You keep Plus until then and will not be charged again.`
        : 'Your subscription ends at the end of the current billing period. You will not be charged again.',
    );
    if (input.kind === 'extraordinary') {
      lines.push('', 'We will check your reason for an extraordinary cancellation and contact you if it ends your subscription earlier.');
    }
  } else if (input.outcome === 'store') {
    lines.push(
      'Your subscription was bought in the iOS or Android app, so it is managed by Apple or Google. Please cancel it in your App Store or Google Play subscription settings; we have recorded your cancellation and will help if that does not work.',
    );
  } else if (input.outcome === 'failed') {
    lines.push('We could not process the cancellation automatically. We have recorded it and will process it by hand within one business day, effective at the earliest possible date.');
  } else {
    lines.push('We could not find an active web subscription for this email address. If you subscribed with a different address, please cancel again with that address or reply to this email.');
  }
  lines.push('', 'Keep this email as your confirmation.', '', 'Luis from Cosurfing');
  return lines.join('\n') + operatorFooterText(SITE_URL);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const name = cleanText(body.name, 120);
  const email = cleanText(body.email, 254).toLowerCase();
  const kind = body.kind === 'extraordinary' ? 'extraordinary' : 'ordinary';
  const reason = cleanText(body.reason, 2000);
  const requestedDate = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : null;
  if (!name) return json({ error: 'name_required' }, 400);
  if (!isEmail(email)) return json({ error: 'invalid_email' }, 400);
  if (kind === 'extraordinary' && !reason) return json({ error: 'reason_required' }, 400);

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const ipHash = await sha256(`${RATE_LIMIT_SALT}:${clientIp(req)}`);
  if (!(await rateLimit(sb, `cancel:ip:${ipHash}`, 10, 3600)) || !(await rateLimit(sb, `cancel:email:${email}`, 5, 3600))) {
    return json({ error: 'rate_limited' }, 429);
  }

  const receivedAt = new Date();
  const { data: userId } = await sb.rpc('find_user_id_by_email', { p_email: email });

  let result: { outcome: Outcome; effectiveAt: Date | null };
  try {
    result = await applyCancellation(sb, (userId as string | null) ?? null, requestedDate);
  } catch (e) {
    console.error('cancel error', e instanceof Error ? e.message : e);
    result = { outcome: 'failed', effectiveAt: null };
  }

  const { error } = await sb.from('cancellation_requests').insert({
    email,
    name,
    kind,
    reason: reason || null,
    requested_date: requestedDate,
    user_id: userId ?? null,
    outcome: result.outcome,
    effective_at: result.effectiveAt?.toISOString() ?? null,
    created_at: receivedAt.toISOString(),
  });
  if (error) {
    console.error('cancel insert error', error.message);
    return json({ error: 'server_error' }, 500);
  }

  if (emailConfigured()) {
    const text = confirmationText({ name, email, kind, reason, requestedDate, receivedAt, ...result });
    await sendEmail({
      to: email,
      subject: 'Your Cosurfing Plus cancellation',
      text,
      html: `<pre style="font-family:inherit;white-space:pre-wrap;">${text.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</pre>`,
    }).catch((e) => console.error('cancel email error', e instanceof Error ? e.message : e));
  }

  return json({ receivedAt: receivedAt.toISOString() });
});
