"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Trophy } from "lucide-react";
import type { Beatmap } from "@/types/beatmap";
import type { LeaderboardEntry } from "@/types/game";
import { formatDuration } from "@/types/game";
import { getLeaderboard } from "@/lib/api/leaderboard";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { useGameStore } from "@/lib/store/useGameStore";
import { shortRank } from "@/lib/select/format";
import { cn } from "@/lib/utils";
import ScoreCard from "./ScoreCard";
import { SHOW_DETAILS_EVENT } from "./OptionsMenu";
import SplitSelect from "./SplitSelect";
import { SHEAR, UNSHEAR } from "./shear";

type Tab = "details" | "ranking";
type Scope = "GLOBAL" | "LOCAL" | "FRIENDS";

const STALE_MS = 5 * 60 * 1000;
/** Setiap baris bergeser 13 px ke kiri (diagonal ala lazer); dijepit supaya kartu jauh tidak keluar layar. */
const SHIFT_PER_ROW = 13;
const MAX_SHIFT_ROWS = 9;

function useLeaderboard(beatmapId: string, scope: Scope, token: string | null, mods?: readonly string[]) {
  const key = `${beatmapId}-${scope}-${token || ""}-${mods?.join(",") ?? "*"}`;
  const cached = useGameStore((s) => s.leaderboardCache[key]);
  const setCache = useGameStore((s) => s.setLeaderboardCache);

  useEffect(() => {
    if (cached && Date.now() - cached.timestamp <= STALE_MS) return;
    let alive = true;
    // Backend yang menggantung jangan bikin spinner abadi.
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000));
    Promise.race([getLeaderboard(beatmapId, scope, token, mods), timeout])
      .then((data) => alive && setCache(key, Array.isArray(data) ? data : []))
      .catch(() => alive && setCache(key, []));
    return () => {
      alive = false;
    };
    // `mods` is folded into `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beatmapId, scope, token, key, cached, setCache]);

  return { entries: cached?.entries ?? [], loading: !cached };
}

function TabButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("relative cursor-pointer px-1 pb-1 font-game-display text-[17px] font-semibold transition-colors", active ? "text-white" : "text-[#dddded]/80 hover:text-white")}
    >
      {children}
      <span className={cn("absolute inset-x-1 -bottom-0.5 h-0.5 rounded-full bg-[#b9bde6] transition-opacity", active ? "opacity-100" : "opacity-0")} />
    </button>
  );
}

function Details({ beatmap }: { beatmap: Beatmap }) {
  const rows: [string, string][] = [
    ["Mapper", beatmap.creator],
    ["Difficulty", `[${beatmap.keyCount}K] ${beatmap.difficultyName}`],
    ["Length", formatDuration(beatmap.lengthSeconds)],
    ["BPM", String(Math.round(beatmap.bpm))],
    ["Notes", beatmap.noteCount.toLocaleString("en-US")],
    ["Hold Notes", beatmap.holdCount.toLocaleString("en-US")],
    ["Overall Difficulty", beatmap.od.toFixed(1)],
    ["HP Drain", beatmap.hp.toFixed(1)],
  ];
  return (
    <dl className="mx-[22px] mt-3 max-w-[560px] rounded-xl bg-select-bar/85 p-4">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between border-b border-white/5 py-2 font-game-display text-[16px] last:border-0">
          <dt className="text-white/60">{k}</dt>
          <dd className="font-semibold text-white">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Message({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mx-[22px] mt-6 flex max-w-[820px] flex-col items-center gap-4 rounded-2xl bg-select-bar/85 px-8 py-14 text-center font-game-display text-[20px] font-semibold text-white/85">
      {icon}
      {children}
    </div>
  );
}

export default function RankingPanel({ beatmap }: { beatmap: Beatmap }) {
  const router = useRouter();
  const { isGuest, token, user } = useAuthStore();
  const [tab, setTab] = useState<Tab>("ranking");
  const [scope, setScope] = useState<Scope>("GLOBAL");
  // Selected Mods toggle: only scores played with exactly the mods picked in Mod Select.
  const [modsOnly, setModsOnly] = useState(false);
  const selectedMods = useGameStore((s) => s.selectedMods);
  const { entries, loading } = useLeaderboard(beatmap.id, scope, token, modsOnly ? selectedMods : undefined);

  useEffect(() => {
    const show = () => setTab("details");
    window.addEventListener(SHOW_DETAILS_EVENT, show);
    return () => window.removeEventListener(SHOW_DETAILS_EVENT, show);
  }, []);

  const openScore = (entry: LeaderboardEntry) => {
    useGameStore.getState().setViewingScore(entry, beatmap);
    router.push("/result");
  };

  const mine = !isGuest && user ? entries.find((e) => e.userId === user.id) : undefined;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-[52px] shrink-0 items-start gap-6 px-[22px] pt-[9px]">
        <div className="flex gap-6 pb-1 pt-[5px]">
          <TabButton active={tab === "details"} onClick={() => setTab("details")}>Details</TabButton>
          <TabButton active={tab === "ranking"} onClick={() => setTab("ranking")}>Ranking</TabButton>
        </div>
        {tab === "ranking" && (
          <div className="absolute left-[282px] top-[9px] flex items-center gap-[10px]">
            <SplitSelect<Scope>
              label="Scope"
              value={scope}
              options={[{ label: "Global", value: "GLOBAL" }, { label: "Friends", value: "FRIENDS" }, { label: "Local", value: "LOCAL" }]}
              onChange={setScope}
              className="w-[205px]"
            />
            <SplitSelect<"SCORE"> label="Sort" value="SCORE" options={[{ label: "Score", value: "SCORE" }]} onChange={() => {}} disabled dim className="w-[198px]" />
            <button
              type="button"
              onClick={() => setModsOnly((v) => !v)}
              aria-pressed={modsOnly}
              title={modsOnly ? "Showing scores with the selected mods only" : "Show only scores with the selected mods"}
              className={cn(SHEAR, "h-[38px] w-[172px] cursor-pointer rounded-[10px] font-game-display text-[17px] text-white transition-[filter] hover:brightness-125", modsOnly ? "bg-lf-primary" : "bg-select-button")}
            >
              <span className={cn(UNSHEAR, "inline-block")}>Selected Mods</span>
            </button>
          </div>
        )}
      </div>

      {tab === "details" ? (
        <Details beatmap={beatmap} />
      ) : isGuest ? (
        <Message icon={<Lock className="h-10 w-10 text-white/50" aria-hidden />}>
          Login to see rankings
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("open-auth-dropdown"))}
            className="cursor-pointer rounded-lg bg-select-tile px-5 py-2 font-semibold text-white transition-[filter] hover:brightness-125"
          >
            Sign In
          </button>
        </Message>
      ) : loading ? (
        <div className="mx-[22px] mt-10 h-6 w-6 animate-spin rounded-full border-2 border-white/70 border-t-transparent" role="status" aria-label="Loading scores" />
      ) : entries.length === 0 ? (
        <Message icon={<Trophy className="h-10 w-10 text-white/40" aria-hidden />}>No scores yet. Be the first to play!</Message>
      ) : (
        <div className={cn("no-scrollbar mt-[8px] min-h-0 flex-1 overflow-y-auto overflow-x-hidden pt-[2px]", mine ? "pb-[150px]" : "pb-6")}>
          {entries.slice(0, 50).map((entry, i) => (
            <div key={entry.id} className="mb-1 h-[68px]" style={{ transform: `translateX(${60 - SHIFT_PER_ROW * Math.min(i, MAX_SHIFT_ROWS)}px)` }}>
              <ScoreCard entry={entry} onClick={() => openScore(entry)} />
            </div>
          ))}
        </div>
      )}

      {tab === "ranking" && mine && !isGuest && (
        <div className="absolute inset-x-0 bottom-0 h-[141px]" style={{ width: "min(841px, 100%)" }}>
          {/* foto: tepi kanan band miring (853 di atas -> 837 di bawah) */}
          <div className={cn(SHEAR, "absolute inset-y-0 -left-[40px] right-0 rounded-tr-[14px] bg-select-band/90")} />
          <span className="absolute left-[49px] top-2 font-game-display text-[14px] text-white/75">
            Personal Best ({shortRank(mine.position)} of {entries.length.toLocaleString("en-US")})
          </span>
          <div className="absolute left-[38px] top-[28px]">
            <ScoreCard entry={mine} variant="best" rankLabel={shortRank(mine.position)} onClick={() => openScore(mine)} />
          </div>
        </div>
      )}
    </div>
  );
}
