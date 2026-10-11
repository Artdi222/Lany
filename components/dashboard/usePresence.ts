"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { sendHeartbeat } from "@/lib/api/dashboard";
import { usePresenceStore } from "@/lib/store/usePresenceStore";
import { useNotificationStore } from "@/lib/store/useNotificationStore";

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
  // Account-menu status (Online / Do not disturb / Appear offline); a change is sent right away.
  const status = usePresenceStore((s) => s.status);

  useEffect(() => {
    if (!token) {
      useNotificationStore.getState().reset();
      return;
    }
    const activity = activityFor(pathname);
    // Notifications ride the presence interval (60 s), so a friend request shows up within a minute.
    const ping = () => {
      sendHeartbeat(token, activity, status).catch(() => {});
      useNotificationStore.getState().sync(token).catch(() => {});
    };
    ping();
    const id = setInterval(ping, 60_000);
    return () => clearInterval(id);
  }, [token, pathname, status]);
}
