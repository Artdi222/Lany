import { create } from "zustand";
import { apiClient } from "@/lib/api/client";
import { useAuthStore } from "./useAuthStore";

export interface Collection {
  id: number;
  name: string;
  beatmapIds: string[];
}

interface CollectionState {
  collections: Collection[];
  /** Song select filter; null = all beatmaps. */
  activeId: number | null;
  load: () => Promise<void>;
  setActive: (id: number | null) => void;
  create: (name: string) => Promise<Collection | null>;
  toggleBeatmap: (collectionId: number, beatmapId: string) => void;
}

const token = () => useAuthStore.getState().token;

export const useCollectionStore = create<CollectionState>((set, get) => ({
  collections: [],
  activeId: null,
  load: async () => {
    const t = token();
    if (!t) return set({ collections: [], activeId: null });
    const collections = await apiClient<Collection[]>("/users/me/collections", { token: t });
    set((s) => ({ collections, activeId: collections.some((c) => c.id === s.activeId) ? s.activeId : null }));
  },
  setActive: (activeId) => set({ activeId }),
  create: async (name) => {
    const t = token();
    if (!t) return null;
    const c = await apiClient<Collection>("/users/me/collections", { method: "POST", token: t, body: { name } });
    set((s) => ({ collections: [...s.collections, c].sort((a, b) => a.name.localeCompare(b.name)) }));
    return c;
  },
  // Optimistic: the list updates at once; a failed request is fixed by the next load().
  toggleBeatmap: (collectionId, beatmapId) => {
    const t = token();
    const c = get().collections.find((x) => x.id === collectionId);
    if (!t || !c) return;
    const has = c.beatmapIds.includes(beatmapId);
    apiClient(`/users/me/collections/${collectionId}/beatmaps/${beatmapId}`, { method: has ? "DELETE" : "POST", token: t }).catch(() =>
      get().load().catch(() => {}),
    );
    set((s) => ({
      collections: s.collections.map((x) =>
        x.id !== collectionId ? x : { ...x, beatmapIds: has ? x.beatmapIds.filter((id) => id !== beatmapId) : [...x.beatmapIds, beatmapId] },
      ),
    }));
  },
}));
