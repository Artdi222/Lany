"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import * as PIXI from "pixi.js";
import { GameEngine } from "@/lib/game/GameEngine";
import { BeatmapLoader, LoadedBeatmapData } from "@/lib/game/BeatmapLoader";
import { useGameStore } from "@/lib/store/useGameStore";
import { useSettingsStore } from "@/lib/store/useSettingsStore";
import { useMusicStore } from "@/lib/store/useMusicStore";
import { getBeatmapUrl, getBeatmap } from "@/lib/api/beatmaps";
import type { JudgementType } from "@/types/game";
import { cloneNotes } from "@/lib/game/noteUtils";
import { resolveMaxFps, resolveResolution } from "@/lib/game/RenderSettings";

interface GameCanvasProps {
  beatmapId: string;
  onReady?: () => void;
  onProgress?: (progress: number) => void;
}

import SkipButton from "./SkipButton";

export default function GameCanvas({ beatmapId, onReady, onProgress }: GameCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSkip, setShowSkip] = useState(false);
  const [nextNoteTime, setNextNoteTime] = useState<number | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const archiveKeyRef = useRef<string | null>(null);

  // Selectors, not the whole store: the score/combo/hp change on every hit and must not re-render this component.
  const startGame = useGameStore((s) => s.startGame);
  const endGame = useGameStore((s) => s.endGame);
  const updateJudgement = useGameStore((s) => s.updateJudgement);
  const failGame = useGameStore((s) => s.failGame);
  const status = useGameStore((s) => s.status);
  const currentBeatmap = useGameStore((s) => s.currentBeatmap);
  const retryTrigger = useGameStore((s) => s.retryTrigger);
  const settings = useSettingsStore();

  useEffect(() => {
    // Only run this for retries. Initial start is handled by the init() function.
    if (retryTrigger > 0 && isInitialized && engineRef.current) {
      const archiveKey = archiveKeyRef.current;
      if (!archiveKey) return;

      // Re-parse notes for a fresh start (to reset all 'hit' flags etc)
      const cached = BeatmapLoader.getCache(archiveKey);
      const difficulty = currentBeatmap?.difficultyName || "";
      const parsed = cached?.getDifficulty
        ? cached.getDifficulty(difficulty, currentBeatmap?.keyCount)
        : cached?.difficulties.get(difficulty.toLowerCase());
      
      if (parsed) {
        // We need NEW note objects because the old ones are mutated
        const freshNotes = cloneNotes(parsed.notes);
        engineRef.current.reset(freshNotes);
        engineRef.current.start();
        
        // Update store with fresh notes too
        startGame({
          ...currentBeatmap!,
          notes: freshNotes
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryTrigger, isInitialized]);

  // Skip-intro detection and progress reporting at 10 Hz. This used to be a second requestAnimationFrame
  // loop (every frame: an O(n) note scan, several setStates, and a progress update that re-rendered the
  // whole play page); neither needs more than 10 Hz.
  useEffect(() => {
    const id = setInterval(() => {
      const engine = engineRef.current;
      if (!engine || status !== "playing") {
        setShowSkip(false);
        return;
      }
      const next = engine.getNextNoteTime();
      if (next !== null && next - engine.getCurrentTime() > 10000) {
        setNextNoteTime(next);
        setShowSkip(true);
      } else {
        setShowSkip(false);
      }
      onProgress?.(engine.getProgress());
    }, 100);
    return () => clearInterval(id);
  }, [status, onProgress]);

  const handleSkip = useCallback(() => {
    if (engineRef.current && nextNoteTime !== null) {
      engineRef.current.seek(nextNoteTime - 1500);
      setShowSkip(false);
    }
  }, [nextNoteTime]);

  // Handle skip keybind
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && showSkip) {
        e.preventDefault();
        handleSkip();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showSkip, handleSkip]);

  // Sync engine pause state with store status
  useEffect(() => {
    if (!engineRef.current || !isInitialized) return;
    if (status === "paused") {
      engineRef.current.pause();
    } else if (status === "playing") {
      engineRef.current.resume();
    }
  }, [status, isInitialized]);

  // Sync scroll speed settings
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setScrollSpeed(settings.scrollSpeed);
    }
  }, [settings.scrollSpeed]);

  // Sync volume settings
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setVolume(settings.volume);
    }
  }, [settings.volume]);

  // Sync background dim settings
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setBackgroundDim(settings.backgroundDim);
    }
  }, [settings.backgroundDim]);

  // Sync background blur settings
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setBackgroundBlur(settings.backgroundBlur);
    }
  }, [settings.backgroundBlur]);

  const handleJudgement = useCallback((type: JudgementType, errorMs: number, time: number, weight?: number, count?: number) => {
    updateJudgement(type, errorMs, time, weight, count);
    const { hp, selectedMods } = useGameStore.getState();
    if (selectedMods.includes("NF")) return;
    if (hp <= 0 || (type === "MISS" && selectedMods.includes("SD"))) { failGame(); engineRef.current?.pause(); }
  }, [updateJudgement, failGame]);

  const handleComplete = useCallback(() => { endGame(); }, [endGame]);
  const handleFail = useCallback(() => { failGame(); }, [failGame]);


  useEffect(() => {
    let destroyed = false;

    async function init() {
      if (!containerRef.current) return;

      try {
        // Create PixiJS app
        const app = new PIXI.Application({
          width: window.innerWidth,
          height: window.innerHeight,
          backgroundColor: 0x000000,
          backgroundAlpha: 0,
          antialias: settings.antialias,
          resolution: resolveResolution(settings.renderScale, window.devicePixelRatio),
          autoDensity: true,
        });
        app.ticker.maxFPS = resolveMaxFps(settings.maxFps);
        appRef.current = app;
        containerRef.current.appendChild(app.view as HTMLCanvasElement);

        // 1. Fetch beatmap metadata only if not already in store
        let beatmap = useGameStore.getState().selectedBeatmap;
        if (!beatmap || beatmap.id !== beatmapId) {
          // If we have it in the beatmaps list, use that
          const existing = useGameStore.getState().beatmaps.find(b => b.id === beatmapId);
          if (existing) {
            beatmap = existing;
          } else {
            beatmap = await getBeatmap(beatmapId);
          }
        }

        // 2. Fetch signed URL only if the archive is NOT already cached
        const archiveKey = beatmap.filePath;
        archiveKeyRef.current = archiveKey;
        let loaded: LoadedBeatmapData;
        
        const cached = BeatmapLoader.getCache(archiveKey);
        if (cached) {
          // Archive already in memory, just pick the difficulty
          loaded = cached;
        } else {
          // Not cached, need a signed URL to download
          const urlData = await getBeatmapUrl(beatmapId, "");
          loaded = await BeatmapLoader.load(archiveKey, urlData.url);
        }
        
        // 3. Get parsed data for this specific difficulty
        const parsed = loaded.getDifficulty
          ? loaded.getDifficulty(beatmap.difficultyName, beatmap.keyCount)
          : loaded.difficulties.get(beatmap.difficultyName.toLowerCase());
        if (!parsed) throw new Error(`Difficulty "${beatmap.difficultyName}" not found in archive`);

        // We need NEW note objects because they will be mutated by the engine
        const notes = cloneNotes(parsed.notes);
        const keybinds = beatmap.keyCount === 4 ? settings.keybinds["4k"] : settings.keybinds["7k"];

        if (destroyed) return;

        // 4. Create engine
        const engine = new GameEngine({
          app,
          notes,
          keyCount: beatmap.keyCount,
          od: beatmap.od,
          keybinds: [...keybinds],
          scrollDirection: settings.scrollDirection,
          scrollSpeed: settings.scrollSpeed,
          percyMaxLengthPx: settings.percyMaxLengthPx,
          volume: settings.volume,
          globalOffset: settings.globalOffset,
          mods: useGameStore.getState().selectedMods,
          customRate: useGameStore.getState().customRate,
          callbacks: { onJudgement: handleJudgement, onComplete: handleComplete, onFail: handleFail },
        });

        await engine.init(loaded.audioUrl, settings.volume);
        engine.setBackgroundDim(settings.backgroundDim);
        engine.setBackgroundBlur(settings.backgroundBlur);
        await engine.setBackground(loaded.backgroundUrl);
        if (destroyed) { engine.destroy(); return; }
        
        engineRef.current = engine;
        setIsInitialized(true);

        // Force background music stop just before starting engine
        useMusicStore.getState().pauseMusic();

        startGame({
          id: beatmap.id,
          title: beatmap.title, artist: beatmap.artist, creator: beatmap.creator,
          difficultyName: beatmap.difficultyName, keyCount: beatmap.keyCount,
          od: beatmap.od, hp: beatmap.hp, bpm: beatmap.bpm,
          lengthMs: beatmap.lengthSeconds * 1000, notes, audioUrl: loaded.audioUrl,
          backgroundUrl: loaded.backgroundUrl || "",
        });

        // Start if status is playing
        if (!destroyed && useGameStore.getState().status === "playing") {
          engine.start();
        } else if (useGameStore.getState().status === "paused") {
          engine.start();
          engine.pause();
        }
        
        onReady?.();
      } catch (err: unknown) {
        if (!destroyed) setError(err instanceof Error ? err.message : "Failed to load");
      }
    }

    init();

    return () => {
      destroyed = true;
      engineRef.current?.destroy();
      if (appRef.current) {
        appRef.current.destroy(true);
        appRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beatmapId]);


  if (error) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-lanify-bg z-50">
        <div className="text-center p-8">
          <p className="text-lanify-danger font-game-display text-lg mb-2">Error</p>
          <p className="text-lanify-text-secondary text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div ref={containerRef} className="fixed inset-0 z-20" />
      <SkipButton visible={showSkip} onSkip={handleSkip} />
    </>
  );
}
