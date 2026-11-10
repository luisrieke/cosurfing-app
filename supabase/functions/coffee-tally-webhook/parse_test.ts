import { assert, assertEquals } from 'jsr:@std/assert@1';

import { isTallyFileUrl, verifySignature } from './index.ts';
import { cents, parseSubmission, type TallyField, type TallyPayload } from './parse.ts';

const file = (name: string) => [{ id: name, name: `${name}.jpg`, url: `https://storage.tally.so/private/${name}.jpg?sig=x`, mimeType: 'image/jpeg', size: 1000 }];
const choice = (label: string, text: string): TallyField => ({
  key: label,
  label,
  type: 'MULTIPLE_CHOICE',
  value: ['opt-1'],
  options: [{ id: 'opt-1', text }, { id: 'opt-2', text: 'No' }],
});
const check = (label: string): TallyField => ({ key: label, label, type: 'CHECKBOXES', value: ['c1'], options: [{ id: 'c1', text: 'I agree' }] });

function payload(fields: TallyField[]): TallyPayload {
  return { eventType: 'FORM_RESPONSE', createdAt: '2026-11-10T10:00:00Z', data: { submissionId: 'sub1', formId: 'form1', fields } };
}

const base: TallyField[] = [
  { key: 'h1', label: 'token', type: 'HIDDEN_FIELDS', value: 'tok' },
  { key: 'h2', label: 'base', type: 'HIDDEN_FIELDS', value: 'open' },
  { key: 'h3', label: 'place', type: 'HIDDEN_FIELDS', value: 'open' },
  { key: 'h4', label: 'share', type: 'HIDDEN_FIELDS', value: 'open' },
  { key: 'e', label: 'Email', type: 'INPUT_EMAIL', value: 'me@x.test' },
  check('Campaign rules'),
  { key: 'rs', label: 'Review screenshot', type: 'FILE_UPLOAD', value: file('review') },
  { key: 'ps', label: 'Photos screenshot', type: 'FILE_UPLOAD', value: file('photos') },
  { key: 'pr', label: 'Place reviewed', type: 'INPUT_TEXT', value: 'Café A' },
  check('Genuine visit'),
  { key: 'ls', label: 'Location screenshot', type: 'FILE_UPLOAD', value: file('loc') },
  { key: 'r', label: 'Receipt', type: 'FILE_UPLOAD', value: file('receipt') },
  { key: 'vd', label: 'Visit date', type: 'INPUT_DATE', value: '2026-11-09' },
  { key: 'a', label: 'Coffee amount', type: 'INPUT_NUMBER', value: 4.2 },
  check('Final confirmation'),
];

Deno.test('base only', () => {
  const p = parseSubmission(payload([...base, choice('New place submitted', 'No'), choice('Spread the word', 'Not yet')]));
  assertEquals(p.steps, ['contribute']);
  assertEquals(p.token, 'tok');
  assertEquals(p.claimed.contribute, 420);
  assertEquals(p.answers.visit_date, '2026-11-09');
  assertEquals(p.files.map((f) => f.kind), ['review_screenshot', 'photos_screenshot', 'location_screenshot', 'receipt']);
  assertEquals(p.referralEmail, null);
});

Deno.test('all three steps, referral needs the friend agreement', () => {
  const fields = [
    ...base,
    choice('New place submitted', 'Yes'),
    { key: 'nps', label: 'New place screenshot', type: 'FILE_UPLOAD', value: file('np') },
    { key: 'npn', label: 'New place name or link', type: 'INPUT_TEXT', value: 'Café B' },
    { key: 'npr', label: 'New place receipt', type: 'FILE_UPLOAD', value: file('npr') },
    { key: 'npa', label: 'New place coffee amount', type: 'INPUT_NUMBER', value: '3,80' },
    choice('Spread the word', 'I invited a friend'),
    { key: 'fe', label: "Friend's email", type: 'INPUT_EMAIL', value: 'Friend@X.test' },
    { key: 'sr', label: 'Share receipt', type: 'FILE_UPLOAD', value: file('sr') },
    { key: 'sa', label: 'Share coffee amount', type: 'INPUT_NUMBER', value: 5 },
  ];
  const without = parseSubmission(payload(fields));
  assertEquals(without.steps, ['contribute', 'new_place']);
  assertEquals(without.preIgnored.spread, 'friend_consent_missing');
  assertEquals(without.referralEmail, null);

  const withConsent = parseSubmission(payload([...fields, check('Friend agreed')]));
  assertEquals(withConsent.steps, ['contribute', 'new_place', 'spread']);
  assertEquals(withConsent.referralEmail, 'friend@x.test');
  assertEquals(withConsent.claimed, { contribute: 420, new_place: 380, spread: 500 });
  assert(!JSON.stringify(withConsent.answers).includes('friend@'));
});

Deno.test('bonus later: base section hidden', () => {
  const fields: TallyField[] = [
    { key: 'h1', label: 'token', type: 'HIDDEN_FIELDS', value: 'tok' },
    { key: 'h2', label: 'base', type: 'HIDDEN_FIELDS', value: 'done' },
    { key: 'h4', label: 'share', type: 'HIDDEN_FIELDS', value: 'open' },
    check('Campaign rules'),
    choice('Spread the word', 'I published a public post'),
    { key: 'pu', label: 'Post URL', type: 'INPUT_LINK', value: 'https://instagram.com/p/1' },
    { key: 'psc', label: 'Post screenshot', type: 'FILE_UPLOAD', value: file('post') },
    { key: 'sr', label: 'Share receipt', type: 'FILE_UPLOAD', value: file('sr') },
    check('Final confirmation'),
  ];
  const p = parseSubmission(payload(fields));
  assertEquals(p.steps, ['spread']);
  assertEquals(p.answers.post_url, 'https://instagram.com/p/1');
  assertEquals(p.answers.visit_date, null);
  assertEquals(p.files.map((f) => f.kind), ['share_screenshot', 'receipt']);
});

Deno.test('missing consent or receipt is not accepted', () => {
  const noConsent = parseSubmission(payload(base.filter((f) => f.label !== 'Final confirmation')));
  assertEquals(noConsent.steps, []);
  assertEquals(noConsent.preIgnored.contribute, 'consent_missing');
  const noReceipt = parseSubmission(payload(base.filter((f) => f.label !== 'Receipt')));
  assertEquals(noReceipt.preIgnored.contribute, 'receipt_missing');
});

Deno.test('amounts', () => {
  assertEquals(cents('4,50 €'), 450);
  assertEquals(cents('3.2'), 320);
  assertEquals(cents('abc'), null);
  assertEquals(cents(null), null);
});

Deno.test('file urls must be on tally.so', () => {
  assert(isTallyFileUrl('https://storage.tally.so/private/a.jpg'));
  assert(!isTallyFileUrl('http://storage.tally.so/a.jpg'));
  assert(!isTallyFileUrl('https://tally.so.evil.com/a.jpg'));
  assert(!isTallyFileUrl('https://169.254.169.254/latest'));
  assert(isTallyFileUrl('https://storage.googleapis.com/tally-response-assets/abc/file.png'));
  assert(!isTallyFileUrl('https://storage.googleapis.com/someone-else/file.png'));
  assert(!isTallyFileUrl('https://storage.tally.so:8443/a.jpg'));
});

Deno.test('signature', async () => {
  const body = JSON.stringify(payload(base));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('s3cret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)))));
  assert(await verifySignature(body, sig, 's3cret'));
  assert(!(await verifySignature(body, sig, 'other')));
  assert(!(await verifySignature(body.replace('tok', 'tik'), sig, 's3cret')));
  assert(!(await verifySignature(body, '', 's3cret')));
});
