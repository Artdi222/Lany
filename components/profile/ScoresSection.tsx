"use client";

import { ModIcons } from "@/components/ui/ModIcon";
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { getUserBestScores, type UserBestScore } from "@/lib/api/user";
import { GRADE_COLORS, relativeTimeLong } from "@/lib/select/format";

// ponytail: in-memory cache so reopening a profile shows its scores at once; refreshed on every open.
const cache = new Map<string, UserBestScore[]>();
const PAGE = 5;

function ScoreRow({ s }: { s: UserBestScore }) {
  return (
    <div className="flex h-[58px] items-stretch overflow-hidden rounded-lf-md bg-lf-surface-hover/60 font-game-body">
      <div className="flex min-w-0 flex-1 items-center gap-4 pl-4">
        <span className="flex h-6 w-[52px] shrink-0 items-center justify-center rounded-full font-game-display text-sm font-bold text-white" style={{ backgroundColor: GRADE_COLORS[s.rank] ?? "#8c9296" }}>
          {s.rank}
        </span>
        <div className="min-w-0">
          <div className="truncate text-[14px] text-white">
            <span className="font-bold">{s.title}</span> <span className="text-white/60">by {s.artist}</span>
          </div>
          <div className="truncate text-xs">
            <span className="text-lf-warning">
              [{s.keyCount}K] {s.difficultyName}
            </span>
            <span className="ml-2 text-white/45">{relativeTimeLong(s.submittedAt)}</span>
          </div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <ModIcons mods={s.mods} />
        </div>
        <div className="w-24 shrink-0 text-right">
          <div className="text-[13px] font-bold text-lf-warning">{s.accuracy.toFixed(2)}%</div>
          <div className="text-[11px] text-white/55">weighted {Math.round(s.weight * 100)}%</div>
        </div>
        <div className="w-16 shrink-0 pr-4 text-right text-[13px] font-bold text-white">{Math.round(s.pp * s.weight)}pp</div>
      </div>
      <div className="flex w-[84px] shrink-0 items-center justify-center bg-black/25 font-game-display text-[15px] font-bold text-lf-accent">
        {Math.round(s.pp)}
        <span className="text-[11px]">pp</span>
      </div>
    </div>
  );
}

function ScoreList({ title, scores }: { title: string; scores: UserBestScore[] }) {
  const [shown, setShown] = useState(PAGE);
  return (
    <section className="mt-7">
      <h4 className="flex items-center gap-2 border-l-[3px] border-lf-accent pl-3 font-game-display text-sm font-bold text-white">
        {title}
        <span className="rounded-full bg-black/40 px-2 text-[11px] font-normal text-white/80">{scores.length}</span>
      </h4>
      {scores.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {scores.slice(0, shown).map((s) => (
            <ScoreRow key={s.id} s={s} />
          ))}
        </div>
      )}
      {scores.length > shown && (
        <button type="button" onClick={() => setShown((n) => n + PAGE * 2)} className="mx-auto mt-3 flex cursor-pointer items-center gap-1.5 rounded-full bg-black/40 px-4 py-1 font-game-body text-[11px] font-bold uppercase text-white/85 transition-colors hover:bg-black/60 hover:text-white">
          <ChevronDown className="h-3 w-3" />
          Show more
          <ChevronDown className="h-3 w-3" />
        </button>
      )}
    </section>
  );
}

/** "Scores" block of player info (Best Performance + First Place). Spec: docs/ui-spec/profile.md. */
export default function ScoresSection({ userId }: { userId: string }) {
  const [data, setData] = useState<UserBestScore[] | null>(null);

  useEffect(() => {
    let alive = true;
    getUserBestScores(userId)
      .then((res) => {
        cache.set(userId, res);
        if (alive) setData(res);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [userId]);

  const scores = cache.get(userId) ?? data;

  return (
    <div className="mx-[70px] mb-8 rounded-lf-lg bg-black/20 px-8 py-6">
      <h3 className="inline-block border-b-[3px] border-lf-primary pb-1 font-game-display text-base font-bold text-white">Scores</h3>
      {scores === null ? (
        <div className="mt-6 h-5 w-5 animate-spin rounded-full border-2 border-white/60 border-t-transparent" role="status" aria-label="Loading scores" />
      ) : (
        <>
          <ScoreList key={`best-${userId}`} title="Best Performance" scores={scores} />
          <ScoreList key={`first-${userId}`} title="First Place Scores" scores={scores.filter((s) => s.first)} />
        </>
      )}
    </div>
  );
}
