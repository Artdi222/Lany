import { expect, test } from "bun:test";
import { chatRows } from "./rows";

const msg = (id: number, createdAt: string) => ({ id, senderId: "a", text: "x", createdAt });

test("date divider per day, time only on the first message of each minute", () => {
  process.env.TZ = "UTC";
  const rows = chatRows([
    msg(1, "2026-09-15T19:44:05Z"),
    msg(2, "2026-09-15T19:44:50Z"),
    msg(3, "2026-09-15T19:45:01Z"),
    msg(4, "2026-09-16T19:45:01Z"),
  ]);
  expect(rows.map((r) => (r.kind === "date" ? r.label : r.time))).toEqual([
    "15 SEPTEMBER 2026",
    "07:44 PM",
    null,
    "07:45 PM",
    "16 SEPTEMBER 2026",
    "07:45 PM", // same minute as the previous message, but a new day shows it again
  ]);
});
