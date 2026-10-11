"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { MODS, modRate, scoreMultiplier, toggleMod, type ModCategory } from "@/lib/game/Mods";
import { useGameStore } from "@/lib/store/useGameStore";
import { getBeatmapPerformance, peekBeatmapPerformance } from "@/lib/api/scores";
import type { Beatmap } from "@/types/beatmap";

/** Overlay Mod Select (docs/ui-spec/mods.md, foto `...519386266`). Layout lazer, warna palet Lanify. */

const COLUMNS: { category: ModCategory; title: string; color: string }[] = [
  { category: "reduction", title: "Difficulty Reduction", color: "var(--color-lf-success)" },
  { category: "increase", title: "Difficulty Increase", color: "var(--color-lf-danger)" },
];

export default function ModSelect({ onClose }: { onClose: () => void }) {
  const selected = useGameStore((s) => s.selectedMods);
  const setSelected = useGameStore((s) => s.setSelectedMods);

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

      <div className="mt-[114px] flex gap-[15px] overflow-x-auto pl-[520px]">
        {COLUMNS.map((col) => (
          <section key={col.category} className="h-[680px] w-[430px] shrink-0 -skew-x-[11deg] overflow-hidden rounded-xl bg-select-band shadow-lg">
            <h3 className="flex h-14 items-center px-[25px] font-game-display text-[17px] font-semibold text-select-bar" style={{ backgroundColor: col.color }}>
              <span className="skew-x-[11deg]">{col.title}</span>
            </h3>
            <ul className="flex flex-col gap-[9px] p-[10px]">
              {MODS.filter((m) => m.category === col.category).map((m) => {
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
                      <span className={cn("flex h-full w-[70px] shrink-0 items-center justify-center", on ? "bg-black/15" : "bg-black/20")}>
                        {/* ponytail: placeholder icon (acronym only); the photo's glyphs are not legible */}
                        <span className="skew-x-[11deg] font-game-display text-[13px] font-bold">{m.acronym}</span>
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
    </div>
  );
}

/** Footer kanan saat Mod Select terbuka: bintang, BPM, KC/OD/HP, multiplier (nilai ikut mod kecepatan). */
export function ModStats({ beatmap }: { beatmap: Beatmap | null }) {
  const selected = useGameStore((s) => s.selectedMods);
  const rate = modRate(selected);
  const speed = rate > 1 ? "DT" : rate < 1 ? "HT" : "";
  const [, bump] = useState(0);

  useEffect(() => {
    if (!beatmap || !speed || peekBeatmapPerformance(beatmap.id, speed)) return;
    getBeatmapPerformance(beatmap.id, speed).then(() => bump((n) => n + 1)).catch(() => {});
  }, [beatmap, speed]);

  if (!beatmap) return null;
  const stars = speed ? peekBeatmapPerformance(beatmap.id, speed)?.starRating : beatmap.starRating;
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
    <div className="absolute bottom-[18px] right-[20px] z-20 flex gap-10 font-game-display text-white">
      <div className={box}>
        <div className="flex items-center gap-10 bg-select-tile px-7">
          <span className={cn(seg, "gap-10")}>
            <span className="rounded-full bg-lf-danger px-3 py-0.5 text-[15px] font-bold text-select-bar">★ {stars != null ? stars.toFixed(2) : "…"}</span>
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
        <div className="flex w-[130px] items-center justify-center bg-select-tile">
          <span className={cn(seg, "text-[18px] capitalize")}>{beatmap.rankedStatus}</span>
        </div>
        <div className="flex w-[85px] items-center justify-center bg-select-field">
          <span className={cn(seg, "text-[18px]")}>{scoreMultiplier(selected).toFixed(2)}x</span>
        </div>
      </div>
    </div>
  );
}
