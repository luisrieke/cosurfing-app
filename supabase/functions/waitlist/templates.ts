// Email templates for the city waiting list. English only for now.

export const INTERVIEW_URL = 'https://cal.com/luisrieke/user-interview';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function layout(bodyHtml: string, footerHtml: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>Cosurfing</title>
  </head>
  <body style="margin:0;padding:0;background:#F7F5F0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#17150F;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F5F0;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:16px;border:1px solid #E8E5DE;">
            <tr>
              <td style="padding:28px 32px 0 32px;">
                <span style="display:inline-block;width:10px;height:10px;border-radius:5px;background:#0E7C7B;vertical-align:middle;margin-right:8px;"></span>
                <span style="font-size:16px;font-weight:600;vertical-align:middle;">Cosurfing</span>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 28px 32px;font-size:16px;line-height:25px;">
                ${bodyHtml}
              </td>
            </tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
            <tr>
              <td style="padding:16px 32px;font-size:12px;line-height:18px;color:#6B675E;">
                ${footerHtml}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function button(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
  <tr>
    <td style="border-radius:12px;background:#0E7C7B;">
      <a href="${url}" style="display:inline-block;padding:14px 22px;font-size:16px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:12px;">${escapeHtml(label)}</a>
    </td>
  </tr>
</table>`;
}

export function confirmationEmail(input: { city: string; confirmUrl: string }) {
  const city = escapeHtml(input.city);
  const subject = `Confirm your spot on the ${input.city} waiting list`;
  const html = layout(
    `<p style="margin:0 0 16px 0;">Hey,</p>
<p style="margin:0 0 16px 0;">Thanks for your interest in Cosurfing for <strong>${city}</strong>. Please confirm your email address so we can keep you posted.</p>
${button('Confirm my email', input.confirmUrl)}
<p style="margin:0 0 16px 0;color:#6B675E;font-size:14px;line-height:21px;">If the button does not work, copy this link into your browser:<br /><a href="${input.confirmUrl}" style="color:#0E7C7B;word-break:break-all;">${input.confirmUrl}</a></p>
<p style="margin:0;color:#6B675E;font-size:14px;line-height:21px;">The link is valid for 48 hours. If you did not sign up, you can ignore this email and nothing will happen.</p>`,
    `You received this email because someone entered your address on the Cosurfing waiting list for ${city}. We only use it for updates about Cosurfing in ${city}.`,
  );
  const text = `Hey,

Thanks for your interest in Cosurfing for ${input.city}. Please confirm your email address so we can keep you posted:

${input.confirmUrl}

The link is valid for 48 hours. If you did not sign up, you can ignore this email and nothing will happen.

— Cosurfing`;
  return { subject, html, text };
}

export function ambassadorEmail(input: { firstName: string | null; city: string; leaveUrl: string }) {
  const greetingName = input.firstName?.trim() ? input.firstName.trim() : 'there';
  const city = escapeHtml(input.city);
  const subject = `Help bring Cosurfing to ${input.city}?`;
  const html = layout(
    `<p style="margin:0 0 16px 0;">Hey ${escapeHtml(greetingName)},</p>
<p style="margin:0 0 16px 0;">Thanks for joining the Cosurfing waiting list for ${city}!</p>
<p style="margin:0 0 16px 0;">I’m Luis, the founder of Cosurfing. I’m building a simple way to find great coworking spaces and laptop-friendly cafés, starting with Berlin and Parga.</p>
<p style="margin:0 0 16px 0;">As we explore where to launch next, I’d love to meet people who know their local scene.</p>
<p style="margin:0 0 16px 0;">Could you imagine becoming a Cosurfing ambassador for ${city}? This could mean recommending a few great places to work, sharing local feedback, and helping us understand what your city needs.</p>
<p style="margin:0 0 16px 0;">There’s no commitment — I’d simply love to hear what you think.</p>
<p style="margin:0 0 8px 0;">If you’re up for a short user interview, you can pick a time here:</p>
${button('Book a chat with Luis', INTERVIEW_URL)}
<p style="margin:0 0 16px 0;"><a href="${INTERVIEW_URL}" style="color:#0E7C7B;">${INTERVIEW_URL}</a></p>
<p style="margin:0 0 16px 0;">You’re also welcome to reply directly to this email.</p>
<p style="margin:0;">Thanks,<br />Luis<br />Founder, Cosurfing</p>`,
    `You are receiving this because you confirmed your spot on the Cosurfing waiting list for ${city}. <a href="${input.leaveUrl}" style="color:#6B675E;">Leave the ${city} waiting list</a>.`,
  );
  const text = `Hey ${greetingName},

Thanks for joining the Cosurfing waiting list for ${input.city}!

I’m Luis, the founder of Cosurfing. I’m building a simple way to find great coworking spaces and laptop-friendly cafés, starting with Berlin and Parga.

As we explore where to launch next, I’d love to meet people who know their local scene.

Could you imagine becoming a Cosurfing ambassador for ${input.city}? This could mean recommending a few great places to work, sharing local feedback, and helping us understand what your city needs.

There’s no commitment — I’d simply love to hear what you think.

If you’re up for a short user interview, you can pick a time here:

${INTERVIEW_URL}

You’re also welcome to reply directly to this email.

Thanks,
Luis
Founder, Cosurfing

—
Leave the ${input.city} waiting list: ${input.leaveUrl}`;
  return { subject, html, text };
}
