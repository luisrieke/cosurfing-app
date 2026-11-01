import { strings } from './strings';

/** Points needed for each level, aligned with strings.levels.names. */
const THRESHOLDS = [0, 10, 50, 150, 400, 1000] as const;

export interface Level {
  index: number;
  name: string;
  /** Points needed for the next level, or null at the top level. */
  nextAt: number | null;
  nextName: string | null;
  /** 0–1 progress towards the next level. */
  progress: number;
}

export function levelFor(points: number): Level {
  let index = 0;
  for (let i = 0; i < THRESHOLDS.length; i++) if (points >= THRESHOLDS[i]!) index = i;
  const nextAt = index + 1 < THRESHOLDS.length ? THRESHOLDS[index + 1]! : null;
  const from = THRESHOLDS[index]!;
  return {
    index,
    name: strings.levels.names[index]!,
    nextAt,
    nextName: nextAt !== null ? strings.levels.names[index + 1]! : null,
    progress: nextAt === null ? 1 : Math.min(1, (points - from) / (nextAt - from)),
  };
}
