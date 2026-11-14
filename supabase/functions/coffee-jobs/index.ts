// Scheduled work for the coffee campaign, invoked by pg_cron through invoke_crawler and
// authenticated with the crawler secret;
// it sends the queued participant emails (spot reserved, approved, rejected, paid).

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { emailConfigured, sendEmail } from '../_shared/email.ts';
import { operatorFooterText } from '../_shared/operator.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SITE_URL = (Deno.env.get('SITE_URL') ?? 'https://cosurfing.app').replace(/\/$/, '');
const BATCH = 50;

interface Notice {
  id: string;
  kind: 'spot_reserved' | 'reward_approved' | 'reward_rejected' | 'reward_paid';
  user_id: string;
  step: string | null;
  reason: string | null;
  note: string | null;
  amount_cents: number | null;
  can_resubmit: boolean | null;
  attempts: number;
}

const STEP: Record<string, string> = {
  contribute: 'Step 1 (your review and photos)',
  new_place: 'Step 2 (the new place you added)',
  spread: 'Step 3 (spreading the word)',
};

// Same wording as the review criteria on /free-coffee/terms.
export const REASON: Record<string, string> = {
  low_effort: 'The review is too short or too general to help other remote workers (see “What counts as a useful review”).',
  not_authentic: 'We could not confirm that the contribution is your own, genuine experience.',
  proof_not_received: 'We did not receive your direct message with the proof and your code.',
  evidence_missing: 'Some of the required proof is missing or cannot be read.',
  receipt_invalid: 'The receipt is unreadable, does not show an eligible coffee, or does not match the visit.',
  receipt_reused: 'This receipt was already used for another reward.',
  not_coffee: 'The receipt does not include an eligible coffee drink.',
  place_exists: 'This place was already listed on Cosurfing.',
  place_inaccurate: 'The place information is inaccurate or incomplete, so it did not pass our quality check.',
  referral_invalid: 'We could not verify the referral (no new Cosurfing account with that email, or it was created before you joined).',
  post_invalid: 'The post is not publicly accessible or is not a genuine post about Cosurfing.',
  base_not_eligible: 'Bonus rewards need an approved Step 1, and Step 1 was not approved.',
  campaign_full: 'All places in the program were taken.',
  other: 'See the note below.',
};

function euros(cents: number | null): string {
  return `€${((cents ?? 0) / 100).toFixed(2)}`;
}

export function compose(n: Notice): { subject: string; text: string } {
  const page = `${SITE_URL}/free-coffee`;
  const step = STEP[n.step ?? ''] ?? 'your contribution';
  const note = n.note ? `\n\nNote from Luis: ${n.note}` : '';
  const sign = `\n\nThanks for helping build Cosurfing,\nLuis${operatorFooterText(SITE_URL)}`;
  switch (n.kind) {
    case 'spot_reserved':
      return {
        subject: 'A spot opened up for you: your coffee is waiting ☕',
        text: `Hi,\n\na spot in the Cosurfing Early Contributors program opened up and it is now reserved for you.\n\nOpen ${page} to see what to do next. Your reservation is held for a few days; after that it goes to the next person on the waiting list.${sign}`,
      };
    case 'reward_approved':
      return {
        subject: `Approved: ${euros(n.amount_cents)} for your coffee`,
        text: `Hi,\n\ngood news: we approved ${step} and will reimburse ${euros(n.amount_cents)}.${note}\n\nIf you have not done so yet, add where we should send the money at ${page} (PayPal or bank account). We pay by hand, usually within 14 days after you added the details.${sign}`,
      };
    case 'reward_rejected': {
      const reason = REASON[n.reason ?? 'other'] ?? REASON.other;
      const next = n.can_resubmit
        ? `You can fix this, send the proof once more by direct message and mark it as sent at ${page}.`
        : 'This decision is final for this step.';
      return {
        subject: 'About your coffee submission',
        text: `Hi,\n\nwe reviewed ${step} and could not approve it.\n\nWhy: ${reason}${note}\n\n${next}\n\nA person made this decision using the published criteria (${SITE_URL}/free-coffee/terms). If you think we made a mistake, reply to this email and we will look at it again.${sign}`,
      };
    }
    case 'reward_paid':
      return {
        subject: `Paid: ${euros(n.amount_cents)} for your coffee ☕`,
        text: `Hi,\n\nwe just sent you ${euros(n.amount_cents)} for ${step}. Enjoy your coffee!${sign}`,
      };
  }
}

async function sendNotices(sb: SupabaseClient): Promise<number> {
  if (!emailConfigured()) return 0;
  const { data, error } = await sb
    .from('coffee_notices')
    .select('id, kind, user_id, step, reason, note, amount_cents, can_resubmit, attempts')
    .is('sent_at', null)
    .lt('attempts', 5)
    .order('created_at')
    .limit(BATCH);
  if (error) throw new Error(error.message);
  let sent = 0;
  for (const n of (data ?? []) as Notice[]) {
    try {
      const { data: user } = await sb.auth.admin.getUserById(n.user_id);
      const to = user.user?.email;
      if (!to) {
        await sb.from('coffee_notices').update({ sent_at: new Date().toISOString(), last_error: 'no_recipient' }).eq('id', n.id);
        continue;
      }
      const { subject, text } = compose(n);
      await sendEmail({ to, subject, text, html: `<pre style="font-family:inherit;white-space:pre-wrap;">${escapeHtml(text)}</pre>` });
      await sb.from('coffee_notices').update({ sent_at: new Date().toISOString(), last_error: null }).eq('id', n.id);
      sent++;
    } catch (e) {
      const message = (e instanceof Error ? e.message : String(e)).slice(0, 500);
      await sb.from('coffee_notices').update({ attempts: n.attempts + 1, last_error: message }).eq('id', n.id);
    }
  }
  return sent;
}

if (import.meta.main) {
  Deno.serve(async (req) => {
    if (req.method !== 'POST') return new Response('method_not_allowed', { status: 405 });
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const secret = req.headers.get('x-crawler-secret') ?? '';
    const { data: ok } = await sb.rpc('check_crawler_secret', { p_secret: secret });
    if (!secret || ok !== true) return new Response('unauthorized', { status: 401 });
    try {
      const sent = await sendNotices(sb);
      return Response.json({ sent, email: emailConfigured() });
    } catch (e) {
      console.error('coffee-jobs failed', e instanceof Error ? e.message : e);
      return Response.json({ error: 'failed' }, { status: 500 });
    }
  });
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
