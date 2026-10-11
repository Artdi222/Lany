"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { sendHeartbeat } from "@/lib/api/dashboard";

/** Same wording as osu! ("Choosing a beatmap", "Smashing keys"); the backend accepts only these. */
export function activityFor(pathname: string): string {
  if (pathname.startsWith("/play")) return "Smashing keys";
  if (pathname.startsWith("/select") || pathname.startsWith("/prepare")) return "Choosing a beatmap";
  if (pathname.startsWith("/result")) return "Browsing";
  return "Idle";
}

/** Tell the backend we are online (every 60 s, and right away when the screen changes). Online = seen within 2 min. */
export function usePresence() {
  const token = useAuthStore((s) => s.token);
  const pathname = usePathname();

  useEffect(() => {
    if (!token) return;
    const activity = activityFor(pathname);
    const ping = () => sendHeartbeat(token, activity).catch(() => {});
    ping();
    const id = setInterval(ping, 60_000);
    return () => clearInterval(id);
  }, [token, pathname]);
}
