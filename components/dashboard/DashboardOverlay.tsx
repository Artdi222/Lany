"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, Search, User as UserIcon, X } from "lucide-react";
import { Icon } from "@/components/ui/icons/Icon";
import Flag from "@/components/profile/Flag";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { getFriends, getOnlineUsers, searchUsers, type UserCard } from "@/lib/api/dashboard";
import { relativeTimeLong } from "@/lib/select/format";
import { cn } from "@/lib/utils";

/** Dashboard overlay. Spec: docs/ui-spec/dashboard.md. */

type Tab = "friends" | "online" | "search";
type Sort = "active" | "rank" | "username";
type Filter = "all" | "online" | "offline";

const SORTERS: Record<Sort, (a: UserCard, b: UserCard) => number> = {
  active: (a, b) => Number(b.online) - Number(a.online) || Date.parse(b.lastSeenAt ?? "0") - Date.parse(a.lastSeenAt ?? "0"),
  rank: (a, b) => b.totalPp - a.totalPp,
  username: (a, b) => a.username.localeCompare(b.username),
};

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cn("relative cursor-pointer pb-3 font-game-display text-[15px] transition-colors", active ? "font-bold text-white" : "text-lf-accent hover:text-white")}>
      {children}
      {active && <span className="absolute inset-x-0 -bottom-px h-[3px] rounded-full bg-lf-accent" />}
    </button>
  );
}

function Card({ u, onOpen }: { u: UserCard; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative h-[167px] cursor-pointer overflow-hidden rounded-lg bg-lf-bg-raised text-left transition-[filter] duration-150 hover:brightness-110"
    >
      {u.bannerUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={u.bannerUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-35" />
      )}
      <div className="relative flex h-full">
        <div className="flex w-[98px] shrink-0 flex-col items-center pt-[14px]">
          <span className="flex h-[84px] w-[84px] items-center justify-center overflow-hidden rounded-md bg-lf-surface">
            {u.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={u.avatarUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <UserIcon className="h-9 w-9 text-white/40" />
            )}
          </span>
          <span
            className={cn("mt-[17px] h-[34px] w-[34px] rounded-full border-[4px]", !u.online ? "border-white/35" : u.status === "dnd" ? "border-lf-danger" : "border-lf-success")}
            aria-hidden
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col pt-[14px] pr-4">
          <div className="flex h-[37px] items-center gap-2">
            {u.country && <Flag code={u.country} height={30} />}
            {u.mutual && (
              <span className="flex h-[30px] items-center rounded-full bg-lf-danger px-3 text-select-bar" title="Mutual friend">
                <Heart className="h-4 w-4 fill-current" />
                <Heart className="-ml-1 h-4 w-4 fill-current" />
              </span>
            )}
          </div>
          <span className="mt-[16px] truncate font-game-display text-[18px] font-bold text-white">{u.username}</span>
          <span className="mt-auto pb-[14px] font-game-body leading-tight">
            {!u.online && u.lastSeenAt && <span className="block text-[13px] text-white/85">Last seen {relativeTimeLong(u.lastSeenAt)}</span>}
            <span className="block text-[15px] font-semibold text-white">{!u.online ? "Offline" : u.status === "dnd" ? "Do not disturb" : u.activity}</span>
          </span>
        </div>
      </div>
    </button>
  );
}

export default function DashboardOverlay({
  isOpen,
  onClose,
  onOpenUser,
  escBlocked,
}: {
  isOpen: boolean;
  onClose: () => void;
  onOpenUser: (id: string) => void;
  /** True while a sheet opened from here is on top, so Esc closes that first. */
  escBlocked?: boolean;
}) {
  const token = useAuthStore((s) => s.token);
  // null = default; resolved at render because the auth store hydrates after the first render.
  const [picked, setTab] = useState<Tab | null>(null);
  const tab: Tab = picked ?? (token ? "friends" : "online");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("active");
  const [query, setQuery] = useState("");
  const [list, setList] = useState<UserCard[] | null>(null);

  // Search tab asks the server (debounced); the other tabs load once and filter locally.
  const q = query.trim();
  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    const load =
      tab === "friends" ? (token ? () => getFriends(token) : null)
      : tab === "online" ? getOnlineUsers
      : q ? () => searchUsers(q) : null;
    if (!load) {
      queueMicrotask(() => alive && setList([]));
      return;
    }
    const id = setTimeout(() => load().then((r) => alive && setList(r)).catch(() => alive && setList([])), tab === "search" ? 300 : 0);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [isOpen, tab, token, tab === "search" ? q : ""]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isOpen || escBlocked) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose, escBlocked]);

  const counts = useMemo(() => {
    const online = list?.filter((u) => u.online).length ?? 0;
    return { all: list?.length ?? 0, online, offline: (list?.length ?? 0) - online };
  }, [list]);

  const shown = useMemo(() => {
    if (!list) return null;
    let xs = list;
    if (tab === "friends" && filter !== "all") xs = xs.filter((u) => u.online === (filter === "online"));
    if (tab !== "search" && q) xs = xs.filter((u) => u.username.toLowerCase().includes(q.toLowerCase()));
    return tab === "search" ? xs : [...xs].sort(SORTERS[sort]);
  }, [list, tab, filter, sort, q]);

  const switchTab = (t: Tab) => {
    if (t === tab) return;
    setTab(t);
    setList(null);
    setQuery("");
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-x-0 bottom-0 top-12 z-40">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/60" />
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-y-0 left-1/2 flex w-[min(1630px,100%)] -translate-x-1/2 flex-col bg-lf-surface shadow-lf-panel"
          >
            <header className="relative flex h-[78px] shrink-0 items-center gap-4 bg-lf-bg-raised px-[77px]">
              <Icon name="globe" size={40} />
              <h2 className="font-game-display text-[22px] text-white">dashboard</h2>
              <button type="button" onClick={onClose} aria-label="Close" className="absolute right-6 cursor-pointer rounded-full p-2 text-white/70 transition-colors hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </header>
            <div className="flex h-[66px] shrink-0 items-end bg-select-tile px-[70px]">
              <div className="flex gap-7 border-b border-lf-accent/40">
                {token && <TabButton active={tab === "friends"} onClick={() => switchTab("friends")}>friends</TabButton>}
                <TabButton active={tab === "online"} onClick={() => switchTab("online")}>currently online</TabButton>
                <TabButton active={tab === "search"} onClick={() => switchTab("search")}>user search</TabButton>
              </div>
            </div>

            {tab === "friends" && (
              <div className="flex h-[112px] shrink-0 gap-[15px] bg-lf-bg-raised px-[70px] pt-8">
                {(["all", "online", "offline"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    className={cn("w-[125px] cursor-pointer border-t-[3px] pt-3 text-left font-game-body transition-opacity", filter === f ? "opacity-100" : "opacity-60 hover:opacity-90")}
                    style={{ borderColor: f === "all" ? "#fff" : f === "online" ? "var(--color-lf-success)" : "rgba(0,0,0,0.5)" }}
                  >
                    <span className="block text-[13px] font-semibold capitalize text-white">{f}</span>
                    <span className="block text-[17px] text-white/85">{counts[f]}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-[55px] pb-10 pt-7">
              <div className="flex items-center gap-8">
                <label className={cn("flex h-[55px] items-center rounded-md bg-lf-bg-raised pl-3 pr-4", tab === "search" ? "flex-1" : "w-[988px]")}>
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="type to search"
                    className="h-full min-w-0 flex-1 bg-transparent font-game-body text-[22px] text-white outline-none placeholder:text-white/45"
                  />
                  <Search className="h-7 w-7 text-white" strokeWidth={3} aria-hidden />
                </label>
                {tab !== "search" && (
                  <div className="flex items-center gap-3 font-game-body text-[13px] font-semibold text-white">
                    <span className="mr-3">Sort by</span>
                    {([["active", "Recently active"], ["rank", "Rank"], ["username", "Username"]] as const).map(([k, label]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setSort(k)}
                        className={cn("cursor-pointer rounded px-3 py-1.5 transition-colors", sort === k ? "bg-lf-accent text-select-bar" : "hover:bg-white/10")}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="mx-auto mt-[30px] grid max-w-[1250px] grid-cols-1 gap-[15px] md:grid-cols-2 xl:grid-cols-3">
                {shown?.map((u) => <Card key={u.id} u={u} onOpen={() => onOpenUser(u.id)} />)}
              </div>
              {shown && shown.length === 0 && (
                <p className="mt-16 text-center font-game-body text-white/60">
                  {tab === "search" ? (q ? "No players found." : "Type a username to search.") : tab === "friends" ? "No friends here yet. Open a player's profile to add them." : "Nobody is online right now."}
                </p>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
