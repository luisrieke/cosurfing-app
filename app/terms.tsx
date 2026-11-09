import { LegalPage, type LegalClause } from '@/components/LegalPage';
import { OPERATOR, OPERATOR_ADDRESS } from '@/lib/legal';
import { TERMS_UPDATED } from '@/lib/terms';

/** Plain-language summary; the clauses below are what counts. */
const SUMMARY = [
  'Cosurfing is run by Spacifik UG (haftungsbeschränkt) in Berlin.',
  'You keep the rights to your photos and reviews and can use them anywhere else. You give Spacifik UG a simple, free right to show them in Cosurfing and to use them to promote Cosurfing.',
  'Only upload photos you took yourself, without recognizable people.',
  'Anyone can report content. We explain our decisions to the people affected.',
  'Place information can be wrong or outdated. Check important details with the venue.',
];

const CLAUSES: LegalClause[] = [
  {
    title: '1. Operator and scope',
    paragraphs: [
      `cosurfing.app and the Cosurfing apps (together “Cosurfing”) are operated by ${OPERATOR.company}, ${OPERATOR_ADDRESS}, registered at ${OPERATOR.register}, represented by its managing director ${OPERATOR.director} (“Spacifik”, “we”, “us”).`,
      'These Terms of Use apply to every use of Cosurfing, with or without an account. By creating an account you accept these Terms.',
    ],
  },
  {
    title: '2. The service',
    paragraphs: [
      'Cosurfing helps people find places to work remotely: coworking spaces, cafés, libraries and colivings. Place information comes from OpenStreetMap (© OpenStreetMap contributors, ODbL), from the venues’ own websites, from our editors and from users.',
      'We do our best to keep the information correct, but places open, close and change. We do not guarantee that any information (including opening hours, prices, Wi‑Fi speed, or whether a place still exists) is correct, complete or up to date. Please check important details with the venue directly.',
      'How we rank places and check reviews is explained on the page “How rankings work”. Venues cannot pay for a better position.',
    ],
  },
  {
    title: '3. Accounts',
    paragraphs: [
      'You need an account to write reviews, run speed tests, upload photos, suggest places and report issues. You must be at least 16 years old. Keep access to your email address secure; you are responsible for activity under your account.',
      'You can delete your account at any time under Account → Delete account.',
    ],
  },
  {
    title: '4. Your content and the rights you grant us',
    paragraphs: [
      '“Your content” means everything you submit to Cosurfing: photos (whether added on a place page or together with a review), written reviews, star and detail ratings, facts about a place, speed test results, menus, offers, Wi‑Fi tips, place suggestions, reports and corrections. Your profile picture and display name are not “your content” in this sense; see the last paragraph of this section.',
      'You keep the copyright and all other rights in your content. You can keep using it yourself and license it to anyone else.',
      'By submitting content you grant Spacifik UG a simple (non-exclusive), free, worldwide right, unlimited in time, to use your content for operating and promoting Cosurfing (§ 31 UrhG). This includes storing, reproducing and making it publicly available on cosurfing.app, in the Cosurfing apps, in link previews and in search engines; adapting it technically (for example resizing, cropping, compressing, translating, or combining ratings into scores); and using it in promotion of Cosurfing, for example on social media, in newsletters or press material. We may let service providers who host or deliver Cosurfing use it only for these purposes.',
      'We do not sell your content or license it to third parties for their own purposes. You receive no payment for your content; contributor points are not a payment and have no monetary value.',
      'We show your display name next to your content where content is shown with an author. In small previews, maps and promotion it may appear without your name.',
      'If you delete your account, your reviews, ratings, menus, offers, Wi‑Fi tips, facts, speed tests, suggestions and reports are deleted. Photos of places can stay on Cosurfing without your name. If you want a specific photo removed, write to us and we will remove it unless we have to keep it for legal reasons.',
      'You accept these Terms when you create your account, and we store the time and the version of these Terms with your account and with your content.',
      'Your profile picture and display name stay yours. You only grant us a simple (non-exclusive), free right to show them in Cosurfing next to your contributions for as long as your account exists.',
    ],
  },
  {
    title: '5. Rules for your content',
    paragraphs: [
      'You confirm that you created your content yourself and that you hold all rights needed to grant the rights in section 4. Photos must have been taken by you.',
      'Photos must not show recognizable people, licence plates, private documents or screens with private content. Content must be accurate to the best of your knowledge and must not be illegal, offensive, discriminatory or misleading. Reviews must reflect your own experience and must not be written in exchange for any benefit from the venue or a competitor.',
      'Offers: you may share your own referral or invite link if you say what both sides get. Cosurfing marks such links as referral links because you may benefit from them. Other advertising is not allowed.',
      'You indemnify Spacifik UG against third-party claims (including reasonable legal costs) that arise because you culpably infringed the rights of others with your content.',
    ],
  },
  {
    title: '6. Moderation and reports',
    paragraphs: [
      'Contributions from new contributors (reviews, photos, menus, offers, Wi‑Fi tips, facts and place suggestions) are checked by a person before they go live. Contributors with a clean record (Local Guides) can publish directly; we check their contributions afterwards and can withdraw the status. We use automated checks only to limit how often content can be sent and to verify that speed tests were run at the place. We do not use automated systems to decide on removals.',
      'Anyone can report content they think is illegal or breaks these Terms with “Report” next to a review, photo, offer, Wi‑Fi tip or profile, or by email. Please explain why the content is illegal or breaks the rules, and where it is. We check every report, decide promptly and tell you the result.',
      'We may hide or delete content that is illegal or breaks section 5, and limit, suspend or close accounts that repeatedly or seriously break these Terms, try to manipulate reviews, speed tests or rankings, or create fake accounts. When we remove your content or restrict your account, we tell you which content is affected, what we did and why, the rule or law it breaks, and how you can respond (Art. 17 Digital Services Act). You can reply to that email if you think we made a mistake, and we will review the decision.',
      'We are not obliged to publish content.',
    ],
  },
  {
    title: '7. Cosurfing Plus',
    paragraphs: [
      'Cosurfing Plus is a paid subscription that unlocks additional content. Purchases in the iOS or Android app are handled by Apple or Google under their terms and are cancelled in your App Store or Google Play settings. Purchases on the web are processed by Stripe. Price, billing period and renewal are shown before you buy; all prices include VAT.',
      'A web subscription renews automatically for the same period until you cancel it. You can cancel at any time with effect from the end of the current billing period, under Account → Manage subscription or on the page “Cancel contract”, which you can reach from every page without signing in.',
      'Consumers have a statutory right of withdrawal, explained on the page “Right of withdrawal”.',
    ],
  },
  {
    title: '8. Acceptable use',
    paragraphs: [
      'Do not scrape, copy or systematically extract data from Cosurfing, interfere with the service, create fake accounts, or try to manipulate reviews, speed tests or rankings.',
    ],
  },
  {
    title: '9. Liability',
    paragraphs: [
      'We are liable without limitation for intent and gross negligence, for injury to life, body or health, and under the German Product Liability Act. For slight negligence we are only liable for breaches of essential contractual obligations (obligations whose fulfilment makes the proper use of the service possible in the first place and on which you may regularly rely), limited to the typical, foreseeable damage. Otherwise our liability is excluded.',
      'We may change, restrict or discontinue free features. Features included in a paid Plus subscription stay available for the period you paid for.',
    ],
  },
  {
    title: '10. Changes to these Terms',
    paragraphs: [
      'We may change these Terms for valid reasons, for example new features, changes in the law or court decisions. We will show signed-in users the new version in the app at least 30 days before it takes effect, except where a change is required by law sooner, and ask you to accept it.',
      'New Terms only apply to you once you accept them. If you do not accept, the previous version keeps applying. In that case we may end the use agreement for free features with two weeks’ notice; a paid subscription can then be ended at the end of its current period.',
    ],
  },
  {
    title: '11. Governing law',
    paragraphs: [
      'German law applies, excluding the UN Convention on Contracts for the International Sale of Goods. If you are a consumer, mandatory consumer protection rules of the country where you live remain unaffected. If you are a merchant, the place of jurisdiction is Berlin. If any provision is invalid, the rest of these Terms remain valid.',
    ],
  },
];

export default function TermsScreen() {
  return (
    <LegalPage
      title="Terms of Use"
      description="Terms of Use of Cosurfing (cosurfing.app), operated by Spacifik UG (haftungsbeschränkt)."
      updated={TERMS_UPDATED}
      summary={SUMMARY}
      clauses={CLAUSES}
      contactLabel="Questions about these Terms or a request to remove content:"
    />
  );
}
