/**
 * Score/combo/HP/accuracy bookkeeping for one judgement, as plain functions (no zustand, no React).
 *
 * Extracted from useGameStore.updateJudgement, which ran on every hit and recomputed the total note
 * count with a `reduce` over the whole chart each time. The total is now computed once per game
 * (`maxScoreUnits`) and a run of identical judgements (a hold's head + tail + ticks) is applied in a
 * single call via `count`.
 */
import type { JudgementCounts, JudgementType, ParsedNote } from "@/types/game";

export interface JudgementSlice {
  judgements: JudgementCounts;
  combo: number;
  maxCombo: number;
  accuracy: number;
  hp: number;
  score: number;
}

const ACCURACY_WEIGHTS: JudgementCounts = { marvelous: 300, perfect: 300, great: 200, good: 100, bad: 50, miss: 0 };

export function calculateAccuracy(j: JudgementCounts): number {
  const total = j.marvelous + j.perfect + j.great + j.good + j.bad + j.miss;
  if (total === 0) return 100;
  const weighted =
    j.marvelous * ACCURACY_WEIGHTS.marvelous +
    j.perfect * ACCURACY_WEIGHTS.perfect +
    j.great * ACCURACY_WEIGHTS.great +
    j.good * ACCURACY_WEIGHTS.good +
    j.bad * ACCURACY_WEIGHTS.bad +
    j.miss * ACCURACY_WEIGHTS.miss;
  return (weighted / (total * 300)) * 100;
}

/** Score denominator: every judgement a perfect run would produce (tap = 1, hold = head + tail + ticks) x 320. */
export function maxScoreUnits(notes: ParsedNote[] | undefined | null): number {
  const objects =
    notes?.reduce((acc, n) => (n.isHoldNote ? acc + 2 + (n.totalTicks || 0) : acc + 1), 0) || 1;
  return objects * 320;
}

function hpDelta(type: JudgementType): number {
  if (type === "MISS") return -8;
  if (type === "BAD") return -4;
  if (type === "GOOD") return -1;
  return 2;
}

/**
 * Apply `count` identical judgements. All of them share a sign (and a MISS zeroes combo regardless of
 * count), so batching gives the same result as `count` single calls, including the HP clamp.
 */
export function applyJudgement(
  state: JudgementSlice,
  type: JudgementType,
  weight: number,
  count: number,
  maxUnits: number,
  /** Mods: HP loss scale (EZ 0.5) and score multiplier (EZ/NF/HT 0.5 each). */
  hpLossScale = 1,
  scoreMultiplier = 1,
): JudgementSlice {
  const key = type.toLowerCase() as keyof JudgementCounts;
  const judgements = { ...state.judgements, [key]: state.judgements[key] + count };

  const combo = type === "MISS" ? 0 : state.combo + count;
  const delta = hpDelta(type);
  const hp = Math.max(0, Math.min(100, state.hp + (delta < 0 ? delta * hpLossScale : delta) * weight * count));

  const scoreSum =
    judgements.marvelous * 320 +
    judgements.perfect * 300 +
    judgements.great * 200 +
    judgements.good * 100 +
    judgements.bad * 50;

  return {
    judgements,
    combo,
    maxCombo: Math.max(state.maxCombo, combo),
    accuracy: calculateAccuracy(judgements),
    hp,
    score: Math.floor((scoreSum / maxUnits) * 1000000 * scoreMultiplier),
  };
}
