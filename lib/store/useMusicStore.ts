import { create } from "zustand";
import type { Beatmap } from "@/types/beatmap";
import { listBeatmaps, getBeatmapUrl } from "@/lib/api/beatmaps";
import { BeatmapLoader } from "@/lib/game/BeatmapLoader";

interface MusicState {
  playlist: Beatmap[];
  currentIndex: number;
  isPlaying: boolean;
  shuffle: boolean;
  currentAudio: HTMLAudioElement | null;
  volume: number;
  lastRequestId: string;
  currentBeatmapId: string | null;
  
  // Actions
  initPlaylist: () => Promise<void>;
  playRandom: () => Promise<void>;
  playBeatmap: (beatmap: Beatmap) => Promise<void>;
  togglePlay: () => void;
  toggleShuffle: () => void;
  /** Jump to a fraction (0-1) of the current track. */
  seek: (fraction: number) => void;
  pauseMusic: () => void;
  next: () => void;
  previous: () => void;
  setVolume: (v: number) => void;
}

export const useMusicStore = create<MusicState>((set, get) => {
  // Create a single audio instance to reuse
  const audio = typeof window !== "undefined" ? new Audio() : null;
  if (audio) {
    audio.loop = true;
  }

  return {
    playlist: [],
    currentIndex: -1,
    isPlaying: false,
    shuffle: false,
    currentAudio: audio,
    volume: 0.3,
    lastRequestId: "",
    currentBeatmapId: null,

    initPlaylist: async () => {
      if (get().playlist.length > 0) return;
      try {
        const res = await listBeatmaps(1, 10000);
        
        // Group by Title + Artist to show only unique songs
        const uniquePlaylist: Beatmap[] = [];
        const seen = new Set<string>();
        
        for (const b of res.data) {
          const key = `${b.title}-${b.artist}`;
          if (!seen.has(key)) {
            seen.add(key);
            uniquePlaylist.push(b);
          }
        }

        set({ playlist: uniquePlaylist });
      } catch (err) {
        console.error("Failed to init music playlist:", err);
      }
    },

    playBeatmap: async (beatmap: Beatmap) => {
      const { currentAudio, volume, playlist, currentBeatmapId, isPlaying } = get();
      if (!currentAudio) return;

      // If already loaded this exact beatmap, just handle play/pause/retry
      if (currentBeatmapId === beatmap.id) {
        if (!isPlaying) {
          currentAudio.play().catch(e => console.warn("Music play blocked:", e));
          set({ isPlaying: true });
        } else {
          // If already playing, this might be a 'retry' or manual select: just reset position
          currentAudio.currentTime = 0;
        }
        return;
      }
      
      // Stop current and clear for new source
      currentAudio.pause();
      const playRequestId = Math.random().toString(36).substring(7);
      // Index (sumber cover/judul di UI) diisi sekarang, bukan setelah arsip selesai diunduh (bisa >10 s).
      const index = playlist.findIndex(b => b.title === beatmap.title && b.artist === beatmap.artist);
      set({ lastRequestId: playRequestId, currentIndex: index });

      try {
        const archiveKey = beatmap.filePath;
        let data;
        const cached = BeatmapLoader.getCache(archiveKey);
        
        if (cached) {
          data = cached;
        } else {
          const { url: signedUrl } = await getBeatmapUrl(beatmap.id, "");
          data = await BeatmapLoader.load(archiveKey, signedUrl);
        }
        
        // If a newer request has started, stop here
        if (get().lastRequestId !== playRequestId) return;

        // Update source and ID
        currentAudio.src = data.audioUrl;
        currentAudio.volume = volume;
        
        set({ isPlaying: true, currentBeatmapId: beatmap.id });

        const playPromise = currentAudio.play();
        if (playPromise !== undefined) {
          playPromise.catch(e => {
            if (e.name !== "NotAllowedError") return;
            // Autoplay blocked until the first user gesture: play then instead of staying silent.
            const retry = () => {
              window.removeEventListener("pointerdown", retry);
              window.removeEventListener("keydown", retry);
              if (get().isPlaying && currentAudio.paused) currentAudio.play().catch(() => {});
            };
            window.addEventListener("pointerdown", retry);
            window.addEventListener("keydown", retry);
          });
        }
      } catch (err) {
        if (get().lastRequestId === playRequestId) {
          console.error("Failed to play music:", err);
        }
      }
    },


  playRandom: async () => {
    let { playlist } = get();
    if (playlist.length === 0) {
      await get().initPlaylist();
      playlist = get().playlist;
    }
    if (playlist.length === 0) return;
    
    const random = playlist[Math.floor(Math.random() * playlist.length)];
    await get().playBeatmap(random);
  },

  togglePlay: () => {
    const { currentAudio, isPlaying } = get();
    if (!currentAudio) return;
    
    if (isPlaying) {
      currentAudio.pause();
    } else {
      currentAudio.play().catch(e => {
        if (e.name !== "AbortError") {
          console.warn("Music play blocked:", e);
        }
      });
    }
    set({ isPlaying: !isPlaying });
  },

  pauseMusic: () => {
    const { currentAudio } = get();
    if (currentAudio) {
      currentAudio.pause();
    }
    set({ isPlaying: false });
  },

  toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),

  seek: (fraction) => {
    const { currentAudio } = get();
    if (currentAudio?.duration) currentAudio.currentTime = fraction * currentAudio.duration;
  },

  next: () => {
    const { playlist, currentIndex, shuffle } = get();
    if (playlist.length === 0) return;
    const nextIndex = shuffle ? Math.floor(Math.random() * playlist.length) : (currentIndex + 1) % playlist.length;
    get().playBeatmap(playlist[nextIndex]);
  },

  previous: () => {
    const { playlist, currentIndex } = get();
    if (playlist.length === 0) return;
    const prevIndex = (currentIndex - 1 + playlist.length) % playlist.length;
    get().playBeatmap(playlist[prevIndex]);
  },

  setVolume: (v: number) => {
    const { currentAudio } = get();
    if (currentAudio) currentAudio.volume = v;
    set({ volume: v });
  }
};
});
