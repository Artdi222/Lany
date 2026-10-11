import { apiClient } from "./client";
import type { User } from "@/types/user";
import type { RankGrade } from "@/types/game";

export interface UserStats {
  playCount: number;
  avgAccuracy: number;
}

export interface UserProfileResponse extends User {
  globalRank: number;
  countryRank: number | null;
  stats: UserStats;
}

/** Fetch user profile and stats by user ID */
export async function getUserProfile(id: string): Promise<UserProfileResponse> {
  return apiClient<UserProfileResponse>(`/users/${id}`);
}

/** Update current user's profile (username and/or avatarUrl) */
export async function updateProfile(
  token: string,
  payload: { username?: string; avatarUrl?: string; bannerUrl?: string; country?: string }
): Promise<User> {
  return apiClient<User>("/users/me", {
    method: "PUT",
    body: payload,
    token,
  });
}

export interface RankingEntry {
  id: string;
  rank: number;
  username: string;
  avatarUrl: string | null;
  country: string | null;
  totalPp: number;
  accuracy: number;
  playCount: number;
  ss: number;
  s: number;
  a: number;
}

export interface CountryRankingEntry {
  rank: number;
  country: string;
  activeUsers: number;
  playCount: number;
  performance: number;
  avgPerformance: number;
}

export function getRankings(page = 1, country?: string) {
  return apiClient<{ page: number; pageCount: number; entries: RankingEntry[] }>(`/users/rankings?page=${page}${country ? `&country=${country}` : ""}`);
}

export function getCountryRankings() {
  return apiClient<CountryRankingEntry[]>("/users/rankings/countries");
}

export interface UserBestScore {
  id: string;
  beatmapId: string;
  title: string;
  artist: string;
  difficultyName: string;
  keyCount: number;
  coverUrl: string | null;
  score: number;
  accuracy: number;
  maxCombo: number;
  pp: number;
  /** 0.95^i, the share of `pp` counted in the player's total. */
  weight: number;
  rank: RankGrade;
  mods: string | null;
  submittedAt: string;
  first: boolean;
}

/** Best pp score per ranked beatmap (max 100), highest first. */
export function getUserBestScores(id: string) {
  return apiClient<UserBestScore[]>(`/users/${id}/scores`);
}

/** Upload an avatar/banner image (any signed-in user); returns the storage path. */
export async function uploadProfileImage(token: string, file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000"}/users/me/image`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || json.message || `Upload failed: ${res.statusText}`);
  return json.data.filePath;
}
