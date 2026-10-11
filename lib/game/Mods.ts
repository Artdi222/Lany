/**
 * Mods supported by Lanify (Plan.md section 1): EZ, NF, HT, DT, NC, SD, HD.
 * Same set and exclusion groups as the backend validator (`be/src/utils/mod-validator.ts`).
 * Multipliers follow osu!lazer mania.
 */
export type ModAcronym = "EZ" | "NF" | "HT" | "DT" | "NC" | "SD" | "HD";
export type ModCategory = "reduction" | "increase";

export interface ModInfo {
  acronym: ModAcronym;
  name: string;
  description: string;
  category: ModCategory;
  multiplier: number;
}

export const MODS: ModInfo[] = [
  { acronym: "EZ", name: "Easy", description: "More forgiving HP drain, less accuracy required.", category: "reduction", multiplier: 0.5 },
  { acronym: "NF", name: "No Fail", description: "You can't fail, no matter what.", category: "reduction", multiplier: 0.5 },
  { acronym: "HT", name: "Half Time", description: "Less zoom...", category: "reduction", multiplier: 0.5 },
  { acronym: "SD", name: "Sudden Death", description: "Miss and fail.", category: "increase", multiplier: 1 },
  { acronym: "DT", name: "Double Time", description: "Zoooooooooom...", category: "increase", multiplier: 1 },
  { acronym: "NC", name: "Nightcore", description: "Uguuuuuuuu...", category: "increase", multiplier: 1 },
  { acronym: "HD", name: "Hidden", description: "Keys fade out before you hit them!", category: "increase", multiplier: 1 },
];

const GROUPS: ModAcronym[][] = [
  ["HT", "DT", "NC"],
  ["NF", "SD"],
];

/** Toggle one mod; picking a mod drops the others in its exclusion group. Output keeps MODS order. */
export function toggleMod(selected: readonly ModAcronym[], mod: ModAcronym): ModAcronym[] {
  if (selected.includes(mod)) return selected.filter((m) => m !== mod);
  const group = GROUPS.find((g) => g.includes(mod)) ?? [];
  const next = new Set(selected.filter((m) => !group.includes(m)));
  next.add(mod);
  return MODS.map((m) => m.acronym).filter((a) => next.has(a));
}

/** Playback / game-clock rate. */
export function modRate(mods: readonly ModAcronym[]): number {
  if (mods.includes("HT")) return 0.75;
  if (mods.includes("DT") || mods.includes("NC")) return 1.5;
  return 1;
}

/** Hit window scale; EZ widens windows like osu-mania-stable (great 40 -> 56 ms). */
export const windowScale = (mods: readonly ModAcronym[]) => (mods.includes("EZ") ? 1.4 : 1);

/** Scale for HP loss; EZ halves it. */
export const hpLossScale = (mods: readonly ModAcronym[]) => (mods.includes("EZ") ? 0.5 : 1);

export function scoreMultiplier(mods: readonly ModAcronym[]): number {
  return MODS.reduce((acc, m) => (mods.includes(m.acronym) ? acc * m.multiplier : acc), 1);
}
