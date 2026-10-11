"use client";

import { useSettingsStore } from "@/lib/store/useSettingsStore";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { apiClient } from "@/lib/api/client";
import type { RankGrade } from "@/types/game";
import { useCollectionStore } from "@/lib/store/useCollectionStore";
import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Music, Search } from "lucide-react";
import type { Beatmap } from "@/types/beatmap";
import { buildRows, isSelectedItem, selectedRowIndex, type Row } from "@/lib/select/rows";
import { rowOffset } from "@/lib/select/curve";
import SplitSelect from "@/components/select/SplitSelect";
import StarRangeSlider from "@/components/select/StarRangeSlider";
import { SHEAR, UNSHEAR } from "@/components/select/shear";
import { cn } from "@/lib/utils";
import { DiffCard, HeaderCard, SetCard } from "@/components/select/CarouselCards";

/** Kolom kanan layar select: header (search, star rating, sort/group/collection) + daftar virtualized. Spec: docs/ui-spec/song-select.md. */

type SortKey = "title" | "artist" | "starRating" | "bpm";
type GroupKey = "NONE" | "ARTIST" | "DIFFICULTY";

interface BeatmapListProps {
  selectedBeatmap: Beatmap | null;
  onSelectBeatmap: (beatmap: Beatmap) => void;
  loading: boolean;
  search: string;
  setSearch: (s: string) => void;
  sortBy: SortKey;
  setSortBy: (s: SortKey) => void;
  starMin: number;
  starMax: number;
  setStarRange: (min: number, max: number) => void;
  groupBy: GroupKey;
  setGroupBy: (g: GroupKey) => void;
  groupedCategories: GroupCategory[];
}

export interface BeatmapGroupItem {
  id: string; // The parent ID or the beatmap ID
  title: string;
  artist: string;
  coverUrl?: string | null;
  status: string;
  representedBeatmap?: Beatmap; // For difficulty grouping
  allDifficulties: Beatmap[];
}

export interface GroupCategory {
  label: string; // e.g. "A", "1 Star", or "" for NONE
  items: BeatmapGroupItem[];
}


type ListRow = Row<BeatmapGroupItem, Beatmap>;

const ROW_ESTIMATE: Record<ListRow["kind"], number> = { header: 62, card: 101, diff: 64 };

const SORT_OPTIONS = [
  { label: "Title", value: "title" },
  { label: "Artist", value: "artist" },
  { label: "Star rating", value: "starRating" },
  { label: "BPM", value: "bpm" },
] as const;
const GROUP_OPTIONS = [
  { label: "None", value: "NONE" },
  { label: "Artist", value: "ARTIST" },
  { label: "Difficulty", value: "DIFFICULTY" },
] as const;

export default function BeatmapList({
  selectedBeatmap,
  onSelectBeatmap,
  loading,
  search,
  setSearch,
  sortBy,
  setSortBy,
  starMin,
  starMax,
  setStarRange,
  groupBy,
  setGroupBy,
  groupedCategories,
}: BeatmapListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const collections = useCollectionStore((s) => s.collections);
  const activeCollectionId = useCollectionStore((s) => s.activeId);
  const setActiveCollection = useCollectionStore((s) => s.setActive);
  const keyMode = useSettingsStore((s) => s.keyMode);
  // Best grade per difficulty (badge on difficulty cards); signed-in players only.
  const token = useAuthStore((s) => s.token);
  const [bestGrades, setBestGrades] = useState<Record<string, RankGrade>>({});
  useEffect(() => {
    if (!token) return;
    apiClient<{ beatmapId: string; rank: RankGrade }[]>("/users/me/best-grades", { token })
      .then((rows) => setBestGrades(Object.fromEntries(rows.map((r) => [r.beatmapId, r.rank]))))
      .catch(() => {});
  }, [token]);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const selectedId = selectedBeatmap?.id ?? null;

  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  // Seleksi baru (panah keyboard, Random) harus membuka kategori dan grup tempatnya berada.
  const [prevSelectedId, setPrevSelectedId] = useState<string | null>(null);
  if (selectedId !== prevSelectedId) {
    setPrevSelectedId(selectedId);
    if (selectedId) {
      for (const cat of groupedCategories) {
        const item = cat.items.find((it) => isSelectedItem(it, groupBy, selectedId));
        if (!item) continue;
        if (collapsedCategories.has(cat.label)) setCollapsedCategories((s) => toggle(s, cat.label));
        if (collapsedGroups.has(item.id)) setCollapsedGroups((s) => toggle(s, item.id));
        break;
      }
    }
  }

  const rows = useMemo(
    () => buildRows<Beatmap, BeatmapGroupItem>(groupedCategories, { groupBy, selectedId, collapsedCategories, collapsedGroups }),
    [groupedCategories, groupBy, selectedId, collapsedCategories, collapsedGroups],
  );

  // Penanda scroll putih tipis di tepi kanan (foto). Hanya indikator; scroll lewat roda/trackpad/keyboard.
  const [thumb, setThumb] = useState({ top: 0, height: 0 });
  const updateThumb = () => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollTop, clientHeight, scrollHeight } = el;
    if (scrollHeight <= clientHeight + 1) return setThumb((t) => (t.height === 0 ? t : { top: 0, height: 0 }));
    const height = Math.max(40, (clientHeight * clientHeight) / scrollHeight);
    const top = (scrollTop / (scrollHeight - clientHeight)) * (clientHeight - height);
    setThumb({ top, height });
  };

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    onChange: updateThumb,
    estimateSize: (i) => ROW_ESTIMATE[rows[i].kind],
    getItemKey: (i) => rows[i].key,
    overscan: 8,
  });

  // Gulirkan seleksi baru ke tengah. Hanya saat id berubah, bukan saat grup dilipat/dibuka.
  const lastScrolledId = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedId || lastScrolledId.current === selectedId) return;
    const idx = selectedRowIndex(rows);
    if (idx < 0) return;
    // Scroll pertama (restore seleksi saat halaman dibuka) instan; berikutnya halus.
    const first = lastScrolledId.current === null;
    lastScrolledId.current = selectedId;
    virtualizer.scrollToIndex(idx, { align: "center", behavior: first ? "auto" : "smooth" });
  }, [selectedId, rows, virtualizer]);

  const matchCount = groupedCategories.reduce((acc, cat) => acc + cat.items.length, 0);

  return (
    <div className="flex h-full flex-col">
      {/* ── Header ───────────────────────────────────────── */}
      {/* Seperti lazer: semua kotak miring (tan 0.2) dan tepi kiri/kanannya jatuh di satu garis miring, jadi tiap baris
          bergeser ke kiri sebanyak 0.2 x jarak vertikalnya. Panel belakang ikut miring dan bleed ke kanan. */}
      <div className="relative z-20 -ml-[30px] shrink-0 pb-[4px] pt-[9px]">
        <div className={cn(SHEAR, "absolute inset-y-0 left-[6px] -right-[40px] rounded-bl-2xl bg-select-bar/90 shadow-[0_8px_24px_rgb(0_0_0/0.35)] backdrop-blur-sm")} />
        <div className="relative ml-[25px] mr-[10px] flex h-[66px]">
          <label className={cn(SHEAR, "relative flex min-w-0 flex-1 cursor-text flex-col justify-center rounded-l-[10px] bg-select-field px-4")}>
            <input
              type="text"
              placeholder="search..."
              aria-label="Search beatmaps"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(UNSHEAR, "w-full bg-transparent font-game-display text-[24px] text-white outline-none placeholder:text-[#a3a4bd]")}
            />
            <span className={cn(UNSHEAR, "font-game-display text-[12px] font-semibold text-select-match")}>{matchCount} matches</span>
          </label>
          <span className={cn(SHEAR, "flex w-[65px] shrink-0 items-center justify-center rounded-r-[10px] bg-select-tile text-white")}>
            <Search className={cn(UNSHEAR, "h-6 w-6")} strokeWidth={2.5} aria-hidden />
          </span>
        </div>

        <div className="relative ml-[12px] mr-[21px] mt-[11px] flex h-[39px] items-center gap-[3px]">
          <span className={cn(SHEAR, "flex h-full w-[116px] shrink-0 items-center justify-center rounded-l-[10px] bg-select-tile font-game-display text-[17px] font-semibold text-white")}>
            <span className={UNSHEAR}>Star Rating</span>
          </span>
          <div className="h-full min-w-0 flex-1">
            <StarRangeSlider min={starMin} max={starMax} onChange={setStarRange} />
          </div>
        </div>

        <div className="relative ml-[2px] mr-[32px] mt-[9px] flex items-center gap-2">
          <SplitSelect<SortKey> label="Sort" value={sortBy} options={SORT_OPTIONS} onChange={setSortBy} className="w-[240px]" />
          <SplitSelect<GroupKey> label="Group" value={groupBy} options={GROUP_OPTIONS} onChange={setGroupBy} className="w-[238px]" />
          <SplitSelect<string>
            label="Collection"
            value={activeCollectionId == null ? "ALL" : String(activeCollectionId)}
            options={[{ label: "All beatmaps", value: "ALL" }, ...collections.map((c) => ({ label: `${c.name} (${c.beatmapIds.length})`, value: String(c.id) }))]}
            onChange={(v) => setActiveCollection(v === "ALL" ? null : Number(v))}
            disabled={!collections.length}
            className="min-w-0 flex-1"
          />
        </div>
      </div>

      {/* ── Daftar (virtualized) ─────────────────────────── */}
      <div className="relative z-10 mt-2 min-h-0 flex-1">
        <div ref={scrollRef} className="no-scrollbar h-full overflow-y-auto overflow-x-hidden pb-[40vh] pt-2">
          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <div className="h-7 w-7 animate-spin rounded-full border-4 border-white border-t-transparent" role="status" aria-label="Loading beatmaps" />
            </div>
          ) : rows.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center text-white/60">
              <Music className="mb-3 h-10 w-10 opacity-60" aria-hidden />
              <p className="font-game-display text-[17px]">{search ? "No results" : `No ${keyMode}K beatmaps yet`}</p>
            </div>
          ) : (
            <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((v) => {
                const row = rows[v.index];
                // jarak tengah kartu ke tengah area daftar (pt-2 = 8 px di atas isi)
                const distance = 8 + v.start + v.size / 2 - (virtualizer.scrollOffset ?? 0) - (virtualizer.scrollRect?.height ?? 0) / 2;
                return (
                  <div key={v.key} data-index={v.index} ref={virtualizer.measureElement} className="absolute left-0 top-0 w-full pb-1.5 transition-transform duration-300 ease-out" style={{ transform: `translateY(${v.start}px)` }}>
                    <div className="transition-[margin-left] duration-150 ease-out" style={{ marginLeft: rowOffset(row.kind === "header" ? row : { kind: row.kind, selected: row.selected }, distance) }}>
                      {row.kind === "header" ? (
                        <HeaderCard label={row.label} count={row.count} collapsed={row.collapsed} onClick={() => setCollapsedCategories((s) => toggle(s, row.label))} />
                      ) : row.kind === "diff" ? (
                        <DiffCard diff={row.diff} selected={row.selected} grade={bestGrades[row.diff.id]} onClick={() => onSelectBeatmap(row.diff)} />
                      ) : (
                        <SetCard
                          title={row.item.title}
                          artist={row.item.artist}
                          coverUrl={row.item.coverUrl}
                          status={row.item.status}
                          difficulties={groupBy === "DIFFICULTY" && row.item.representedBeatmap ? [row.item.representedBeatmap] : row.item.allDifficulties}
                          selected={row.selected}
                          expanded={row.expanded}
                          onClick={() =>
                            row.selected && groupBy !== "DIFFICULTY"
                              ? setCollapsedGroups((s) => toggle(s, row.item.id))
                              : onSelectBeatmap(row.item.representedBeatmap || row.item.allDifficulties[0])
                          }
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {thumb.height > 0 && <div aria-hidden className="pointer-events-none absolute right-[5px] w-1.5 rounded-full bg-white/90" style={{ top: thumb.top, height: thumb.height }} />}
      </div>
    </div>
  );
}
