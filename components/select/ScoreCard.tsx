/* eslint-disable @next/next/no-img-element */
import { User } from "lucide-react";
import type { LeaderboardEntry } from "@/types/game";
import { GRADE_COLORS, relativeTimeLong } from "@/lib/select/format";
import { cn } from "@/lib/utils";
import { SHEAR, UNSHEAR } from "./shear";
import { ModIcons } from "@/components/ui/ModIcon";

/** Kartu skor leaderboard (spec: docs/ui-spec/song-select.md, "Kiri-bawah"). Tinggi 68, pitch 72. Seperti foto: badan, tile rank (PB) dan tile grade miring (tan 0.2) dengan sudut membulat; avatar tidak miring. */


function Stat({ label, children, valueClass }: { label: string; children: React.ReactNode; valueClass?: string }) {
  return (
    <div className="flex flex-col">
      <span className="font-game-display text-[12px] font-semibold uppercase leading-none tracking-wide text-white/90">{label}</span>
      <span className={cn("mt-1 font-game-display text-[17px] leading-none tabular-nums", valueClass ?? "text-white")}>{children}</span>
    </div>
  );
}

export default function ScoreCard({
  entry,
  variant = "row",
  rankLabel,
  onClick,
}: {
  entry: LeaderboardEntry;
  variant?: "row" | "best";
  /** Teks tile rank untuk varian "best" (mis. "#2.9k"). */
  rankLabel?: string;
  onClick?: () => void;
}) {
  const best = variant === "best";
  const fullCombo = entry.judgements.miss === 0;
  const gradeColor = GRADE_COLORS[entry.rank] ?? "#8c9296";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("group relative block h-[68px] cursor-pointer text-left transition-[filter] duration-150 hover:brightness-125", best ? "w-[797px]" : "w-[808px]")}
    >
      <div className={cn(SHEAR, "absolute inset-x-0 inset-y-[2px] rounded-[10px]", best ? "bg-[#2f3142]" : "bg-[#1c1c1c]/60")} />
      {/* segmen skor sedikit lebih terang (foto), menempel ke tile grade */}
      <div className={cn(SHEAR, "absolute inset-y-0 right-[40px] w-[230px] rounded-[10px] bg-white/[0.06]")} />

      {best ? (
        <div
          className={cn(SHEAR, "absolute left-0 top-0 flex h-full w-[57px] items-center justify-center rounded-[10px] bg-linear-to-b from-[#b9bde6] to-[#9397b5] font-game-display text-[17px] font-semibold text-black/80")}
        >
          <span className={UNSHEAR}>{rankLabel}</span>
        </div>
      ) : (
        <span className="absolute left-0 top-0 flex h-full w-[72px] items-center justify-end pr-3.5 font-game-display text-[20px] font-semibold text-white">#{entry.position}</span>
      )}

      <div className={cn(SHEAR, "absolute -top-[1px] h-[70px] w-[68px] overflow-hidden rounded-[10px] bg-black/50 shadow-[0_2px_6px_rgb(0_0_0/0.35)]", best ? "left-[54px]" : "left-[72px]")}>
        {entry.avatarUrl ? (
          <img src={entry.avatarUrl} alt="" className={cn(UNSHEAR, "h-full w-full scale-125 object-cover")} />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-white/40">
            <User className={cn(UNSHEAR, "h-8 w-8")} aria-hidden />
          </span>
        )}
      </div>

      <div className={cn("absolute top-0 flex h-full min-w-0 flex-col justify-center", best ? "left-[134px]" : "left-[152px]")} style={{ width: 230 }}>
        <span className="font-game-display text-[14px] leading-none text-white/85">{relativeTimeLong(entry.submittedAt)}</span>
        <span className="mt-1 truncate font-game-display text-[20px] font-semibold leading-tight text-white">{entry.username}</span>
      </div>

      <div className="absolute top-0 flex h-full items-center gap-7" style={{ left: 372 }}>
        <Stat label="Max combo" valueClass={fullCombo ? "text-select-fc" : undefined}>
          {entry.maxCombo}x
        </Stat>
        <Stat label="Accuracy">{entry.accuracy.toFixed(2)}%</Stat>
      </div>

      <div className="absolute top-0 flex h-full w-[190px] flex-col items-end justify-center" style={{ left: 538 }}>
        <span className="font-game-display text-[30px] font-light leading-none tabular-nums text-white">{entry.score.toLocaleString("en-US")}</span>
        <span className="mt-1 flex items-center gap-2">
          {entry.pp ? <span className="font-game-display text-[12px] text-white/70">{Math.round(entry.pp)}pp</span> : null}
          <ModIcons mods={entry.mods} size={18} />
        </span>
      </div>

      <div
        className={cn(SHEAR, "absolute right-0 top-0 flex h-full w-[58px] items-center justify-center rounded-[10px] font-game-display text-[26px] font-medium text-white/90")}
        style={{ backgroundColor: gradeColor, textShadow: "0 1px 2px rgb(0 0 0 / 0.25)" }}
      >
        <span className={UNSHEAR}>{entry.rank}</span>
      </div>
    </button>
  );
}
