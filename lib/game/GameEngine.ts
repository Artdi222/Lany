import * as PIXI from "pixi.js";
import { AudioEngine } from "./AudioEngine";
import { NoteRenderer } from "./NoteRenderer";
import { InputHandler } from "./InputHandler";
import { JudgementEngine } from "./JudgementEngine";
import type { ParsedNote, ScrollDirection, JudgementType } from "@/types/game";
import { modRate, windowScale, type ModAcronym } from "./Mods";

interface GameEngineCallbacks {
  onJudgement: (
    type: JudgementType,
    errorMs: number,
    time: number,
    weight?: number,
    count?: number,
  ) => void;
  onComplete: () => void;
  onFail: () => void;
}

export class GameEngine {
  private app: PIXI.Application;
  private audioEngine: AudioEngine;
  private noteRenderer: NoteRenderer;
  private inputHandler: InputHandler;
  private judgementEngine: JudgementEngine;
  private notes: ParsedNote[];
  private callbacks: GameEngineCallbacks;
  private paused: boolean = false;
  private running: boolean = false;
  private lastMissCheckedIndex: number = 0;

  constructor(config: {
    app: PIXI.Application;
    notes: ParsedNote[];
    keyCount: number;
    od: number;
    keybinds: string[];
    scrollDirection: ScrollDirection;
    scrollSpeed: number;
    percyMaxLengthPx?: number;
    volume: number;
    globalOffset: number;
    mods?: readonly ModAcronym[];
    /** Customise rate for the speed mod (null = its default). */
    customRate?: number | null;
    callbacks: GameEngineCallbacks;
  }) {
    const mods = config.mods ?? [];
    const rate = modRate(mods, config.customRate ?? null);
    this.app = config.app;
    this.notes = config.notes;
    this.callbacks = config.callbacks;
    this.judgementEngine = new JudgementEngine(config.od, windowScale(mods) * rate);
    this.audioEngine = new AudioEngine(config.globalOffset, rate);
    this.noteRenderer = new NoteRenderer(
      config.app,
      config.keyCount,
      config.scrollDirection,
      config.scrollSpeed,
      config.percyMaxLengthPx,
      mods.includes("HD"),
    );
    this.inputHandler = new InputHandler(
      config.keybinds,
      config.notes,
      this.judgementEngine,
      (perfMs) => this.audioEngine.getTimeAt(perfMs),
      // Errors are measured in song time; report them in real ms so the hit-error graph matches what the player felt.
      (type, errorMs, time, weight, count) =>
        this.callbacks.onJudgement(type, errorMs / rate, time, weight, count),
      (column) => this.noteRenderer.flashColumn(column),
    );
  }

  async init(audioUrl: string, volume: number): Promise<void> {
    await this.audioEngine.load(audioUrl, volume);
  }

  async setBackground(url: string | null): Promise<void> {
    await this.noteRenderer.setBackground(url);
  }

  start(): void {
    if (this.running) {
      this.audioEngine.resume();
      this.inputHandler.start();
      return;
    }

    this.running = true;
    const leadInMs = this.calculateLeadIn();
    this.audioEngine.play(leadInMs);
    this.inputHandler.start();
    this.app.ticker.add(this.gameLoop, this);
    this.audioEngine.onEnd(() => {
      this.callbacks.onComplete();
      this.pause();
    });
  }

  private calculateLeadIn(): number {
    if (this.notes.length === 0) return 0;
    const firstNoteTime = this.notes[0].startTime;
    const hitZoneY = this.noteRenderer.getHitZoneY();
    const isDown = this.noteRenderer.getScrollDirection() === "down";
    const screenH = this.app?.screen?.height || 800;
    const spawnDistance = isDown ? hitZoneY + 100 : screenH - hitZoneY + 100;
    const pxPerMs = this.noteRenderer.getScrollSpeed() * 0.08;
    const travelTime = spawnDistance / pxPerMs;

    if (firstNoteTime < travelTime) {
      return Math.max(1500, Math.ceil(travelTime - firstNoteTime + 300));
    }
    return 0;
  }

  pause(): void {
    this.paused = true;
    this.audioEngine.pause();
    this.inputHandler.stop();
  }

  resume(): void {
    this.paused = false;
    this.audioEngine.resume();
    this.inputHandler.start();
  }

  private gameLoop = (): void => {
    // Flashes keep fading while paused, like the per-flash ticker callbacks they replace.
    this.noteRenderer.tickFlashes(this.app.ticker.deltaMS);
    if (this.paused) return;
    this.audioEngine.syncClock();
    const currentTime = this.audioEngine.getCurrentTime();
    this.checkMissedNotes(currentTime);
    this.inputHandler.update(currentTime);
    this.noteRenderer.updateNotes(this.notes, currentTime);
  };

  private checkMissedNotes(currentTime: number): void {
    // Read the miss window from InputHandler — single source of truth.
    const missWindow = this.inputHandler.missWindow;
    const notes = this.notes;
    const len = notes.length;

    for (let i = this.lastMissCheckedIndex; i < len; i++) {
      const note = notes[i];

      // Stop as soon as we reach a note still in the future
      if (note.startTime > currentTime) break;

      // KEY FIX: Only mark a miss once the note is FULLY outside the hit window
      // (both the early and late sides). Using the same missWindow + 50ms buffer
      // as before, but now routing through InputHandler so columnIndices stay
      // in sync — preventing checkMissedNotes from stealing notes that a
      // keydown event is about to claim.
      const elapsed = currentTime - note.startTime;

      if (!note.isHoldNote && !note.hit) {
        if (elapsed > missWindow + 50) {
          // Route through InputHandler so columnIndices advance correctly
          this.inputHandler.markMissed(note, missWindow, currentTime);
        }
      } else if (note.isHoldNote && !note.headHit && !note.holdMissed) {
        if (elapsed > missWindow + 50) {
          this.inputHandler.markHoldMissed(note, missWindow, currentTime);
        }
      }

      // Advance the flat-array pointer only when this note is fully settled
      if ((note.hit || note.holdMissed) && i === this.lastMissCheckedIndex) {
        this.lastMissCheckedIndex++;
      }
    }
  }

  getProgress(): number {
    const duration = this.audioEngine.getDuration();
    if (duration === 0) return 0;
    return (this.audioEngine.getCurrentTime() / duration) * 100;
  }

  getCurrentTime(): number {
    return this.audioEngine.getCurrentTime();
  }

  seek(timeMs: number): void {
    const oldTime = this.audioEngine.getCurrentTime();
    this.audioEngine.seek(timeMs);
    this.lastMissCheckedIndex = 0;

    if (timeMs > oldTime) {
      for (const note of this.notes) {
        if (!note.hit && note.startTime < timeMs) {
          note.hit = true;
          if (note.isHoldNote) note.holdMissed = true;
        }
      }
    }
  }

  getNextNoteTime(): number | null {
    const currentTime = this.audioEngine.getCurrentTime();
    const notes = this.notes;
    // Every note before lastMissCheckedIndex is already hit, so start there instead of at 0.
    for (let i = this.lastMissCheckedIndex; i < notes.length; i++) {
      const n = notes[i];
      if (!n.hit && n.startTime > currentTime) return n.startTime;
    }
    return null;
  }

  setScrollSpeed(speed: number): void {
    this.noteRenderer.setScrollSpeed(speed);
  }

  setPercyMaxLength(px: number): void {
    this.noteRenderer.setPercyMaxLength(px);
  }

  setVolume(vol: number): void {
    this.audioEngine.setVolume(vol);
  }

  setBackgroundDim(dim: number): void {
    this.noteRenderer.setBackgroundDim(dim);
  }

  setBackgroundBlur(blur: number): void {
    this.noteRenderer.setBackgroundBlur(blur);
  }

  isPlaying(): boolean {
    return this.running;
  }

  reset(newNotes: ParsedNote[]): void {
    this.notes = newNotes;
    this.audioEngine.reset();
    this.inputHandler.reset(newNotes);
    this.paused = false;
    this.lastMissCheckedIndex = 0;
  }

  destroy(): void {
    this.app.ticker?.remove(this.gameLoop, this);
    this.inputHandler.destroy();
    this.noteRenderer.destroy();
    this.audioEngine.destroy();
  }
}
