import type { LeaderboardEntry } from '@/types/game';
import { apiClient } from './client';

/** Get leaderboard for a specific beatmap. `mods` (acronyms) = only scores with exactly that mod set. */
export async function getLeaderboard(
  beatmapId: string,
  scope: 'GLOBAL' | 'LOCAL' | 'FRIENDS' = 'GLOBAL',
  token?: string | null,
  mods?: readonly string[],
): Promise<LeaderboardEntry[]> {
  const query = mods ? `?mods=${encodeURIComponent(JSON.stringify(mods))}` : '';
  if (scope !== 'GLOBAL' && token) {
    return apiClient<LeaderboardEntry[]>(`/leaderboard/${beatmapId}/${scope.toLowerCase()}${query}`, { token });
  }
  return apiClient<LeaderboardEntry[]>(`/leaderboard/${beatmapId}${query}`);
}

/** Get global leaderboard */
export async function getGlobalLeaderboard(): Promise<LeaderboardEntry[]> {
  return apiClient<LeaderboardEntry[]>('/leaderboard/global');
}
