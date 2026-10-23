// Stripe webhook: the only place Stripe subscriptions turn into Plus entitlements.
// Deployed with verify_jwt = false (Stripe does not send a Supabase JWT); authenticity is
// established by verifying the Stripe signature with STRIPE_WEBHOOK_SECRET.

import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';

// Created lazily: constructing Stripe with an empty key throws, and we want a clean 503 instead.
let stripeClient: Stripe | null = null;
function stripe(): Stripe {
  if (!stripeClient) stripeClient = new Stripe(STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });
  return stripeClient;
}
const cryptoProvider = Stripe.createSubtleCryptoProvider();

function sb() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

// Stripe moved current_period_end from the subscription to its items in newer API versions.
function periodEnd(sub: Stripe.Subscription): string | null {
  const direct = (sub as unknown as { current_period_end?: number }).current_period_end;
  const fromItem = (sub.items?.data?.[0] as unknown as { current_period_end?: number } | undefined)?.current_period_end;
  const ts = direct ?? fromItem;
  return ts ? new Date(ts * 1000).toISOString() : null;
}

async function resolveUserId(sub: Stripe.Subscription): Promise<string | null> {
  const fromMeta = sub.metadata?.supabase_user_id;
  if (fromMeta) return fromMeta;
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const { data } = await sb().from('entitlements').select('user_id').eq('stripe_customer_id', customerId).maybeSingle();
  if (data?.user_id) return data.user_id as string;
  const customer = await stripe().customers.retrieve(customerId);
  if (!customer.deleted && customer.metadata?.supabase_user_id) return customer.metadata.supabase_user_id;
  return null;
}

async function applySubscription(sub: Stripe.Subscription): Promise<void> {
  const userId = await resolveUserId(sub);
  if (!userId) {
    console.error('stripe webhook: could not map subscription to a user', sub.id);
    return;
  }
  const active = sub.status === 'active' || sub.status === 'trialing' || sub.status === 'past_due';
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const { error } = await sb()
    .from('entitlements')
    .upsert(
      {
        user_id: userId,
        status: active ? 'active' : 'inactive',
        source: 'stripe',
        stripe_customer_id: customerId,
        stripe_subscription_id: sub.id,
        current_period_end: periodEnd(sub),
        cancel_at_period_end: Boolean(sub.cancel_at_period_end),
      },
      { onConflict: 'user_id' },
    );
  if (error) throw new Error(error.message);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    return new Response('stripe not configured', { status: 503 });
  }
  const signature = req.headers.get('stripe-signature');
  if (!signature) return new Response('missing signature', { status: 400 });
  const payload = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(payload, signature, STRIPE_WEBHOOK_SECRET, undefined, cryptoProvider);
  } catch (e) {
    console.error('stripe signature verification failed', e instanceof Error ? e.message : e);
    return new Response('invalid signature', { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === 'subscription' && session.subscription) {
          const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
          const sub = await stripe().subscriptions.retrieve(subId);
          if (!sub.metadata?.supabase_user_id && session.client_reference_id) {
            sub.metadata = { ...sub.metadata, supabase_user_id: session.client_reference_id };
          }
          await applySubscription(sub);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        await applySubscription(event.data.object as Stripe.Subscription);
        break;
      }
      default:
        // Other events are acknowledged without action.
        break;
    }
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('stripe webhook handler failed', e instanceof Error ? e.message : e);
    // Non-2xx makes Stripe retry.
    return new Response('handler error', { status: 500 });
  }
});
