import { LegalPage, type LegalClause } from '@/components/LegalPage';
import { OPERATOR, OPERATOR_ADDRESS } from '@/lib/legal';
import { PRIVACY_UPDATED } from '@/lib/terms';

const SUMMARY = [
  'No analytics, no advertising trackers, no tracking cookies.',
  'Your account needs only an email address. Your display name, avatar and contributions are public.',
  'Your data is stored in the EU (Frankfurt). Some service providers are based in the USA.',
  'You can delete your account in the app at any time.',
];

const CLAUSES: LegalClause[] = [
  {
    title: '1. Controller',
    paragraphs: [
      `${OPERATOR.company}, ${OPERATOR_ADDRESS}, represented by its managing director ${OPERATOR.director}. Email: ${OPERATOR.email}.`,
      'We have not appointed a data protection officer because we are not required to.',
    ],
  },
  {
    title: '2. Visiting cosurfing.app and using the apps',
    paragraphs: [
      'When you open Cosurfing, your device sends technical data to our hosting provider: IP address, date and time, the page requested, browser or app version and operating system. This is needed to deliver the website and the app and to keep them secure (Art. 6 (1) (f) GDPR). Logs are kept by our providers for a short time only.',
      'Website hosting: Netlify, Inc., 101 2nd Street, San Francisco, CA 94105, USA. Database, sign-in, file storage and server functions: Supabase, Inc., USA, with our data stored in Frankfurt, Germany (AWS eu-central-1).',
      'Cosurfing uses no analytics, no advertising networks and no tracking cookies.',
    ],
  },
  {
    title: '3. Storage on your device',
    paragraphs: [
      'We store a few entries in your browser’s local storage or in the app’s storage: your sign-in session, place drafts and speed tests you have not sent yet, and on this device only a counter of place pages viewed without an account and when you closed a sign-up hint. These entries never leave your device except the sign-in session, which is sent to Supabase to prove you are signed in. They are necessary to provide the service you requested (§ 25 (2) no. 2 TDDDG). You can delete them at any time in your browser settings or by signing out.',
    ],
  },
  {
    title: '4. Maps, city search, images and speed tests',
    paragraphs: [
      'To show these features, your browser or app connects directly to the following services, which receive your IP address and the request. Legal basis: Art. 6 (1) (f) GDPR; our legitimate interest is a working map, search and speed test.',
      'Map tiles on the web: OpenFreeMap (tiles.openfreemap.org). Map in the iOS and Android apps: Apple Maps (Apple Inc., USA) or Google Maps (Google Ireland Ltd., Ireland). City search: Photon by komoot GmbH, Germany (photon.komoot.io). City photos come from Wikimedia Commons and are delivered through our own hosting.',
      'Speed tests: your device downloads and uploads test data from Cloudflare, Inc., USA (speed.cloudflare.com). Cloudflare sees your IP address.',
      'The “Directions” button opens Google Maps or Apple Maps. Only then do those services receive data, under their own privacy policies.',
    ],
  },
  {
    title: '5. Your account',
    paragraphs: [
      'To create an account we need your email address. We send you a one-time code to sign in. We store the date and the version of the Terms of Use you accepted. Legal basis: Art. 6 (1) (b) GDPR (contract).',
      'During onboarding you can add a display name, a profile picture and your home cities. Your display name, profile picture, level, points and your published places, reviews and photos are shown on your public profile and next to your contributions. Your email address is never shown to other users.',
      'Sign-in and account emails are sent through Supabase.',
    ],
  },
  {
    title: '6. Your contributions',
    paragraphs: [
      'Reviews, ratings, photos, menus, offers, Wi‑Fi tips, facts, place suggestions and reports are stored with your user ID. Published contributions are public. Photos are re-encoded on upload, which removes location and camera data (EXIF). Legal basis: Art. 6 (1) (b) GDPR.',
      'Reports about content are stored with the reporter’s user ID, or the email address of reporters without an account, so we can handle them and send the confirmation and our decision (Art. 16 and 17 Digital Services Act, Art. 6 (1) (c) GDPR). Email addresses of reporters without an account are removed 180 days after the decision. When we remove or restrict content, we email the author our reasons; we keep a record of these emails for one year.',
    ],
  },
  {
    title: '7. Speed tests and location',
    paragraphs: [
      '“Near me” on the map uses your device location only on your device. It is not sent to us.',
      'When you send a speed test, we check once that you are at the place. For this we store your location rounded to about 11 metres, its accuracy, your network type and a salted hash of your IP address. Only our admins can see this data. We use it to verify the test and prevent manipulation (Art. 6 (1) (f) GDPR) and remove it after 30 days. The speed result itself stays with the place.',
    ],
  },
  {
    title: '8. City waiting list',
    paragraphs: [
      'If you join a city’s waiting list we store your email address, optional first name and a salted hash of your IP address, and send you a confirmation email (double opt-in). Only after you confirm do we send you one email about Cosurfing in that city and a possible user interview. Emails are sent through Resend (Plus Five Thirty, Inc., USA). Legal basis: your consent (Art. 6 (1) (a) GDPR), which you can withdraw at any time with the link in every email.',
      'Unconfirmed entries are deleted after 30 days. If you leave the list, your entry is deleted after 30 days. The IP hash is removed after 30 days.',
    ],
  },
  {
    title: '9. Cosurfing Plus',
    paragraphs: [
      'Purchases in the iOS or Android app are handled by Apple or Google. We use RevenueCat, Inc., USA, to connect your purchase to your account; RevenueCat receives your user ID and the purchase data.',
      'Purchases on the web are processed by Stripe Payments Europe, Ltd., Ireland. Stripe receives your email address and payment details; we never see your full card details. We store your Stripe customer and subscription IDs and the subscription status. Legal basis: Art. 6 (1) (b) GDPR. Invoices and payment records are kept for 10 years because tax law requires it (Art. 6 (1) (c) GDPR, § 147 AO, § 257 HGB).',
      'If you cancel through the “Cancel contracts here” page, we store your name, email address, the type of cancellation, an optional reason, the requested end date and the time we received it, and email you a confirmation. We keep this record for 3 years after the end of the year of the cancellation, as proof that we processed it (Art. 6 (1) (b) and (c) GDPR, § 312k BGB).',
      'The Plus waiting list is a form by Tally BV, Belgium. If you open it while signed in, your email address and user ID are filled in so we can unlock Plus for your account.',
    ],
  },
  {
    title: '10. Transfers outside the EU',
    paragraphs: [
      'Some providers are based in the USA. Transfers rely on the EU-US Data Privacy Framework, where the provider is certified, or on the EU Standard Contractual Clauses (Art. 46 (2) (c) GDPR). We have data processing agreements with all processors.',
    ],
  },
  {
    title: '11. How long we keep data',
    paragraphs: [
      'Account data is kept until you delete your account. When you delete it, we delete your sign-in data, profile, profile picture, reviews and ratings, saved places, facts, speed tests, menus, offers, Wi‑Fi tips, suggestions and reports, and cancel a web subscription. Photos of places stay on Cosurfing without your name, as described in the Terms of Use. Data we must keep by law (such as invoices) is kept for the period required, then deleted. Technical rate-limit entries are deleted after 7 days.',
    ],
  },
  {
    title: '12. Your rights',
    paragraphs: [
      'You have the right to access (Art. 15 GDPR), rectification (Art. 16), erasure (Art. 17), restriction of processing (Art. 18), data portability (Art. 20) and to withdraw any consent with effect for the future (Art. 7 (3)).',
      'Right to object (Art. 21 GDPR): where we process data based on legitimate interests, you can object at any time for reasons arising from your particular situation.',
      `To use these rights, email ${OPERATOR.email}. You can delete your account yourself under Account → Delete account.`,
      'You can complain to a data protection authority, for example the Berliner Beauftragte für Datenschutz und Informationsfreiheit, Alt-Moabit 59–61, 10555 Berlin.',
    ],
  },
  {
    title: '13. Age',
    paragraphs: ['Cosurfing is meant for people aged 16 and older.'],
  },
];

export default function PrivacyScreen() {
  return (
    <LegalPage
      title="Privacy Policy"
      description="How Cosurfing (cosurfing.app), operated by Spacifik UG (haftungsbeschränkt), processes personal data."
      updated={PRIVACY_UPDATED}
      summary={SUMMARY}
      clauses={CLAUSES}
      contactLabel="Questions about your data:"
    />
  );
}
