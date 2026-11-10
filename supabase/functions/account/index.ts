// Account self-service for signed-in users. `delete` removes the auth user; database rows go
// with it through `on delete cascade`, except place photos, which stay without the uploader's
// name (`uploaded_by` is set null) as covered by the Terms of Use. Storage files are not
// covered by the cascade, so they are removed here first.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';

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

async function removeFiles(sb: SupabaseClient, bucket: string, paths: (string | null)[]): Promise<void> {
  const list = paths.filter((p): p is string => Boolean(p));
  for (let i = 0; i < list.length; i += 100) {
    const { error } = await sb.storage.from(bucket).remove(list.slice(i, i + 100));
    if (error) throw new Error(`storage_${bucket}: ${error.message}`);
  }
}

async function deleteAccount(sb: SupabaseClient, userId: string): Promise<{ storeSubscription: boolean }> {
  const { data: entitlement } = await sb
    .from('entitlements')
    .select('status, source, stripe_subscription_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (entitlement?.stripe_subscription_id && STRIPE_SECRET_KEY) {
    const stripe = new Stripe(STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });
    try {
      await stripe.subscriptions.cancel(entitlement.stripe_subscription_id);
    } catch (e) {
      // Already canceled subscriptions are fine; anything else must stop the deletion.
      const code = (e as { code?: string }).code;
      if (code !== 'resource_missing') throw e;
    }
  }

  const [avatars, menus, wifi, coffee] = await Promise.all([
    sb.storage.from('avatars').list(userId, { limit: 1000 }),
    sb.from('place_menus').select('path').eq('user_id', userId),
    sb.from('place_wifi_notes').select('photo_path').eq('user_id', userId),
    sb.from('coffee_evidence').select('storage_path').eq('user_id', userId),
  ]);
  await removeFiles(sb, 'avatars', (avatars.data ?? []).map((f) => `${userId}/${f.name}`));
  await removeFiles(sb, 'place-menus', (menus.data ?? []).map((r) => r.path as string));
  await removeFiles(sb, 'place-wifi', (wifi.data ?? []).map((r) => r.photo_path as string | null));
  await removeFiles(sb, 'coffee-evidence', (coffee.data ?? []).map((r) => r.storage_path as string | null));

  const { error } = await sb.auth.admin.deleteUser(userId);
  if (error) throw new Error(`delete_user: ${error.message}`);

  return { storeSubscription: entitlement?.status === 'active' && entitlement.source === 'revenuecat' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const sb = admin();
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'unauthorized' }, 401);
  const { data: userData, error: userError } = await sb.auth.getUser(jwt);
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  try {
    switch (body.action) {
      case 'delete': {
        if (body.confirm !== 'DELETE') return json({ error: 'confirmation_required' }, 400);
        return json(await deleteAccount(sb, userData.user.id));
      }
      default:
        return json({ error: 'unknown_action' }, 400);
    }
  } catch (e) {
    console.error('account error', e instanceof Error ? e.message : e);
    return json({ error: 'server_error' }, 500);
  }
});
