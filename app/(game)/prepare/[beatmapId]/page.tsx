"use client";

export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Star } from "lucide-react";
import { BackButton } from "@/components/select/SelectFooter";
import { LogoButton } from "@/components/menu/LogoButton";
import { useGameStore } from "@/lib/store/useGameStore";
import { useSettingsStore } from "@/lib/store/useSettingsStore";
import { getBeatmap, getBeatmapUrl } from "@/lib/api/beatmaps";
import { getBeatmapPerformance } from "@/lib/api/scores";
import { BeatmapLoader } from "@/lib/game/BeatmapLoader";
import { getStarRatingColor } from "@/types/game";
import type { Beatmap } from "@/types/beatmap";

// Cover stays bright for HOLD_MS (paused while the pointer is over the settings), then eases to dim/blur over FADE_MS.
const HOLD_MS = 2500;
const FADE_MS = 1600;

/** Player loader: loads as soon as it opens, then enters the game. Spec: docs/ui-spec/loader.md. */
export default function PreparePage() {
  const router = useRouter();
  const beatmapId = useParams().beatmapId as string;
  const settings = useSettingsStore();
  const [beatmap, setBeatmap] = useState<Beatmap | null>(() => {
    const cached = useGameStore.getState().selectedBeatmap;
    return cached?.id === beatmapId ? cached : null;
  });
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const [loaded, setLoaded] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [settled, setSettled] = useState(false);
  const holdLeft = useRef(HOLD_MS);
  const hasBeatmap = beatmap !== null;

  // Like lazer: hold on the bright cover, counting only while the pointer is off the settings panel.
  useEffect(() => {
    if (!hasBeatmap || hovering || settled) return;
    const t0 = performance.now();
    const t = setTimeout(() => setSettled(true), holdLeft.current);
    return () => {
      clearTimeout(t);
      holdLeft.current -= performance.now() - t0;
    };
  }, [hasBeatmap, hovering, settled]);

  // Enter the game once the beatmap is loaded and the fade to black has finished.
  useEffect(() => {
    if (!settled || !loaded) return;
    const t = setTimeout(() => router.push(`/play/${beatmapId}`), FADE_MS);
    return () => clearTimeout(t);
  }, [settled, loaded, router, beatmapId]);

  useEffect(() => {
    // Guard: React strict mode runs effects twice in dev; load once.
    if (started.current) return;
    started.current = true;
    let cancelled = false;

    (async () => {
      try {
        const bm = beatmap ?? (await getBeatmap(beatmapId));
        if (cancelled) return;
        setBeatmap(bm);
        useGameStore.getState().setSelectedBeatmapId(beatmapId);
        getBeatmapPerformance(beatmapId).catch(() => {}); // warm the result screen's max pp
        const signedUrl = BeatmapLoader.hasCache(bm.filePath) ? "" : (await getBeatmapUrl(beatmapId, "")).url;
        await BeatmapLoader.load(bm.filePath, signedUrl);
        if (!cancelled) setLoaded(true);
      } catch (err) {
        console.error("Failed to load beatmap:", err);
        if (!cancelled) setError("Failed to load this beatmap.");
      }
    })();

    return () => {
      cancelled = true;
      started.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative flex-1 overflow-hidden bg-lf-bg text-white">
      {beatmap?.coverUrl && (
        <div
          className="absolute -inset-10 bg-cover bg-center transition-[filter] duration-[1600ms] ease-lf-in-out"
          style={{ backgroundImage: `url(${beatmap.coverUrl})`, filter: `blur(${settled ? 12 + settings.backgroundBlur * 0.3 : 8}px)` }}
        />
      )}
      <div
        className="absolute inset-0 bg-black transition-opacity duration-[1600ms] ease-lf-in-out"
        style={{ opacity: settled ? settings.backgroundDim / 100 : 0 }}
      />

      {beatmap && (
        <div className="absolute inset-x-0 top-[26%] flex flex-col items-center text-center [text-shadow:0_2px_8px_rgb(0_0_0/0.5)]">
          <LogoButton src="/background/Logo.webp" tabIndex={-1} pulsing circleClassName="h-32 w-32 sm:h-32 sm:w-32" />
          <h1 className="mt-4 font-game-display text-4xl font-light text-white/90">{beatmap.title}</h1>
          <p className="mt-1 font-game-display text-2xl uppercase text-white/85">{beatmap.artist}</p>
          {beatmap.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={beatmap.coverUrl} alt="" className="mt-4 h-[78px] w-[398px] rounded-[10px] object-cover" />
          )}
          <p className="mt-4 font-game-display text-2xl text-white/90">{error ?? beatmap.difficultyName}</p>
          <span
            className="mt-2 inline-flex items-center gap-1 rounded-full px-3 py-0.5 font-game-display text-sm font-bold text-black [text-shadow:none]"
            style={{ backgroundColor: getStarRatingColor(beatmap.starRating) }}
          >
            <Star className="h-3 w-3 fill-current" aria-hidden /> {beatmap.starRating.toFixed(2)}
          </span>
          <dl className="mt-14 grid grid-cols-[auto_auto] gap-x-3 text-sm">
            <dt className="text-right text-white/45">Mapper</dt>
            <dd className="text-left text-white/90">{beatmap.creator}</dd>
          </dl>
        </div>
      )}

      <aside onPointerEnter={() => setHovering(true)} onPointerLeave={() => setHovering(false)} className="absolute right-6 top-6 hidden w-[358px] flex-col gap-4 lg:flex">
        <Panel title="Visual settings">
          <Slider label="Background dim" value={settings.backgroundDim} min={0} max={100} suffix="%" onChange={settings.setBackgroundDim} />
          <Slider label="Background blur" value={settings.backgroundBlur} min={0} max={100} suffix="%" onChange={settings.setBackgroundBlur} />
        </Panel>
        <Panel title="Audio settings">
          <Slider label="Audio offset" value={settings.globalOffset} min={-200} max={200} suffix=" ms" onChange={settings.setGlobalOffset} />
        </Panel>
      </aside>

      <div className="absolute inset-x-0 bottom-0 h-[67px] bg-select-bar" />
      <div className="absolute inset-x-0 bottom-0 h-[85px]">
        <BackButton href="/select" />
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-black/35 px-4 pb-4 pt-3 shadow-lf-panel">
      <h2 className="mb-3 font-game-display text-[15px] font-bold uppercase tracking-wide text-white">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

// Thin track, pill thumb (spec: docs/ui-spec/loader.md). The fill is a gradient on the input itself.
function Slider({ label, value, min, max, suffix = "", onChange }: { label: string; value: number; min: number; max: number; suffix?: string; onChange: (v: number) => void }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="block">
      <span className="flex justify-between font-game-body text-[15px] text-white/85">
        {label}
        <span className="tabular-nums text-white/60">{value}{suffix}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ background: `linear-gradient(to right, var(--color-lf-accent) ${pct}%, rgb(255 255 255 / 0.25) ${pct}%)` }}
        className="mt-2 block h-1 w-full cursor-pointer appearance-none rounded-full [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-9 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-lf-accent [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-9 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-lf-accent [&::-webkit-slider-thumb]:shadow-lf-glow"
      />
    </label>
  );
}
