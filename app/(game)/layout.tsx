"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useGameStore } from "@/lib/store/useGameStore";
import GameNavbar from "@/components/game/shared/Navbar";
import { usePresence } from "@/components/dashboard/usePresence";
import AmbientMotionController from "@/components/ui/AmbientMotionController";
import FpsCounter from "@/components/ui/FpsCounter";

export default function GameLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // Online presence for the dashboard; here (not in the navbar) so it keeps running while playing.
  usePresence();
  useEffect(() => {
    useGameStore.persist.rehydrate();
  }, []);
  const isPlayPage = pathname.includes("/play/");
  const isResultPage = pathname.includes("/result");
  const hideNavbar = isPlayPage || isResultPage;

  return (
    <AmbientMotionController>
    <div className="h-full bg-lanify-bg text-lanify-text font-game-body flex flex-col overflow-hidden">
      {!hideNavbar && <GameNavbar />}
      
      <main className={`flex-1 flex flex-col min-h-0 relative ${!hideNavbar ? "mt-12" : ""}`}>
        <AnimatePresence mode="popLayout">
          <motion.div
            key={pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex-1 flex flex-col overflow-hidden"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
      <FpsCounter />
    </div>
    </AmbientMotionController>
  );
}
