/**
 * Pure math for keeping the game clock locked to the audio that is actually *audible*.
 *
 * The game clock is `performance.now() - anchor`. Three things make a one-shot anchor wrong:
 *  - the audio clock (`ctx.currentTime`) ticks in coarse steps (~8ms, up to ~21ms), so any
 *    single read is stale;
 *  - the audio clock runs at a slightly different rate than `performance.now()` (measured
 *    ~0.25 ms/s, i.e. ~50ms over a 200s song);
 *  - sound is audible `outputLatency` (~40ms+) after the context renders it.
 * So the anchor is re-estimated continuously from `Howl.seek()` + `getOutputTimestamp()`
 * and smoothed by `AnchorFilter`.
 */

export interface OutputSample {
  /** `howl.seek() * 1000`, read in the same synchronous block as `ctxNowMs`. */
  seekMs: number;
  /** `ctx.currentTime * 1000`. */
  ctxNowMs: number;
  /** `ctx.getOutputTimestamp().contextTime * 1000`. */
  gotCtxMs: number;
  /** `ctx.getOutputTimestamp().performanceTime`. */
  gotPerfMs: number;
  perfNowMs: number;
}

/**
 * `performance.now()` value at which the *audible* song time is 0.
 *
 * Song time at the context instant being output is `seek - (ctxNow - gotCtx)`; that instant
 * is `gotPerf` on the performance clock. Staleness of `ctxNow` cancels because `seek` and
 * `ctxNow` are read together.
 */
export function anchorFromOutputTimestamp(s: OutputSample, rate = 1): number {
  // At `rate`, song time advances `rate` ms per real ms, so the song position converts back by `/ rate`.
  return s.gotPerfMs - s.seekMs / rate + (s.ctxNowMs - s.gotCtxMs);
}

/** Fallback when `getOutputTimestamp` is unavailable: subtract the reported output latency. */
export function anchorFromLatency(seekMs: number, perfNowMs: number, latencyMs: number, rate = 1): number {
  return perfNowMs - seekMs / rate + latencyMs;
}

/**
 * The `performance.now()` time an input event actually happened, from `event.timeStamp`.
 *
 * A key press that arrives while the main thread is busy waits in the queue, so judging it
 * at "when the handler runs" adds that wait to the player's timing error. `timeStamp` is
 * when the browser received it. It is only trusted if it looks like a point on the
 * performance timeline in the recent past; otherwise (0, NaN, future, epoch-based, stale)
 * the handler time `nowMs` is used, which is the previous behaviour.
 */
export function resolveEventTime(eventTimeStamp: number, nowMs: number, maxAgeMs = 250): number {
  if (!Number.isFinite(eventTimeStamp) || eventTimeStamp <= 0) return nowMs;
  const age = nowMs - eventTimeStamp;
  if (age < 0 || age > maxAgeMs) return nowMs;
  return eventTimeStamp;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface AnchorFilterOptions {
  /** Samples in the median window (outlier rejection). */
  window?: number;
  /** Max anchor movement per accepted sample, so notes never visibly jump. */
  maxSlewMs?: number;
  /** A median further than this from the anchor is a real discontinuity: snap to it. */
  jumpMs?: number;
}

export class AnchorFilter {
  private samples: number[] = [];
  private anchor: number | null = null;
  private snapNext = true;
  private readonly window: number;
  private readonly maxSlewMs: number;
  private readonly jumpMs: number;

  constructor({ window = 24, maxSlewMs = 0.5, jumpMs = 40 }: AnchorFilterOptions = {}) {
    this.window = window;
    this.maxSlewMs = maxSlewMs;
    this.jumpMs = jumpMs;
  }

  get value(): number | null {
    return this.anchor;
  }

  /** Forget history (seek, pause/resume, audio start). The next sample is adopted without slewing. */
  reset(initial: number | null = null): void {
    this.samples = [];
    this.anchor = initial;
    this.snapNext = true;
  }

  /** Feed one anchor estimate; returns the smoothed anchor. */
  push(sample: number): number {
    this.samples.push(sample);
    if (this.samples.length > this.window) this.samples.shift();
    const target = median(this.samples);

    if (this.anchor === null || this.snapNext) {
      this.anchor = target;
      this.snapNext = false;
      return this.anchor;
    }

    const delta = target - this.anchor;
    if (Math.abs(delta) > this.jumpMs) {
      this.anchor = target;
    } else {
      this.anchor += Math.max(-this.maxSlewMs, Math.min(this.maxSlewMs, delta));
    }
    return this.anchor;
  }
}
