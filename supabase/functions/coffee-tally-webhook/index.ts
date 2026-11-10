// Tally webhook for the Early Contributors coffee program (/free-coffee).
// Deployed with verify_jwt = false; authenticity comes from the Tally signing secret
// (Tally-Signature: base64 HMAC-SHA256 of the body). The participant is identified by the
// one-time `token` hidden field issued by coffee_form_link(), never by an email or user id
// typed into the form. Proof files are copied from Tally into the private `coffee-evidence`
// bucket; the database decides which steps are accepted (coffee_ingest_submission).

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { type ParsedFile, parseSubmission, type TallyPayload } from './parse.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SIGNING_SECRET = Deno.env.get('TALLY_SIGNING_SECRET') ?? '';
const FORM_ID = Deno.env.get('TALLY_COFFEE_FORM_ID') ?? '';
const TALLY_API_KEY = Deno.env.get('TALLY_API_KEY') ?? '';

const BUCKET = 'coffee-evidence';
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 16;
const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
};

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(data: Uint8Array<ArrayBuffer> | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return hex(await crypto.subtle.digest('SHA-256', bytes));
}

async function hmacBase64(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifySignature(raw: string, header: string, secret: string): Promise<boolean> {
  if (!header || !secret) return false;
  if (timingSafeEqual(header, await hmacBase64(secret, raw))) return true;
  // Tally signs JSON.stringify(body); accept that form too in case the raw bytes differ in whitespace.
  try {
    return timingSafeEqual(header, await hmacBase64(secret, JSON.stringify(JSON.parse(raw))));
  } catch {
    return false;
  }
}

/**
 * Tally serves uploads from its own storage (storage.tally.so, which may redirect to its Google Cloud
 * bucket); anything else is refused (SSRF guard).
 */
export function isTallyFileUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return false;
    if (u.hostname === 'tally.so' || u.hostname.endsWith('.tally.so')) return true;
    return u.hostname === 'storage.googleapis.com' && /^\/tally-[a-z0-9-]+\//.test(u.pathname);
  } catch {
    return false;
  }
}

interface StoredFile {
  step: string;
  kind: string;
  path: string;
  mime: string;
  size: number;
  sha256: string;
}

/** A file we will never accept; retrying the delivery would not help. */
class RejectedFile extends Error {}

async function download(file: ParsedFile['file']): Promise<{ bytes: Uint8Array<ArrayBuffer>; mime: string }> {
  let url = file.url;
  let res: Response | null = null;
  for (let hop = 0; hop < 4; hop++) {
    if (!isTallyFileUrl(url)) throw new RejectedFile('file_host_not_allowed');
    res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
    const next = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
    if (!next) break;
    await res.body?.cancel();
    url = new URL(next, url).toString();
    res = null;
  }
  if (!res) throw new RejectedFile('too_many_redirects');
  if (!res.ok) throw new Error(`file_download_${res.status}`);
  const declared = Number(res.headers.get('content-length') ?? '0');
  if (declared > MAX_BYTES) throw new RejectedFile('file_too_large');
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) throw new RejectedFile('file_too_large');
  const mime = (file.mimeType || res.headers.get('content-type') || '').split(';')[0]!.trim().toLowerCase();
  if (!MIME_EXT[mime]) throw new RejectedFile('file_type_not_allowed');
  return { bytes, mime };
}

/**
 * Copies files a few at a time: Tally waits 10 s for an answer and retries later (deduplicated by
 * submission id). Files we refuse are skipped and show up as missing proof for the reviewer.
 */
async function storeFiles(sb: SupabaseClient, userId: string, submissionId: string, parsed: ParsedFile[]): Promise<StoredFile[]> {
  const items = parsed.slice(0, MAX_FILES).map((item, i) => ({ item, n: i + 1 }));
  const stored: StoredFile[] = [];
  const worker = async () => {
    for (let next = items.shift(); next; next = items.shift()) {
      const { item, n } = next;
      let file: { bytes: Uint8Array<ArrayBuffer>; mime: string };
      try {
        file = await download(item.file);
      } catch (e) {
        if (e instanceof RejectedFile) {
          console.warn('coffee evidence skipped', item.kind, e.message);
          continue;
        }
        throw e;
      }
      const path = `${userId}/${submissionId}/${item.step}-${item.kind}-${n}.${MIME_EXT[file.mime]}`;
      const { error } = await sb.storage.from(BUCKET).upload(path, file.bytes, { contentType: file.mime, upsert: true });
      if (error) throw new Error(`upload: ${error.message}`);
      stored.push({ step: item.step, kind: item.kind, path, mime: file.mime, size: file.bytes.byteLength, sha256: await sha256Hex(file.bytes) });
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return stored;
}

async function removeFiles(sb: SupabaseClient, paths: string[]): Promise<void> {
  if (paths.length) await sb.storage.from(BUCKET).remove(paths);
}

/** Optional: removes the response from Tally once the evidence is copied, so receipts and a friend's email do not stay there. */
async function deleteFromTally(formId: string, submissionId: string): Promise<void> {
  if (!TALLY_API_KEY) return;
  const res = await fetch(`https://api.tally.so/forms/${encodeURIComponent(formId)}/submissions/${encodeURIComponent(submissionId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${TALLY_API_KEY}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) console.warn('tally delete failed', res.status);
}

if (import.meta.main) {
  Deno.serve(async (req) => {
    if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
    if (!SIGNING_SECRET) return new Response('tally not configured', { status: 503 });

    const raw = await req.text();
    if (!(await verifySignature(raw, req.headers.get('tally-signature') ?? '', SIGNING_SECRET))) {
      return new Response('unauthorized', { status: 401 });
    }

    let payload: TallyPayload;
    try {
      payload = JSON.parse(raw) as TallyPayload;
    } catch {
      return new Response('invalid json', { status: 400 });
    }
    if (payload.eventType !== 'FORM_RESPONSE' || !payload.data?.submissionId) return Response.json({ ignored: true });
    if (FORM_ID && payload.data.formId !== FORM_ID) return Response.json({ ignored: 'other_form' });

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const parsed = parseSubmission(payload);

    const { data: existing } = await sb.from('coffee_submissions').select('id').eq('tally_submission_id', parsed.submissionId).maybeSingle();
    if (existing) return Response.json({ duplicate: true });

    const tokenHash = parsed.token ? await sha256Hex(parsed.token) : '0'.repeat(64);
    const { data: token } = await sb
      .from('coffee_form_tokens')
      .select('user_id, used_at, expires_at')
      .eq('token_hash', tokenHash)
      .maybeSingle();
    const tokenValid = token && !token.used_at && new Date(token.expires_at as string).getTime() > Date.now();

    let stored: StoredFile[] = [];
    const wanted = parsed.files.filter((f) => parsed.steps.includes(f.step));
    if (tokenValid && wanted.length) {
      try {
        stored = await storeFiles(sb, token.user_id as string, parsed.submissionId, wanted);
      } catch (e) {
        console.error('coffee evidence copy failed', e instanceof Error ? e.message : e);
        // Let Tally retry (it retries failed deliveries); nothing was recorded yet.
        return new Response('evidence copy failed', { status: 500 });
      }
    }

    const { data: result, error } = await sb.rpc('coffee_ingest_submission', {
      p: {
        tally_submission_id: parsed.submissionId,
        tally_form_id: parsed.formId,
        token_hash: tokenHash,
        submitted_at: parsed.submittedAt,
        steps: parsed.steps,
        pre_ignored: parsed.preIgnored,
        answers: parsed.answers,
        claimed: parsed.claimed,
        referral_email: parsed.referralEmail,
        evidence: stored,
      },
    });
    if (error) {
      // A parallel retry of the same delivery may have won; its files live at the same paths.
      const { data: raced } = await sb.from('coffee_submissions').select('id').eq('tally_submission_id', parsed.submissionId).maybeSingle();
      if (raced) return Response.json({ duplicate: true });
      console.error('coffee ingest failed', error.message);
      await removeFiles(sb, stored.map((s) => s.path));
      return new Response('ingest failed', { status: 500 });
    }

    const accepted = new Set<string>(((result as { accepted?: string[] })?.accepted ?? []) as string[]);
    await removeFiles(sb, stored.filter((s) => !accepted.has(s.step)).map((s) => s.path));
    await deleteFromTally(parsed.formId, parsed.submissionId).catch(() => undefined);

    return Response.json({ status: (result as { status?: string })?.status ?? 'ok', accepted: [...accepted] });
  });
}
