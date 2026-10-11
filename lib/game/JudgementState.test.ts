import { describe, expect, test } from "bun:test";
import type { JudgementCounts, JudgementType, ParsedNote } from "@/types/game";
import {
  applyJudgement,
  calculateAccuracy,
  maxScoreUnits,
  type JudgementSlice,
} from "./JudgementState";

/** Deterministic PRNG so random sequences never flake. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const zero = (): JudgementCounts => ({ marvelous: 0, perfect: 0, great: 0, good: 0, bad: 0, miss: 0 });
const fresh = (): JudgementSlice => ({
  judgements: zero(),
  combo: 0,
  maxCombo: 0,
  accuracy: 100,
  hp: 100,
  score: 0,
});
const TYPES: JudgementType[] = ["MARVELOUS", "PERFECT", "GREAT", "GOOD", "BAD", "MISS"];

/**
 * The previous useGameStore.updateJudgement, copied verbatim (minus the history arrays and `set`),
 * used as the reference the refactor must match. `totalNotes` is recomputed per call, as it was.
 */
function reference(state: JudgementSlice, notes: ParsedNote[], type: JudgementType, weight = 1): JudgementSlice {
  const key = type.toLowerCase() as keyof JudgementCounts;
  const newJudgements = { ...state.judgements, [key]: state.judgements[key] + 1 };
  const isMiss = type === "MISS";
  const newCombo = isMiss ? 0 : state.combo + 1;
  const newMaxCombo = Math.max(state.maxCombo, newCombo);

  const w = { marvelous: 300, perfect: 300, great: 200, good: 100, bad: 50, miss: 0 };
  const total = Object.values(newJudgements).reduce((a, b) => a + b, 0);
  const weighted = (Object.keys(w) as (keyof JudgementCounts)[]).reduce((a, k) => a + newJudgements[k] * w[k], 0);
  const accuracy = total === 0 ? 100 : (weighted / (total * 300)) * 100;

  const hpDelta = (isMiss ? -8 : type === "BAD" ? -4 : type === "GOOD" ? -1 : 2) * weight;
  const hp = Math.max(0, Math.min(100, state.hp + hpDelta));

  const totalNotes =
    notes.reduce((acc, note) => (!note.isHoldNote ? acc + 1 : acc + 2 + (note.totalTicks || 0)), 0) || 1;
  const maxPossibleScore = totalNotes * 320;
  const sum =
    newJudgements.marvelous * 320 +
    newJudgements.perfect * 300 +
    newJudgements.great * 200 +
    newJudgements.good * 100 +
    newJudgements.bad * 50;

  return {
    judgements: newJudgements,
    combo: newCombo,
    maxCombo: newMaxCombo,
    accuracy,
    hp,
    score: Math.floor((sum / maxPossibleScore) * 1000000),
  };
}

const note = (isHoldNote: boolean, totalTicks = 0) => ({ isHoldNote, totalTicks }) as ParsedNote;

describe("maxScoreUnits", () => {
  test("a tap is 1 unit, a hold is head + tail + ticks, times 320", () => {
    expect(maxScoreUnits([note(false), note(false), note(true, 3)])).toBe((1 + 1 + (2 + 3)) * 320);
  });
  test("an empty or missing chart counts as 1 unit (never divides by zero)", () => {
    expect(maxScoreUnits([])).toBe(320);
    expect(maxScoreUnits(undefined)).toBe(320);
  });
});

describe("calculateAccuracy", () => {
  test("is 100 with no judgements and weighs tiers as 300/300/200/100/50/0", () => {
    expect(calculateAccuracy(zero())).toBe(100);
    expect(calculateAccuracy({ ...zero(), marvelous: 1, great: 1 })).toBeCloseTo(((300 + 200) / 600) * 100, 9);
    expect(calculateAccuracy({ ...zero(), miss: 4 })).toBe(0);
  });
});

describe("applyJudgement", () => {
  test("matches the previous implementation exactly over long random runs", () => {
    const rand = rng(11);
    const notes = [...Array.from({ length: 40 }, () => note(false)), note(true, 5), note(true, 12)];
    const units = maxScoreUnits(notes);

    for (let run = 0; run < 20; run++) {
      let a = fresh();
      let b = fresh();
      for (let i = 0; i < 400; i++) {
        const type = TYPES[Math.floor(rand() * TYPES.length)];
        const weight = rand() < 0.2 ? 1 / (2 + Math.floor(rand() * 12)) : 1;
        a = reference(a, notes, type, weight);
        b = applyJudgement(b, type, weight, 1, units);
        expect(b).toEqual(a);
      }
    }
  });

  test("a batch of N equals N single judgements (hold ticks and head/tail)", () => {
    const rand = rng(5);
    const notes = Array.from({ length: 30 }, () => note(false)).concat([note(true, 8)]);
    const units = maxScoreUnits(notes);

    for (let run = 0; run < 200; run++) {
      const type = TYPES[Math.floor(rand() * TYPES.length)];
      const count = 1 + Math.floor(rand() * 10);
      const weight = 1 / (2 + Math.floor(rand() * 10));
      // start from a mid-game state so the HP clamp can be hit on either side
      let start = fresh();
      for (let i = 0; i < Math.floor(rand() * 20); i++) {
        start = applyJudgement(start, TYPES[Math.floor(rand() * 6)], 1, 1, units);
      }

      let one = start;
      for (let i = 0; i < count; i++) one = reference(one, notes, type, weight);
      const batch = applyJudgement(start, type, weight, count, units);
      expect(batch.judgements).toEqual(one.judgements);
      expect(batch.combo).toBe(one.combo);
      expect(batch.maxCombo).toBe(one.maxCombo);
      expect(batch.hp).toBeCloseTo(one.hp, 9);
      expect(batch.score).toBe(one.score);
      expect(batch.accuracy).toBeCloseTo(one.accuracy, 9);
    }
  });

  test("a MISS batch resets combo once and HP never drops below 0", () => {
    const units = maxScoreUnits([note(false)]);
    let s = fresh();
    for (let i = 0; i < 5; i++) s = applyJudgement(s, "MARVELOUS", 1, 1, units);
    s = applyJudgement(s, "MISS", 1, 40, units);
    expect(s.combo).toBe(0);
    expect(s.maxCombo).toBe(5);
    expect(s.hp).toBe(0);
    expect(s.judgements.miss).toBe(40);
  });

  test("mods scale HP loss (not gain) and the score", () => {
    const units = maxScoreUnits([note(false), note(false)]);
    const hit = applyJudgement({ ...fresh(), hp: 50 }, "MARVELOUS", 1, 1, units, 0.5, 0.5);
    expect(hit.hp).toBe(52);
    expect(hit.score).toBe(250000);
    expect(applyJudgement({ ...fresh(), hp: 50 }, "MISS", 1, 1, units, 0.5).hp).toBe(46);
  });

  test("does not mutate its input", () => {
    const before = fresh();
    const snapshot = JSON.parse(JSON.stringify(before));
    applyJudgement(before, "PERFECT", 1, 3, 320);
    expect(before).toEqual(snapshot);
  });
});
