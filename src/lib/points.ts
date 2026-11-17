/** Points per contribution. Reviews must match public.review_points() and contribution_totals(). */
export const POINTS = {
  stars: 3,
  text: 10,
  longTextBonus: 10,
  longTextChars: 200,
  firstReview: 5,
  photo: 5,
  fact: 2,
} as const;

export type RewardKey = 'rating' | 'text' | 'longText' | 'first' | 'photos' | 'facts';

export interface RewardLine {
  key: RewardKey;
  points: number;
  /** How many items the line counts (photos, facts). */
  count?: number;
}

export interface ReviewRewardInput {
  body: string;
  /** The place had no review yet when this one was written. */
  first: boolean;
  photos?: number;
  facts?: number;
}

/** Points for the review alone (no photos or facts). */
export function reviewPoints(body: string | null | undefined, first = false): number {
  const len = (body ?? '').trim().length;
  const base = len === 0 ? POINTS.stars : len >= POINTS.longTextChars ? POINTS.text + POINTS.longTextBonus : POINTS.text;
  return base + (first ? POINTS.firstReview : 0);
}

/** The lines of the thank-you screen, in the order Google shows them. */
export function reviewReward(input: ReviewRewardInput): { lines: RewardLine[]; total: number } {
  const len = input.body.trim().length;
  const lines: RewardLine[] = [{ key: 'rating', points: POINTS.stars }];
  if (len > 0) lines.push({ key: 'text', points: POINTS.text - POINTS.stars });
  if (len >= POINTS.longTextChars) lines.push({ key: 'longText', points: POINTS.longTextBonus });
  if (input.first) lines.push({ key: 'first', points: POINTS.firstReview });
  if (input.photos) lines.push({ key: 'photos', points: input.photos * POINTS.photo, count: input.photos });
  if (input.facts) lines.push({ key: 'facts', points: input.facts * POINTS.fact, count: input.facts });
  return { lines, total: lines.reduce((sum, l) => sum + l.points, 0) };
}
