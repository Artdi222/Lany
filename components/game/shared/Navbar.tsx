"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { User as UserIcon } from "lucide-react";
import MusicPlayer from "./MusicPlayer";
import SettingsDrawer from "./SettingsDrawer";
import TopBarClock from "./TopBarClock";
import { Icon } from "@/components/ui/icons/Icon";
import RegisterModal from "./RegisterModal";
import AccountPanel from "@/components/auth/AccountPanel";
import AccountCard from "@/components/profile/AccountCard";
import ProfilePanel from "./ProfilePanel";
import RankingsOverlay from "@/components/rankings/RankingsOverlay";
import DashboardOverlay from "@/components/dashboard/DashboardOverlay";
import { motion, AnimatePresence } from "framer-motion";
import NotificationPanel from "@/components/notifications/NotificationPanel";
import ChatOverlay from "@/components/chat/ChatOverlay";
import type { ChatUser } from "@/lib/api/chat";
import { useNotificationStore } from "@/lib/store/useNotificationStore";

export default function GameNavbar() {
  const { user, isGuest } = useAuthStore();
  const [mounted, setMounted] = useState(false);

  // Dropdown & Modal states
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isProfilePanelOpen, setIsProfilePanelOpen] = useState(false);
  const [isRankingsOpen, setIsRankingsOpen] = useState(false);
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const [profileUserId, setProfileUserId] = useState<string | undefined>();
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  // Chat overlay; `chatTarget` = player picked via a profile's Message button.
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatTarget, setChatTarget] = useState<ChatUser | null>(null);
  const unread = useNotificationStore((s) => s.items.filter((n) => !n.read).length);
  const markAllRead = useNotificationStore((s) => s.markAllRead);

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // Listen for open-auth-dropdown custom event
  useEffect(() => {
    const handleOpenAuth = () => {
      setIsDropdownOpen(true);
    };
    const handleOpenChat = (e: Event) => {
      setIsProfilePanelOpen(false);
      setIsNotifOpen(false);
      setChatTarget((e as CustomEvent<ChatUser>).detail);
      setIsChatOpen(true);
    };
    window.addEventListener("open-auth-dropdown", handleOpenAuth);
    window.addEventListener("open-chat", handleOpenChat);
    return () => {
      window.removeEventListener("open-auth-dropdown", handleOpenAuth);
      window.removeEventListener("open-chat", handleOpenChat);
    };
  }, []);

  // F9 toggles the dashboard (as in osu!).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsNotifOpen(false);
        setIsChatOpen(false);
      }
      if (e.key !== "F9") return;
      e.preventDefault();
      setIsRankingsOpen(false);
      setIsDashboardOpen((o) => !o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <>
      <nav className={`fixed top-0 left-0 right-0 z-50 flex items-stretch justify-between h-12 bg-lf-bg-raised text-lf-text transition-opacity duration-300 ${mounted ? "opacity-100" : "opacity-0"}`}>
        {/* Left: settings, home, ruleset */}
        <div className="flex items-stretch">
          <SettingsDrawer>
            <button
              aria-label="Settings"
              className="m-1 flex w-[58px] cursor-pointer items-center justify-center rounded-lf-md transition-colors hover:bg-lf-surface-hover data-[state=open]:bg-lf-primary"
            >
              <Icon name="settings" size={22} />
            </button>
          </SettingsDrawer>
          <Link href="/" aria-label="Home" className="flex w-[68px] items-center justify-center transition-colors hover:bg-lf-surface-hover">
            <Icon name="home" size={22} />
          </Link>
          {/* Ruleset: Lany hanya punya mania, jadi satu ikon terpilih */}
          <div className="relative flex w-12 items-center justify-center" aria-label="Mania">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-lf-accent text-lf-bg">
              <Icon name="ruleset-mania" size={24} title="Mania" />
            </span>
            <span className="absolute bottom-[3px] h-[2px] w-[21px] rounded-full bg-lf-text" />
          </div>
        </div>

        {/* Right: chat, globe, music, user, clock, notifications */}
        <div className="flex items-stretch">
          <button
            type="button"
            onClick={() => {
              setIsDashboardOpen(false);
              setIsRankingsOpen((o) => !o);
            }}
            aria-label="Rankings"
            aria-pressed={isRankingsOpen}
            className={`m-1 flex w-[46px] cursor-pointer items-center justify-center rounded-lf-md transition-colors ${isRankingsOpen ? "bg-lf-primary" : "hover:bg-lf-surface-hover"}`}
          >
            <Icon name="rankings" size={22} />
          </button>
          <button
            type="button"
            disabled={isGuest}
            onClick={() => {
              setChatTarget(null);
              setIsChatOpen((o) => !o);
            }}
            aria-label="Chat"
            aria-pressed={isChatOpen}
            title={isGuest ? "Sign in to chat" : "chat"}
            className={`m-1 flex w-[46px] cursor-pointer items-center justify-center rounded-lf-md transition-colors disabled:cursor-default disabled:text-lf-text-dim ${isChatOpen ? "bg-pink-600" : "enabled:hover:bg-lf-surface-hover"}`}
          >
            <Icon name="chat" size={22} />
          </button>
          <button
            type="button"
            onClick={() => {
              setIsRankingsOpen(false);
              setIsDashboardOpen((o) => !o);
            }}
            aria-label="Dashboard"
            aria-pressed={isDashboardOpen}
            title="dashboard: view your friends and other players (F9)"
            className={`m-1 flex w-[46px] cursor-pointer items-center justify-center rounded-lf-md transition-colors ${isDashboardOpen ? "bg-lf-primary" : "hover:bg-lf-surface-hover"}`}
          >
            <Icon name="globe" size={22} />
          </button>
          <MusicPlayer />
          <div className="mx-1 my-2.5 w-0.5 rounded-full bg-lf-text" />

          {/* User: tombol dropdown login/profil */}
          <div className="relative flex" ref={dropdownRef}>
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className={`m-1 flex cursor-pointer items-center gap-3 rounded-lf-md px-3 transition-colors ${isDropdownOpen ? "bg-lf-primary" : "hover:bg-lf-surface-hover"}`}
            >
              <span className="max-w-44 truncate text-[15px] font-game-body text-lf-text">
                {isGuest ? "Guest" : user?.username}
              </span>
              <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lf-sm bg-lf-bg">
                {user?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.avatarUrl} alt={user.username} className="h-full w-full object-cover" />
                ) : (
                  <UserIcon className="h-5 w-5 text-lf-text-muted" />
                )}
              </span>
            </button>

            {/* Dropdown Menu - Anchored Right Below */}
            <AnimatePresence>
              {isDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="fixed right-0 top-12 z-50 w-[min(506px,100vw)] bg-lf-bg-raised shadow-lf-panel"
                >
                  {isGuest ? (
                    <AccountPanel
                      onDone={() => setIsDropdownOpen(false)}
                      onRegister={() => {
                        setIsDropdownOpen(false);
                        setIsRegisterOpen(true);
                      }}
                    />
                  ) : (
                    <AccountCard
                      onDone={() => setIsDropdownOpen(false)}
                      onOpenProfile={() => {
                        setIsDropdownOpen(false);
                        setProfileUserId(undefined);
                        setIsProfilePanelOpen(true);
                      }}
                    />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <TopBarClock />
          <button
            type="button"
            onClick={() => {
              // Read on close, so the unread markers stay visible while the panel is open.
              if (isNotifOpen) markAllRead();
              setIsNotifOpen(!isNotifOpen);
            }}
            aria-label="Notifications"
            aria-pressed={isNotifOpen}
            className={`relative m-1 flex w-[46px] cursor-pointer items-center justify-center rounded-lf-md transition-colors ${isNotifOpen ? "bg-red-600" : "hover:bg-lf-surface-hover"}`}
          >
            <Icon name="bell" size={22} />
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] leading-none text-white">
                {unread}
              </span>
            )}
          </button>
          <AnimatePresence>{isNotifOpen && <NotificationPanel />}</AnimatePresence>
          <AnimatePresence>
            {isChatOpen && !isGuest && <ChatOverlay key={chatTarget?.id ?? "chat"} target={chatTarget} />}
          </AnimatePresence>
        </div>
      </nav>

      {/* Registration Modal Overlay */}
      <RegisterModal
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
      />

      <RankingsOverlay
        isOpen={isRankingsOpen}
        onClose={() => setIsRankingsOpen(false)}
        escBlocked={isProfilePanelOpen}
        onOpenUser={(id) => {
          setProfileUserId(id);
          setIsProfilePanelOpen(true);
        }}
      />

      <DashboardOverlay
        isOpen={isDashboardOpen}
        onClose={() => setIsDashboardOpen(false)}
        escBlocked={isProfilePanelOpen}
        onOpenUser={(id) => {
          setProfileUserId(id);
          setIsProfilePanelOpen(true);
        }}
      />

      {/* osu!-style Profile Details Panel */}
      <ProfilePanel
        isOpen={isProfilePanelOpen}
        onClose={() => setIsProfilePanelOpen(false)}
        userId={profileUserId}
      />
    </>
  );
}
