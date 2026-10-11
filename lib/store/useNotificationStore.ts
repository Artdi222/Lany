import { create } from "zustand";
import { toast } from "sonner";
import { apiClient } from "@/lib/api/client";
import { useAuthStore } from "./useAuthStore";

export interface AppNotification {
  /** "l<n>" = this tab only (toast mirrors), "s<n>" = stored on the server. */
  id: string;
  text: string;
  kind: "success" | "error";
  read: boolean;
}

interface ServerNotification {
  id: number;
  text: string;
  read: boolean;
}

interface NotificationState {
  items: AppNotification[];
  push: (text: string, kind: AppNotification["kind"]) => void;
  sync: (token: string) => Promise<void>;
  dismiss: (id: string) => void;
  markAllRead: () => void;
  clear: () => void;
  /** Signed out: drop the previous account's server notifications. */
  reset: () => void;
}

let nextId = 1;
// Highest server id already seen; null until the first sync, so old notifications do not toast on load.
let lastServerId: number | null = null;

const isServer = (n: AppNotification) => n.id.startsWith("s");
const token = () => useAuthStore.getState().token;
const call = (path: string, method: "POST" | "DELETE") => {
  const t = token();
  if (t) apiClient(path, { method, token: t }).catch(() => {});
};

export const useNotificationStore = create<NotificationState>((set, get) => ({
  items: [],
  push: (text, kind) =>
    set((s) => ({ items: [{ id: `l${nextId++}`, text, kind, read: false }, ...s.items] })),
  sync: async (t) => {
    const rows = await apiClient<ServerNotification[]>("/users/me/notifications", { token: t });
    const fresh = lastServerId === null ? [] : rows.filter((r) => r.id > lastServerId!);
    lastServerId = Math.max(lastServerId ?? 0, ...rows.map((r) => r.id));
    fresh.forEach((r) => toast(r.text));
    const server: AppNotification[] = rows.map((r) => ({ id: `s${r.id}`, text: r.text, kind: "success", read: r.read }));
    // ponytail: local items first, then server ones; no timestamp merge until ordering complaints show up.
    set({ items: [...get().items.filter((n) => !isServer(n)), ...server] });
  },
  dismiss: (id) => {
    if (id.startsWith("s")) call(`/users/me/notifications/${id.slice(1)}`, "DELETE");
    set((s) => ({ items: s.items.filter((n) => n.id !== id) }));
  },
  markAllRead: () => {
    if (get().items.some((n) => isServer(n) && !n.read)) call("/users/me/notifications/read", "POST");
    set((s) => ({ items: s.items.map((n) => (n.read ? n : { ...n, read: true })) }));
  },
  clear: () => {
    if (get().items.some(isServer)) call("/users/me/notifications", "DELETE");
    set({ items: [] });
  },
  reset: () => {
    lastServerId = null;
    set((s) => ({ items: s.items.filter((n) => !isServer(n)) }));
  },
}));

/** Toast now, and keep it in the notification panel (this tab only). */
export function notify(text: string, kind: AppNotification["kind"] = "success") {
  toast[kind](text);
  useNotificationStore.getState().push(text, kind);
}
