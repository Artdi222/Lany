/** Judgement types for osu!mania gameplay */
export type JudgementType = 'MARVELOUS' | 'PERFECT' | 'GREAT' | 'GOOD' | 'BAD' | 'MISS';

/** Judgement colors for display */
export const JUDGEMENT_COLORS: Record<JudgementType, string> = {
  MARVELOUS: '#00e5ff',
  PERFECT: '#ffd700',
  GREAT: '#00ff88',
  GOOD: '#3366cc',
  BAD: '#ff8800',
  MISS: '#ff4444',
};

/** Judgement display names */
export const JUDGEMENT_LABELS: Record<JudgementType, string> = {
  MARVELOUS: 'MARVELOUS',
  PERFECT: 'PERFECT',
  GREAT: 'GREAT',
  GOOD: 'GOOD',
  BAD: 'BAD',
  MISS: 'MISS',
};

/** Game status states */
export type GameStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'resuming' | 'failed' | 'complete';

/** Scroll direction for notes */
export type ScrollDirection = 'down' | 'up';

/** Judgement counts */
export interface JudgementCounts {
  marvelous: number;
  perfect: number;
  great: number;
  good: number;
  bad: number;
  miss: number;
}

/** Accuracy history point for graph */
export interface AccuracyPoint {
  time: number;
  accuracy: number;
}

/** Hit error data point */
export interface HitError {
  time: number;
  errorMs: number;
}

/** Parsed beatmap data ready for gameplay */
export interface ParsedBeatmap {
  id: string;
  title: string;
  artist: string;
  creator: string;
  difficultyName: string;
  keyCount: number;
  od: number;
  hp: number;
  bpm: number;
  lengthMs: number;
  notes: ParsedNote[];
  audioUrl: string;
  backgroundUrl: string;
}

/** Individual note in parsed format */
export interface ParsedNote {
  column: number;
  startTime: number;
  endTime: number; // same as startTime for regular notes
  isHoldNote: boolean;
  hit: boolean;
  judgement: JudgementType | null;
  // Hold-specific fields
  headHit?: boolean;
  tailHit?: boolean;
  isActiveHold?: boolean;
  nextTickTime?: number;
  ticksHit?: number;
  totalTicks?: number;
  holdMissed?: boolean;
}

/** Score data for result screen and submission */
export interface ScoreData {
  beatmapId: string;
  score: number;
  accuracy: number;
  maxCombo: number;
  judgements: JudgementCounts;
  accuracyHistory: AccuracyPoint[];
  hitErrors: HitError[];
  rank: RankGrade;
}

/** Grade ranks */
export type RankGrade = 'SS' | 'S' | 'A' | 'B' | 'C' | 'D';

/** Grade colors */
export const RANK_COLORS: Record<RankGrade, string> = {
  SS: '#ffd700',
  S: '#c0c0c0',
  A: '#00ff88',
  B: '#3399ff',
  C: '#7C3AED',
  D: '#ff4444',
};

/** Leaderboard entry from backend */
export interface LeaderboardEntry {
  position: number;
  id: string;
  userId: string;
  username: string;
  avatarUrl: string | null;
  score: number;
  accuracy: number;
  maxCombo: number;
  rank: RankGrade;
  judgements: JudgementCounts;
  accuracyHistory: string | null;
  hitErrors: string | null;
  mods: string | null;
  submittedAt: string;
  pp?: number;
}

/** Settings store shape */
export interface GameSettings {
  scrollSpeed: number;
  scrollDirection: ScrollDirection;
  globalOffset: number;
  backgroundDim: number;
  backgroundBlur: number;
  volume: number;
  /** Graphics (read when a map starts). */
  antialias: boolean;
  /** Render resolution multiplier; 0 = auto (device pixel ratio). */
  renderScale: number;
  /** Frame cap in fps; 0 = unlimited. */
  maxFps: number;
  /** Animasi dekoratif: 'system' ikut prefers-reduced-motion. */
  reduceMotion: 'system' | 'on' | 'off';
  /** Indikator FPS/ms di pojok kanan bawah (debug). */
  showFps: boolean;
  keybinds: {
    '4k': [string, string, string, string];
    '7k': [string, string, string, string, string, string, string];
  };
  selectionSortBy: 'title' | 'artist' | 'starRating' | 'bpm';
  selectionGroupBy: 'NONE' | 'ARTIST' | 'DIFFICULTY';
  selectionStarMin: number;
  selectionStarMax: number;
  lastSelectedBeatmapId: string | null;
  /** Top-bar mode switch: song select only lists maps with this key count. */
  keyMode: 4 | 7;
  percyMaxLengthPx: number;
}

/** Default game settings */
export const DEFAULT_SETTINGS: GameSettings = {
  scrollSpeed: 20,
  scrollDirection: 'down',
  globalOffset: 0,
  backgroundDim: 60,
  backgroundBlur: 0,
  volume: 0.8,
  antialias: true,
  renderScale: 0,
  maxFps: 0,
  reduceMotion: 'system',
  showFps: false,
  keybinds: {
    '4k': ['d', 'f', 'j', 'k'],
    '7k': ['s', 'd', 'f', ' ', 'j', 'k', 'l'],
  },
  selectionSortBy: 'title',
  selectionGroupBy: 'NONE',
  selectionStarMin: 0,
  selectionStarMax: 10,
  lastSelectedBeatmapId: null,
  keyMode: 4,
  percyMaxLengthPx: 99999, // ponytail: Infinity breaks JSON.stringify (zustand persist), 99999 is larger than any screen
};

/** Star rating color mapping */
export function getStarRatingColor(stars: number): string {
  if (stars < 2) return '#4caf50';    // Green < 2
  if (stars < 3) return '#ffeb3b';    // Yellow 2-3
  if (stars < 4) return '#ff9800';    // Orange 3-4
  if (stars < 5) return '#f44336';    // Red 4-5
  return '#9c27b0';                   // Purple 5+
}

/** Format seconds to mm:ss */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Random gameplay tips */
export const GAMEPLAY_TIPS = [
  "Press Escape to pause during gameplay",
  "Adjust scroll speed in settings to match your comfort",
  "Focus on accuracy over speed",
  "Hold notes require you to keep the key pressed",
  "Use the audio offset setting if notes feel out of sync",
  "Try different scroll directions in settings",
  "Practice with easier maps first to build muscle memory",
  "Your timing window is based on the map's OD value",
];
