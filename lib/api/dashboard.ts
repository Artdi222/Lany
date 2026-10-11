import { apiClient } from "./client";

/** A user as shown on a dashboard card (friends, currently online, user search). */
export interface UserCard {
  id: string;
  username: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  country: string | null;
  totalPp: number;
  lastSeenAt: string | null;
  online: boolean;
  /** What an online user is doing ("Choosing a beatmap", ...); null when offline. */
  activity: string | null;
  /** Friends list only: they follow back. */
  mutual?: boolean;
}

export const getFriends = (token: string) => apiClient<UserCard[]>("/users/me/friends", { token });
export const getOnlineUsers = () => apiClient<UserCard[]>("/users/online");
export const searchUsers = (q: string) => apiClient<UserCard[]>(`/users/search?q=${encodeURIComponent(q)}`);

export const addFriend = (token: string, id: string) => apiClient(`/users/me/friends/${id}`, { method: "POST", token });
export const removeFriend = (token: string, id: string) => apiClient(`/users/me/friends/${id}`, { method: "DELETE", token });

export const sendHeartbeat = (token: string, activity: string) =>
  apiClient("/users/me/heartbeat", { method: "POST", token, body: { activity } });
