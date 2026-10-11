"use client";

export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ChevronLeft, RotateCcw, Star, User } from "lucide-react";
import { useGameStore, calculateRank } from "@/lib/store/useGameStore";
import { isUnranked } from "@/lib/game/Mods";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { getBeatmapPerformance, getScoreDetail, peekBeatmapPerformance, submitScore, type BeatmapPerformance } from "@/lib/api/scores";
import { getLeaderboard } from "@/lib/api/leaderboard";
import { judgementsToPayload } from "@/types/score";
import { JUDGEMENT_COLORS, type LeaderboardEntry } from "@/types/game";
import { cn } from "@/lib/utils";
import { SHEAR, UNSHEAR } from "@/components/select/shear";
import { difficultyColor, starTextColor } from "@/lib/select/difficultyColor";
import GradeRing from "@/components/game/result/GradeRing";
import AccuracyGraph from "@/components/game/result/AccuracyGraph";
import HitErrorBar from "@/components/game/result/HitErrorBar";
import GuestBanner from "@/components/game/result/GuestBanner";
import NeighbourCard from "@/components/game/result/NeighbourCard";
import { toast } from "sonner";

type Perf = BeatmapPerformance;

/** Stored mods ('["DT","HD"]') to the acronym string the pp calculator takes ("DTHD"). */
function modAcronyms(mods: string | null | undefined): string {
  try {
    const list = mods ? JSON.parse(mods) : [];
    return Array.isArray(list) ? list.join("") : "";
  } catch {
    return "";
  }
}

const CARD_H = 880;

/** Shrinks the score cards on screens shorter than 1080 px (card + top bar + footer). */
function useCardZoom() {
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const update = () => setZoom(Math.min(1, (window.innerHeight - 150) / CARD_H));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return zoom;
}

function StatCell({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div className="min-w-0 text-center">
      <div className="truncate rounded-full bg-black/45 px-1 py-px font-game-display text-[10px] font-bold uppercase tracking-wide" style={{ color: color ?? "#fff" }}>
        {label}
      </div>
      <div className="mt-1 font-game-body text-[19px] text-white tabular-nums">{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[20px] bg-lf-bg-raised/85 px-5 py-4 shadow-lf-panel">
      <h2 className="inline-block border-b-2 border-lf-accent pb-0.5 font-game-display text-sm font-bold text-white">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Score screen. Spec: docs/ui-spec/score.md. */
export default function ResultPage() {
  const router = useRouter();
  const { status, score, maxCombo, accuracy, judgements, accuracyHistory, hitErrors, currentBeatmap, selectedBeatmapId, isReadOnly, viewingMeta } = useGameStore();
  const { token, isGuest, user } = useAuthStore();
  const submitted = useRef(false);
  const [freshPp, setFreshPp] = useState<number | null>(null);
  const [freshId, setFreshId] = useState<string | null>(null);
  const boardKey = `${currentBeatmap?.id ?? selectedBeatmapId}-GLOBAL-${token || ""}`;
  // Same cache as the song select ranking panel, so the strip shows at once and refreshes behind.
  const board = useGameStore((s) => s.leaderboardCache[boardKey]?.entries) ?? [];
  const selectedBeatmap = useGameStore((s) => s.selectedBeatmap);
  const [detail, setDetail] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  const [fetchedPerf, setPerf] = useState<Perf | null>(null);
  const [playedAt] = useState(() => new Date().toISOString());

  const rank = calculateRank(accuracy);
  const zoom = useCardZoom();
  const selectedMods = useGameStore((s) => s.selectedMods);
  const unranked = useGameStore((s) => isUnranked(s.selectedMods, s.customRate));
  const mods = isReadOnly ? modAcronyms(viewingMeta?.mods) : selectedMods.join("");
  const totalJudgements = Object.values(judgements).reduce((a, b) => a + b, 0);
  const beatmapId = currentBeatmap?.id ?? selectedBeatmapId;

  // Submit score on mount
  useEffect(() => {
    if (submitted.current || isReadOnly) return;

    // Don't submit if no notes were hit (avoids empty SS bug)
    if (totalJudgements === 0 || (score === 0 && accuracy === 100)) {
      return;
    }

    submitted.current = true;
    // ponytail: unranked (Customise speed) plays are not saved at all; the backend has no unranked flag.
    if (unranked) {
      toast.info("Unranked play: score not saved");
      return;
    }

    if (token && selectedBeatmapId) {
      const payload = {
        beatmapId: selectedBeatmapId,
        score,
        accuracy: parseFloat(accuracy.toFixed(2)),
        maxCombo,
        ...judgementsToPayload(judgements),
        accuracyHistory: JSON.stringify(accuracyHistory),
        hitErrors: JSON.stringify(hitErrors),
        ...(selectedMods.length ? { mods: JSON.stringify(selectedMods) } : {}),
      };
      submitScore(payload, token)
        .then((res) => {
          setFreshPp(res.pp ?? null);
          setFreshId(res.id);
          toast.success("Score saved!");
          useGameStore.getState().invalidateLeaderboardCache(selectedBeatmapId);
        })
        .catch(() => toast.error("Failed to save score"));
    }
  }, [token, selectedBeatmapId, score, accuracy, maxCombo, judgements, accuracyHistory, hitErrors, isReadOnly, totalJudgements, selectedMods, unranked]);

  // Leaderboard strip; refetched once the fresh score is saved so it lands in its real position.
  useEffect(() => {
    if (!beatmapId) return;
    let alive = true;
    getLeaderboard(beatmapId, "GLOBAL", token)
      .then((res) => alive && useGameStore.getState().setLeaderboardCache(boardKey, Array.isArray(res) ? res : []))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [beatmapId, token, freshId, boardKey]);

  // Leaderboard lists leave out the graph data; load it for the score being viewed.
  const viewedId = isReadOnly ? viewingMeta?.scoreId : undefined;
  useEffect(() => {
    if (!viewedId) return;
    let alive = true;
    getScoreDetail(viewedId)
      .then((d) => {
        if (!alive) return;
        const parse = (v: string | null) => {
          try {
            return v ? JSON.parse(v) : [];
          } catch {
            return [];
          }
        };
        useGameStore.setState({ accuracyHistory: parse(d.accuracyHistory), hitErrors: parse(d.hitErrors) });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [viewedId]);

  useEffect(() => {
    if (!beatmapId || !totalJudgements || peekBeatmapPerformance(beatmapId, mods, totalJudgements)) return;
    let alive = true;
    getBeatmapPerformance(beatmapId, mods, totalJudgements)
      .then((res) => alive && setPerf(res))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [beatmapId, mods, totalJudgements]);

  // Exact value (this play's mods + judgement count) once loaded; until then the NM lookup prefetched
  // on the loader screen, so star / max combo render on the first frame.
  const exactPerf = (beatmapId && peekBeatmapPerformance(beatmapId, mods, totalJudgements)) || fetchedPerf;
  const perf = exactPerf ?? (beatmapId ? peekBeatmapPerformance(beatmapId, mods) ?? (mods ? undefined : peekBeatmapPerformance(beatmapId)) : undefined) ?? null;
  // No mods: the star rating is already known from song select.
  const stars = !mods && selectedBeatmap?.id === beatmapId ? selectedBeatmap.starRating : perf?.starRating;
  const pp = isReadOnly ? viewingMeta?.pp ?? null : freshPp;
  const player = isReadOnly && viewingMeta ? viewingMeta : { username: isGuest ? "Guest" : user?.username ?? "Player", avatarUrl: isGuest ? null : user?.avatarUrl ?? null };
  const when = new Date(isReadOnly && viewingMeta ? viewingMeta.submittedAt : playedAt);
  const ppShare = pp !== null && perf?.maxPp ? Math.min(1, pp / perf.maxPp) : 0;

  const currentId = isReadOnly ? viewingMeta?.scoreId : freshId;
  const others = board.filter((e) => e.id !== currentId);
  const ownIndex = board.findIndex((e) => e.id === currentId);
  // Not on the board (e.g. not the player's best): slot it in by pp, else by score.
  const insertAt =
    ownIndex >= 0 ? ownIndex : others.findIndex((e) => (pp !== null && e.pp !== undefined ? e.pp < pp : e.score < score));
  const split = insertAt < 0 ? others.length : insertAt;

  useEffect(() => {
    if (!detail) mainRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [detail, split, board.length]);

  const openEntry = (entry: LeaderboardEntry) => {
    useGameStore.getState().setViewingScore(entry);
    setDetail(false);
  };

  const judgementCells = [
    { label: "Marvelous", count: judgements.marvelous, color: JUDGEMENT_COLORS.MARVELOUS },
    { label: "Perfect", count: judgements.perfect, color: JUDGEMENT_COLORS.PERFECT },
    { label: "Great", count: judgements.great, color: JUDGEMENT_COLORS.GREAT },
    { label: "Good", count: judgements.good, color: JUDGEMENT_COLORS.GOOD },
    { label: "Bad", count: judgements.bad, color: JUDGEMENT_COLORS.BAD },
    { label: "Miss", count: judgements.miss, color: JUDGEMENT_COLORS.MISS },
  ];

  // Main score card: centered in the strip, or on the left in detail mode. Click toggles detail.
  const mainCard = (
        <motion.div
          ref={mainRef}
          layout
          role="button"
          tabIndex={0}
          aria-expanded={detail}
          aria-label={detail ? "Hide score details" : "Show score details"}
          onClick={() => setDetail((d) => !d)}
          onKeyDown={(e) => e.key === "Enter" && setDetail((d) => !d)}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          style={{ zoom, height: CARD_H }}
          className="relative flex w-[477px] shrink-0 cursor-pointer flex-col pt-[65px]"
        >
          <div className="absolute left-1/2 top-0 z-10 flex -translate-x-1/2 flex-col items-center">
            <span className="flex h-[105px] w-[105px] items-center justify-center overflow-hidden rounded-[22px] bg-lf-bg shadow-lf-panel">
              {player.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={player.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <User className="h-12 w-12 text-lf-text-muted" />
              )}
            </span>
            <span className="mt-1 font-game-display text-[15px] font-bold text-white">{player.username}</span>
          </div>

          <div className="flex min-h-0 flex-1 flex-col rounded-[22px] bg-lf-bg-raised/75 pt-[70px] shadow-lf-panel">
            <div className="flex min-h-0 flex-1 flex-col rounded-[22px] bg-lf-surface/90 px-6 pb-4 pt-5">
              <h1 className="truncate text-center font-game-display text-[20px] font-bold text-white">{currentBeatmap?.title || "Unknown"}</h1>
              <p className="truncate text-center font-game-body text-[13px] text-white/75">{currentBeatmap?.artist}</p>

              <div className="mt-5">
                <GradeRing accuracy={accuracy} rank={rank} />
              </div>

              <p className="mt-4 text-center font-game-body text-[60px] font-light leading-none text-white tabular-nums">{score.toLocaleString("en-US")}</p>
              <div className="mt-3 flex justify-center">
                <span
                  className="flex items-center gap-1 rounded-full px-2.5 py-0.5 font-game-display text-xs font-bold"
                  style={stars !== undefined ? { backgroundColor: difficultyColor(stars), color: starTextColor(stars) } : { backgroundColor: "rgb(255 255 255 / 0.15)" }}
                >
                  <Star className="h-3 w-3 fill-current" />
                  {stars !== undefined ? stars.toFixed(2) : "-"}
                </span>
              </div>
              <p className="mt-1 text-center font-game-body text-[15px] text-white">{currentBeatmap?.difficultyName}</p>
              <p className="text-center font-game-body text-xs text-white/70">
                mapped by <span className="font-bold text-white">{currentBeatmap?.creator}</span>
              </p>

              <div className="mt-auto space-y-2 pt-4">
                <div className="grid grid-cols-3 gap-1.5">
                  <StatCell label="Accuracy" value={`${accuracy.toFixed(2)}%`} />
                  <StatCell
                    label="Max Combo"
                    value={
                      <>
                        {maxCombo.toLocaleString("en-US")}
                        {perf && <span className="text-xs text-white/60">/{perf.maxCombo.toLocaleString("en-US")}</span>}
                      </>
                    }
                  />
                  <StatCell label="PP" value={pp !== null ? Math.round(pp).toLocaleString("en-US") : "-"} />
                </div>
                <div className="grid grid-cols-6 gap-1.5">
                  {judgementCells.map((j) => (
                    <StatCell key={j.label} label={j.label} value={j.count.toLocaleString("en-US")} color={j.color} />
                  ))}
                </div>
                <p className="pt-3 text-center font-game-body text-[11px] text-white/70">
                  Played on {when.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} {when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                </p>
              </div>
            </div>
          </div>
        </motion.div>
  );

  // Reset only once the route has actually changed: resetting first left this page on screen with an
  // empty store ("SS, 0 points") or blank until /select loaded. The flag keeps React strict mode's
  // dev-only mount/unmount from resetting a live result.
  const leaving = useRef(false);
  useEffect(
    () => () => {
      if (leaving.current) useGameStore.getState().resetGame();
    },
    [],
  );
  const back = () => {
    leaving.current = true;
    router.push("/select");
  };

  // Opening /result directly (nothing played or picked) has no score to show.
  if (status === "idle") return null;

  return (
    <div className="relative h-screen overflow-hidden bg-lf-bg">
      {currentBeatmap?.backgroundUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={currentBeatmap.backgroundUrl} alt="" className="absolute inset-0 h-full w-full scale-105 object-cover blur-md" />
      )}
      <div className="absolute inset-0 bg-black/55" />

      {detail ? (
      <div className="relative z-10 flex h-full gap-9 px-7 pb-[72px] pt-[72px]">
        {mainCard}

        {/* Right: breakdown + Lanify's own stats */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }} className="no-scrollbar min-w-0 flex-1 space-y-3 overflow-y-auto pt-[150px]">
          {isGuest && !isReadOnly && <GuestBanner />}
          <Panel title="Performance Breakdown">
            <div className="flex items-center gap-6">
              <div className="flex min-w-0 flex-1 items-center gap-3 font-game-body text-xs text-white">
                Difficulty
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/70">
                  <div className="h-full rounded-full bg-lf-accent" style={{ width: `${ppShare * 100}%` }} />
                </div>
                <span className="w-9 text-right font-bold">{Math.round(ppShare * 100)}%</span>
              </div>
              <div className="h-8 w-px bg-white/20" />
              <div className="grid w-[40%] grid-cols-[1fr_auto] gap-x-4 font-game-body text-xs">
                <span className="text-lf-accent">Achieved PP</span>
                <span className="text-right text-lf-accent">{pp !== null ? Math.round(pp) : "-"}</span>
                <span className="text-white/60">Maximum</span>
                <span className="text-right text-white/60">{perf ? Math.round(perf.maxPp) : "-"}</span>
              </div>
            </div>
          </Panel>
          {accuracyHistory.length > 0 && (
            <Panel title="Accuracy Over Time">
              <AccuracyGraph data={accuracyHistory} />
            </Panel>
          )}
          {hitErrors.length > 0 && (
            <Panel title="Hit Error">
              <HitErrorBar errors={hitErrors} />
            </Panel>
          )}
        </motion.div>
      </div>
      ) : (
        <div className="no-scrollbar relative z-10 flex h-full items-center gap-6 overflow-x-auto px-[50vw] pb-[72px] pt-[72px]">
          {others.slice(0, split).map((e) => (
            <NeighbourCard key={e.id} entry={e} zoom={zoom} onClick={() => openEntry(e)} />
          ))}
          {mainCard}
          {others.slice(split).map((e) => (
            <NeighbourCard key={e.id} entry={e} zoom={zoom} onClick={() => openEntry(e)} />
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="absolute inset-x-0 bottom-0 z-10 flex h-[67px] items-center justify-center gap-3 bg-lf-bg-raised/90">
        <button type="button" onClick={back} className={cn(SHEAR, "absolute -left-3 bottom-0 flex h-full w-[140px] cursor-pointer items-center justify-center gap-2 bg-select-back pl-3 font-game-display text-[17px] text-white transition-[filter] hover:brightness-110")}>
          <span className={cn(UNSHEAR, "flex items-center gap-2")}>
            <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white">
              <ChevronLeft className="h-4 w-4" />
            </span>
            back
          </span>
        </button>
        {!isReadOnly && selectedBeatmapId && (
          <button
            type="button"
            onClick={() => router.push(`/play/${selectedBeatmapId}`)}
            className="flex h-[38px] w-[400px] cursor-pointer items-center justify-center gap-2 rounded-lf-md bg-lf-primary font-game-display text-sm font-bold text-white transition-[filter] hover:brightness-110"
          >
            <RotateCcw className="h-4 w-4" /> Retry
          </button>
        )}
      </div>
    </div>
  );
}
