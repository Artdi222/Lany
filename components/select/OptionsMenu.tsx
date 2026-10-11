"use client";

import { useEffect, useRef, useState } from "react";
import { Check, FileText, FolderPlus } from "lucide-react";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { useCollectionStore } from "@/lib/store/useCollectionStore";
import type { Beatmap } from "@/types/beatmap";

/** Menu Options (foto `...519414354`): panel #1e1f29 di atas footer. Hanya aksi yang punya fitur di Lany: Play, Details, Collection. */

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
  const isGuest = useAuthStore((s) => s.isGuest);
  const collections = useCollectionStore((s) => s.collections);
  const [showCollections, setShowCollections] = useState(false);
  const [newName, setNewName] = useState("");

  const createCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name || !beatmap) return;
    setNewName("");
    const c = await useCollectionStore.getState().create(name).catch(() => null);
    if (c) useCollectionStore.getState().toggleBeatmap(c.id, beatmap.id);
  };

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
        {beatmap && !isGuest && (
          <Item icon={<FolderPlus className="h-5 w-5" aria-hidden />} onClick={() => setShowCollections((v) => !v)}>
            Collection
          </Item>
        )}
        {beatmap && !isGuest && showCollections && (
          <div className="flex flex-col gap-1 rounded-lg bg-select-field/60 p-2">
            {collections.map((c) => {
              const has = c.beatmapIds.includes(beatmap.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={has}
                  onClick={() => useCollectionStore.getState().toggleBeatmap(c.id, beatmap.id)}
                  className="flex h-9 cursor-pointer items-center gap-3 rounded-md px-3 text-left font-game-display text-[15px] text-white hover:bg-white/10"
                >
                  <span className="flex h-4 w-4 items-center justify-center rounded-sm border border-white/50">{has && <Check className="h-3 w-3" strokeWidth={3} />}</span>
                  <span className="truncate">{c.name}</span>
                </button>
              );
            })}
            <form onSubmit={createCollection}>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={50}
                placeholder="New collection..."
                className="h-9 w-full rounded-md bg-select-bar px-3 font-game-display text-[15px] text-white outline-none placeholder:text-white/40"
              />
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
