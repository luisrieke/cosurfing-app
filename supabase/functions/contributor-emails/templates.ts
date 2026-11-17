// Emails that bring contributors back. English only for now.

import { operatorFooterHtml, operatorFooterText } from '../_shared/operator.ts';

export interface Suggestion {
  slug: string;
  name: string;
  review_count: number;
}

export interface Email {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function layout(site: string, bodyHtml: string, footerHtml: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>Cosurfing</title>
  </head>
  <body style="margin:0;padding:0;background:#F4EFE6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2A211A;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4EFE6;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFCF7;border-radius:16px;border:1px solid #E2D9C9;">
            <tr>
              <td style="padding:28px 32px 0 32px;font-size:16px;font-weight:600;">Cosurfing</td>
            </tr>
            <tr>
              <td style="padding:20px 32px 28px 32px;font-size:16px;line-height:25px;">
                ${bodyHtml}
              </td>
            </tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
            <tr>
              <td style="padding:16px 32px;font-size:12px;line-height:18px;color:#76695B;">
                ${footerHtml}${operatorFooterHtml(site)}
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
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;">
  <tr>
    <td style="border-radius:12px;background:#2A211A;">
      <a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 22px;font-size:16px;font-weight:600;color:#FFF9F0;text-decoration:none;border-radius:12px;">${escapeHtml(label)}</a>
    </td>
  </tr>
</table>`;
}

function p(html: string): string {
  return `<p style="margin:0 0 16px 0;">${html}</p>`;
}

function hello(name: string): string {
  return name.trim() ? `Hi ${name.trim()},` : 'Hi,';
}

function suggestionsHtml(site: string, list: Suggestion[], src: string): string {
  if (list.length === 0) return '';
  const items = list
    .map((s) => {
      const url = `${site}/place/${s.slug}/review?src=${src}`;
      const bonus = s.review_count === 0 ? ' <span style="color:#A8642A;">· no reviews yet, +5 bonus</span>' : '';
      return `<li style="margin:0 0 8px 0;"><a href="${escapeHtml(url)}" style="color:#2A211A;font-weight:600;">${escapeHtml(s.name)}</a>${bonus}</li>`;
    })
    .join('');
  return `<ul style="margin:0 0 16px 0;padding-left:20px;">${items}</ul>`;
}

function suggestionsText(site: string, list: Suggestion[], src: string): string {
  return list
    .map((s) => `- ${s.name}${s.review_count === 0 ? ' (no reviews yet, +5 bonus)' : ''}: ${site}/place/${s.slug}/review?src=${src}`)
    .join('\n');
}

const SIGN = 'Thanks,\nLuis from Cosurfing';

function nudgeFooter(unsubscribeUrl: string): { html: string; text: string } {
  return {
    html: `You get these emails because you turned on contribution emails in your Cosurfing account. <a href="${escapeHtml(unsubscribeUrl)}" style="color:#76695B;">Unsubscribe</a>`,
    text: `You get these emails because you turned on contribution emails in your Cosurfing account. Unsubscribe: ${unsubscribeUrl}`,
  };
}

export function reviewLiveEmail(input: {
  site: string;
  name: string;
  place: { name: string; slug: string };
  city: { name: string; slug: string } | null;
  suggestions: Suggestion[];
}): Email {
  const { site, place, city, suggestions } = input;
  const placeUrl = `${site}/place/${place.slug}`;
  const rateUrl = city ? `${site}/${city.slug}/rate?src=email_live` : null;
  const subject = `Your review of ${place.name} is live`;
  const more =
    suggestions.length > 0 && city
      ? p(`Know more places in ${escapeHtml(city.name)}? These could use your rating:`) + suggestionsHtml(site, suggestions, 'email_live')
      : '';
  const html = layout(
    site,
    p(escapeHtml(hello(input.name))) +
      p(
        `your review of <a href="${escapeHtml(placeUrl)}" style="color:#2A211A;font-weight:600;">${escapeHtml(place.name)}</a> is now live on Cosurfing. Remote workers looking for a place to work will see it from now on. Thank you!`,
      ) +
      more +
      (rateUrl ? button('Rate more places', rateUrl) : '') +
      p(`<span style="white-space:pre-line;">${escapeHtml(SIGN)}</span>`),
    'You get this email once when a review of yours goes live.',
  );
  const text = [
    hello(input.name),
    '',
    `your review of ${place.name} is now live on Cosurfing: ${placeUrl}`,
    'Remote workers looking for a place to work will see it from now on. Thank you!',
    suggestions.length > 0 && city ? `\nKnow more places in ${city.name}? These could use your rating:\n${suggestionsText(site, suggestions, 'email_live')}` : '',
    rateUrl ? `\nRate more places: ${rateUrl}` : '',
    '',
    SIGN,
    operatorFooterText(site),
  ].join('\n');
  return { subject, html, text };
}

export function visitPromptEmail(input: { site: string; name: string; place: { name: string; slug: string }; unsubscribeUrl: string }): Email {
  const { site, place } = input;
  const subject = `How was ${place.name}?`;
  const starUrl = (n: number) => `${site}/place/${place.slug}/review?rating=${n}&src=email_prompt`;
  const stars = [1, 2, 3, 4, 5]
    .map(
      (n) =>
        `<td style="padding:0 4px;"><a href="${escapeHtml(starUrl(n))}" style="display:inline-block;padding:10px 12px;border-radius:10px;border:1px solid #E2D9C9;color:#D99A2B;font-size:22px;text-decoration:none;" aria-label="${n} stars">${'★'.repeat(n)}</a></td>`,
    )
    .join('');
  const footer = nudgeFooter(input.unsubscribeUrl);
  const html = layout(
    site,
    p(escapeHtml(hello(input.name))) +
      p(`you worked at or saved <strong>${escapeHtml(place.name)}</strong> recently. How good is it for working? Tap the stars, it takes 5 seconds:`) +
      `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px 0;"><tr>${stars}</tr></table>` +
      p('Add a sentence on the next page and earn 10 points.') +
      p(`<span style="white-space:pre-line;">${escapeHtml(SIGN)}</span>`),
    footer.html,
  );
  const text = [
    hello(input.name),
    '',
    `you worked at or saved ${place.name} recently. How good is it for working? Pick your rating:`,
    ...[5, 4, 3, 2, 1].map((n) => `${n} ${n === 1 ? 'star' : 'stars'}: ${starUrl(n)}`),
    '',
    'Add a sentence on the next page and earn 10 points.',
    '',
    SIGN,
    '',
    footer.text,
    operatorFooterText(site),
  ].join('\n');
  return { subject, html, text };
}

export function impactDigestEmail(input: {
  site: string;
  name: string;
  views: number;
  unlocks: number;
  reviews: number;
  city: { name: string; slug: string } | null;
  suggestions: Suggestion[];
  unsubscribeUrl: string;
}): Email {
  const { site, views, unlocks, city, suggestions } = input;
  const subject =
    views > 0 ? `Places you reviewed were viewed ${views.toLocaleString('en-US')} times this month` : 'People read your reviews this month';
  const facts = [
    views > 0 ? `the places you reviewed were viewed <strong>${views.toLocaleString('en-US')} times</strong>` : null,
    unlocks > 0 ? `your reviews were opened <strong>${unlocks.toLocaleString('en-US')} ${unlocks === 1 ? 'time' : 'times'}</strong>` : null,
  ].filter(Boolean);
  const factsText = [
    views > 0 ? `the places you reviewed were viewed ${views.toLocaleString('en-US')} times` : null,
    unlocks > 0 ? `your reviews were opened ${unlocks.toLocaleString('en-US')} ${unlocks === 1 ? 'time' : 'times'}` : null,
  ].filter(Boolean);
  const rateUrl = city ? `${site}/${city.slug}/rate?src=email_live` : `${site}/`;
  const footer = nudgeFooter(input.unsubscribeUrl);
  const html = layout(
    site,
    p(escapeHtml(hello(input.name))) +
      p(`in the last 30 days ${facts.join(' and ')}. That is how many people your ${input.reviews === 1 ? 'review helps' : `${input.reviews} reviews help`} find a good place to work.`) +
      (suggestions.length > 0 && city
        ? p(`These places in ${escapeHtml(city.name)} could use your rating next:`) + suggestionsHtml(site, suggestions, 'email_live')
        : '') +
      button('Rate more places', rateUrl) +
      p(`<span style="white-space:pre-line;">${escapeHtml(SIGN)}</span>`),
    footer.html,
  );
  const text = [
    hello(input.name),
    '',
    `in the last 30 days ${factsText.join(' and ')}. That is how many people your ${input.reviews === 1 ? 'review helps' : `${input.reviews} reviews help`} find a good place to work.`,
    suggestions.length > 0 && city ? `\nThese places in ${city.name} could use your rating next:\n${suggestionsText(site, suggestions, 'email_live')}` : '',
    `\nRate more places: ${rateUrl}`,
    '',
    SIGN,
    '',
    footer.text,
    operatorFooterText(site),
  ].join('\n');
  return { subject, html, text };
}

export function unsubscribedPage(site: string, ok: boolean): string {
  const message = ok
    ? 'Done. You will not get contribution emails anymore. You can turn them back on in your account.'
    : 'This link is not valid anymore. You can turn contribution emails off in your account.';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Cosurfing</title></head>
<body style="margin:0;padding:48px 16px;background:#F4EFE6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2A211A;">
<div style="max-width:480px;margin:0 auto;background:#FFFCF7;border:1px solid #E2D9C9;border-radius:16px;padding:28px 32px;font-size:16px;line-height:25px;">
<p style="margin:0 0 16px 0;font-weight:600;">Cosurfing</p><p style="margin:0 0 16px 0;">${escapeHtml(message)}</p>
<a href="${escapeHtml(`${site}/account`)}" style="color:#2A211A;font-weight:600;">Open your account</a></div></body></html>`;
}
