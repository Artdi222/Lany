import { create } from 'zustand';
import type {
  GameStatus,
  JudgementCounts,
  AccuracyPoint,
  HitError,
  ParsedBeatmap,
  JudgementType,
  RankGrade,
  LeaderboardEntry,
} from '@/types/game';
import type { Beatmap } from '@/types/beatmap';
import { applyJudgement, maxScoreUnits as computeMaxScoreUnits } from '@/lib/game/JudgementState';
import { hpLossScale, scoreMultiplier, speedRange, type ModAcronym } from '@/lib/game/Mods';

interface GameState {
  status: GameStatus;
  score: number;
  combo: number;
  maxCombo: number;
  accuracy: number;
  judgements: JudgementCounts;
  hp: number;
  accuracyHistory: AccuracyPoint[];
  hitErrors: HitError[];
  currentBeatmap: ParsedBeatmap | null;
  selectedBeatmapId: string | null;
  selectedBeatmap: Beatmap | null;
  beatmaps: Beatmap[];
  latestJudgement: { type: JudgementType; time: number } | null;
  isReadOnly: boolean;
  /** Who/when/pp of a score opened from a leaderboard; null for the player's own fresh play. */
  viewingMeta: { scoreId: string; mods: string | null; username: string; avatarUrl: string | null; submittedAt: string; pp: number | null } | null;
  retryTrigger: number;
  /** Score denominator for the current chart, computed once in startGame (not per hit). */
  maxScoreUnits: number;
  /** Mods picked in song select; used by the next play, its score submit and result screen. */
  selectedMods: ModAcronym[];
  /** Customise: speed-mod rate set on the slider; null = the mod's default. Non-default = unranked. */
  customRate: number | null;

  leaderboardCache: Record<string, { entries: LeaderboardEntry[]; timestamp: number }>;

  // Actions
  setBeatmaps: (beatmaps: Beatmap[]) => void;
  setSelectedMods: (mods: ModAcronym[]) => void;
  setCustomRate: (rate: number | null) => void;
  setSelectedBeatmap: (beatmap: Beatmap | null) => void;
  startGame: (beatmap: ParsedBeatmap) => void;
  pauseGame: () => void;
  resumeGame: () => void;
  startResuming: () => void;
  failGame: () => void;
  endGame: () => void;
  /** `count` applies several identical judgements at once (a hold's head + tail + ticks). */
  updateJudgement: (type: JudgementType, errorMs: number, time: number, weight?: number, count?: number) => void;
  updateHp: (hp: number) => void;
  resetGame: () => void;
  retryGame: () => void;
  setSelectedBeatmapId: (id: string | null) => void;
  setViewingScore: (entry: LeaderboardEntry, beatmap?: Beatmap | null) => void;
  setLeaderboardCache: (key: string, entries: LeaderboardEntry[]) => void;
  invalidateLeaderboardCache: (beatmapId?: string) => void;
}

const initialJudgements: JudgementCounts = {
  marvelous: 0,
  perfect: 0,
  great: 0,
  good: 0,
  bad: 0,
  miss: 0,
};

function calculateRank(accuracy: number): RankGrade {
  if (accuracy >= 100) return 'SS';
  if (accuracy >= 95) return 'S';
  if (accuracy >= 90) return 'A';
  if (accuracy >= 80) return 'B';
  if (accuracy >= 70) return 'C';
  return 'D';
}

export const useGameStore = create<GameState>()((set, get) => ({
  status: 'idle',
  score: 0,
  combo: 0,
  maxCombo: 0,
  accuracy: 100,
  judgements: { ...initialJudgements },
  hp: 100,
  accuracyHistory: [],
  hitErrors: [],
  currentBeatmap: null,
  selectedBeatmapId: null,
  selectedBeatmap: null,
  beatmaps: [],
  latestJudgement: null,
  isReadOnly: false,
  viewingMeta: null,
  retryTrigger: 0,
  maxScoreUnits: 0,
  selectedMods: [],
  customRate: null,

  setBeatmaps: (beatmaps) => set({ beatmaps }),
  // A different (or no) speed mod drops the custom rate, like lazer resetting the mod's settings.
  setSelectedMods: (selectedMods) =>
    set((s) => (speedRange(s.selectedMods)?.mod === speedRange(selectedMods)?.mod ? { selectedMods } : { selectedMods, customRate: null })),
  setCustomRate: (customRate) => set({ customRate }),
  setSelectedBeatmap: (selectedBeatmap) => set({ selectedBeatmap, selectedBeatmapId: selectedBeatmap?.id || null }),

  startGame: (beatmap) =>
    set({
      status: 'playing',
      score: 0,
      combo: 0,
      maxCombo: 0,
      accuracy: 100,
      judgements: { ...initialJudgements },
      hp: 100,
      accuracyHistory: [],
      hitErrors: [],
      currentBeatmap: beatmap,
      maxScoreUnits: computeMaxScoreUnits(beatmap.notes),
      selectedBeatmapId: beatmap.id,
      latestJudgement: null,
      isReadOnly: false,
      viewingMeta: null,
    }),

  pauseGame: () => set({ status: 'paused' }),
  resumeGame: () => set({ status: 'playing' }),
  startResuming: () => set({ status: 'resuming' }),
  failGame: () => set({ status: 'failed' }),
  endGame: () => set({ status: 'complete' }),

  updateJudgement: (type, errorMs, time, weight = 1, count = 1) => {
    const state = get();
    const maxUnits = state.maxScoreUnits || computeMaxScoreUnits(state.currentBeatmap?.notes);
    const mods = state.selectedMods;
    const next = applyJudgement(state, type, weight, count, maxUnits, hpLossScale(mods), scoreMultiplier(mods));

    // History is append-only and only read after the run (result page, score submit), so it is
    // pushed in place instead of copying the whole array on every hit. A fresh array is created by
    // startGame / retryGame / resetGame, so nothing from a previous run is ever mutated.
    state.accuracyHistory.push({ time, accuracy: next.accuracy });
    if (type !== 'MISS') {
      for (let i = 0; i < count; i++) state.hitErrors.push({ time, errorMs });
    }

    set({
      ...next,
      maxScoreUnits: maxUnits,
      latestJudgement: { type, time: Date.now() },
    });
  },

  updateHp: (hp) => set({ hp: Math.max(0, Math.min(100, hp)) }),

  resetGame: () =>
    set({
      status: 'idle',
      score: 0,
      combo: 0,
      maxCombo: 0,
      accuracy: 100,
      judgements: { ...initialJudgements },
      hp: 100,
      accuracyHistory: [],
      hitErrors: [],
      currentBeatmap: null,
      maxScoreUnits: 0,
      latestJudgement: null,
      isReadOnly: false,
      viewingMeta: null,
      retryTrigger: 0,
    }),

  retryGame: () =>
    set((state) => ({
      status: 'playing',
      score: 0,
      combo: 0,
      maxCombo: 0,
      accuracy: 100,
      judgements: { ...initialJudgements },
      hp: 100,
      accuracyHistory: [],
      hitErrors: [],
      latestJudgement: null,
      isReadOnly: false,
      viewingMeta: null,
      retryTrigger: state.retryTrigger + 1,
    })),

  setSelectedBeatmapId: (id) => set({ selectedBeatmapId: id }),

  setViewingScore: (entry, beatmap) =>
    set({
      score: entry.score,
      accuracy: entry.accuracy,
      maxCombo: entry.maxCombo,
      judgements: { ...entry.judgements },
      accuracyHistory: typeof entry.accuracyHistory === 'string' ? JSON.parse(entry.accuracyHistory) : [],
      hitErrors: typeof entry.hitErrors === 'string' ? JSON.parse(entry.hitErrors) : [],
      isReadOnly: true,
      viewingMeta: { scoreId: entry.id, mods: entry.mods, username: entry.username, avatarUrl: entry.avatarUrl, submittedAt: entry.submittedAt, pp: entry.pp ?? null },
      status: 'complete',
      currentBeatmap: beatmap
        ? {
            id: beatmap.id,
            title: beatmap.title,
            artist: beatmap.artist,
            creator: beatmap.creator,
            difficultyName: beatmap.difficultyName,
            keyCount: beatmap.keyCount,
            od: beatmap.od,
            hp: beatmap.hp,
            bpm: beatmap.bpm,
            lengthMs: beatmap.lengthSeconds * 1000,
            notes: [],
            audioUrl: '',
            backgroundUrl: beatmap.coverUrl || '',
          }
        : get().currentBeatmap,
    }),

  leaderboardCache: {},

  setLeaderboardCache: (key, entries) =>
    set((state) => ({
      leaderboardCache: {
        ...state.leaderboardCache,
        [key]: { entries, timestamp: Date.now() },
      },
    })),

  invalidateLeaderboardCache: (beatmapId) => {
    if (!beatmapId) {
      set({ leaderboardCache: {} });
      return;
    }
    set((state) => {
      const newCache = { ...state.leaderboardCache };
      // Mark stale instead of deleting: the old list stays on screen while the refetch runs.
      Object.keys(newCache).forEach((key) => {
        if (key.startsWith(beatmapId)) {
          newCache[key] = { ...newCache[key], timestamp: 0 };
        }
      });
      return { leaderboardCache: newCache };
    });
  },
}));

export { calculateRank };
