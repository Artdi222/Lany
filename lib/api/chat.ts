import { apiClient } from "./client";

export interface ChatUser {
  id: string;
  username: string;
  avatarUrl: string | null;
}

export interface ChatMessage {
  id: number;
  senderId: string;
  text: string;
  createdAt: string;
}

export const getChats = (token: string) => apiClient<ChatUser[]>("/users/me/chats", { token });
export const getMessages = (token: string, userId: string, after = 0) =>
  apiClient<ChatMessage[]>(`/users/me/chats/${userId}?after=${after}`, { token });
export const sendMessage = (token: string, userId: string, text: string) =>
  apiClient<ChatMessage>(`/users/me/chats/${userId}`, { method: "POST", token, body: { text } });
