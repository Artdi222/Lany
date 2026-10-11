/**
 * Mods supported by Lany (Plan.md section 1): EZ, NF, HT, DT, NC, SD, HD.
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

/** Customise (lazer): the speed mod's rate can be set on a slider; any non-default rate makes the play unranked. */
export function speedRange(mods: readonly ModAcronym[]): { mod: ModAcronym; min: number; max: number; def: number } | null {
  if (mods.includes("HT")) return { mod: "HT", min: 0.5, max: 0.99, def: 0.75 };
  const fast = mods.find((m) => m === "DT" || m === "NC");
  return fast ? { mod: fast, min: 1.01, max: 2, def: 1.5 } : null;
}

/** Playback / game-clock rate; `customRate` (Customise) replaces the speed mod's default. */
export function modRate(mods: readonly ModAcronym[], customRate: number | null = null): number {
  const range = speedRange(mods);
  if (!range) return 1;
  return customRate == null ? range.def : Math.min(range.max, Math.max(range.min, customRate));
}

export const isUnranked = (mods: readonly ModAcronym[], customRate: number | null) => {
  const range = speedRange(mods);
  return !!range && customRate != null && modRate(mods, customRate) !== range.def;
};

/** Hit window scale; EZ widens windows like osu-mania-stable (great 40 -> 56 ms). */
export const windowScale = (mods: readonly ModAcronym[]) => (mods.includes("EZ") ? 1.4 : 1);

/** Scale for HP loss; EZ halves it. */
export const hpLossScale = (mods: readonly ModAcronym[]) => (mods.includes("EZ") ? 0.5 : 1);

export function scoreMultiplier(mods: readonly ModAcronym[]): number {
  return MODS.reduce((acc, m) => (mods.includes(m.acronym) ? acc * m.multiplier : acc), 1);
}
