import { LegalPage, type LegalClause } from '@/components/LegalPage';
import { COFFEE_TERMS_UPDATED } from '@/lib/coffee';
import { OPERATOR, OPERATOR_ADDRESS } from '@/lib/legal';

const SUMMARY = [
  'Organized by Cosurfing, which is run by Spacifik UG (haftungsbeschränkt) in Berlin.',
  'Up to 3 coffees per person: €5 at most per coffee, €15 at most in total, only for coffee you actually bought.',
  'The first 50 participants whose Step 1 is approved. Nothing is guaranteed before a person has reviewed it.',
  'Honest reviews are welcome, positive or negative. Reviews written in the program are labelled.',
  'You send your proof as a direct message to Luis on Instagram, TikTok or X. It is deleted from the chat after the review; payout details are only requested after approval.',
];

const CLAUSES: LegalClause[] = [
  {
    title: '1. Organizer',
    paragraphs: [
      `The Cosurfing Early Contributors program “Your next 3 coffees are on me” (“the program”) is organized by ${OPERATOR.company}, ${OPERATOR_ADDRESS}, ${OPERATOR.register}, represented by ${OPERATOR.director} (“Cosurfing”, “we”). Contact: ${OPERATOR.email}.`,
      'The program is not a game of chance and there is no draw. Rewards depend only on the criteria below. Apple, Google, Instagram (Meta), TikTok, X and the venues do not organize, sponsor or endorse it.',
      'These terms apply in addition to the Cosurfing Terms of Use. If they conflict, these terms take precedence for the program.',
    ],
  },
  {
    title: '2. Who can take part',
    paragraphs: [
      'You can take part if you are at least 18 years old, have a Cosurfing account, live in the European Union, the European Economic Area, Switzerland or the United Kingdom, and can receive money by PayPal or SEPA bank transfer in euros.',
      'One participation per person. Using several accounts, or other people’s accounts, ends the participation of all accounts involved.',
      'Not eligible: employees of Spacifik UG and their household members, and anyone reviewing or adding a place they own, work for or are paid by.',
    ],
  },
  {
    title: '3. Program period and the first 50 participants',
    paragraphs: [
      'The program starts when this page says it is open and ends on the end date shown on cosurfing.app/free-coffee, or earlier once 50 participants are confirmed. Submissions are accepted until the submission deadline shown there.',
      'When you join, we reserve a spot for you for 7 days. If you do not send Step 1 within that time (see section 4a), the spot is released and offered to the next person on the waiting list; you can rejoin once, at the end of the waiting list.',
      'While Step 1 is being reviewed, your spot stays reserved. When Step 1 is approved, your spot is confirmed. If Step 1 is not approved, you can fix it and send it once more within 7 days; if the second attempt is not approved either, the spot goes to the next person.',
      'When all spots are taken, new participants join a waiting list in order of sign-up. We email you if a spot opens up. Being on the waiting list does not give you a right to a spot.',
      'We count and enforce the 50 spots on our server. If you see a spot counter on the page, it may be a few minutes out of date.',
    ],
  },
  {
    title: '4. Rewards',
    paragraphs: [
      'Step 1 (Contribute) earns one coffee. Step 2 (Add a new place) and Step 3 (Spread the word) earn one more coffee each, so three coffees at most per person. Steps 2 and 3 need an approved Step 1 and can be done in any order, at the same time as Step 1 or later.',
      'We reimburse the price of one coffee drink you actually bought (for example a cappuccino, espresso, latte or comparable coffee), up to €5 per coffee and €15 in total per person. Breakfasts, meals, food, other drinks and unrelated purchases are excluded. If a receipt contains other items, we only reimburse the coffee. We never pay more than the eligible amount on your receipt and there is no cash alternative.',
      'Every reward needs its own receipt. A receipt can only be reimbursed once, across all participants. Receipts must be your own, clearly readable and show the venue, the date and the coffee. The visit must have happened while you take part and at most 30 days before you send it. If you paid in another currency, we reimburse the euro equivalent on the day of the visit, still at most €5.',
    ],
  },
  {
    title: '4a. How to send your proof',
    paragraphs: [
      'When you join, cosurfing.app/free-coffee shows your personal code (for example CS-7K3QF). Send your proof as a direct message to Luis Rieke, founder of Cosurfing, on Instagram (@luisbuildsinpublic), TikTok (@luisbuildsinpublic) or X (@luisbu1lds). The message must contain your code and the proof listed for each step below. Then tap “I’ve sent my proof” on cosurfing.app/free-coffee and enter the username you sent it from.',
      'A step counts as sent once both have happened. We do not accept proof through comments, email or other channels. If we cannot find a message with your code from that username, we reject the step with the reason “proof not received”; you can then send it once more within 7 days.',
      'Only send the proof from an account that belongs to you. We never ask you for passwords, login codes or payment details in a direct message, and we never send you a payment link there. Payout details are only entered on cosurfing.app/free-coffee.',
    ],
  },
  {
    title: '5. Step 1: what we check',
    paragraphs: [
      'A useful review is based on your own, real visit and tells other remote workers what it is like to work there. It covers at least three of: Wi‑Fi, power outlets, noise, seating and comfort, whether calls are OK, laptop policy, prices, opening hours. It is written in your own words; copied, generic or AI-generated text is not eligible.',
      'You upload at least two photos of the place that you took yourself, following the photo rules in the Terms of Use (no recognizable people).',
      'Your review can be positive, mixed or negative. We never ask for a particular rating and the rating has no influence on the decision.',
      'Proof (in your direct message): screenshots of the published review and your uploaded photos, a screenshot of your location in Google Maps or Apple Maps taken at the place, and a photo of the coffee receipt. A location screenshot alone is not proof of a visit; we look at all proof together and may ask a follow-up question.',
    ],
  },
  {
    title: '6. Step 2: what we check',
    paragraphs: [
      'You suggest a place through Cosurfing that was not listed when you suggested it (if two people suggest the same place, the first one counts). It must exist, be open to the public and be suitable for working, and your name, address, type of place and other details must be accurate. It has to pass our normal review of place suggestions.',
      'Proof (in your direct message): a screenshot of your suggestion, the place name or link and a photo of a separate coffee receipt.',
    ],
  },
  {
    title: '7. Step 3: what we check',
    paragraphs: [
      'Referral: a friend creates a new Cosurfing account after you joined the program. You send us the email address of their account in your direct message, but only if your friend agreed to it. We use it only to find their account and check that it is new and not yours; we do not store it in our systems, delete it from the chat with the rest of the proof and never contact your friend because of it. Each friend counts once.',
      'Public post: a genuine post about Cosurfing on a public social network, blog or forum, in your own words, that is publicly visible when we check it. Because you get a coffee for it, you must mark the post as advertising, for example with “#ad” or “Anzeige”. Proof (in your direct message): the link and a screenshot.',
      'Step 3 also needs its own coffee receipt.',
    ],
  },
  {
    title: '8. Review and decisions',
    paragraphs: [
      'A person reviews every submission against the criteria in these terms; we do not decide automatically. Our system shows the reviewer signals such as a missing review or a receipt that was already reimbursed, but they never decide on their own. We usually decide within 7 days.',
      'We do not approve contributions that are low-effort, fake, copied, duplicated, misleading or irrelevant, that break the Cosurfing Terms of Use, or whose proof is missing or unreadable. When we do not approve a step, we email you the reason. If you think we made a mistake, reply to that email and we will look at it again.',
      'If we find out later that a reward was obtained by fraud, we may end your participation and ask for the money back.',
      'Reviews, photos and places you add stay subject to the normal Cosurfing moderation. Reviews written while you take part are labelled as written in the program, so that readers know that Cosurfing reimbursed a coffee.',
    ],
  },
  {
    title: '9. Payout',
    paragraphs: [
      'Only after a step was approved do we ask where to send the money (PayPal email address or IBAN and account holder). We pay by hand, usually within 14 days after you added your details. We cover the transfer fees on our side.',
      'You are responsible for any taxes on what you receive, if any apply where you live.',
    ],
  },
  {
    title: '10. Privacy',
    paragraphs: [
      'What we process for the program, why, how long we keep it and who receives it is explained in section 9a of the Privacy Policy. In short: we do not upload your screenshots or receipt to Cosurfing. They stay in the direct message, are only read by Luis, and are deleted from the chat at the latest 30 days after the decision on the step. We only keep the receipt details needed to prevent double reimbursement and for accounting. Payout details are deleted 30 days after the last payment. The social network processes your message under its own privacy policy. Please cover card numbers or other personal details on your receipt before you send it.',
    ],
  },
  {
    title: '11. Changes and ending the program',
    paragraphs: [
      'We may end or pause the program early for an important reason, for example abuse, a technical problem or a legal requirement. Steps that were already approved are still paid. Steps that were sent before the end are still reviewed under these terms.',
      'We do not change these terms to the disadvantage of participants for steps they already sent. You can leave the program at any time on cosurfing.app/free-coffee.',
    ],
  },
  {
    title: '12. Law',
    paragraphs: [
      'German law applies. If you are a consumer, the mandatory consumer protection rules of the country where you live remain unaffected. If any provision is invalid, the rest of these terms remain valid.',
    ],
  },
];

export default function CoffeeTermsScreen() {
  return (
    <LegalPage
      title="Early Contributors program terms"
      description="Terms of the Cosurfing Early Contributors coffee program: eligibility, rewards, review criteria and payout."
      updated={COFFEE_TERMS_UPDATED}
      summary={SUMMARY}
      clauses={CLAUSES}
      contactLabel="Questions about the program:"
    />
  );
}
