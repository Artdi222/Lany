import * as PIXI from "pixi.js";
import type { ParsedNote, ScrollDirection } from "@/types/game";
import { ColumnFlashes } from "./ColumnFlash";
import { advanceFirstVisible, holdEndKey } from "./noteUtils";

const COLUMN_COLORS_4K = ["#8f95c4", "#ffffff", "#ffffff", "#8f95c4"];
const COLUMN_COLORS_7K = [
  "#8f95c4",
  "#b9bde6",
  "#ffffff",
  "#787ac7",
  "#ffffff",
  "#b9bde6",
  "#8f95c4",
];
const HIT_ZONE_COLOR = 0x7d7d7d;
const COLUMN_FLASH_COLOR = 0x7d7d7d;

// Pre-parsed colors to avoid parseInt on every frame
const PARSED_COLORS_4K = COLUMN_COLORS_4K.map((c) =>
  parseInt(c.replace("#", ""), 16),
);
const PARSED_COLORS_7K = COLUMN_COLORS_7K.map((c) =>
  parseInt(c.replace("#", ""), 16),
);

interface HoldBodySprite {
  sprite: PIXI.NineSlicePlane;
  inUse: boolean;
}

export class NoteRenderer {
  private app: PIXI.Application;
  private laneContainer: PIXI.Container;
  private notesContainer: PIXI.Container;
  private hitZone: PIXI.Graphics;
  private columnFlashes: PIXI.Graphics[];
  private backgroundSprite: PIXI.Sprite | null = null;
  private backgroundContainer: PIXI.Container;
  private keyCount: number;
  private columnWidth: number;
  private laneWidth: number;
  private laneX: number;
  private hitZoneY: number;
  private scrollDirection: ScrollDirection;
  private scrollSpeed: number;
  private parsedColors: number[];
  private laneGap: number = 18;
  private radius: number;
  private centerXs: number[]; // pre-computed per column
  private backgroundDim: number = 60;
  private backgroundBlur: number = 0;
  private dimGraphics: PIXI.Graphics | null = null;
  private blurFilter: PIXI.BlurFilter | null = null;

  // Head note sprite pool
  private notePool: PIXI.Sprite[] = [];
  private activeNotes: PIXI.Sprite[] = [];
  private noteTexture: PIXI.RenderTexture | null = null;

  // Hold body sprite pool
  private holdPool: HoldBodySprite[] = [];
  private holdTexture: PIXI.RenderTexture | null = null;
  private activeHolds: HoldBodySprite[] = [];
  private holdCapSize: number = 0; // cap height in pixels for NineSlicePlane

  // Per-column flash fade state (advanced once per frame by tickFlashes)
  private flashes: ColumnFlashes;

  // Reusable Set to avoid allocation per frame (numeric keys: see holdEndKey)
  private holdEndTimes: Set<number> = new Set();

  // First chart index still worth rendering; advances monotonically so a frame never rescans the notes
  // that are already behind the hit line. Reset when time goes backwards (retry/seek) or the chart changes.
  private firstVisible = 0;
  private lastRenderTime = -Infinity;
  private lastNotes: ParsedNote[] | null = null;

  // Percy skin: maximum visual LN body length in pixels (Infinity = no cap)
  private percyMaxLengthPx: number;
  private hiddenTexture: PIXI.Texture | null = null;
  /** Playback rate (HT/DT/NC). Scroll speed stays constant on screen like lazer mania, so px per song-ms is divided by it. */
  private rate: number;

  constructor(
    app: PIXI.Application,
    keyCount: number,
    scrollDirection: ScrollDirection,
    scrollSpeed: number,
    percyMaxLengthPx: number = 99999,
    hidden: boolean = false,
    rate: number = 1,
  ) {
    this.rate = rate;
    this.app = app;
    this.keyCount = keyCount;
    this.flashes = new ColumnFlashes(keyCount);
    this.scrollDirection = scrollDirection;
    this.scrollSpeed = scrollSpeed;
    this.percyMaxLengthPx = percyMaxLengthPx || 99999; // guard stale null from localStorage
    const isBigger = app.screen.height > 1000;
    const sizeScale = isBigger ? 1.2 : 1.0;
    
    const baseOffset = 130;
    const adjustment = isBigger ? 50 : 0;

    this.columnWidth = (keyCount === 4 ? 128 : 92) * sizeScale;
    this.laneGap = 18 * sizeScale;
    this.laneWidth =
      this.columnWidth * keyCount + this.laneGap * (keyCount - 1);
    this.laneX = (app.screen.width - this.laneWidth) / 2;
    this.hitZoneY = scrollDirection === "down" 
      ? app.screen.height - (baseOffset + adjustment) 
      : (baseOffset - adjustment);
    this.parsedColors = keyCount === 4 ? PARSED_COLORS_4K : PARSED_COLORS_7K;
    this.radius = this.columnWidth / 2 - 4;

    // Pre-compute centerX per column — avoids repeated math in the hot loop
    this.centerXs = [];
    for (let i = 0; i < keyCount; i++) {
      this.centerXs.push(
        this.laneX +
          i * (this.columnWidth + this.laneGap) +
          this.columnWidth / 2,
      );
    }

    // Background container
    this.backgroundContainer = new PIXI.Container();
    app.stage.addChildAt(this.backgroundContainer, 0);

    this.laneContainer = new PIXI.Container();
    this.notesContainer = new PIXI.Container();
    this.laneContainer.addChild(this.notesContainer);
    app.stage.addChild(this.laneContainer);

    const bg = new PIXI.Graphics();
    bg.beginFill(0x000000, 0.7);
    bg.drawRect(this.laneX, 0, this.laneWidth, app.screen.height);
    bg.endFill();
    this.laneContainer.addChildAt(bg, 0);

    // Hit zone (drawn once, never redrawn)
    this.hitZone = new PIXI.Graphics();
    for (let i = 0; i < keyCount; i++) {
      const centerX = this.centerXs[i];
      this.hitZone.lineStyle(4, HIT_ZONE_COLOR, 0.8);
      this.hitZone.drawCircle(centerX, this.hitZoneY, this.radius);
      this.hitZone.lineStyle(8, HIT_ZONE_COLOR, 0.15);
      this.hitZone.drawCircle(centerX, this.hitZoneY, this.radius);
    }
    if (hidden) this.addHiddenCover(app.screen.height);
    this.laneContainer.addChild(this.hitZone);

    // Column flashes (drawn once, alpha-animated)
    this.columnFlashes = [];
    for (let i = 0; i < keyCount; i++) {
      const flash = new PIXI.Graphics();
      flash.beginFill(COLUMN_FLASH_COLOR, 0.6);
      flash.drawCircle(this.centerXs[i], this.hitZoneY, this.radius);
      flash.endFill();
      flash.alpha = 0;
      // Under the notes, so a press never covers the head pinned on the receptor.
      this.laneContainer.addChildAt(flash, this.laneContainer.getChildIndex(this.notesContainer));
      this.columnFlashes.push(flash);
    }

    // Build note head texture (white circle, tinted per column at runtime)
    const headG = new PIXI.Graphics();
    headG.beginFill(0xffffff);
    headG.drawCircle(this.radius, this.radius, this.radius);
    headG.endFill();
    this.noteTexture = PIXI.RenderTexture.create({
      width: this.radius * 2,
      height: this.radius * 2,
      scaleMode: PIXI.SCALE_MODES.LINEAR,
      resolution: app.renderer.resolution,
    });
    app.renderer.render(headG, { renderTexture: this.noteTexture });
    headG.destroy();

    // Build hold body texture — sharp tail, circular start (ponytail)
    const holdW = Math.round(this.radius * 1.8);
    const holdCapR = Math.round(holdW / 2);
    const holdTexH = holdCapR * 2 + 4;
    this.holdCapSize = holdCapR;
    const holdG = new PIXI.Graphics();
    holdG.beginFill(0xffffff);
    if (this.scrollDirection === "down") {
      holdG.moveTo(holdW / 2, 0); // top tip (tail)
      holdG.lineTo(holdW, holdCapR);
      holdG.lineTo(holdW, holdCapR + 4);
      holdG.arc(holdW / 2, holdCapR + 4, holdCapR, 0, Math.PI); // bottom circular (start)
      holdG.lineTo(0, holdCapR);
      holdG.lineTo(holdW / 2, 0);
    } else {
      holdG.arc(holdW / 2, holdCapR, holdCapR, Math.PI, 0); // top circular (start)
      holdG.lineTo(holdW, holdCapR + 4);
      holdG.lineTo(holdW / 2, holdTexH); // bottom tip (tail)
      holdG.lineTo(0, holdCapR + 4);
      holdG.lineTo(0, holdCapR);
    }
    holdG.endFill();
    this.holdTexture = PIXI.RenderTexture.create({
      width: holdW,
      height: holdTexH,
      scaleMode: PIXI.SCALE_MODES.LINEAR,
      resolution: app.renderer.resolution,
    });
    app.renderer.render(holdG, { renderTexture: this.holdTexture });
    holdG.destroy();

    // Pre-warm pools
    for (let i = 0; i < 100; i++) {
      const s = new PIXI.Sprite(this.noteTexture);
      s.anchor.set(0.5);
      s.visible = false;
      this.notesContainer.addChild(s);
      this.notePool.push(s);
    }
    for (let i = 0; i < 50; i++) {
      const s = new PIXI.NineSlicePlane(
        this.holdTexture!,
        0,
        this.holdCapSize,
        0,
        this.holdCapSize, // left, top, right, bottom slices
      );
      s.pivot.set(holdW / 2, 0);
      s.visible = false;
      this.notesContainer.addChildAt(s, 0);
      this.holdPool.push({ sprite: s, inUse: false });
    }

    // Initialize blur filter
    this.blurFilter = new PIXI.BlurFilter();
    this.blurFilter.blur = 0;
  }

  async setBackground(url: string | null): Promise<void> {
    if (!url || !this.app) return;

    try {
      const loadUrl = url;

      const texture = await new Promise<PIXI.Texture>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const base = new PIXI.BaseTexture(img, {
            scaleMode: PIXI.SCALE_MODES.LINEAR,
          });
          // Data URLs may resolve synchronously.
          if (base.valid) {
            resolve(new PIXI.Texture(base));
            return;
          }
          base.on("loaded", () => resolve(new PIXI.Texture(base)));
          base.on("error", (_b: unknown, e: unknown) =>
            reject(new Error(`BaseTexture error: ${e}`)),
          );
        };
        img.onerror = () =>
          reject(
            new Error(`Image decode failed (url length=${loadUrl.length})`),
          );
        img.src = loadUrl;
      });

      if (!texture?.baseTexture?.valid) {
        texture.destroy(true);
        throw new Error("Texture loaded but baseTexture is invalid");
      }

      // Guard: app may have been destroyed while we were awaiting.
      if (!this.app?.renderer) {
        texture.destroy(true);
        return;
      }

      // Capture old texture BEFORE reassigning — destroying it first would null
      // out uvsFloat32 on any sprite still referencing that BaseTexture, which
      // is the root cause of the "Cannot read properties of null (reading
      // 'uvsFloat32')" crash.
      const oldTexture = this.backgroundSprite?.texture ?? null;

      if (this.backgroundSprite) {
        this.backgroundSprite.texture = texture;
      } else {
        this.backgroundSprite = new PIXI.Sprite(texture);
        this.backgroundSprite.anchor.set(0.5);
        this.backgroundContainer.addChild(this.backgroundSprite);

        this.dimGraphics = new PIXI.Graphics();
        this.updateDim();
        this.backgroundContainer.addChild(this.dimGraphics);
      }

      // Apply initial blur
      this.updateBlur();

      // destroyBase=false: discard only this Texture wrapper, not the underlying
      // BaseTexture. Passing true is what triggers the uvsFloat32 crash when
      // PIXI's internal cache still holds a reference to that BaseTexture.
      if (oldTexture && oldTexture !== texture) {
        oldTexture.destroy(false);
      }

      const screenW = this.app.renderer.width;
      const screenH = this.app.renderer.height;
      const screenRatio = screenW / screenH;
      const texRatio = texture.width / texture.height;

      if (texRatio > screenRatio) {
        this.backgroundSprite.height = screenH;
        this.backgroundSprite.width = screenH * texRatio;
      } else {
        this.backgroundSprite.width = screenW;
        this.backgroundSprite.height = screenW / texRatio;
      }

      this.backgroundSprite.x = screenW / 2;
      this.backgroundSprite.y = screenH / 2;
    } catch (e) {
      console.error(
        "Failed to load background:",
        e instanceof Error ? e.message : e,
      );
    }
  }

  /**
   * Light a column. Called straight from the key handler: it only sets a Pixi alpha, so the flash
   * is drawn by the very next render with no React in between. A press while the column is still
   * fading restarts the flash.
   */
  flashColumn(column: number): void {
    const flash = this.columnFlashes[column];
    if (!flash || flash.destroyed) return;
    this.flashes.trigger(column);
    flash.alpha = this.flashes.alpha(column);
  }

  /** Advance all flash fades by one frame. Called once per frame from the game loop. */
  tickFlashes(deltaMs: number): void {
    if (!this.flashes.tick(deltaMs)) return;
    for (let i = 0; i < this.columnFlashes.length; i++) {
      const flash = this.columnFlashes[i];
      if (!flash.destroyed) flash.alpha = this.flashes.alpha(i);
    }
  }

  updateNotes(notes: ParsedNote[], currentTime: number): void {
    if (!this.app) return;

    // --- Return everything to pools (reuse arrays, no allocation) ---
    for (let i = 0; i < this.activeNotes.length; i++) {
      this.activeNotes[i].visible = false;
      this.notePool.push(this.activeNotes[i]);
    }
    this.activeNotes.length = 0;

    for (let i = 0; i < this.activeHolds.length; i++) {
      this.activeHolds[i].sprite.visible = false;
      this.activeHolds[i].inUse = false;
      this.holdPool.push(this.activeHolds[i]);
    }
    this.activeHolds.length = 0;

    this.holdEndTimes.clear();

    const pxPerMs = this.getPxPerMs();
    const isDown = this.scrollDirection === "down";
    const screenH = this.app.screen.height;
    // Look-ahead must cover the full travel distance: from spawn edge to hit zone.
    // spawnDistance = hitZoneY (down) or screenH - hitZoneY (up), plus a small buffer.
    const spawnDistance = isDown
      ? this.hitZoneY + 100
      : screenH - this.hitZoneY + 100;
    const lookAheadMs = spawnDistance / pxPerMs;
    const visibleEnd = currentTime + lookAheadMs;
    const visibleStart = currentTime - 500;

    if (currentTime < this.lastRenderTime || notes !== this.lastNotes) this.firstVisible = 0;
    this.lastRenderTime = currentTime;
    this.lastNotes = notes;
    this.firstVisible = advanceFirstVisible(notes, this.firstVisible, visibleStart);

    for (let ni = this.firstVisible; ni < notes.length; ni++) {
      const note = notes[ni];
      if (note.startTime > visibleEnd) break;

      if (
        note.isHoldNote
          ? note.endTime < visibleStart
          : note.startTime < visibleStart
      )
        continue;
      if (
        (!note.isHoldNote && note.hit) ||
        (note.isHoldNote && note.tailHit && !note.holdMissed)
      )
        continue;

      if (note.isHoldNote) {
        this.holdEndTimes.add(holdEndKey(note.column, note.endTime));
      } else if (this.holdEndTimes.has(holdEndKey(note.column, note.startTime))) {
        continue;
      }

      const timeDiff = note.startTime - currentTime;
      const y = isDown
        ? this.hitZoneY - timeDiff * pxPerMs
        : this.hitZoneY + timeDiff * pxPerMs;
      const color = note.isHoldNote ? 0xd4b6ea : 0x86aae8;
      const tailColor = 0xbbbcbe;
      const centerX = this.centerXs[note.column];

      // ─── HOLD BODY (sprite-based, no Graphics redraw) ───
      if (note.isHoldNote || note.isActiveHold) {
        const endDiff = note.endTime - currentTime;
        const endY = isDown
          ? this.hitZoneY - endDiff * pxPerMs
          : this.hitZoneY + endDiff * pxPerMs;
        // A hit hold (held, or let go early) never goes back past the receptor: the rest of the body
        // slides in from there instead of jumping to where the head would be.
        const startY = note.headHit
          ? (isDown ? Math.min(y, this.hitZoneY) : Math.max(y, this.hitZoneY))
          : y;

        // A hit hold's body is gone once its tail reaches the receptor.
        const tailPassed = isDown ? endY >= this.hitZoneY : endY <= this.hitZoneY;
        if (!(note.headHit && tailPassed) && (!isDown || endY < this.hitZoneY || note.holdMissed)) {
          const realBodyH = Math.abs(endY - startY);
          // Percy-cut: cap visual body length, but never smaller than the
          // NineSlicePlane's two caps (tail-tip + rounded start) + 4px gap.
          const minBodyH = this.holdCapSize * 2 + 4;
          const visualBodyH = Math.max(
            Math.min(realBodyH, this.percyMaxLengthPx),
            minBodyH,
          );

          // Anchor fix: the pivot sits on the texture's top edge.
          // - down scroll: pivot must be at the HEAD side (startY), so shift
          //   the visual top upward from startY by visualBodyH.
          // - up scroll: pivot is already at the HEAD side (startY), just
          //   cap the length.
          // Overlap: extend the body past the head so the start-cap is fully
          // hidden behind the circular head sprite (body is narrower than head).
          const overlap = this.holdCapSize;
          const top = isDown
            ? startY - visualBodyH
            : startY - overlap;

          let hold = this.holdPool.pop();
          if (!hold) {
            const s = new PIXI.NineSlicePlane(
              this.holdTexture!,
              0,
              this.holdCapSize,
              0,
              this.holdCapSize,
            );
            const holdW = Math.round(this.radius * 1.8);
            s.pivot.set(holdW / 2, 0);
            s.visible = false;
            this.notesContainer.addChildAt(s, 0);
            hold = { sprite: s, inUse: true };
          }

          hold.sprite.visible = true;
          if (note.holdMissed) {
            hold.sprite.tint = this.darkenColor(tailColor, 0.4);
            hold.sprite.alpha = 0.6;
          } else {
            hold.sprite.tint = tailColor;
            hold.sprite.alpha = 1.0;
          }
          hold.sprite.height = visualBodyH + overlap;
          hold.sprite.x = centerX;
          hold.sprite.y = top;
          hold.inUse = true;
          this.activeHolds.push(hold);
        }
      }

      // ─── HEAD SPRITE ───
      // Bug #1 fix: during an active hold, pin the head to the hit zone
      // instead of hiding it. It disappears on release via the tailHit
      // check at the top of this loop.
      // Let go early: only the dimmed body shows; pressing again brings the (dimmed) head back on the receptor.
      if (note.isHoldNote && note.headHit && note.holdMissed && !note.isActiveHold) continue;
      const headY = note.isActiveHold ? this.hitZoneY : y;
      if (headY > -100 && headY < screenH + 100) {
        let sprite = this.notePool.pop();
        if (!sprite) {
          sprite = new PIXI.Sprite(this.noteTexture!);
          sprite.anchor.set(0.5);
          this.notesContainer.addChild(sprite);
        }
        sprite.visible = true;
        if (note.isHoldNote && note.holdMissed) {
          sprite.tint = this.darkenColor(color, 0.2);
          sprite.alpha = 0.4;
        } else {
          sprite.tint = color;
          sprite.alpha = 1.0;
        }
        sprite.position.set(centerX, headY);
        this.activeNotes.push(sprite);
      }
    }
  }

  setScrollSpeed(speed: number): void {
    this.scrollSpeed = speed;
  }

  setPercyMaxLength(px: number): void {
    this.percyMaxLengthPx = px;
  }

  setBackgroundDim(dim: number): void {
    this.backgroundDim = dim;
    this.updateDim();
  }

  setBackgroundBlur(blur: number): void {
    this.backgroundBlur = blur;
    this.updateBlur();
  }

  private updateDim(): void {
    if (!this.dimGraphics || !this.app) return;
    this.dimGraphics.clear();
    this.dimGraphics.beginFill(0x000000, this.backgroundDim / 100);
    this.dimGraphics.drawRect(0, 0, this.app.renderer.width, this.app.renderer.height);
    this.dimGraphics.endFill();
  }

  private updateBlur(): void {
    if (!this.backgroundSprite || !this.blurFilter) return;
    // Map 0-100 to something reasonable for blur, say 0-20
    const blurValue = (this.backgroundBlur / 100) * 20;
    this.blurFilter.blur = blurValue;
    
    if (blurValue > 0) {
      this.backgroundSprite.filters = [this.blurFilter];
    } else {
      this.backgroundSprite.filters = null;
    }
  }

  private darkenColor(color: number, factor: number = 0.6): number {
    const r = Math.floor(((color >> 16) & 0xff) * factor);
    const g = Math.floor(((color >> 8) & 0xff) * factor);
    const b = Math.floor((color & 0xff) * factor);
    return (r << 16) | (g << 8) | b;
  }

  getHitZoneY(): number {
    return this.hitZoneY;
  }
  getScrollDirection(): ScrollDirection {
    return this.scrollDirection;
  }
  getScrollSpeed(): number {
    return this.scrollSpeed;
  }
  getLaneBounds() {
    return { x: this.laneX, width: this.laneWidth };
  }

  /**
   * HD: a lane-wide band over the notes, opaque near the hit zone and fading out toward the spawn
   * side, so keys vanish before they are hit. Drawn under the hit zone so receptors stay visible.
   */
  private addHiddenCover(screenH: number): void {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.35, "rgba(0,0,0,1)");
    g.addColorStop(1, "rgba(0,0,0,1)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1, 256);
    this.hiddenTexture = PIXI.Texture.from(canvas);

    // ponytail: fixed coverage (fade over ~20% of the screen, then fully hidden for the last ~25% before the hit line); add a coverage setting if players ask.
    const cover = new PIXI.Sprite(this.hiddenTexture);
    const fadeStart = this.hitZoneY - screenH * 0.46; // distance from the hit line where fading begins (down scroll)
    cover.x = this.laneX;
    cover.width = this.laneWidth;
    if (this.scrollDirection === "down") {
      cover.y = fadeStart;
      cover.height = screenH - fadeStart;
    } else {
      // Flip vertically: the band grows upward from the bottom of the screen to the hit line.
      cover.anchor.y = 1;
      cover.scale.y = -1;
      cover.y = 0;
      cover.height = this.hitZoneY + screenH * 0.46;
    }
    this.laneContainer.addChild(cover);
  }

  /** Pixels per ms of song time. */
  getPxPerMs(): number {
    return (this.scrollSpeed * 0.08) / this.rate;
  }

  destroy(): void {
    this.laneContainer.destroy({ children: true });
    this.hiddenTexture?.destroy(true);
    // texture + baseTexture: the background image is owned by this renderer, free it with the sprite
    this.backgroundContainer.destroy({ children: true, texture: true, baseTexture: true });
    this.noteTexture?.destroy(true);
    this.holdTexture?.destroy(true);
    this.notePool.length = 0;
    this.activeNotes.length = 0;
    this.holdPool.length = 0;
    this.activeHolds.length = 0;
    this.flashes.reset();
    this.holdEndTimes.clear();
  }
}
