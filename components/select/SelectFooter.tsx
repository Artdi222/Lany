"use client";

import Link from "next/link";
import { ChevronLeft, Settings, Shuffle, ArrowLeftRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGameStore } from "@/lib/store/useGameStore";

/** Footer layar select: ukuran dan warna dari foto (docs/ui-spec/song-select.md, bagian Footer). */

export function BackButton({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="group absolute bottom-[18px] left-[22px] z-10 flex h-16 w-[328px] -skew-x-[10deg] items-center justify-center rounded-lg border border-white/25 bg-select-back shadow-lg transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.98]"
    >
      <span className="flex skew-x-[10deg] items-center gap-5 pr-[22px] font-game-display text-xl text-white">
        <ChevronLeft className="h-7 w-7" strokeWidth={3.5} aria-hidden />
        Back
      </span>
    </Link>
  );
}

interface TileProps {
  label: string;
  icon: React.ReactNode;
  bg: string;
  line: string;
  /** Lebar tile dalam px (foto: 160 / 160 / 160). */
  left: number;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
}

function Tile({ label, icon, bg, line, left, active, disabled, title, onClick }: TileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-options-toggle={label === "Options" ? "" : undefined}
      aria-pressed={active}
      title={title}
      className={cn(
        "group absolute bottom-0 flex h-[85px] w-40 -skew-x-[10deg] cursor-pointer items-start justify-center rounded-t-xl text-white shadow-lg transition-[transform,filter,background-color] duration-150",
        disabled ? "cursor-not-allowed opacity-50" : "hover:-translate-y-1.5 hover:brightness-125",
        active && "-translate-y-1.5 brightness-125",
      )}
      style={{ left, backgroundColor: active ? "var(--color-select-options-icon)" : bg }}
    >
      <span className="flex skew-x-[10deg] flex-col items-center gap-[13px] pt-[11px]">
        <span className="h-6 w-6">{icon}</span>
        <span className="font-game-display text-[17px] leading-none">{label}</span>
      </span>
      <span className="absolute inset-x-3 bottom-0 h-1.5 rounded-t-sm" style={{ backgroundColor: line }} />
    </button>
  );
}

export default function SelectFooter({
  onRandom,
  onOptions,
  onMods,
  onPlay,
  optionsOpen,
  modsOpen,
  modCount,
  canPlay,
  modStats,
}: {
  onRandom: () => void;
  onOptions: () => void;
  onMods: () => void;
  onPlay: () => void;
  optionsOpen: boolean;
  modsOpen: boolean;
  modCount: number;
  canPlay: boolean;
  /** Shown instead of Random/Options/Play while Mod Select is open (foto Mods). */
  modStats: React.ReactNode;
}) {
  return (
    <>
      <div className="absolute inset-x-0 bottom-0 z-20 h-[67px] rounded-tl-2xl bg-select-bar" />
      <div className="absolute inset-x-0 bottom-0 z-20 h-[85px]">
        <BackButton />
        <Tile
          label="Mods"
          left={405}
          bg="var(--color-select-mods)"
          line="var(--color-select-mods-line)"
          icon={<ArrowLeftRight className={cn("h-6 w-6", modsOpen ? "text-white" : "text-select-mods-icon")} aria-hidden />}
          active={modsOpen || modCount > 0}
          onClick={onMods}
        />
        {modsOpen ? (
          <button
            type="button"
            onClick={() => useGameStore.getState().setSelectedMods([])}
            className="absolute bottom-[10px] left-[590px] flex h-[62px] w-[270px] -skew-x-[10deg] cursor-pointer items-center justify-center rounded-lg bg-select-field font-game-display text-[19px] text-white/80 transition-[filter] duration-150 hover:brightness-125"
          >
            <span className="skew-x-[10deg]">Deselect All</span>
          </button>
        ) : (
        <>
        <Tile
          label="Random"
          left={568}
          bg="var(--color-select-random)"
          line="var(--color-select-random-line)"
          icon={<Shuffle className="h-6 w-6 text-select-random-icon" aria-hidden />}
          onClick={onRandom}
        />
        <Tile
          label="Options"
          left={732}
          bg="var(--color-select-options)"
          line="var(--color-select-options-line)"
          icon={<Settings className={cn("h-6 w-6", optionsOpen ? "text-white" : "text-select-options-icon")} aria-hidden />}
          active={optionsOpen}
          onClick={onOptions}
        />
        </>
        )}
      </div>
      {modsOpen && modStats}

      {/* Logo = tombol Play, terpotong di pojok kanan-bawah seperti lazer */}
      <button
        type="button"
        aria-label="Play"
        disabled={!canPlay}
        onClick={onPlay}
        hidden={modsOpen}
        className="group absolute -bottom-[150px] -right-[110px] z-30 h-[330px] w-[330px] cursor-pointer focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="absolute inset-0 rounded-full border-[6px] border-white bg-linear-to-br from-lf-primary-hover to-lf-primary shadow-lf-glow transition-transform duration-200 ease-lf-out group-hover:scale-105 group-active:scale-95" />
        {/* Terlihat ±220x180 px (x 0..220 tombol); label dipusatkan di area itu */}
        <span className="absolute left-[45px] top-[80px] w-[200px] text-center font-game-display text-[54px] font-bold leading-none tracking-wide text-white drop-shadow">Play</span>
      </button>
    </>
  );
}
