import type { ChatMessage } from "@/lib/api/chat";

export type ChatRow =
  | { kind: "date"; key: string; label: string }
  | { kind: "message"; key: string; message: ChatMessage; time: string | null };

const dayLabel = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }).toUpperCase();
const minuteLabel = (d: Date) => d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

/** As in lazer: a date divider when the day changes, the time only on the first message of each minute. */
export function chatRows(messages: ChatMessage[]): ChatRow[] {
  const rows: ChatRow[] = [];
  let lastDay = "";
  let lastMinute = "";
  for (const m of messages) {
    const d = new Date(m.createdAt);
    const day = dayLabel(d);
    if (day !== lastDay) {
      rows.push({ kind: "date", key: `d${m.id}`, label: day });
      lastDay = day;
      lastMinute = "";
    }
    const minute = minuteLabel(d);
    rows.push({ kind: "message", key: `m${m.id}`, message: m, time: minute === lastMinute ? null : minute });
    lastMinute = minute;
  }
  return rows;
}
