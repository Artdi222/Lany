/**
 * Per-column hit-flash state, kept out of PixiJS so it is plain, testable math.
 *
 * Replaces the old per-flash `ticker.add(fadeOut)` callbacks, which (1) ignored a new press while a
 * column was still fading, (2) faded by a fixed step per frame so the flash lasted 200ms at 60Hz but
 * 83ms at 144Hz, and (3) added and removed a ticker callback on every hit.
 */

/** Alpha right after a press (unchanged from the previous renderer). */
export const FLASH_PEAK = 0.6;
/** Time to fade from peak to 0. Matches the old 12 frames at 60Hz. */
export const FLASH_DURATION_MS = 200;

export class ColumnFlashes {
  private alphas: number[];

  constructor(columns: number) {
    this.alphas = new Array<number>(columns).fill(0);
  }

  /** Light a column at peak; restarts the fade if it is already lit. */
  trigger(column: number): void {
    if (column >= 0 && column < this.alphas.length) this.alphas[column] = FLASH_PEAK;
  }

  alpha(column: number): number {
    return this.alphas[column] ?? 0;
  }

  /** Advance every fade by `deltaMs`. Returns true if any alpha changed. */
  tick(deltaMs: number): boolean {
    if (!(deltaMs > 0)) return false;
    const step = (FLASH_PEAK * deltaMs) / FLASH_DURATION_MS;
    let changed = false;
    for (let i = 0; i < this.alphas.length; i++) {
      if (this.alphas[i] > 0) {
        this.alphas[i] = Math.max(0, this.alphas[i] - step);
        changed = true;
      }
    }
    return changed;
  }

  reset(): void {
    this.alphas.fill(0);
  }
}
