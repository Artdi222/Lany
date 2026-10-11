import { create } from "zustand";
import { toast } from "sonner";

export interface AppNotification {
  id: number;
  text: string;
  kind: "success" | "error";
  read: boolean;
}

interface NotificationState {
  items: AppNotification[];
  push: (text: string, kind: AppNotification["kind"]) => void;
  dismiss: (id: number) => void;
  markAllRead: () => void;
  clear: () => void;
}

let nextId = 1;

// ponytail: client-only, lost on reload; add a backend table when server-side events exist.
export const useNotificationStore = create<NotificationState>((set) => ({
  items: [],
  push: (text, kind) =>
    set((s) => ({ items: [{ id: nextId++, text, kind, read: false }, ...s.items] })),
  dismiss: (id) => set((s) => ({ items: s.items.filter((n) => n.id !== id) })),
  markAllRead: () => set((s) => ({ items: s.items.map((n) => (n.read ? n : { ...n, read: true })) })),
  clear: () => set({ items: [] }),
}));

/** Toast now, and keep it in the notification panel. */
export function notify(text: string, kind: AppNotification["kind"] = "success") {
  toast[kind](text);
  useNotificationStore.getState().push(text, kind);
}
