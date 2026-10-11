"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Mail, Search, User as UserIcon } from "lucide-react";
import { Icon } from "@/components/ui/icons/Icon";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { getChats, getMessages, sendMessage, type ChatMessage, type ChatUser } from "@/lib/api/chat";
import { chatRows } from "@/lib/chat/rows";

const POLL_MS = 3000;

/** Bottom chat overlay (spec: docs/ui-spec/chat.md). Direct messages only; polled while open. */
export default function ChatOverlay({ target }: { target: ChatUser | null }) {
  const token = useAuthStore((s) => s.token);
  const me = useAuthStore((s) => s.user);
  const [chats, setChats] = useState<ChatUser[]>([]);
  const [active, setActive] = useState<ChatUser | null>(target);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Conversation list; a profile's "Message" target is shown even before the first message.
  useEffect(() => {
    if (!token) return;
    getChats(token)
      .then((list) => {
        setChats(target && !list.some((c) => c.id === target.id) ? [target, ...list] : list);
        setActive((a) => a ?? list[0] ?? null);
      })
      .catch(() => {});
  }, [token, target]);

  // Messages of the open conversation: full load, then poll only for newer ids.
  useEffect(() => {
    if (!token || !active) return;
    let last = 0;
    let alive = true;
    const poll = () =>
      getMessages(token, active.id, last)
        .then((rows) => {
          if (!alive || !rows.length) return;
          last = rows[rows.length - 1].id;
          setMessages((m) => [...m, ...rows.filter((r) => !m.some((x) => x.id === r.id))]);
        })
        .catch(() => {});
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [token, active]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const rows = useMemo(() => chatRows(messages), [messages]);
  const shown = chats.filter((c) => c.username.toLowerCase().includes(query.trim().toLowerCase()));

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !token || !active) return;
    setDraft("");
    try {
      const m = await sendMessage(token, active.id, text);
      setMessages((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));
    } catch {
      setDraft(text);
    }
  };

  return (
    <motion.section
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-x-0 bottom-0 z-40 flex h-[37vh] min-h-[320px] flex-col bg-lf-bg-raised shadow-lf-panel"
    >
      <header className="flex h-14 shrink-0 items-center gap-3 bg-lf-surface px-5 text-lf-text">
        <Icon name="chat" size={30} />
        <h2 className="font-game-display text-[19px]">chat</h2>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[267px] shrink-0 flex-col overflow-y-auto bg-lf-bg py-2">
          <label className="mx-3.5 flex h-10 items-center rounded-lf-sm bg-lf-bg-raised px-3.5">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="type to search"
              className="min-w-0 flex-1 bg-transparent text-[15px] text-lf-text outline-none placeholder:text-lf-text-dim"
            />
            <Search className="h-5 w-5 text-lf-text" />
          </label>
          <h3 className="mx-3.5 mt-4 mb-1.5 flex items-center gap-2 text-[13px] font-bold uppercase text-lf-text">
            Direct messages <Mail className="h-4 w-4" />
          </h3>
          {shown.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                if (c.id === active?.id) return;
                setMessages([]);
                setActive(c);
              }}
              className={`flex h-[35px] shrink-0 cursor-pointer items-center gap-2.5 px-3.5 text-left text-[15px] text-lf-text transition-colors ${active?.id === c.id ? "bg-lf-surface" : "hover:bg-lf-surface-hover"}`}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-lf-bg-raised">
                {c.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <UserIcon className="h-3.5 w-3.5 text-lf-text-muted" />
                )}
              </span>
              <span className="truncate">{c.username}</span>
            </button>
          ))}
          {!chats.length && (
            <p className="mx-3.5 mt-1 text-[13px] text-lf-text-dim">Open a player&apos;s profile and press Message to start.</p>
          )}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-1.5 py-2">
            {rows.map((r, i) =>
              r.kind === "date" ? (
                <div key={r.key} className="my-3 flex items-center gap-5 px-2">
                  <span className="h-px w-32 bg-lf-surface" />
                  <span className="text-[14px] font-bold text-lf-text">{r.label}</span>
                  <span className="h-px flex-1 bg-lf-surface" />
                </div>
              ) : (
                <div
                  key={r.key}
                  className={`grid grid-cols-[86px_210px_1fr] items-center rounded-sm text-[15px] leading-6 ${i % 2 ? "bg-white/[0.04]" : ""}`}
                >
                  <span className="pl-1.5 text-[13px] text-lf-text-dim">{r.time}</span>
                  <span className={`truncate pr-5 text-right font-bold ${r.message.senderId === me?.id ? "text-pink-400" : "text-violet-400"}`}>
                    {r.message.senderId === me?.id ? me?.username : active?.username}
                  </span>
                  <span className="break-words text-lf-text">{r.message.text}</span>
                </div>
              ),
            )}
          </div>

          {active && (
            <form onSubmit={send} className="flex h-14 shrink-0 items-center">
              <span className="w-[296px] shrink-0 truncate pr-5 text-right text-[17px] text-lf-text-dim">
                talking with {active.username}
              </span>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={1000}
                placeholder="type message..."
                autoFocus
                className="h-full min-w-0 flex-1 bg-transparent text-[17px] text-lf-text outline-none placeholder:text-lf-text-dim"
              />
            </form>
          )}
        </div>
      </div>
    </motion.section>
  );
}
