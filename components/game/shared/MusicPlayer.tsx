"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, SkipForward, SkipBack, Shuffle, Menu } from "lucide-react";
import { useMusicStore } from "@/lib/store/useMusicStore";
import { useGameStore } from "@/lib/store/useGameStore";
import { useSettingsStore } from "@/lib/store/useSettingsStore";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/icons/Icon";

export default function MusicPlayer() {
  const pathname = usePathname();
  const settings = useSettingsStore();
  const { 
    playlist, 
    currentIndex, 
    isPlaying, 
    togglePlay, 
    pauseMusic,
    next, 
    previous, 
    playBeatmap, 
    playRandom,
    setVolume,
    shuffle,
    toggleShuffle,
  } = useMusicStore();
  
  const [expanded, setExpanded] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const currentSong = playlist[currentIndex];
  const gameStatus = useGameStore((s) => s.status);
  const wasPlayingRef = useRef(false);

  // Hide on certain pages
  const isSelectPage = pathname === "/select";
  const isPreparePage = pathname.includes("/prepare/");
  const shouldHide = isSelectPage || isPreparePage || gameStatus === "playing";

  useEffect(() => {
    if (gameStatus === "playing") {
      if (isPlaying) {
        wasPlayingRef.current = true;
        pauseMusic();
      }
    } else if (wasPlayingRef.current && !isPlaying) {
      wasPlayingRef.current = false;
      togglePlay();
    }
  }, [gameStatus, isPlaying, togglePlay, pauseMusic]);

  // Sync with master volume
  useEffect(() => {
    setVolume(settings.volume);
  }, [settings.volume, setVolume]);

  // Auto-play random song if nothing playing
  useEffect(() => {
    if (currentIndex === -1 && playlist.length === 0) {
      playRandom();
    }
  }, [currentIndex, playlist.length, playRandom]);

  // F6 toggles the panel (shown in the lazer tooltip).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F6") {
        e.preventDefault();
        setExpanded((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Click outside to close
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    window.addEventListener("mousedown", handle);
    return () => window.removeEventListener("mousedown", handle);
  }, []);

  if (shouldHide) return null;

  return (
    <div className="relative flex items-center h-full" ref={containerRef}>
      {/* Mini Player */}
      <button
        onClick={() => setExpanded(!expanded)}
        aria-label={currentSong ? `Now playing: ${currentSong.title}` : "Now playing"}
        className={`group relative flex h-full w-12 cursor-pointer items-center justify-center rounded-md transition-colors ${expanded ? "bg-lf-primary text-white" : `hover:bg-white/10 ${isPlaying ? "text-lf-accent" : "text-lf-text"}`}`}
      >
        <Icon name="music" size={22} />
        {/* Tooltip as in the reference photo: plain shadowed text under the button, no box. */}
        {!expanded && (
          <span className="pointer-events-none absolute right-0 top-full z-60 mt-3 hidden whitespace-nowrap text-right font-game-display text-white [text-shadow:0_1px_4px_rgb(0_0_0/0.9)] group-hover:block">
            <span className="block text-[17px] font-bold">now playing</span>
            <span className="text-[14px]">manage the currently playing track</span>
            <span className="ml-3 text-[14px] text-white/60">F6</span>
          </span>
        )}
      </button>

      {/* Panel: spec docs/ui-spec/now-playing.md */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="fixed right-3 top-16 z-60 w-[min(561px,calc(100vw-1.5rem))]"
          >
            <div className="overflow-hidden rounded-lg bg-lf-bg-raised shadow-lf-panel">
              <div className="relative flex h-[105px] flex-col items-center justify-center px-6 text-center">
                {currentSong?.coverUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={currentSong.coverUrl} alt="" onError={(e) => (e.currentTarget.style.display = "none")} className="absolute inset-0 h-full w-full object-cover opacity-40" />
                )}
                <div className="absolute inset-0 bg-linear-to-r from-black/50 to-transparent" />
                <h4 className="relative max-w-full truncate font-game-display text-[28px] font-light text-white">{currentSong?.title ?? "Not playing"}</h4>
                <p className="relative max-w-full truncate font-game-display text-[15px] font-bold text-white/90">{currentSong?.artist ?? ""}</p>
              </div>

              <div className="flex h-[70px] items-center justify-between bg-lf-surface px-6">
                <button onClick={toggleShuffle} aria-label="Shuffle" aria-pressed={shuffle} className={`cursor-pointer transition-colors ${shuffle ? "text-lf-accent" : "text-white/70 hover:text-white"}`}>
                  <Shuffle className="h-6 w-6" />
                </button>
                <div className="flex items-center gap-10 text-white">
                  <button onClick={previous} aria-label="Previous" className="cursor-pointer hover:text-lf-accent"><SkipBack className="h-6 w-6 fill-current" /></button>
                  <button onClick={togglePlay} aria-label={isPlaying ? "Pause" : "Play"} className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border-[3px] border-white transition-transform hover:scale-105 active:scale-95">
                    {isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="ml-0.5 h-5 w-5 fill-current" />}
                  </button>
                  <button onClick={next} aria-label="Next" className="cursor-pointer hover:text-lf-accent"><SkipForward className="h-6 w-6 fill-current" /></button>
                </div>
                <button onClick={() => setListOpen((v) => !v)} aria-label="Playlist" aria-pressed={listOpen} className={`cursor-pointer transition-colors ${listOpen ? "text-lf-accent" : "text-white/70 hover:text-white"}`}>
                  <Menu className="h-6 w-6" />
                </button>
              </div>
              <ProgressStrip />
            </div>

            {listOpen && (
              <ul className="custom-scrollbar mt-[22px] max-h-[60vh] overflow-y-auto rounded-lg bg-lf-bg-raised/95 p-5 shadow-lf-panel">
                {playlist.map((bm, idx) => (
                  <li key={bm.id}>
                    <button
                      onClick={() => playBeatmap(bm)}
                      className={`flex w-full cursor-pointer items-baseline gap-3 py-0.5 text-left hover:text-white ${idx === currentIndex ? "text-lf-accent" : "text-white/90"}`}
                    >
                      <span className="shrink-0 font-game-body text-lg">{bm.title}</span>
                      <span className="truncate font-game-display text-sm font-bold text-white/45">{bm.artist}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Song progress along the card's bottom edge. Own component: audio `timeupdate` re-renders only this strip. */
function ProgressStrip() {
  const audio = useMusicStore((s) => s.currentAudio);
  const [pct, setPct] = useState(0);

  useEffect(() => {
    if (!audio) return;
    const update = () => setPct(audio.duration ? (audio.currentTime / audio.duration) * 100 : 0);
    update();
    audio.addEventListener("timeupdate", update);
    return () => audio.removeEventListener("timeupdate", update);
  }, [audio]);

  const seek = useMusicStore((s) => s.seek);
  const onSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    seek((e.clientX - r.left) / r.width);
  };

  return (
    <div onClick={onSeek} className="h-1.5 w-full cursor-pointer bg-black/40">
      <div className="h-full bg-lf-accent" style={{ width: `${pct}%` }} />
    </div>
  );
}
