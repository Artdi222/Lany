import { Howl, Howler } from "howler";
import { AnchorFilter, anchorFromLatency, anchorFromOutputTimestamp } from "./AudioClock";

/** Minimum gap between audio-clock samples (ms). ctx.currentTime only ticks every ~8ms anyway. */
const CLOCK_SAMPLE_INTERVAL_MS = 40;

/**
 * AudioEngine — Howler.js wrapper for precise game audio timing.
 *
 * Game time = `performance.now() - startTimestamp + globalOffset`. `startTimestamp` is the
 * "anchor": it starts as a raw guess at play()/seek()/resume() and is then continuously
 * re-estimated from the audio clock by `syncClock()` so it follows the *audible* song
 * position (output latency + clock drift), see AudioClock.ts.
 */
export class AudioEngine {
  private howl: Howl | null = null;
  private soundId: number | null = null;
  private globalOffset: number;
  private startTimestamp: number = 0;
  private clockFilter = new AnchorFilter();
  private lastClockSampleAt: number = 0;
  private pauseTime: number = 0;
  private playing: boolean = false;
  private currentUrl: string | null = null;
  private leadInMs: number = 0;
  private audioStarted: boolean = false;
  /** Playback rate (HT/DT/NC). Song time advances `rate` ms per real ms. */
  private rate: number;

  constructor(globalOffset: number = 0, rate: number = 1) {
    this.globalOffset = globalOffset;
    this.rate = rate;
  }

  async load(url: string, volume: number = 0.8): Promise<void> {
    if (this.howl && this.currentUrl === url) {
      this.howl.stop();
      this.howl.seek(0);
      this.howl.rate(this.rate);
      return Promise.resolve();
    }

    if (this.howl) {
      this.howl.stop();
      this.howl.unload();
    }

    return new Promise((resolve, reject) => {
      this.howl = new Howl({
        src: [url],
        format: ["mp3", "ogg", "wav"],
        volume,
        html5: false,
        // ponytail: Web Audio rate also shifts pitch, so DT sounds like NC; pitch-preserving DT needs a time-stretch worklet.
        rate: this.rate,
        onload: () => {
          this.currentUrl = url;
          resolve();
        },
        onloaderror: (_id, err) =>
          reject(new Error(`Audio load error: ${err}`)),
      });
    });
  }

  reset(): void {
    if (this.howl) {
      this.howl.stop();
      this.howl.seek(0);
    }
    this.startTimestamp = 0;
    this.pauseTime = 0;
    this.playing = false;
    this.soundId = null;
    this.leadInMs = 0;
    this.audioStarted = false;
    this.resyncClock(0);
  }

  /** Restart anchor tracking from a raw anchor; the next audio-clock sample is adopted without slewing. */
  private resyncClock(anchor: number): void {
    this.startTimestamp = anchor;
    this.clockFilter.reset(anchor);
    this.lastClockSampleAt = 0;
  }

  play(leadInMs: number = 0): void {
    if (!this.howl) return;

    this.leadInMs = leadInMs;
    this.startTimestamp = performance.now();
    this.playing = true;

    if (leadInMs > 0) {
      this.audioStarted = false;
      this.pauseTime = -leadInMs;
    } else {
      this.audioStarted = true;
      this.soundId = this.howl.play();
      this.resyncClock(this.startTimestamp);
    }
  }

  /**
   * Re-anchor game time to the audible audio position. Call once per frame while playing
   * (throttled internally). Kept out of getCurrentTime() so the input path stays side-effect free.
   * No-op without Web Audio, so HTML5-audio fallbacks keep the raw performance.now() clock.
   * Elapsed real time is scaled by `rate` everywhere the anchor is used (HT/DT/NC).
   */
  syncClock(): void {
    if (!this.howl || !this.playing || !this.audioStarted || this.soundId === null) return;
    const now = performance.now();
    if (now - this.lastClockSampleAt < CLOCK_SAMPLE_INTERVAL_MS) return;

    const ctx = Howler.usingWebAudio ? Howler.ctx : undefined;
    // After the song ends or while Howler waits for the context, seek() is meaningless: don't sample.
    if (!ctx || ctx.state !== "running" || !this.howl.playing(this.soundId)) return;

    const seek = this.howl.seek(this.soundId);
    if (typeof seek !== "number") return;
    this.lastClockSampleAt = now;

    const seekMs = seek * 1000;
    const ctxNowMs = ctx.currentTime * 1000;
    const ts = typeof ctx.getOutputTimestamp === "function" ? ctx.getOutputTimestamp() : null;

    const sample =
      ts && ts.contextTime && ts.performanceTime
        ? anchorFromOutputTimestamp({
            seekMs,
            ctxNowMs,
            gotCtxMs: ts.contextTime * 1000,
            gotPerfMs: ts.performanceTime,
            perfNowMs: now,
          }, this.rate)
        : anchorFromLatency(seekMs, now, (ctx.outputLatency || ctx.baseLatency || 0) * 1000, this.rate);

    this.startTimestamp = this.clockFilter.push(sample);
  }

  pause(): void {
    if (!this.howl) return;
    this.pauseTime = this.getCurrentTime();
    if (this.audioStarted && this.soundId !== null) {
      this.howl.pause(this.soundId);
    }
    this.playing = false;
  }

  resume(): void {
    if (!this.howl) return;
    const current = this.audioStarted ? this.getCurrentTime() : this.pauseTime;
    if (!this.audioStarted) {
      this.startTimestamp = performance.now() - (current + this.leadInMs) / this.rate;
    } else {
      this.startTimestamp = performance.now() - current / this.rate;
      if (this.soundId !== null) {
        this.howl.play(this.soundId);
      }
      this.resyncClock(this.startTimestamp);
    }
    this.playing = true;
  }

  /**
   * Get current playback time in milliseconds.
   * Handles negative lead-in time before actual audio start.
   */
  getCurrentTime(): number {
    if (!this.howl) return 0;

    if (!this.playing) return this.pauseTime;

    if (!this.audioStarted) {
      const elapsed = (performance.now() - this.startTimestamp) * this.rate;
      const current = -this.leadInMs + elapsed;
      if (current >= 0) {
        this.audioStarted = true;
        this.soundId = this.howl.play();
        this.resyncClock(performance.now() - current / this.rate);
        return current + this.globalOffset;
      }
      return current + this.globalOffset;
    }

    return this.getTimeAt(performance.now());
  }

  /**
   * Song time (ms) at a point on the `performance.now()` timeline, e.g. `KeyboardEvent.timeStamp`.
   * Same clock as getCurrentTime() but side-effect free (never starts audio), so the input
   * handler can judge a press at when it happened rather than when its handler ran.
   */
  getTimeAt(perfMs: number): number {
    if (!this.howl) return 0;
    if (!this.playing) return this.pauseTime;
    if (!this.audioStarted) return -this.leadInMs + (perfMs - this.startTimestamp) * this.rate + this.globalOffset;
    return (perfMs - this.startTimestamp) * this.rate + this.globalOffset;
  }

  seek(timeMs: number): void {
    if (!this.howl) return;

    if (timeMs < 0) {
      if (this.audioStarted && this.soundId !== null) {
        this.howl.stop();
        this.soundId = null;
      }
      this.audioStarted = false;
      this.leadInMs = -timeMs;
      this.startTimestamp = performance.now();
      if (!this.playing) {
        this.pauseTime = timeMs;
      }
      return;
    }

    if (!this.audioStarted) {
      this.audioStarted = true;
      this.soundId = this.howl.play();
    }

    const seekSeconds = (timeMs - this.globalOffset) / 1000;
    if (this.soundId !== null) {
      this.howl.seek(Math.max(0, seekSeconds), this.soundId);
    }

    if (this.playing) {
      this.resyncClock(performance.now() - timeMs / this.rate);
    } else {
      this.pauseTime = timeMs;
    }
  }

  setVolume(vol: number): void {
    if (this.howl && this.soundId !== null) this.howl.volume(vol, this.soundId);
    else if (this.howl) this.howl.volume(vol);
  }

  onEnd(callback: () => void): void {
    if (this.howl) this.howl.on("end", callback);
  }

  getDuration(): number {
    if (!this.howl) return 0;
    return (this.howl.duration() as number) * 1000;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  destroy(): void {
    if (this.howl) {
      this.howl.stop();
      this.howl.unload();
      this.howl = null;
    }
    this.playing = false;
  }
}
