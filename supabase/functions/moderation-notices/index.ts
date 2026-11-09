// Sends queued moderation emails: statements of reasons to people whose content we removed or
// restricted (Art. 17 DSA), and confirmations and decisions to reporters (Art. 16 (4) and (5) DSA).
// Invoked by pg_cron through invoke_crawler, authenticated with the crawler secret.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { emailConfigured, sendEmail } from '../_shared/email.ts';
import { operatorFooterText } from '../_shared/operator.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SITE_URL = (Deno.env.get('SITE_URL') ?? 'https://cosurfing.app').replace(/\/$/, '');
const BATCH = 50;

interface Notice {
  id: string;
  kind: 'decision' | 'report_received' | 'report_result';
  user_id: string | null;
  email: string | null;
  target_type: string;
  place_id: string | null;
  summary: string | null;
  action: string | null;
  reason: string | null;
  note: string | null;
  attempts: number;
  place: { name: string; slug: string } | null;
}

const TARGET: Record<string, string> = {
  review: 'review',
  photo: 'photo',
  menu: 'menu photo',
  offer: 'offer',
  wifi_note: 'Wi‑Fi tip',
  fact: 'fact',
  suggestion: 'place suggestion',
  speed_test: 'speed test',
  profile: 'profile name and picture',
};

const REASON: Record<string, string> = {
  rules: 'It does not follow our rules for content (Terms of Use, section 5).',
  illegal: 'It appears to be illegal content.',
  personal_data: 'It shows recognizable people or private personal data, which our rules do not allow (Terms of Use, section 5) and which can violate the GDPR.',
  copyright: 'It appears to infringe someone else’s copyright or other rights (Terms of Use, section 5).',
  spam: 'It is advertising, spam or not about the place (Terms of Use, section 5).',
  offensive: 'It is offensive, abusive or discriminatory (Terms of Use, section 5).',
  inaccurate: 'It is inaccurate or misleading about the place (Terms of Use, section 5).',
  duplicate: 'It repeats content that is already on Cosurfing.',
};

const ACTION: Record<string, string> = {
  not_published: 'We did not publish it.',
  hidden: 'We removed it from Cosurfing.',
  deleted: 'We deleted it.',
  edit_rejected: 'We did not publish your change; the previous version stays online.',
  profile_reset: 'We removed your display name and profile picture. You can set new ones in your account.',
};

function where(n: Notice): string {
  return n.place ? ` for ${n.place.name} (${SITE_URL}/place/${n.place.slug})` : '';
}

function compose(n: Notice): { subject: string; text: string } {
  const target = TARGET[n.target_type] ?? 'contribution';
  const reason = REASON[n.reason ?? 'rules'] ?? REASON.rules;
  const note = n.note ? `\n\nDetails from our team: ${n.note}` : '';
  const sign = `\n\nThanks,\nLuis from Cosurfing${operatorFooterText(SITE_URL)}`;

  if (n.kind === 'report_received') {
    return {
      subject: 'We received your report',
      text: `Hi,\n\nthanks for reporting a ${target}${where(n)}. A person on our team will check it and we will email you our decision.${sign}`,
    };
  }

  if (n.kind === 'report_result') {
    const outcome =
      n.action === 'removed'
        ? `We checked the ${target} you reported${where(n)} and removed it. Reason: ${reason}`
        : `We checked the ${target} you reported${where(n)} and decided to keep it, because we could not find that it is illegal or breaks our Terms of Use.`;
    return {
      subject: 'Decision on your report',
      text: `Hi,\n\n${outcome}${note}\n\nThe decision was made by a person; we did not use automated decision-making. If you disagree, reply to this email and we will look at it again. You can also contact the competent authorities or go to court.${sign}`,
    };
  }

  const excerpt = n.summary ? `\n\nThe content: “${n.summary}”` : '';
  const action = ACTION[n.action ?? 'hidden'] ?? ACTION.hidden;
  return {
    subject: `About your ${target} on Cosurfing`,
    text: `Hi,\n\nwe reviewed your ${target}${where(n)}.${excerpt}\n\nWhat we did: ${action}\n\nWhy: ${reason}${note}\n\nThis decision was made by a person on our team; we did not use automated means to detect or decide on it. It only affects this ${target}${n.target_type === 'profile' ? '' : ', not your account'}.\n\nIf you think we made a mistake, reply to this email and explain why. We will review the decision and tell you the result. You can also go to court.${sign}`,
  };
}

async function recipient(sb: SupabaseClient, n: Notice): Promise<string | null> {
  if (n.email) return n.email;
  if (!n.user_id) return null;
  const { data } = await sb.auth.admin.getUserById(n.user_id);
  return data.user?.email ?? null;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method_not_allowed', { status: 405 });
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const secret = req.headers.get('x-crawler-secret') ?? '';
  const { data: ok } = await sb.rpc('check_crawler_secret', { p_secret: secret });
  if (!secret || ok !== true) return new Response('unauthorized', { status: 401 });
  if (!emailConfigured()) return Response.json({ error: 'email_not_configured' }, { status: 503 });

  const { data, error } = await sb
    .from('moderation_notices')
    .select('id, kind, user_id, email, target_type, place_id, summary, action, reason, note, attempts, place:places(name, slug)')
    .is('sent_at', null)
    .lt('attempts', 5)
    .order('created_at')
    .limit(BATCH);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let sent = 0;
  for (const n of (data ?? []) as unknown as Notice[]) {
    try {
      const to = await recipient(sb, n);
      if (!to) {
        // Account deleted in the meantime: nothing to send.
        await sb.from('moderation_notices').update({ sent_at: new Date().toISOString(), last_error: 'no_recipient' }).eq('id', n.id);
        continue;
      }
      const { subject, text } = compose(n);
      await sendEmail({ to, subject, text, html: `<pre style="font-family:inherit;white-space:pre-wrap;">${escapeHtml(text)}</pre>` });
      await sb.from('moderation_notices').update({ sent_at: new Date().toISOString(), last_error: null }).eq('id', n.id);
      sent++;
    } catch (e) {
      const message = (e instanceof Error ? e.message : String(e)).slice(0, 500);
      await sb.from('moderation_notices').update({ attempts: n.attempts + 1, last_error: message }).eq('id', n.id);
    }
  }
  return Response.json({ sent });
});

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
