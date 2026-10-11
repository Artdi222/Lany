"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Play, LogIn, LogOut, Lightbulb, Settings as SettingsIcon } from "lucide-react";
import SettingsDrawer from "@/components/game/shared/SettingsDrawer";
import { LogoButton } from "@/components/menu/LogoButton";
import { SkewedPanel } from "@/components/ui/SkewedPanel";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { useSettingsStore } from "@/lib/store/useSettingsStore";
import { useMusicStore } from "@/lib/store/useMusicStore";
import { useGameStore } from "@/lib/store/useGameStore";
import { GAMEPLAY_TIPS } from "@/types/game";

const MENU_BACKGROUNDS = ["/background/BG-1.webp", "/background/BG-2.webp"];

export default function MainMenuPage() {
  const router = useRouter();
  const { isGuest, logout } = useAuthStore();
  const globalOffset = useSettingsStore((s) => s.globalOffset);
  const isPlaying = useMusicStore((s) => s.isPlaying);
  // Hanya beatmap yang dipilih di selector yang mengganti art maskot; lagu acak menu tidak.
  const coverUrl = useGameStore((s) => s.selectedBeatmap?.coverUrl) ?? null;
  const [mounted, setMounted] = useState(false);
  const [isMenuExpanded, setIsMenuExpanded] = useState(false);
  const [tip, setTip] = useState("");
  const [mascotBg, setMascotBg] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    setTip(GAMEPLAY_TIPS[Math.floor(Math.random() * GAMEPLAY_TIPS.length)]);
    setMascotBg(MENU_BACKGROUNDS[Math.floor(Math.random() * MENU_BACKGROUNDS.length)]);
  }, []);

  return (
    <div className={`relative flex-1 flex flex-col overflow-hidden bg-lf-bg selection:bg-lf-accent/30 transition-opacity duration-300 ${mounted ? "opacity-100" : "opacity-0"}`}>
      {/* Art maskot (acak per kunjungan) sampai ada beatmap dipilih di selector */}
      <AnimatePresence>
        {(coverUrl || mascotBg) && (
          <motion.div
            key={coverUrl ?? mascotBg}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            className="pointer-events-none absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${coverUrl ?? mascotBg})` }}
          >
            <div className={`absolute inset-0 ${coverUrl ? "bg-black/60" : "bg-black/25"}`} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pill info kiri atas */}
      <div className="absolute left-2 top-3 z-20 flex items-center gap-2 rounded-lf-lg bg-lf-bg-raised/80 px-4 py-2.5 text-lf-body text-lf-text">
        <span className="text-lf-text-muted">Global Offset</span>
        <span className="font-game-mono tabular-nums text-lf-accent">
          {globalOffset >= 0 ? "+" : ""}{globalOffset}ms
        </span>
      </div>

      <div className="relative z-10 flex h-full w-full flex-1 items-center justify-center px-4 pb-16">
        {/* Pita strip: sejajar dengan panel (container punya pb-16, jadi tengahnya naik 2rem) */}
        <div
          className={`pointer-events-none absolute inset-x-0 top-[calc(50%-2rem)] -z-10 h-24 -translate-y-1/2 bg-black/50 transition-opacity duration-300 sm:h-32 ${isMenuExpanded ? "opacity-100" : "opacity-0"}`}
        />

        {/* Logo + strip: murni transform/opacity CSS supaya bisa dibalik di tengah animasi */}
        <div
          className={`relative transition-transform duration-[400ms] ease-lf-out ${isMenuExpanded ? "-translate-x-[11.5rem] sm:-translate-x-[15rem]" : "translate-x-0"}`}
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="relative z-30 flex shrink-0 flex-col items-center"
          >
            <LogoButton src="/background/Logo.webp" pulsing={isPlaying} visualizer onClick={() => setIsMenuExpanded((v) => !v)} />
          </motion.div>

          <div
            inert={!isMenuExpanded}
            className={`absolute left-full top-1/2 z-10 flex -translate-y-1/2 flex-row items-center gap-0 py-4 pr-6 transition-[opacity,transform] duration-[400ms] ease-lf-out ${
              isMenuExpanded ? "ml-[-20px] translate-x-0 opacity-100" : "pointer-events-none ml-[-20px] -translate-x-12 opacity-0"
            }`}
          >
            <SettingsDrawer>
              <SkewedPanel className="w-40 h-24 sm:w-52 sm:h-32 hover:bg-lf-surface-hover -ml-12 pl-12 sm:pl-16">
                <SettingsIcon className="w-8 h-8 sm:w-10 sm:h-10 text-lf-accent group-hover:text-white transition-colors" />
                <span className="text-[10px] sm:text-sm font-game-display font-bold uppercase tracking-wider text-lf-accent group-hover:text-white">Settings</span>
              </SkewedPanel>
            </SettingsDrawer>

            <SkewedPanel onClick={() => router.push("/select")} variant="primary" className="w-32 h-24 sm:w-40 sm:h-32">
              <Play className="w-8 h-8 sm:w-10 sm:h-10 fill-white text-white group-hover:scale-110 transition-transform" />
              <span className="text-[10px] sm:text-sm font-game-display font-bold uppercase tracking-wider text-white">Play</span>
            </SkewedPanel>

            {isGuest ? (
              <SkewedPanel onClick={() => window.dispatchEvent(new CustomEvent("open-auth-dropdown"))} className="w-32 h-24 sm:w-40 sm:h-32 pr-2">
                <LogIn className="w-8 h-8 sm:w-10 sm:h-10 text-lf-accent group-hover:text-white transition-colors" />
                <span className="text-[10px] sm:text-sm font-game-display font-bold uppercase tracking-wider text-lf-accent group-hover:text-white">Log In</span>
              </SkewedPanel>
            ) : (
              <SkewedPanel onClick={() => logout()} className="w-32 h-24 sm:w-40 sm:h-32 pr-2">
                <LogOut className="w-8 h-8 sm:w-10 sm:h-10 text-lf-accent group-hover:text-white transition-colors" />
                <span className="text-[10px] sm:text-sm font-game-display font-bold uppercase tracking-wider text-lf-accent group-hover:text-white">Log Out</span>
              </SkewedPanel>
            )}
          </div>
        </div>
      </div>

      {/* Tip bawah-tengah */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="absolute bottom-3 left-1/2 z-20 w-[min(52rem,calc(100%-2rem))] -translate-x-1/2 rounded-lf-lg bg-lf-bg-raised/85 px-6 py-3 text-center"
      >
        <div className="mb-1 flex items-center justify-center gap-2 text-lf-body font-semibold text-lf-accent">
          <Lightbulb className="h-4 w-4" aria-hidden />
          A tip for you:
        </div>
        <p className="text-lf-body text-lf-text">{tip}</p>
      </motion.div>
    </div>
  );
}
