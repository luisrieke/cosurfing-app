// City waiting list: join (double opt-in), confirm, leave, and admin retry of the ambassador email.
// Deployed with verify_jwt = false: the public actions are anonymous by design (rate limited +
// honeypot); the admin action verifies the caller's Supabase session in code.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { EmailNotConfiguredError, emailConfigured, sendEmail } from './email.ts';
import { ambassadorEmail, confirmationEmail } from './templates.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SITE_URL = (Deno.env.get('SITE_URL') ?? 'https://cosurfing.app').replace(/\/$/, '');
const RATE_LIMIT_SALT = Deno.env.get('RATE_LIMIT_SALT') ?? 'cosurfing';

const CONFIRM_TTL_HOURS = 48;

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
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

async function rateLimit(sb: SupabaseClient, key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const { data, error } = await sb.rpc('consume_rate_limit', {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error('rate limit error', error.message);
    return true; // fail open rather than blocking legit users on a transient DB issue
  }
  return Boolean(data);
}

interface CityRow {
  id: string;
  slug: string;
  name: string;
  country_code: string;
  country_name: string;
  status: 'active' | 'waitlist';
}

interface EntryRow {
  id: string;
  city_id: string;
  email: string;
  first_name: string | null;
  status: 'pending' | 'verified' | 'left';
  confirm_token_hash: string | null;
  confirm_token_expires_at: string | null;
  leave_token_hash: string | null;
  ambassador_email_status: 'not_sent' | 'sent' | 'failed';
}

async function sendAmbassador(sb: SupabaseClient, entry: EntryRow, city: CityRow, leaveToken: string | null) {
  // Never send twice.
  if (entry.ambassador_email_status === 'sent') return 'sent' as const;
  if (entry.status !== 'verified') return 'skipped' as const;

  // A leave link is required in the footer. If we do not know the raw token (retry case), mint a new one.
  let token = leaveToken;
  if (!token) {
    token = randomToken();
    await sb.from('city_waitlist_entries').update({ leave_token_hash: await sha256(token) }).eq('id', entry.id);
  }
  const leaveUrl = `${SITE_URL}/waitlist/leave?token=${token}`;
  const tpl = ambassadorEmail({ firstName: entry.first_name, city: city.name, leaveUrl });
  try {
    const result = await sendEmail({
      to: entry.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      headers: { 'List-Unsubscribe': `<${leaveUrl}>` },
    });
    await sb
      .from('city_waitlist_entries')
      .update({
        ambassador_email_status: 'sent',
        ambassador_email_error: null,
        ambassador_email_sent_at: new Date().toISOString(),
        resend_email_id: result.id,
      })
      .eq('id', entry.id);
    return 'sent' as const;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('ambassador email failed', entry.id, message);
    await sb
      .from('city_waitlist_entries')
      .update({ ambassador_email_status: 'failed', ambassador_email_error: message.slice(0, 500) })
      .eq('id', entry.id);
    return 'failed' as const;
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function join(req: Request, body: Record<string, unknown>): Promise<Response> {
  const sb = admin();
  const email = cleanText(body.email, 254).toLowerCase();
  const cityName = cleanText(body.city, 80);
  const countryCode = cleanText(body.countryCode, 2).toUpperCase();
  const countryName = cleanText(body.country, 80);
  const firstName = cleanText(body.firstName, 60) || null;
  const honeypot = cleanText(body.website, 200);
  const lat = typeof body.lat === 'number' && Number.isFinite(body.lat) ? body.lat : null;
  const lng = typeof body.lng === 'number' && Number.isFinite(body.lng) ? body.lng : null;

  // Bots fill the hidden field. Pretend everything worked.
  if (honeypot) return json({ status: 'pending_sent' });

  if (!isEmail(email)) return json({ error: 'invalid_email' }, 400);
  if (!cityName) return json({ error: 'missing_city' }, 400);
  if (!/^[A-Z]{2}$/.test(countryCode)) return json({ error: 'missing_country' }, 400);

  const ipHash = await sha256(`${RATE_LIMIT_SALT}:${clientIp(req)}`);
  const okIp = await rateLimit(sb, `waitlist:ip:${ipHash}`, 10, 3600);
  const okEmail = await rateLimit(sb, `waitlist:email:${await sha256(`${RATE_LIMIT_SALT}:${email}`)}`, 5, 3600);
  if (!okIp || !okEmail) return json({ error: 'rate_limited' }, 429);

  // Find or create the city (same name + country = same city).
  let city: CityRow | null = null;
  {
    const { data } = await sb
      .from('cities')
      .select('id, slug, name, country_code, country_name, status')
      .ilike('name', cityName)
      .eq('country_code', countryCode)
      .maybeSingle();
    city = (data as CityRow | null) ?? null;
  }
  if (city?.status === 'active') {
    return json({ status: 'city_active', city: { slug: city.slug, name: city.name } });
  }
  // Fail before writing anything when we could not send the confirmation anyway.
  if (!emailConfigured()) return json({ error: 'email_not_configured' }, 503);
  if (!city) {
    let slug = `${slugify(cityName)}-${countryCode.toLowerCase()}`;
    const { data: clash } = await sb.from('cities').select('id').eq('slug', slug).maybeSingle();
    if (clash) slug = `${slug}-${randomToken().slice(0, 6).toLowerCase()}`;
    const { data, error } = await sb
      .from('cities')
      .insert({
        slug,
        name: cityName,
        country_code: countryCode,
        country_name: countryName || countryCode,
        lat: lat ?? 0,
        lng: lng ?? 0,
        zoom: 12,
        status: 'waitlist',
      })
      .select('id, slug, name, country_code, country_name, status')
      .single();
    if (error) {
      // Lost a race with a concurrent insert: read it back.
      const { data: again } = await sb
        .from('cities')
        .select('id, slug, name, country_code, country_name, status')
        .ilike('name', cityName)
        .eq('country_code', countryCode)
        .maybeSingle();
      if (!again) return json({ error: 'server_error' }, 500);
      city = again as CityRow;
    } else {
      city = data as CityRow;
    }
  }

  const { data: existingRaw } = await sb
    .from('city_waitlist_entries')
    .select('id, city_id, email, first_name, status, confirm_token_hash, confirm_token_expires_at, leave_token_hash, ambassador_email_status')
    .eq('city_id', city.id)
    .eq('email', email)
    .maybeSingle();
  const existing = (existingRaw as EntryRow | null) ?? null;

  if (existing?.status === 'verified') {
    return json({ status: 'already_verified', city: { slug: city.slug, name: city.name } });
  }

  const token = randomToken();
  const tokenHash = await sha256(token);
  const expires = new Date(Date.now() + CONFIRM_TTL_HOURS * 3600 * 1000).toISOString();

  if (existing) {
    const { error } = await sb
      .from('city_waitlist_entries')
      .update({
        status: 'pending',
        first_name: firstName ?? existing.first_name,
        confirm_token_hash: tokenHash,
        confirm_token_expires_at: expires,
        left_at: null,
        ip_hash: ipHash,
      })
      .eq('id', existing.id);
    if (error) return json({ error: 'server_error' }, 500);
  } else {
    const { error } = await sb.from('city_waitlist_entries').insert({
      city_id: city.id,
      email,
      first_name: firstName,
      status: 'pending',
      confirm_token_hash: tokenHash,
      confirm_token_expires_at: expires,
      ip_hash: ipHash,
    });
    if (error) return json({ error: 'server_error' }, 500);
  }

  const confirmUrl = `${SITE_URL}/waitlist/confirm?token=${token}`;
  const tpl = confirmationEmail({ city: city.name, confirmUrl });
  try {
    await sendEmail({ to: email, subject: tpl.subject, html: tpl.html, text: tpl.text });
  } catch (e) {
    if (e instanceof EmailNotConfiguredError) return json({ error: 'email_not_configured' }, 503);
    console.error('confirmation email failed', e instanceof Error ? e.message : e);
    return json({ error: 'email_failed' }, 502);
  }

  return json({
    status: existing ? 'pending_resent' : 'pending_sent',
    city: { slug: city.slug, name: city.name },
  });
}

async function confirm(body: Record<string, unknown>): Promise<Response> {
  const sb = admin();
  const token = cleanText(body.token, 200);
  if (!token) return json({ error: 'invalid_token' }, 400);
  const hash = await sha256(token);
  const { data: entryRaw } = await sb
    .from('city_waitlist_entries')
    .select('id, city_id, email, first_name, status, confirm_token_hash, confirm_token_expires_at, leave_token_hash, ambassador_email_status')
    .eq('confirm_token_hash', hash)
    .maybeSingle();
  const entry = (entryRaw as EntryRow | null) ?? null;
  if (!entry) return json({ error: 'invalid_token' }, 400);
  if (entry.confirm_token_expires_at && new Date(entry.confirm_token_expires_at).getTime() < Date.now()) {
    return json({ error: 'invalid_token' }, 400);
  }
  const { data: cityRaw } = await sb
    .from('cities')
    .select('id, slug, name, country_code, country_name, status')
    .eq('id', entry.city_id)
    .single();
  const city = cityRaw as CityRow;

  if (entry.status === 'verified') {
    // Repeated click: idempotent, no second ambassador email.
    return json({ status: 'already_verified', city: { slug: city.slug, name: city.name, status: city.status } });
  }

  const leaveToken = randomToken();
  const { error } = await sb
    .from('city_waitlist_entries')
    .update({
      status: 'verified',
      verified_at: new Date().toISOString(),
      left_at: null,
      leave_token_hash: await sha256(leaveToken),
    })
    .eq('id', entry.id);
  if (error) return json({ error: 'server_error' }, 500);

  const ambassador = await sendAmbassador(sb, { ...entry, status: 'verified' }, city, leaveToken);
  return json({
    status: 'verified',
    city: { slug: city.slug, name: city.name, status: city.status },
    ambassadorEmail: ambassador,
  });
}

async function leave(body: Record<string, unknown>): Promise<Response> {
  const sb = admin();
  const token = cleanText(body.token, 200);
  if (!token) return json({ error: 'invalid_token' }, 400);
  const hash = await sha256(token);
  const { data: entryRaw } = await sb
    .from('city_waitlist_entries')
    .select('id, city_id, status')
    .eq('leave_token_hash', hash)
    .maybeSingle();
  const entry = entryRaw as { id: string; city_id: string; status: string } | null;
  if (!entry) return json({ error: 'invalid_token' }, 400);
  const { data: cityRaw } = await sb.from('cities').select('slug, name').eq('id', entry.city_id).single();
  if (entry.status !== 'left') {
    await sb
      .from('city_waitlist_entries')
      .update({ status: 'left', left_at: new Date().toISOString() })
      .eq('id', entry.id);
  }
  return json({ status: 'left', city: cityRaw });
}

async function retryAmbassador(req: Request, body: Record<string, unknown>): Promise<Response> {
  const sb = admin();
  const authHeader = req.headers.get('authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'unauthorized' }, 401);
  const { data: userData, error: userError } = await sb.auth.getUser(jwt);
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401);
  const { data: adminRow } = await sb.from('admin_users').select('user_id').eq('user_id', userData.user.id).maybeSingle();
  if (!adminRow) return json({ error: 'forbidden' }, 403);

  const entryId = cleanText(body.entryId, 64);
  const { data: entryRaw } = await sb
    .from('city_waitlist_entries')
    .select('id, city_id, email, first_name, status, confirm_token_hash, confirm_token_expires_at, leave_token_hash, ambassador_email_status')
    .eq('id', entryId)
    .maybeSingle();
  const entry = (entryRaw as EntryRow | null) ?? null;
  if (!entry) return json({ error: 'not_found' }, 404);
  if (entry.status !== 'verified') return json({ error: 'not_verified' }, 400);
  if (!emailConfigured()) return json({ error: 'email_not_configured' }, 503);
  const { data: cityRaw } = await sb
    .from('cities')
    .select('id, slug, name, country_code, country_name, status')
    .eq('id', entry.city_id)
    .single();
  // Force a fresh attempt even if a previous one was marked failed.
  const result = await sendAmbassador(sb, { ...entry, ambassador_email_status: 'not_sent' }, cityRaw as CityRow, null);
  return json({ status: result });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  try {
    switch (body.action) {
      case 'join':
        return await join(req, body);
      case 'confirm':
        return await confirm(body);
      case 'leave':
        return await leave(body);
      case 'retry_ambassador':
        return await retryAmbassador(req, body);
      default:
        return json({ error: 'unknown_action' }, 400);
    }
  } catch (e) {
    console.error('waitlist error', e instanceof Error ? e.message : e);
    return json({ error: 'server_error' }, 500);
  }
});
