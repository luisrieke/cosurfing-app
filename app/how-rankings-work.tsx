import { LegalPage, type LegalClause } from '@/components/LegalPage';

const SUMMARY = [
  'Places are ranked by their work score from 0 to 10. Nobody can pay for a better position.',
  'Reviews come only from people with a verified email address. New contributors’ reviews are checked by a person before they go live.',
  'We do not check whether a reviewer actually visited or paid at a place.',
];

const CLAUSES: LegalClause[] = [
  {
    title: 'How places are ranked',
    paragraphs: [
      'Within a city, places are sorted by their work score, highest first, unless you choose a different order (star rating, Wi‑Fi, number of reviews or name). Filters only narrow the list.',
      'The work score combines five parts, each rated from 0 to 10 and weighted: reviews 65%, Wi‑Fi 10%, power outlets and calls 10%, complete information 10% and type of place 5%.',
      'Reviews: the average star rating, pulled toward a neutral 3.5 stars when a place has only a few reviews, so that a single review cannot push a place to the top. Without reviews this part counts as 3.5 stars and the score is marked as preliminary.',
      'Wi‑Fi: the median of speed tests run at the place (100 Mbps or more gives full points). Without speed tests we use Wi‑Fi ratings from reviews or the listing.',
      'Power outlets and calls: from reviews and the listing. Complete information: whether opening hours, website, address and price are known. Type of place: coworking 10, library and coliving 8, other places 5, because coworking spaces are built for working.',
      'On every place page, “How is the work score calculated?” shows the values for that place.',
    ],
  },
  {
    title: 'How cities are ranked',
    paragraphs: ['The city score is the average work score of the city’s ten best places. Cities with fewer than ten places count missing places as zero.'],
  },
  {
    title: 'No paid placement',
    paragraphs: [
      'Venues cannot pay for a better position or for removing reviews. Cosurfing Plus only unlocks more content for the subscriber and does not affect rankings. Offers and referral links shared by members do not change the order; referral links are marked as such.',
    ],
  },
  {
    title: 'How we check reviews',
    paragraphs: [
      'Only people with an account can review, and every account needs a verified email address. Each account can write one review per place, which it can update.',
      'Reviews from new contributors are checked by a person before they are published. Contributors with a clean record (Local Guides) publish directly; we check their reviews afterwards. We remove reviews that are fake, written in exchange for a benefit, offensive or not about the place, and anyone can report a review.',
      'We do not verify whether the reviewer visited or paid at the place. Speed tests are only counted as verified when the device was at the place.',
      'All reviews that follow our rules are shown, positive and negative. Reviews with text come first, then ratings without text, each newest first.',
    ],
  },
];

export default function HowRankingsWorkScreen() {
  return (
    <LegalPage
      title="How rankings and reviews work"
      description="How Cosurfing ranks places and cities and how reviews are checked."
      summary={SUMMARY}
      clauses={CLAUSES}
      contactLabel="Questions about rankings:"
    />
  );
}
