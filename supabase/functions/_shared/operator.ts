// Mandatory business details (§ 35a GmbHG) for every email we send. Keep in sync with src/lib/legal.ts.

export const OPERATOR_LINE =
  'Spacifik UG (haftungsbeschränkt) · Gerichtstr. 19, 13347 Berlin, Germany · Managing director: Luis Rieke · Amtsgericht Berlin-Charlottenburg, HRB 195740 B · luis@cosurfing.app';

export function operatorFooterHtml(siteUrl: string): string {
  const base = siteUrl.replace(/\/$/, '');
  return `<br /><br />${OPERATOR_LINE}<br /><a href="${base}/imprint" style="color:#6B675E;">Imprint</a> · <a href="${base}/privacy" style="color:#6B675E;">Privacy Policy</a>`;
}

export function operatorFooterText(siteUrl: string): string {
  const base = siteUrl.replace(/\/$/, '');
  return `\n\n${OPERATOR_LINE}\nImprint: ${base}/imprint · Privacy Policy: ${base}/privacy`;
}
