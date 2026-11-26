// Resend webhook: records the delivery status of outreach emails (delivered, delayed, bounced,
// complained, failed) on place_outreach_activities, and moves places with a hard bounce to the
// 'bounced' outreach stage. Emails that are not outreach (sign-in codes etc.) are acknowledged
// and ignored.
//
// Deployed with verify_jwt = false (Resend does not send a Supabase JWT); authenticity is
// established by verifying the Svix signature with RESEND_WEBHOOK_SECRET ("whsec_...").

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WEBHOOK_SECRET = Deno.env.get('RESEND_WEBHOOK_SECRET') ?? '';

// Svix rejects deliveries older than five minutes; so do we, to block replays.
const TOLERANCE_SECONDS = 5 * 60;

const STATUS_BY_EVENT: Record<string, string> = {
  'email.delivered': 'delivered',
  'email.delivery_delayed': 'delivery_delayed',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.failed': 'failed',
};

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifySignature(req: Request, payload: string): Promise<boolean> {
  const id = req.headers.get('svix-id');
  const timestamp = req.headers.get('svix-timestamp');
  const signatures = req.headers.get('svix-signature');
  if (!id || !timestamp || !signatures) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > TOLERANCE_SECONDS) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    base64ToBytes(WEBHOOK_SECRET.replace(/^whsec_/, '')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${payload}`));
  const expected = bytesToBase64(new Uint8Array(mac));

  // The header holds one or more space-separated "v1,<base64>" entries (several during secret rotation).
  return signatures.split(' ').some((entry) => {
    const [version, sig] = entry.split(',');
    return version === 'v1' && !!sig && timingSafeEqual(sig, expected);
  });
}

interface ResendEvent {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    bounce?: { type?: string; subType?: string; message?: string };
    failed?: { reason?: string };
  };
}

function bounceDetail(event: ResendEvent): { detail: string | null; permanent: boolean } {
  const bounce = event.data?.bounce;
  if (event.type === 'email.bounced') {
    const parts = [bounce?.type, bounce?.subType].filter(Boolean).join(' / ');
    const detail = [parts, bounce?.message].filter(Boolean).join(': ') || null;
    // Resend marks hard bounces as "Permanent"; treat a bounce without a type as permanent too,
    // since Resend suppresses the address either way.
    const permanent = !bounce?.type || bounce.type.toLowerCase() === 'permanent';
    return { detail, permanent };
  }
  if (event.type === 'email.failed') return { detail: event.data?.failed?.reason ?? null, permanent: true };
  return { detail: null, permanent: false };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  if (!WEBHOOK_SECRET) return new Response('resend webhook not configured', { status: 503 });

  const payload = await req.text();
  if (!(await verifySignature(req, payload))) return new Response('invalid signature', { status: 401 });

  let event: ResendEvent;
  try {
    event = JSON.parse(payload);
  } catch {
    return new Response('invalid json', { status: 400 });
  }

  const status = event.type ? STATUS_BY_EVENT[event.type] : undefined;
  const emailId = event.data?.email_id;
  if (!status || !emailId) return new Response('ignored', { status: 200 });

  const { detail, permanent } = bounceDetail(event);
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data, error } = await sb.rpc('record_outreach_delivery', {
    p_provider: 'resend',
    p_message_id: emailId,
    p_status: status,
    p_detail: detail,
    p_permanent: permanent,
    p_occurred_at: event.created_at ?? new Date().toISOString(),
  });
  if (error) {
    console.error('resend webhook: could not record delivery', emailId, error.message);
    // 500 makes Resend retry later.
    return new Response('could not record', { status: 500 });
  }
  return new Response(JSON.stringify({ matched: data }), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
