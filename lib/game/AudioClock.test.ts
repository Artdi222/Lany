import { describe, expect, test } from "bun:test";
import { AnchorFilter, anchorFromLatency, anchorFromOutputTimestamp, resolveEventTime } from "./AudioClock";

/** Deterministic PRNG so noise-based tests never flake. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe("anchorFromOutputTimestamp", () => {
  // Model: ctx clock = perf + K. Howler computes seek = (ctxNow - C0) (ctxNow may be stale by `stale` ms).
  // The sample being OUTPUT at perf P was rendered at ctx time (P + K - L), L = output latency.
  // Audible song time at P is therefore (P + K - L - C0), so the true anchor is L + C0 - K.
  const K = 12_000;
  const C0 = 12_500;
  const trueAnchor = (L: number) => L + C0 - K;

  const sampleAt = (P: number, L: number, stale: number) => {
    const ctxNow = P + K - stale;
    return {
      seekMs: ctxNow - C0,
      ctxNowMs: ctxNow,
      gotCtxMs: P + K - L,
      gotPerfMs: P - 1.3, // the output timestamp is a little older than "now"
      perfNowMs: P,
    };
  };

  test("recovers the audible-time anchor regardless of ctx staleness", () => {
    for (const stale of [0, 3, 8, 21]) {
      const s = sampleAt(5000, 40, stale);
      // gotPerf offset (-1.3ms) is the sample-age term; the formula must absorb it
      const a = anchorFromOutputTimestamp(s);
      expect(a).toBeCloseTo(trueAnchor(40) - 1.3, 6);
    }
  });

  test("shifts by exactly the output latency", () => {
    const a40 = anchorFromOutputTimestamp(sampleAt(5000, 40, 5));
    const a60 = anchorFromOutputTimestamp(sampleAt(5000, 60, 5));
    expect(a60 - a40).toBeCloseTo(20, 6);
  });
});

describe("anchorFromLatency (fallback without getOutputTimestamp)", () => {
  test("anchors audible time = seek - latency", () => {
    // perf 2000, seek 1000ms, 40ms latency -> audible song time 960 -> anchor 1040
    expect(anchorFromLatency(1000, 2000, 40)).toBeCloseTo(1040, 9);
  });
  test("zero latency degrades to plain seek", () => {
    expect(anchorFromLatency(1000, 2000, 0)).toBeCloseTo(1000, 9);
  });
});

describe("AnchorFilter", () => {
  test("first sample is adopted immediately", () => {
    const f = new AnchorFilter();
    expect(f.value).toBeNull();
    expect(f.push(1234.5)).toBe(1234.5);
  });

  test("a single outlier does not move the anchor", () => {
    const f = new AnchorFilter();
    for (let i = 0; i < 20; i++) f.push(100 + (i % 2) * 0.2);
    const before = f.value!;
    const after = f.push(160); // e.g. a GC pause stretched one sample
    expect(Math.abs(after - before)).toBeLessThan(1);
  });

  test("small steps are slew-limited per push", () => {
    const f = new AnchorFilter({ maxSlewMs: 0.5 });
    for (let i = 0; i < 20; i++) f.push(100);
    let prev = f.value!;
    for (let i = 0; i < 40; i++) {
      const v = f.push(110); // +10ms, below the jump threshold
      expect(Math.abs(v - prev)).toBeLessThanOrEqual(0.5 + 1e-9);
      prev = v;
    }
    expect(prev).toBeCloseTo(110, 6);
  });

  test("a large persistent step snaps instead of crawling", () => {
    const f = new AnchorFilter({ jumpMs: 40 });
    for (let i = 0; i < 30; i++) f.push(100);
    let v = f.value!;
    let pushes = 0;
    while (Math.abs(v - 200) > 1e-6 && pushes < 100) { v = f.push(200); pushes++; } // device switch / long stall
    expect(v).toBeCloseTo(200, 6);
    expect(pushes).toBeLessThanOrEqual(25); // ~1s at 25 Hz, not the 200+ pushes a 0.5ms/push crawl would take
  });

  test("reset(initial) keeps the initial anchor until the next sample, then snaps", () => {
    const f = new AnchorFilter();
    for (let i = 0; i < 20; i++) f.push(100);
    f.reset(500);
    expect(f.value).toBe(500);
    expect(f.push(512)).toBe(512); // within slew/jump range, still snaps after a reset
  });

  /** Track a drifting anchor (0.25 ms/s, measured) sampled at 25 Hz for 200s; returns sorted abs errors. */
  const driftErrors = (noiseMs: number) => {
    const rand = rng(7);
    const f = new AnchorFilter();
    const errs: number[] = [];
    for (let t = 0; t <= 200_000; t += 40) {
      const truth = 1000 + t * (0.25 / 1000);
      const est = f.push(truth + (rand() - 0.5) * noiseMs);
      if (t > 5000) errs.push(Math.abs(est - truth));
    }
    return errs.sort((a, b) => a - b);
  };

  test("tracks clock drift under realistic jitter (+-1ms, as measured on getOutputTimestamp)", () => {
    const errs = driftErrors(2);
    expect(errs[errs.length - 1]).toBeLessThan(1.5);
  });

  test("tracks clock drift under pessimistic jitter (+-5ms)", () => {
    const errs = driftErrors(10);
    expect(errs[Math.floor(errs.length * 0.95)]).toBeLessThan(2.5);
    expect(errs[errs.length - 1]).toBeLessThan(3.5);
  });
});

describe("resolveEventTime", () => {
  const now = 50_000;

  test("uses the event timestamp when it is recent (event waited in the queue)", () => {
    expect(resolveEventTime(49_965, now)).toBe(49_965);
    expect(resolveEventTime(now, now)).toBe(now);
  });

  test("falls back to now for a timestamp in the future", () => {
    expect(resolveEventTime(now + 5, now)).toBe(now);
  });

  test("falls back to now for missing or invalid timestamps", () => {
    expect(resolveEventTime(0, now)).toBe(now);
    expect(resolveEventTime(-3, now)).toBe(now);
    expect(resolveEventTime(Number.NaN, now)).toBe(now);
    expect(resolveEventTime(Number.POSITIVE_INFINITY, now)).toBe(now);
  });

  test("falls back to now for an epoch-based timestamp (not on the performance timeline)", () => {
    expect(resolveEventTime(1_760_000_000_000, now)).toBe(now);
  });

  test("falls back to now when the event is implausibly old", () => {
    expect(resolveEventTime(now - 251, now)).toBe(now);
    expect(resolveEventTime(now - 250, now)).toBe(now - 250);
    expect(resolveEventTime(now - 400, now, 500)).toBe(now - 400);
  });
});

test("anchors scale the song position by the playback rate", () => {
  // At 1.5x, song position 1500 ms is reached 1000 real ms after the anchor.
  const s = { seekMs: 1500, ctxNowMs: 500, gotCtxMs: 500, gotPerfMs: 11000, perfNowMs: 11000 };
  expect(anchorFromOutputTimestamp(s, 1.5)).toBe(10000);
  expect(anchorFromLatency(1500, 11000, 0, 1.5)).toBe(10000);
  expect(anchorFromLatency(750, 11000, 40, 0.75)).toBe(10040);
});
