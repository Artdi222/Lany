"use client";

import { useEffect, useState } from "react";
import { UserCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { addFriend, getFriends, removeFriend } from "@/lib/api/dashboard";

// ponytail: friend ids fetched once per token and patched on toggle; the dashboard refetches its own list when opened.
let cached: { token: string; ids: Promise<Set<string>> } | null = null;
const friendIds = (token: string) => {
  if (cached?.token !== token) cached = { token, ids: getFriends(token).then((fs) => new Set(fs.map((f) => f.id))) };
  return cached.ids;
};

/** Add friend / Remove friend on another player's profile (one-way follow, like osu!). */
export default function FriendButton({ userId }: { userId: string }) {
  const token = useAuthStore((s) => s.token);
  const [isFriend, setIsFriend] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    friendIds(token).then((ids) => alive && setIsFriend(ids.has(userId))).catch(() => {});
    return () => {
      alive = false;
    };
  }, [token, userId]);

  if (!token || isFriend === null) return null;

  const toggle = async () => {
    setBusy(true);
    try {
      await (isFriend ? removeFriend(token, userId) : addFriend(token, userId));
      const ids = await friendIds(token);
      if (isFriend) ids.delete(userId);
      else ids.add(userId);
      setIsFriend(!isFriend);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update friends");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className={`ml-3 flex shrink-0 cursor-pointer items-center gap-2 rounded-lf-md px-3 py-1.5 font-game-body text-sm transition-colors disabled:opacity-60 ${
        isFriend ? "bg-white/10 text-white hover:bg-lf-danger/80" : "bg-lf-primary text-white hover:bg-lf-primary-hover"
      }`}
    >
      {isFriend ? <UserCheck className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
      {isFriend ? "Friend" : "Add friend"}
    </button>
  );
}
