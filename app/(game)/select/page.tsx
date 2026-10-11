"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import BeatmapList, { GroupCategory } from "@/components/game/select/BeatmapList";
import BeatmapDetail from "@/components/game/select/BeatmapDetail";
import SelectBackground from "@/components/select/SelectBackground";
import SelectFooter from "@/components/select/SelectFooter";
import OptionsMenu from "@/components/select/OptionsMenu";
import ModSelect, { ModStats } from "@/components/select/ModSelect";
import { listBeatmaps } from "@/lib/api/beatmaps";
import { useGameStore } from "@/lib/store/useGameStore";
import { useMusicStore } from "@/lib/store/useMusicStore";
import { useSettingsStore } from "@/lib/store/useSettingsStore";
import type { Beatmap } from "@/types/beatmap";

export default function SongSelectPage() {
  const router = useRouter();
  const { beatmaps, setBeatmaps, selectedBeatmap, setSelectedBeatmap } = useGameStore();
  const [loading, setLoading] = useState(beatmaps.length === 0);
  const [mounted, setMounted] = useState(false);
  const lastSelectedByMe = useRef<string | null>(selectedBeatmap?.id || null);
  const selectedRef = useRef<Beatmap | null>(selectedBeatmap);

  useEffect(() => {
    selectedRef.current = selectedBeatmap;
  }, [selectedBeatmap]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const { playlist: musicPlaylist, currentIndex, playBeatmap, isPlaying } = useMusicStore();

  // Preview audio on selection
  useEffect(() => {
    if (!selectedBeatmap) return;

    const timer = setTimeout(async () => {
      // If already playing this song in the global player, don't restart it
      const currentGlobal = musicPlaylist[currentIndex];
      if (currentGlobal && 
          currentGlobal.title === selectedBeatmap.title && 
          currentGlobal.artist === selectedBeatmap.artist && 
          isPlaying) {
        return;
      }

      playBeatmap(selectedBeatmap);
    }, 400); // 400ms debounce

    return () => {
      clearTimeout(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBeatmap?.id]);

  const [search, setSearch] = useState("");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [modsOpen, setModsOpen] = useState(false);
  const modCount = useGameStore((s) => s.selectedMods.length);
  const closeMods = useCallback(() => setModsOpen(false), []);
  
  const { 
    selectionSortBy: sortBy, 
    selectionGroupBy: groupBy, 
    selectionStarMin: starMin, 
    selectionStarMax: starMax,
    lastSelectedBeatmapId,
    setSelectionSortBy: setSortBy,
    setSelectionGroupBy: setGroupBy,
    setSelectionStarRange,
    setLastSelectedBeatmapId
  } = useSettingsStore();

  const changeSelection = useCallback((beatmap: Beatmap) => {
    lastSelectedByMe.current = beatmap.id;
    setSelectedBeatmap(beatmap);
    setLastSelectedBeatmapId(beatmap.id);
  }, [setSelectedBeatmap, setLastSelectedBeatmapId]);

  const fetchBeatmaps = useCallback(async () => {
    // Only fetch if we don't have them yet
    if (beatmaps.length > 0) {
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      const res = await listBeatmaps(1, 10000);
      setBeatmaps(res.data);
      
      if (res.data.length > 0 && !selectedBeatmap) {
        // Priority 1: Try to restore last selected difficulty
        const persisted = lastSelectedBeatmapId ? res.data.find(b => b.id === lastSelectedBeatmapId) : null;
        
        if (persisted) {
          changeSelection(persisted);
        } else {
          // Priority 2: Try to match with currently playing music
          const currentMusic = musicPlaylist[currentIndex];
          const matched = currentMusic ? res.data.find(b => b.id === currentMusic.id) : null;
          
          if (matched) {
            changeSelection(matched);
          } else {
            // Priority 3: Pick the easiest of the first song
            const firstSongDiffs = res.data.filter(b => b.title === res.data[0].title && b.artist === res.data[0].artist);
            const easiest = firstSongDiffs.sort((a, b) => a.starRating - b.starRating)[0];
            changeSelection(easiest);
          }
        }
      }
    } catch (err) {
      console.error("Failed to fetch beatmaps:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedBeatmap, musicPlaylist, currentIndex, beatmaps.length, setBeatmaps, changeSelection, lastSelectedBeatmapId]);

  // Sync selected beatmap with music player when it changes (e.g. from navbar)
  useEffect(() => {
    const currentMusic = musicPlaylist[currentIndex];
    if (!currentMusic) return;

    // Check against the ref to ensure we have the latest selection without being a dependency
    const currentSelected = selectedRef.current;

    // ONLY sync if:
    // 1. The song in the music player is actually different (different title/artist)
    // 2. AND we didn't just manually select this exact song ourselves
    // This prevents the 'difficulty reset' because musicPlaylist only stores one canonical diff per song
    const isSameSong = currentSelected && 
                      currentSelected.title === currentMusic.title && 
                      currentSelected.artist === currentMusic.artist;

    if (!isSameSong && lastSelectedByMe.current !== currentMusic.id) {
      const matched = beatmaps.find(b => b.id === currentMusic.id);
      if (matched) {
        changeSelection(matched);
      }
    }
  }, [currentIndex, musicPlaylist, beatmaps, changeSelection]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchBeatmaps();
  }, [fetchBeatmaps]);


  const handleSelectBeatmap = (beatmap: Beatmap) => {
    changeSelection(beatmap);
  };

  const handleRandomBeatmap = () => {
    if (beatmaps.length === 0) return;
    const random = beatmaps[Math.floor(Math.random() * beatmaps.length)];
    changeSelection(random);
  };

  // --- Keyboard Navigation Logic ---
  const groupedCategories = useMemo<GroupCategory[]>(() => {
    const lowerSearch = search.toLowerCase();
    
    // First, filter all beatmaps
    const validBeatmaps = beatmaps.filter(b => {
      const matchesSearch = b.title.toLowerCase().includes(lowerSearch) || 
                            b.artist.toLowerCase().includes(lowerSearch);
      return matchesSearch && b.starRating >= starMin && b.starRating <= starMax;
    });

    if (groupBy === "DIFFICULTY") {
      // Each difficulty is its own item
      const items = validBeatmaps.map(b => {
        const inRangeDiffs = beatmaps.filter(x => 
          x.title === b.title && 
          x.artist === b.artist &&
          x.starRating >= starMin && 
          x.starRating <= starMax
        );
        return {
          id: b.id,
          title: b.title,
          artist: b.artist,
          coverUrl: b.coverUrl,
          status: b.rankedStatus,
          representedBeatmap: b,
          allDifficulties: inRangeDiffs.sort((a, b) => a.starRating - b.starRating)
        };
      });

      // Group by star rating buckets: 0-1 Stars, 1-2 Stars, etc.
      const map = new Map<number, typeof items>();
      for (const item of items) {
        const star = item.representedBeatmap!.starRating;
        const bucket = Math.floor(star);
        if (!map.has(bucket)) map.set(bucket, []);
        map.get(bucket)!.push(item);
      }

      const sortedBuckets = Array.from(map.keys()).sort((a, b) => a - b);
      return sortedBuckets.map(bucket => {
        const label = `${bucket} - ${bucket + 1} Stars`;
        const categoryItems = map.get(bucket)!;
        
        // Sort items within bucket
        categoryItems.sort((a, b) => {
          const aFirst = a.representedBeatmap!;
          const bFirst = b.representedBeatmap!;
          switch (sortBy) {
            case "title": return aFirst.title.localeCompare(bFirst.title);
            case "artist": return aFirst.artist.localeCompare(bFirst.artist);
            case "starRating": return aFirst.starRating - bFirst.starRating;
            case "bpm": return aFirst.bpm - bFirst.bpm;
            default: return 0;
          }
        });

        return {
          label,
          items: categoryItems
        };
      });
    } else {
      // Group by song parent (title + artist)
      const parentMap = new Map<string, Beatmap[]>();
      for (const b of validBeatmaps) {
        const key = `${b.title}|||${b.artist}`;
        if (!parentMap.has(key)) parentMap.set(key, []);
        parentMap.get(key)!.push(b);
      }

      const items = Array.from(parentMap.entries()).map(([key, diffs]) => {
        const first = diffs[0];
        // Use only the difficulties that passed the filter (in range)
        const sortedDiffs = diffs.sort((a, b) => a.starRating - b.starRating);
        return {
          id: key,
          title: first.title,
          artist: first.artist,
          coverUrl: first.coverUrl,
          status: first.rankedStatus,
          allDifficulties: sortedDiffs,
          representedBeatmap: sortedDiffs[0] // Default representative is the easiest in range
        };
      });

      if (groupBy === "ARTIST") {
        const map = new Map<string, typeof items>();
        for (const item of items) {
          const firstChar = item.artist.charAt(0).toUpperCase();
          const label = /[A-Z]/.test(firstChar) ? firstChar : "0-9";
          if (!map.has(label)) map.set(label, []);
          map.get(label)!.push(item);
        }

        const sortedLabels = Array.from(map.keys()).sort((a, b) => {
          if (a === "0-9") return -1;
          if (b === "0-9") return 1;
          return a.localeCompare(b);
        });

        return sortedLabels.map(label => {
          const categoryItems = map.get(label)!;
          categoryItems.sort((a, b) => {
            const aFirst = a.allDifficulties[0];
            const bFirst = b.allDifficulties[0];
            switch (sortBy) {
              case "title": return aFirst.title.localeCompare(bFirst.title);
              case "artist": return aFirst.artist.localeCompare(bFirst.artist);
              case "starRating": return aFirst.starRating - bFirst.starRating;
              case "bpm": return aFirst.bpm - bFirst.bpm;
              default: return 0;
            }
          });
          return { label, items: categoryItems };
        });
      } else {
        // NONE
        items.sort((a, b) => {
          const aFirst = a.allDifficulties[0];
          const bFirst = b.allDifficulties[0];
          switch (sortBy) {
            case "title": return aFirst.title.localeCompare(bFirst.title);
            case "artist": return aFirst.artist.localeCompare(bFirst.artist);
            case "starRating": return aFirst.starRating - bFirst.starRating;
            case "bpm": return aFirst.bpm - bFirst.bpm;
            default: return 0;
          }
        });
        return [{ label: "", items }];
      }
    }
  }, [beatmaps, search, starMin, starMax, groupBy, sortBy]);

  const flatBeatmaps = useMemo(() => {
    const list: Beatmap[] = [];
    groupedCategories.forEach(cat => {
      cat.items.forEach(item => {
        if (groupBy === "DIFFICULTY") {
          list.push(item.representedBeatmap!);
        } else {
          list.push(...item.allDifficulties);
        }
      });
    });
    return list;
  }, [groupedCategories, groupBy]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in search
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (!selectedBeatmap || groupedCategories.length === 0) return;

      const currentIdx = flatBeatmaps.findIndex(b => b.id === selectedBeatmap.id);
      
      const flatItems = groupedCategories.flatMap(c => c.items);
      const currentGroupIdx = flatItems.findIndex(item => 
        groupBy === "DIFFICULTY" 
          ? item.representedBeatmap!.id === selectedBeatmap.id
          : item.allDifficulties.some(d => d.id === selectedBeatmap.id)
      );

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const nextIdx = (currentIdx + 1) % flatBeatmaps.length;
        changeSelection(flatBeatmaps[nextIdx]);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prevIdx = (currentIdx - 1 + flatBeatmaps.length) % flatBeatmaps.length;
        changeSelection(flatBeatmaps[prevIdx]);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        const nextGroupIdx = (currentGroupIdx + 1) % flatItems.length;
        const nextGroup = flatItems[nextGroupIdx];
        changeSelection(groupBy === "DIFFICULTY" ? nextGroup.representedBeatmap! : nextGroup.allDifficulties[0]);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        const prevGroupIdx = (currentGroupIdx - 1 + flatItems.length) % flatItems.length;
        const prevGroup = flatItems[prevGroupIdx];
        changeSelection(groupBy === "DIFFICULTY" ? prevGroup.representedBeatmap! : prevGroup.allDifficulties[0]);
      } else if (e.key === "Enter") {
        e.preventDefault();
        router.push(`/prepare/${selectedBeatmap.id}`);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedBeatmap, flatBeatmaps, groupedCategories, groupBy, router, changeSelection]);

  return (
    <div className="relative flex-1 w-full flex flex-col overflow-hidden bg-select-bar">
      <SelectBackground coverUrl={selectedBeatmap?.coverUrl ?? null} />

      <div className={`absolute inset-x-0 top-0 bottom-[67px] z-10 transition-opacity duration-300 ${mounted ? "opacity-100" : "opacity-0"}`}>
        {mounted && (
          <>
            {/* Kiri: info beatmap + leaderboard */}
            <div className="absolute inset-y-0 left-0 flex w-[min(890px,48vw)] min-w-[520px] flex-col">
              <BeatmapDetail beatmap={selectedBeatmap} />
            </div>

            {/* Kanan: pencarian + daftar, kartu bleed sampai tepi kanan */}
            <div className="absolute inset-y-0 right-0 flex w-[min(880px,46vw)] min-w-[520px] flex-col">
              <BeatmapList
                selectedBeatmap={selectedBeatmap}
                onSelectBeatmap={handleSelectBeatmap}
                loading={loading}
                search={search}
                setSearch={setSearch}
                sortBy={sortBy}
                setSortBy={setSortBy}
                starMin={starMin}
                starMax={starMax}
                setStarRange={setSelectionStarRange}
                groupBy={groupBy}
                setGroupBy={setGroupBy}
                groupedCategories={groupedCategories}
              />
            </div>
          </>
        )}
      </div>

      {optionsOpen && (
        <OptionsMenu
          beatmap={selectedBeatmap}
          onClose={() => setOptionsOpen(false)}
          onPlay={() => selectedBeatmap && router.push(`/prepare/${selectedBeatmap.id}`)}
        />
      )}

      {modsOpen && <ModSelect onClose={closeMods} />}

      <SelectFooter
        onRandom={handleRandomBeatmap}
        onOptions={() => setOptionsOpen((v) => !v)}
        onMods={() => { setOptionsOpen(false); setModsOpen((v) => !v); }}
        modsOpen={modsOpen}
        modCount={modCount}
        modStats={<ModStats beatmap={selectedBeatmap} />}
        onPlay={() => selectedBeatmap && router.push(`/prepare/${selectedBeatmap.id}`)}
        optionsOpen={optionsOpen}
        canPlay={!!selectedBeatmap}
      />
    </div>
  );
}
