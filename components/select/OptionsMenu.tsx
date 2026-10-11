"use client";

import { useEffect, useRef } from "react";
import { Check, FileText } from "lucide-react";
import type { Beatmap } from "@/types/beatmap";

/** Menu Options (foto `...519414354`): panel #1e1f29 di atas footer. Hanya aksi yang punya fitur di Lany: Play dan Details. */

export const SHOW_DETAILS_EVENT = "select-show-details";

function Item({ icon, children, onClick }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[66px] w-full cursor-pointer items-center gap-4 rounded-lg bg-select-field px-5 text-left font-game-display text-[17px] text-white transition-[filter] duration-150 hover:brightness-125"
    >
      <span className="flex h-6 w-6 items-center justify-center">{icon}</span>
      {children}
    </button>
  );
}

export default function OptionsMenu({
  beatmap,
  onClose,
  onPlay,
}: {
  beatmap: Beatmap | null;
  onClose: () => void;
  onPlay: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: PointerEvent) => {
      // klik pada tombol Options sendiri ditangani oleh toggle-nya
      if (!ref.current?.contains(e.target as Node) && !(e.target as Element).closest?.("[data-options-toggle]")) onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  return (
    <div ref={ref} role="menu" className="absolute bottom-[100px] left-[640px] z-40 w-[363px] rounded-[10px] bg-select-bar p-[7px] shadow-2xl ring-1 ring-white/10">
      <div className="px-3 pb-2 pt-3">
        <div className="font-game-display text-[17px] font-semibold text-white">For selected difficulty</div>
        <div className="truncate font-game-display text-[14px] text-white/60">{beatmap ? `[${beatmap.keyCount}K] ${beatmap.difficultyName}` : "No beatmap selected"}</div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Item
          icon={<Check className="h-5 w-5" strokeWidth={3} aria-hidden />}
          onClick={() => {
            onClose();
            onPlay();
          }}
        >
          Play
        </Item>
        <Item
          icon={<FileText className="h-5 w-5" aria-hidden />}
          onClick={() => {
            window.dispatchEvent(new CustomEvent(SHOW_DETAILS_EVENT));
            onClose();
          }}
        >
          Details...
        </Item>
      </div>
    </div>
  );
}
