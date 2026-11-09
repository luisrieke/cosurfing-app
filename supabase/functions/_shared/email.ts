// Minimal Resend client (REST, no SDK) for Supabase Edge Functions.

export class EmailNotConfiguredError extends Error {
  constructor() {
    super('Email delivery is not configured (RESEND_API_KEY missing).');
    this.name = 'EmailNotConfiguredError';
  }
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  from?: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

export interface SendEmailResult {
  id: string;
  sandboxed: boolean;
}

export function emailConfigured(): boolean {
  return Boolean(Deno.env.get('RESEND_API_KEY'));
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) throw new EmailNotConfiguredError();

  const from = input.from ?? Deno.env.get('RESEND_FROM') ?? 'Luis from Cosurfing <luis@cosurfing.app>';
  const replyTo = input.replyTo ?? Deno.env.get('RESEND_REPLY_TO') ?? undefined;
  const sandboxTo = Deno.env.get('EMAIL_SANDBOX_TO')?.trim();

  // Safety net for testing: when a sandbox address is configured every email goes there instead.
  const to = sandboxTo || input.to;
  const subject = sandboxTo ? `[sandbox → ${input.to}] ${input.subject}` : input.subject;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html: input.html,
      text: input.text,
      reply_to: replyTo,
      headers: input.headers,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend error ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { id: string };
  return { id: json.id, sandboxed: Boolean(sandboxTo) };
}
