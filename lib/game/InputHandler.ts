import type { ParsedNote, JudgementType } from "@/types/game";
import { JudgementEngine } from "./JudgementEngine";
import { resolveEventTime } from "./AudioClock";

/** `count` > 1 reports several identical judgements at once (a hold's head + tail + ticks). */
type JudgementCallback = (
  type: JudgementType,
  errorMs: number,
  time: number,
  weight?: number,
  count?: number,
) => void;
type ColumnFlashCallback = (column: number) => void;

export class InputHandler {
  private keyMap: Map<string, number> = new Map();
  private keyStates: Map<string, boolean> = new Map();
  private notes: ParsedNote[];
  private notesByColumn: ParsedNote[][] = [];
  private columnIndices: number[] = [];
  private activeHoldsByColumn: (ParsedNote | null)[] = [];

  private judgementEngine: JudgementEngine;
  private onJudgement: JudgementCallback;
  private onColumnFlash: ColumnFlashCallback;
  /** Song time (ms) for a point on the performance.now() timeline, e.g. an event's timeStamp. */
  private getTimeAt: (perfMs: number) => number;
  private active: boolean = false;

  private handleKeyDown: (e: KeyboardEvent) => void;
  private handleKeyUp: (e: KeyboardEvent) => void;

  /** Exposed so GameEngine.checkMissedNotes() can read it without a separate call */
  readonly missWindow: number;

  constructor(
    keybinds: string[],
    notes: ParsedNote[],
    judgementEngine: JudgementEngine,
    getTimeAt: (perfMs: number) => number,
    onJudgement: JudgementCallback,
    onColumnFlash: ColumnFlashCallback,
  ) {
    this.notes = notes;
    this.judgementEngine = judgementEngine;
    this.missWindow = this.judgementEngine.getMissWindow();
    this.onJudgement = onJudgement;
    this.onColumnFlash = onColumnFlash;
    this.getTimeAt = getTimeAt;

    keybinds.forEach((key, idx) => {
      this.keyMap.set(key.toLowerCase(), idx);
      this.keyStates.set(key.toLowerCase(), false);
    });

    this.setupNotes(notes, keybinds.length);

    this.handleKeyDown = this._onKeyDown.bind(this);
    this.handleKeyUp = this._onKeyUp.bind(this);
  }

  private setupNotes(notes: ParsedNote[], keyCount: number) {
    this.notesByColumn = Array.from({ length: keyCount }, () => []);
    this.columnIndices = Array(keyCount).fill(0);
    this.activeHoldsByColumn = Array(keyCount).fill(null);

    for (const note of notes) {
      if (note.column < this.notesByColumn.length) {
        this.notesByColumn[note.column].push(note);
      }
    }
  }

  start(): void {
    this.active = true;
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
  }

  stop(): void {
    this.active = false;
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
  }

  // ---------------------------------------------------------------------------
  // Miss marking — GameEngine MUST call these instead of mutating notes directly.
  // This keeps columnIndices in sync so _onKeyDown never lands on a stale note.
  // ---------------------------------------------------------------------------

  markMissed(note: ParsedNote, missWindow: number, currentTime: number): void {
    if (note.hit) return; // already processed — guard against double-mark
    note.hit = true;
    note.judgement = "MISS";
    this.onJudgement("MISS", missWindow, currentTime);
    this._advanceColumnPast(note.column);
  }

  markHoldMissed(
    note: ParsedNote,
    missWindow: number,
    currentTime: number,
  ): void {
    if (note.holdMissed) return;
    note.holdMissed = true;
    note.hit = true;
    note.tailHit = true;
    const totalTicks = note.totalTicks ?? 0;
    const weight = 1 / (2 + totalTicks);
    // head + tail + every tick, as one update
    this.onJudgement("MISS", missWindow, currentTime, weight, 2 + totalTicks);
    this._advanceColumnPast(note.column);
  }

  /** Advance a column's index past all already-processed notes */
  private _advanceColumnPast(col: number): void {
    if (col >= this.notesByColumn.length) return;
    const columnNotes = this.notesByColumn[col];
    let idx = this.columnIndices[col];
    while (
      idx < columnNotes.length &&
      (columnNotes[idx].hit || columnNotes[idx].holdMissed)
    ) {
      idx++;
    }
    this.columnIndices[col] = idx;
  }

  // ---------------------------------------------------------------------------

  private _onKeyDown(e: KeyboardEvent): void {
    if (!this.active) return;

    const key = e.key.toLowerCase();
    if (key === "escape") return;

    const column = this.keyMap.get(key);
    if (column === undefined) return;

    e.preventDefault();

    if (this.keyStates.get(key)) return;
    this.keyStates.set(key, true);

    this.onColumnFlash(column);

    // Judge at when the key was actually pressed, not when this handler got to run.
    const currentTime = this.getTimeAt(resolveEventTime(e.timeStamp, performance.now()));
    const missWindow = this.missWindow;
    const columnNotes = this.notesByColumn[column];

    // Pressing again on a hold that was let go early picks it back up (it stays dimmed).
    const released = this.activeHoldsByColumn[column];
    if (released && !released.isActiveHold && currentTime < released.endTime) {
      this.resumeHold(released, currentTime);
      return;
    }

    let index = this.columnIndices[column];

    // Advance past any notes that are already processed or hopelessly missed.
    // Because markMissed/markHoldMissed keep columnIndices current, this loop
    // should almost always be a no-op during normal play — just a safety net.
    while (index < columnNotes.length) {
      const note = columnNotes[index];
      if (note.hit || note.holdMissed) {
        index++;
        continue;
      }
      if (currentTime - note.startTime > missWindow) {
        index++;
        continue;
      }
      break;
    }

    this.columnIndices[column] = index;

    if (index < columnNotes.length) {
      const note = columnNotes[index];
      const errorMs = currentTime - note.startTime;

      if (Math.abs(errorMs) <= missWindow) {
        const result = this.judgementEngine.judge(currentTime, note.startTime);
        note.hit = true;
        note.judgement = result.type;

        if (note.isHoldNote) {
          note.headHit = true;
          note.isActiveHold = true;
          this.activeHoldsByColumn[column] = note;
          const weight = 1 / (2 + (note.totalTicks ?? 0));
          this.onJudgement(result.type, result.errorMs, currentTime, weight);
        } else {
          this.onJudgement(result.type, result.errorMs, currentTime, 1);
        }

        this.columnIndices[column] = index + 1;
      }
    }
  }

  private _onKeyUp(e: KeyboardEvent): void {
    const key = e.key.toLowerCase();
    const column = this.keyMap.get(key);
    if (column === undefined) return;

    if (!this.keyStates.get(key)) return;
    this.keyStates.set(key, false);

    const activeNote = this.activeHoldsByColumn[column];
    if (!activeNote) return;

    if (!activeNote.isActiveHold) return;
    activeNote.isActiveHold = false;

    const currentTime = this.getTimeAt(resolveEventTime(e.timeStamp, performance.now()));
    const earlyMs = activeNote.endTime - currentTime;
    const totalTicks = activeNote.totalTicks ?? 0;
    const ticksHit = activeNote.ticksHit ?? 0;
    const weight = 1 / (2 + totalTicks);
    const remainingTicks = totalTicks - ticksHit;

    if (earlyMs > this.missWindow * 1.5) {
      // Let go early: dim it but keep it in the column, a new press resumes it (see resumeHold);
      // update() settles it at the tail if it is never picked back up.
      activeNote.holdMissed = true;
      return;
    }
    this.activeHoldsByColumn[column] = null;
    activeNote.tailHit = true;
    const type = earlyMs <= 50 ? "MARVELOUS" : "PERFECT";
    this.onJudgement(type, -earlyMs, currentTime, weight);
    if (remainingTicks > 0) this.onJudgement("MARVELOUS", 0, currentTime, weight, remainingTicks);
    activeNote.ticksHit = totalTicks;
  }

  /** Pick a released hold back up: the ticks that passed while it was let go are missed, the rest score as usual. */
  private resumeHold(note: ParsedNote, currentTime: number): void {
    note.isActiveHold = true;
    const totalTicks = note.totalTicks ?? 0;
    let missed = 0;
    while (
      note.nextTickTime !== undefined &&
      (note.ticksHit ?? 0) < totalTicks &&
      note.nextTickTime <= currentTime
    ) {
      note.ticksHit = (note.ticksHit ?? 0) + 1;
      note.nextTickTime += 100;
      missed++;
    }
    if (missed > 0) this.onJudgement("MISS", 0, currentTime, 1 / (2 + totalTicks), missed);
  }

  update(currentTime: number): void {
    if (!this.active) return;

    for (let i = 0; i < this.activeHoldsByColumn.length; i++) {
      const note = this.activeHoldsByColumn[i];
      if (!note) continue;

      if (!note.isActiveHold) {
        if (currentTime >= note.endTime) {
          // Never picked back up: the tail and every tick left are missed.
          this.activeHoldsByColumn[i] = null;
          note.tailHit = true;
          const totalTicks = note.totalTicks ?? 0;
          const left = totalTicks - (note.ticksHit ?? 0);
          this.onJudgement("MISS", 0, currentTime, 1 / (2 + totalTicks), 1 + Math.max(0, left));
          note.ticksHit = totalTicks;
        }
        continue;
      }

      if (
        note.nextTickTime !== undefined &&
        note.ticksHit !== undefined &&
        note.totalTicks !== undefined &&
        currentTime >= note.nextTickTime &&
        note.ticksHit < note.totalTicks
      ) {
        note.ticksHit++;
        note.nextTickTime += 100;
        this.onJudgement("MARVELOUS", 0, currentTime, 1 / (2 + note.totalTicks));
      }

      if (currentTime >= note.endTime) {
        this.activeHoldsByColumn[i] = null;
        note.isActiveHold = false;
        note.tailHit = true;

        const totalTicks = note.totalTicks ?? 0;
        const ticksHit = note.ticksHit ?? 0;
        const weight = 1 / (2 + totalTicks);
        this.onJudgement("MARVELOUS", 0, currentTime, weight);
        if (totalTicks > ticksHit) this.onJudgement("MARVELOUS", 0, currentTime, weight, totalTicks - ticksHit);
        note.ticksHit = totalTicks;
      }
    }
  }

  reset(notes: ParsedNote[]): void {
    this.notes = notes;
    this.activeHoldsByColumn.fill(null);
    this.setupNotes(notes, this.notesByColumn.length);
    this.keyStates.forEach((_, key) => this.keyStates.set(key, false));
  }

  destroy(): void {
    this.stop();
    this.activeHoldsByColumn = [];
    this.keyMap.clear();
    this.keyStates.clear();
    this.notesByColumn = [];
  }
}
