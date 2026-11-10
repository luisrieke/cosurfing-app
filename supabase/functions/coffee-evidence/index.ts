// Admin access to coffee campaign proof (receipts, location and review screenshots).
// The bucket has no storage policies; this function checks that the caller is an admin, hands
// out signed URLs that expire after 5 minutes and logs every access in coffee_evidence_access.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const URL_TTL_SECONDS = 300;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'unauthorized' }, 401);
  const { data: userData, error: userError } = await sb.auth.getUser(jwt);
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401);
  const { data: admin } = await sb.from('admin_users').select('user_id').eq('user_id', userData.user.id).maybeSingle();
  if (!admin) return json({ error: 'not_allowed' }, 403);

  let body: { participant_id?: string; evidence_ids?: string[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  if (!body.participant_id || !UUID_RE.test(body.participant_id)) return json({ error: 'participant_required' }, 400);

  const { data: participant } = await sb.from('coffee_participants').select('id, user_id').eq('id', body.participant_id).maybeSingle();
  if (!participant) return json({ error: 'not_found' }, 404);

  let query = sb.from('coffee_evidence').select('id, storage_path').eq('user_id', participant.user_id).not('storage_path', 'is', null);
  const ids = (body.evidence_ids ?? []).filter((id) => UUID_RE.test(id)).slice(0, 50);
  if (ids.length) query = query.in('id', ids);
  const { data: rows, error } = await query;
  if (error) return json({ error: error.message }, 500);
  if (!rows?.length) return json({ urls: {} });

  const { data: signed, error: signError } = await sb.storage
    .from('coffee-evidence')
    .createSignedUrls(rows.map((r) => r.storage_path as string), URL_TTL_SECONDS);
  if (signError) return json({ error: signError.message }, 500);

  const byPath = new Map((signed ?? []).filter((s) => s.signedUrl && s.path).map((s) => [s.path as string, s.signedUrl]));
  const urls: Record<string, string> = {};
  for (const r of rows) {
    const url = byPath.get(r.storage_path as string);
    if (url) urls[r.id as string] = url;
  }
  await sb.from('coffee_evidence_access').insert({
    admin_id: userData.user.id,
    participant_id: participant.id,
    evidence_ids: Object.keys(urls),
  });
  return json({ urls, expires_in: URL_TTL_SECONDS });
});
