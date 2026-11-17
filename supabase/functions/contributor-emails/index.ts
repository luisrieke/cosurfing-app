// Sends queued contributor emails (public.contributor_emails): "your review is live", "How was X?"
// and the monthly impact digest. POST is invoked by pg_cron through invoke_crawler, authenticated
// with the crawler secret. GET ?unsubscribe=<token> is the one-click unsubscribe link.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { emailConfigured, sendEmail } from '../_shared/email.ts';
import { type Email, impactDigestEmail, reviewLiveEmail, type Suggestion, unsubscribedPage, visitPromptEmail } from './templates.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SITE_URL = (Deno.env.get('SITE_URL') ?? 'https://cosurfing.app').replace(/\/$/, '');
const BATCH = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Row {
  id: string;
  kind: 'review_live' | 'visit_prompt' | 'impact_digest';
  user_id: string;
  place_id: string | null;
  place_name: string | null;
  place_slug: string | null;
  city_id: string | null;
  city_name: string | null;
  city_slug: string | null;
  display_name: string;
  email_token: string;
  payload: { views?: number; unlocks?: number; reviews?: number };
  attempts: number;
}

function unsubscribeUrl(token: string): string {
  return `${SUPABASE_URL}/functions/v1/contributor-emails?unsubscribe=${token}`;
}

async function suggestions(sb: SupabaseClient, row: Row): Promise<Suggestion[]> {
  if (!row.city_id) return [];
  const { data } = await sb.rpc('contributor_email_suggestions', {
    p_user: row.user_id,
    p_city: row.city_id,
    p_exclude: row.place_id,
    p_limit: 3,
  });
  return (data ?? []) as Suggestion[];
}

async function compose(sb: SupabaseClient, row: Row): Promise<Email | null> {
  const city = row.city_slug && row.city_name ? { name: row.city_name, slug: row.city_slug } : null;
  const place = row.place_slug && row.place_name ? { name: row.place_name, slug: row.place_slug } : null;
  if (row.kind === 'review_live') {
    if (!place) return null;
    return reviewLiveEmail({ site: SITE_URL, name: row.display_name, place, city, suggestions: await suggestions(sb, row) });
  }
  if (row.kind === 'visit_prompt') {
    if (!place) return null;
    return visitPromptEmail({ site: SITE_URL, name: row.display_name, place, unsubscribeUrl: unsubscribeUrl(row.email_token) });
  }
  return impactDigestEmail({
    site: SITE_URL,
    name: row.display_name,
    views: Number(row.payload.views ?? 0),
    unlocks: Number(row.payload.unlocks ?? 0),
    reviews: Number(row.payload.reviews ?? 0),
    city,
    suggestions: await suggestions(sb, row),
    unsubscribeUrl: unsubscribeUrl(row.email_token),
  });
}

Deno.serve(async (req) => {
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // GET from the footer link, POST from mail clients' one-click unsubscribe (RFC 8058).
  const token = new URL(req.url).searchParams.get('unsubscribe');
  if (token !== null && (req.method === 'GET' || req.method === 'POST')) {
    let ok = false;
    if (UUID.test(token)) {
      const { data } = await sb.rpc('contributor_unsubscribe', { p_token: token });
      ok = data === true;
    }
    return new Response(unsubscribedPage(SITE_URL, ok), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
  if (req.method !== 'POST') return new Response('method_not_allowed', { status: 405 });

  const secret = req.headers.get('x-crawler-secret') ?? '';
  const { data: ok } = await sb.rpc('check_crawler_secret', { p_secret: secret });
  if (!secret || ok !== true) return new Response('unauthorized', { status: 401 });

  if (!emailConfigured()) return Response.json({ error: 'email_not_configured' }, { status: 503 });

  const { data, error } = await sb.rpc('contributor_email_batch', { p_limit: BATCH });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let sent = 0;
  for (const row of (data ?? []) as Row[]) {
    try {
      const { data: user } = await sb.auth.admin.getUserById(row.user_id);
      const to = user.user?.email ?? null;
      const email = to ? await compose(sb, row) : null;
      if (!to || !email) {
        await sb.from('contributor_emails').update({ skipped: to ? 'no_content' : 'no_recipient' }).eq('id', row.id);
        continue;
      }
      const headers =
        row.kind === 'review_live'
          ? undefined
          : {
              'List-Unsubscribe': `<${unsubscribeUrl(row.email_token)}>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            };
      await sendEmail({ to, subject: email.subject, html: email.html, text: email.text, headers });
      await sb.from('contributor_emails').update({ sent_at: new Date().toISOString(), last_error: null }).eq('id', row.id);
      sent++;
    } catch (e) {
      const message = (e instanceof Error ? e.message : String(e)).slice(0, 500);
      await sb.from('contributor_emails').update({ attempts: row.attempts + 1, last_error: message }).eq('id', row.id);
    }
  }
  return Response.json({ sent });
});
