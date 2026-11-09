// Billing actions for signed-in users. Entitlements are never written here as a result of a
// client claim: Stripe Checkout/Portal sessions are created, the Stripe webhook writes status.
// The only exception is the development toggle, which the server refuses unless
// ALLOW_DEV_ENTITLEMENTS=true and which is stored with source = 'dev' so it is never mistaken
// for a real purchase.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SITE_URL = (Deno.env.get('SITE_URL') ?? 'https://cosurfing.app').replace(/\/$/, '');
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const STRIPE_PRICES: Record<string, string> = {
  weekly: Deno.env.get('STRIPE_PRICE_ID_WEEKLY') ?? '',
  yearly: Deno.env.get('STRIPE_PRICE_ID_YEARLY') ?? '',
};
const ALLOW_DEV_ENTITLEMENTS = Deno.env.get('ALLOW_DEV_ENTITLEMENTS') === 'true';
// Requires Stripe Tax to be set up in the dashboard (origin address, OSS registration, prices with tax behaviour "inclusive").
const STRIPE_AUTOMATIC_TAX = Deno.env.get('STRIPE_AUTOMATIC_TAX') === 'true';

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

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

function stripeConfigured(): boolean {
  return Boolean(STRIPE_SECRET_KEY && (STRIPE_PRICES.weekly || STRIPE_PRICES.yearly));
}

function stripe(): Stripe {
  return new Stripe(STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });
}

interface EntitlementRow {
  user_id: string;
  status: 'active' | 'inactive';
  source: 'stripe' | 'revenuecat' | 'dev' | 'manual';
  stripe_customer_id: string | null;
  current_period_end: string | null;
}

async function getEntitlement(sb: SupabaseClient, userId: string): Promise<EntitlementRow | null> {
  const { data } = await sb
    .from('entitlements')
    .select('user_id, status, source, stripe_customer_id, current_period_end')
    .eq('user_id', userId)
    .maybeSingle();
  return (data as EntitlementRow | null) ?? null;
}

async function ensureStripeCustomer(sb: SupabaseClient, userId: string, email: string | undefined): Promise<string> {
  const existing = await getEntitlement(sb, userId);
  if (existing?.stripe_customer_id) return existing.stripe_customer_id;
  const customer = await stripe().customers.create({
    email,
    metadata: { supabase_user_id: userId },
  });
  if (existing) {
    await sb.from('entitlements').update({ stripe_customer_id: customer.id }).eq('user_id', userId);
  } else {
    await sb.from('entitlements').insert({
      user_id: userId,
      status: 'inactive',
      source: 'stripe',
      stripe_customer_id: customer.id,
    });
  }
  return customer.id;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const sb = admin();
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'unauthorized' }, 401);
  const { data: userData, error: userError } = await sb.auth.getUser(jwt);
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401);
  const user = userData.user;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  try {
    switch (body.action) {
      case 'status': {
        return json({
          stripe: stripeConfigured(),
          plans: { weekly: Boolean(STRIPE_PRICES.weekly), yearly: Boolean(STRIPE_PRICES.yearly) },
          devAllowed: ALLOW_DEV_ENTITLEMENTS,
        });
      }

      case 'checkout': {
        if (!stripeConfigured()) return json({ error: 'stripe_not_configured' }, 503);
        const plan = body.plan === 'yearly' ? 'yearly' : 'weekly';
        const price = STRIPE_PRICES[plan];
        if (!price) return json({ error: 'plan_not_configured' }, 503);
        // § 356 (4) / § 357a (2) BGB: service may only start within the withdrawal period on the consumer's express request.
        if (body.immediate_start !== true) return json({ error: 'consent_required' }, 400);
        const termsVersion = typeof body.terms_version === 'string' ? body.terms_version.slice(0, 20) : '';
        const consentAt = new Date().toISOString();
        const current = await getEntitlement(sb, user.id);
        if (current?.status === 'active' && current.source !== 'dev') return json({ error: 'already_subscribed' }, 409);
        const customerId = await ensureStripeCustomer(sb, user.id, user.email ?? undefined);
        const session = await stripe().checkout.sessions.create({
          mode: 'subscription',
          customer: customerId,
          client_reference_id: user.id,
          line_items: [{ price, quantity: 1 }],
          subscription_data: {
            metadata: {
              supabase_user_id: user.id,
              plan,
              terms_version: termsVersion,
              immediate_start_consent_at: consentAt,
            },
          },
          success_url: `${SITE_URL}/plus/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${SITE_URL}/plus`,
          allow_promotion_codes: false,
          locale: 'auto',
          custom_text: {
            submit: {
              message: `Prices include VAT. Your subscription renews automatically until you cancel it, at any time, at ${SITE_URL}/cancel or in your account. Terms: ${SITE_URL}/terms · Right of withdrawal: ${SITE_URL}/withdrawal`,
            },
          },
          ...(STRIPE_AUTOMATIC_TAX
            ? {
                automatic_tax: { enabled: true },
                billing_address_collection: 'required' as const,
                customer_update: { address: 'auto' as const, name: 'auto' as const },
              }
            : {}),
        });
        if (!session.url) return json({ error: 'server_error' }, 500);
        return json({ url: session.url });
      }

      case 'portal': {
        if (!stripeConfigured()) return json({ error: 'stripe_not_configured' }, 503);
        const current = await getEntitlement(sb, user.id);
        if (!current?.stripe_customer_id) return json({ error: 'no_stripe_customer' }, 404);
        const portal = await stripe().billingPortal.sessions.create({
          customer: current.stripe_customer_id,
          return_url: `${SITE_URL}/account`,
        });
        return json({ url: portal.url });
      }

      case 'dev_toggle': {
        if (!ALLOW_DEV_ENTITLEMENTS) return json({ error: 'dev_not_allowed' }, 403);
        const enabled = body.enabled === true;
        const current = await getEntitlement(sb, user.id);
        // Never clobber a real subscription with a simulated one.
        if (current && current.source !== 'dev' && current.status === 'active') {
          return json({ error: 'real_subscription_active' }, 409);
        }
        const row = {
          user_id: user.id,
          status: enabled ? 'active' : 'inactive',
          source: 'dev',
          current_period_end: enabled ? new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString() : null,
          cancel_at_period_end: false,
        };
        const { error } = await sb.from('entitlements').upsert(row, { onConflict: 'user_id' });
        if (error) return json({ error: 'server_error' }, 500);
        return json({ status: row.status });
      }

      default:
        return json({ error: 'unknown_action' }, 400);
    }
  } catch (e) {
    console.error('billing error', e instanceof Error ? e.message : e);
    return json({ error: 'server_error' }, 500);
  }
});
