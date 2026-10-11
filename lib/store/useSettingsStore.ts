import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GameSettings, ScrollDirection } from '@/types/game';
import { DEFAULT_SETTINGS } from '@/types/game';

interface SettingsState extends GameSettings {
  setScrollSpeed: (speed: number) => void;
  setScrollDirection: (dir: ScrollDirection) => void;
  setGlobalOffset: (offset: number) => void;
  setBackgroundDim: (dim: number) => void;
  setBackgroundBlur: (blur: number) => void;
  setVolume: (vol: number) => void;
  setAntialias: (on: boolean) => void;
  setRenderScale: (scale: number) => void;
  setMaxFps: (fps: number) => void;
  setReduceMotion: (mode: GameSettings['reduceMotion']) => void;
  setShowFps: (on: boolean) => void;
  setKeybind: (mode: '4k' | '7k', index: number, key: string) => void;
  setSelectionSortBy: (s: 'title' | 'artist' | 'starRating' | 'bpm') => void;
  setSelectionGroupBy: (g: 'NONE' | 'ARTIST' | 'DIFFICULTY') => void;
  setSelectionStarRange: (min: number, max: number) => void;
  setLastSelectedBeatmapId: (id: string | null) => void;
  setKeyMode: (mode: 4 | 7) => void;
  setPercyMaxLength: (px: number) => void;
  resetSettings: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,

      setScrollSpeed: (speed) => set({ scrollSpeed: Math.max(1, Math.min(40, speed)) }),
      setScrollDirection: (dir) => set({ scrollDirection: dir }),
      setGlobalOffset: (offset) => set({ globalOffset: offset }),
      setBackgroundDim: (dim) => set({ backgroundDim: Math.max(0, Math.min(100, dim)) }),
      setBackgroundBlur: (blur) => set({ backgroundBlur: Math.max(0, Math.min(100, blur)) }),
      setVolume: (vol) => set({ volume: Math.max(0, Math.min(1, vol)) }),
      setAntialias: (on) => set({ antialias: on }),
      setRenderScale: (scale) => set({ renderScale: scale }),
      setMaxFps: (fps) => set({ maxFps: fps }),
      setReduceMotion: (mode) => set({ reduceMotion: mode }),
      setShowFps: (on) => set({ showFps: on }),
      setKeybind: (mode, index, key) =>
        set((state) => {
          const newBinds = { ...state.keybinds };
          if (mode === '4k') {
            const arr = [...newBinds['4k']] as [string, string, string, string];
            arr[index] = key;
            newBinds['4k'] = arr;
          } else {
            const arr = [...newBinds['7k']] as [string, string, string, string, string, string, string];
            arr[index] = key;
            newBinds['7k'] = arr;
          }
          return { keybinds: newBinds };
        }),
      setSelectionSortBy: (s) => set({ selectionSortBy: s }),
      setSelectionGroupBy: (g) => set({ selectionGroupBy: g }),
      setSelectionStarRange: (min, max) => set({ selectionStarMin: min, selectionStarMax: max }),
      setLastSelectedBeatmapId: (id) => set({ lastSelectedBeatmapId: id }),
      setKeyMode: (keyMode) => set({ keyMode }),
      setPercyMaxLength: (px) => set({ percyMaxLengthPx: Math.max(0, px) }),
      resetSettings: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: 'lanify-settings',
    }
  )
);
