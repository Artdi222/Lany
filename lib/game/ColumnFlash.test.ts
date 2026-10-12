import { describe, expect, test } from "bun:test";
import { ColumnFlashes, FLASH_DURATION_MS, FLASH_PEAK } from "./ColumnFlash";

/** Advance by `totalMs` in steps of `stepMs` (a frame rate), like a ticker would. */
function run(flashes: ColumnFlashes, totalMs: number, stepMs: number) {
  for (let t = 0; t < totalMs - 1e-9; t += stepMs) flashes.tick(Math.min(stepMs, totalMs - t));
}

describe("ColumnFlashes", () => {
  test("a press lights its column at peak and leaves the others dark", () => {
    const f = new ColumnFlashes(4);
    f.trigger(2);
    expect(f.alpha(2)).toBe(FLASH_PEAK);
    expect([0, 1, 3].map((c) => f.alpha(c))).toEqual([0, 0, 0]);
  });

  test("fades linearly to zero over FLASH_DURATION_MS", () => {
    const f = new ColumnFlashes(4);
    f.trigger(0);
    f.tick(FLASH_DURATION_MS / 2);
    expect(f.alpha(0)).toBeCloseTo(FLASH_PEAK / 2, 6);
    f.tick(FLASH_DURATION_MS / 2);
    expect(f.alpha(0)).toBe(0);
  });

  test("fade length does not depend on the frame rate", () => {
    const at60 = new ColumnFlashes(1);
    const at144 = new ColumnFlashes(1);
    at60.trigger(0);
    at144.trigger(0);
    run(at60, 100, 1000 / 60);
    run(at144, 100, 1000 / 144);
    expect(at60.alpha(0)).toBeCloseTo(at144.alpha(0), 2);
    expect(at60.alpha(0)).toBeCloseTo(FLASH_PEAK / 2, 2);
  });

  test("a new press while fading restarts the flash at peak", () => {
    const f = new ColumnFlashes(4);
    f.trigger(1);
    f.tick(150);
    expect(f.alpha(1)).toBeLessThan(FLASH_PEAK / 2);
    f.trigger(1);
    expect(f.alpha(1)).toBe(FLASH_PEAK);
  });

  test("alpha never goes below zero, even for a long frame", () => {
    const f = new ColumnFlashes(4);
    f.trigger(3);
    f.tick(5_000);
    expect(f.alpha(3)).toBe(0);
  });

  test("tick reports whether anything changed, so idle frames cost nothing", () => {
    const f = new ColumnFlashes(4);
    expect(f.tick(16)).toBe(false);
    f.trigger(0);
    expect(f.tick(16)).toBe(true);
    f.tick(1_000);
    expect(f.tick(16)).toBe(false);
  });

  test("columns fade independently", () => {
    const f = new ColumnFlashes(4);
    f.trigger(0);
    f.tick(100);
    f.trigger(3);
    f.tick(50);
    expect(f.alpha(0)).toBeCloseTo(FLASH_PEAK * (1 - 150 / FLASH_DURATION_MS), 6);
    expect(f.alpha(3)).toBeCloseTo(FLASH_PEAK * (1 - 50 / FLASH_DURATION_MS), 6);
  });

  test("ignores out-of-range columns and non-positive deltas", () => {
    const f = new ColumnFlashes(4);
    expect(() => f.trigger(9)).not.toThrow();
    expect(f.alpha(9)).toBe(0);
    f.trigger(0);
    f.tick(-5);
    f.tick(Number.NaN);
    expect(f.alpha(0)).toBe(FLASH_PEAK);
  });

  test("reset clears every flash", () => {
    const f = new ColumnFlashes(4);
    f.trigger(0);
    f.trigger(1);
    f.reset();
    expect([0, 1].map((c) => f.alpha(c))).toEqual([0, 0]);
    expect(f.tick(16)).toBe(false);
  });
});
