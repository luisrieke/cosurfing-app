// Receives city batches from scripts/import-cities.mjs and upserts them with the service role.
// Deployed with verify_jwt = false; callers authenticate with the crawler secret stored in Vault.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const secret = req.headers.get('x-crawler-secret') ?? '';
  const { data: ok } = await sb.rpc('check_crawler_secret', { p_secret: secret });
  if (!secret || ok !== true) return json({ error: 'unauthorized' }, 401);

  let body: { cities?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  if (!Array.isArray(body.cities) || body.cities.length === 0 || body.cities.length > 500) {
    return json({ error: 'expected 1-500 cities' }, 400);
  }

  const { data, error } = await sb.rpc('import_cities', { p_items: body.cities });
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, result: data });
});
