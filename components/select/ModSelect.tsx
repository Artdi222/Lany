"use client";

import { useEffect, useState } from "react";
import { ChevronDown, RotateCcw, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { MODS, isUnranked, modRate, scoreMultiplier, speedRange, toggleMod, type ModCategory } from "@/lib/game/Mods";
import GameSlider from "@/components/game/shared/GameSlider";
import { useGameStore } from "@/lib/store/useGameStore";
import { getBeatmapPerformance, peekBeatmapPerformance } from "@/lib/api/scores";
import type { Beatmap } from "@/types/beatmap";

/** Overlay Mod Select (docs/ui-spec/mods.md, foto `...519386266`). Layout lazer, warna palet Lanify. */

const HEX = "polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)";
const colorOf = (category: ModCategory) => COLUMNS.find((c) => c.category === category)!.color;
/** Lazer: < 1 reads as easier (green), > 1 harder (red). */
const multiplierColor = (m: number) => (m < 1 ? "var(--color-lf-success)" : m > 1 ? "var(--color-lf-danger)" : undefined);

const COLUMNS: { category: ModCategory; title: string; color: string }[] = [
  { category: "reduction", title: "Difficulty Reduction", color: "var(--color-lf-success)" },
  { category: "increase", title: "Difficulty Increase", color: "var(--color-lf-danger)" },
];

export default function ModSelect({ onClose }: { onClose: () => void }) {
  const selected = useGameStore((s) => s.selectedMods);
  const setSelected = useGameStore((s) => s.setSelectedMods);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const visible = MODS.filter((m) => !q || m.name.toLowerCase().includes(q) || m.acronym.toLowerCase().includes(q));
  const multiplier = scoreMultiplier(selected);
  const customRate = useGameStore((s) => s.customRate);
  const setCustomRate = useGameStore((s) => s.setCustomRate);
  const range = speedRange(selected);
  const unranked = isUnranked(selected, customRate);
  const [customiseOpen, setCustomiseOpen] = useState(false);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", esc, true);
    return () => window.removeEventListener("keydown", esc, true);
  }, [onClose]);

  return (
    <div className="absolute inset-0 z-[19] bg-black/60 pb-[85px]">
      <div className="mx-[95px] flex h-[91px] items-center justify-between rounded-b-xl bg-select-panel px-[132px] pr-6 text-white shadow-lg">
        <div>
          <h2 className="font-game-display text-[22px] leading-tight">Mod Select</h2>
          <p className="text-[13px] text-white/85">
            Mods provide different ways to enjoy gameplay. Some have an effect on the score you can achieve during ranked play. Others are just for fun.
          </p>
        </div>
        <button type="button" aria-label="Close" onClick={onClose} className="cursor-pointer p-2 hover:opacity-80">
          <X className="h-6 w-6" strokeWidth={3} aria-hidden />
        </button>
      </div>

      <label className="absolute left-[127px] top-[131px] flex h-[54px] w-[401px] -skew-x-[11deg] items-center overflow-hidden rounded-lg bg-select-field text-white shadow-lg">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="tab to search..."
          className="h-full min-w-0 flex-1 skew-x-[11deg] bg-transparent pl-4 font-game-display text-[22px] outline-none placeholder:text-white/60"
        />
        <span className="flex h-full w-[66px] items-center justify-center bg-select-tile">
          <Search className="h-6 w-6 skew-x-[11deg]" strokeWidth={3} aria-hidden />
        </span>
      </label>

      {/* Customise (foto `...717206529`): settings of the selected speed mod. */}
      <div className="absolute right-[135px] top-[131px] z-10 w-[530px] overflow-hidden rounded-xl shadow-lg">
        <button
          type="button"
          disabled={!range}
          aria-expanded={customiseOpen && !!range}
          onClick={() => setCustomiseOpen((v) => !v)}
          className={cn(
            "flex h-[54px] w-full items-center justify-between px-6 font-game-display text-[22px] text-white transition-colors",
            range ? "cursor-pointer bg-lf-primary hover:brightness-110" : "cursor-not-allowed bg-select-field text-white/50",
          )}
        >
          Customise
          <ChevronDown className={cn("h-7 w-7 transition-transform", customiseOpen && range && "rotate-180")} strokeWidth={3} aria-hidden />
        </button>
        {customiseOpen && range && (
          <div className="bg-select-panel px-9 pb-6 pt-5 text-white">
            <div className="flex items-center justify-between">
              <span className="font-game-display text-xl">{MODS.find((m) => m.acronym === range.mod)!.name}</span>
              <span className="rounded-full bg-lf-danger px-3 text-[13px] font-bold text-select-bar">{range.mod}</span>
            </div>
            <div className="mt-3 flex items-start gap-2">
              <button
                type="button"
                aria-label="Reset speed"
                title="Reset to default"
                onClick={() => setCustomRate(null)}
                className={cn("mt-0.5 cursor-pointer text-lf-accent", customRate == null && "invisible")}
              >
                <RotateCcw className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
              </button>
              <GameSlider
                className="flex-1"
                label={range.def > 1 ? "Speed increase" : "Speed decrease"}
                value={modRate(selected, customRate)}
                min={range.min}
                max={range.max}
                step={0.01}
                suffix="x"
                onChange={(v) => setCustomRate(v)}
              />
            </div>
            {/* ponytail: no "Adjust pitch" toggle; Web Audio rate always shifts pitch, a pitch-preserving rate needs a time-stretch worklet. */}
          </div>
        )}
      </div>

      <div className="mt-[114px] flex gap-[15px] overflow-x-auto pl-[520px]">
        {COLUMNS.filter((col) => visible.some((m) => m.category === col.category)).map((col, i) => (
          // First column drops in from above, the next rises from below (after the footer tiles slide away).
          <section
            key={col.category}
            className={cn(
              "h-[680px] w-[430px] shrink-0 -skew-x-[11deg] overflow-hidden rounded-xl bg-select-band shadow-lg",
              i % 2 ? "motion-safe:animate-mods-in-bottom" : "motion-safe:animate-mods-in-top",
            )}
          >
            <h3 className="flex h-14 items-center px-[25px] font-game-display text-[17px] font-semibold text-select-bar" style={{ backgroundColor: col.color }}>
              <span className="skew-x-[11deg]">{col.title}</span>
            </h3>
            <ul className="flex flex-col gap-[9px] p-[10px]">
              {visible.filter((m) => m.category === col.category).map((m) => {
                const on = selected.includes(m.acronym);
                return (
                  <li key={m.acronym}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => setSelected(toggleMod(useGameStore.getState().selectedMods, m.acronym))}
                      className={cn(
                        "flex h-14 w-full cursor-pointer items-center overflow-hidden rounded-md text-left transition-[filter,background-color] duration-150 hover:brightness-125",
                        on ? "text-select-bar" : "bg-select-tile text-white",
                      )}
                      style={on ? { backgroundColor: col.color } : undefined}
                    >
                      <span className={cn("flex h-full w-[70px] shrink-0 items-center justify-center", on ? "bg-black/25" : "bg-black/20")}>
                        {/* ponytail: placeholder icon (hexagon + acronym); the photo's glyphs are not legible */}
                        <span
                          className={cn("flex h-[34px] w-[46px] skew-x-[11deg] items-center justify-center font-game-display text-[13px] font-bold", on ? "bg-black/35 text-white" : "bg-white/10")}
                          style={{ clipPath: HEX }}
                        >
                          {m.acronym}
                        </span>
                      </span>
                      <span className="min-w-0 skew-x-[11deg] pl-5 pr-3">
                        <span className="block font-game-display text-xl leading-tight">{m.name}</span>
                        <span className={cn("block truncate text-[13px]", on ? "text-select-bar/80" : "text-white/85")}>{m.description}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {selected.length > 0 && (
        <div className="absolute bottom-[95px] left-[420px] flex h-9 -skew-x-[11deg] items-center gap-3 rounded-lg bg-select-bar px-3 shadow-lg">
          <span className="flex skew-x-[11deg] gap-1">
            {selected.map((a) => {
              const custom = range?.mod === a && unranked;
              return (
                <span
                  key={a}
                  className={cn("flex h-[22px] items-center justify-center font-game-display text-[10px] font-bold text-select-bar", custom ? "w-[64px] gap-1" : "w-[30px]")}
                  style={{ clipPath: HEX, backgroundColor: colorOf(MODS.find((m) => m.acronym === a)!.category) }}
                >
                  {a}
                  {custom && <span>{modRate(selected, customRate).toFixed(2)}x</span>}
                </span>
              );
            })}
          </span>
          <span className="skew-x-[11deg] font-game-display text-[15px] font-bold text-white" style={{ color: multiplierColor(multiplier) }}>
            {multiplier.toFixed(2)}x
          </span>
          {unranked && (
            <span className="skew-x-[11deg] rounded-md bg-lf-warning px-3 py-0.5 font-game-display text-[13px] font-bold text-select-bar">UNRANKED</span>
          )}
        </div>
      )}
    </div>
  );
}

/** Footer kanan saat Mod Select terbuka: bintang, BPM, KC/OD/HP, multiplier (nilai ikut mod kecepatan). */
export function ModStats({ beatmap }: { beatmap: Beatmap | null }) {
  const selected = useGameStore((s) => s.selectedMods);
  const customRate = useGameStore((s) => s.customRate);
  const rate = modRate(selected, customRate);
  const unranked = isUnranked(selected, customRate);
  const speed = rate > 1 ? "DT" : rate < 1 ? "HT" : "";
  const [, bump] = useState(0);

  useEffect(() => {
    if (!beatmap || !speed || peekBeatmapPerformance(beatmap.id, speed)) return;
    getBeatmapPerformance(beatmap.id, speed).then(() => bump((n) => n + 1)).catch(() => {});
  }, [beatmap, speed]);

  if (!beatmap) return null;
  // ponytail: the backend caches stars for 1.5x/0.75x only, so a custom rate shows no star value.
  const stars = unranked ? undefined : speed ? peekBeatmapPerformance(beatmap.id, speed)?.starRating : beatmap.starRating;
  const stat = (label: string, value: string | number) => (
    <span className="flex flex-col items-center leading-tight">
      <span className="font-game-display text-[19px] font-bold">{label}</span>
      <span className="text-[19px]">{value}</span>
    </span>
  );

  // Foto: dua kotak miring menempel bawah, segmen kiri lebih terang ([★ BPM | KC OD HP] dan [status | multiplier]).
  const box = "flex h-16 -skew-x-[10deg] overflow-hidden rounded-lg border border-white/10 shadow-lg";
  const seg = "flex h-full items-center skew-x-[10deg]";
  return (
    <div className="absolute bottom-[18px] right-[20px] z-20 flex gap-10 font-game-display text-white motion-safe:animate-mods-fade">
      <div className={box}>
        <div className="flex items-center gap-10 bg-select-tile px-7">
          <span className={cn(seg, "gap-10")}>
            <span className="rounded-full bg-lf-danger px-3 py-0.5 text-[15px] font-bold text-select-bar">★ {stars != null ? stars.toFixed(2) : unranked ? "—" : "…"}</span>
            <span className="text-[21px]">{Math.round(beatmap.bpm * rate)} BPM</span>
          </span>
        </div>
        <div className="flex items-center bg-select-field px-8">
          <span className={cn(seg, "gap-10")}>
            {stat("KC", beatmap.keyCount.toFixed(1))}
            {stat("OD", beatmap.od.toFixed(1))}
            {stat("HP", beatmap.hp.toFixed(1))}
          </span>
        </div>
      </div>
      <div className={box}>
        <div className={cn("flex w-[130px] items-center justify-center", unranked ? "bg-lf-warning text-select-bar" : "bg-select-tile")}>
          <span className={cn(seg, "text-[18px] capitalize")}>{unranked ? "Unranked" : beatmap.rankedStatus}</span>
        </div>
        <div className="flex w-[85px] items-center justify-center bg-select-field">
          <span className={cn(seg, "text-[18px]")} style={{ color: multiplierColor(scoreMultiplier(selected)) }}>{scoreMultiplier(selected).toFixed(2)}x</span>
        </div>
      </div>
    </div>
  );
}
