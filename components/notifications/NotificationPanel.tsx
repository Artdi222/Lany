"use client";

import { Check, X } from "lucide-react";
import { useNotificationStore } from "@/lib/store/useNotificationStore";

/** Right-hand panel under the top bar (spec: docs/ui-spec/notifications.md). */
export default function NotificationPanel() {
  const items = useNotificationStore((s) => s.items);
  const dismiss = useNotificationStore((s) => s.dismiss);
  const clear = useNotificationStore((s) => s.clear);

  return (
    <div className="fixed right-0 top-12 bottom-0 z-50 w-[min(450px,100vw)] overflow-y-auto bg-lf-bg-raised px-7 py-4 shadow-lf-panel">
      <div className="flex items-center justify-between">
        <h2 className="font-game-display text-[17px] font-bold uppercase text-lf-text">
          Notifications <span className="text-yellow-400">{items.length}</span>
        </h2>
        <button
          type="button"
          onClick={clear}
          className="cursor-pointer text-[17px] uppercase text-lf-text hover:text-lf-text-muted"
        >
          Clear all
        </button>
      </div>

      <ul className="mt-3 flex flex-col gap-2">
        {items.map((n) => (
          <li key={n.id} className="relative flex min-h-[86px] overflow-hidden rounded-lf-md bg-lf-surface">
            {!n.read && <span className="absolute -left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-lime-400" />}
            <span className="flex w-14 shrink-0 items-center justify-center bg-lf-bg">
              {n.kind === "success" ? (
                <Check className="h-6 w-6 text-lime-400" />
              ) : (
                <X className="h-6 w-6 text-red-400" />
              )}
            </span>
            <p className="flex-1 self-center px-4 py-3 text-[15px] leading-snug text-lf-text">{n.text}</p>
            <button
              type="button"
              onClick={() => dismiss(n.id)}
              aria-label="Dismiss"
              className="cursor-pointer px-4 text-lf-text-muted hover:text-lf-text"
            >
              <Check className="h-5 w-5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
