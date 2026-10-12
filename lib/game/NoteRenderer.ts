import * as PIXI from "pixi.js";
import type { ParsedNote, ScrollDirection } from "@/types/game";
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
// Gameplay look measured from the reference shot (1920x1080, 4K); everything scales with screen height.
const REF_H = 1080;
const RECEPTOR_COLOR = 0x8a8a8a;
const RECEPTOR_PRESSED_COLOR = 0xffffff;
const HOLD_HEAD_COLOR = 0xd8b8e8;
const TAP_HEAD_COLOR = 0x86aae8;
const HOLD_BODY_COLOR = 0xc0c0c0;
const HOLD_BODY_EDGE = 0x5a5a5a;

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

/** Head (or receptor-sized) circle texture: colored fill inside a thin white rim. */
function circleTexture(app: PIXI.Application, r: number, fill: number, rim: number): PIXI.RenderTexture {
  const g = new PIXI.Graphics();
  g.beginFill(0xffffff);
  g.drawCircle(r, r, r);
  g.endFill();
  g.beginFill(fill);
  g.drawCircle(r, r, r - rim);
  g.endFill();
  const tex = PIXI.RenderTexture.create({
    width: r * 2,
    height: r * 2,
    scaleMode: PIXI.SCALE_MODES.LINEAR,
    resolution: app.renderer.resolution,
  });
  app.renderer.render(g, { renderTexture: tex });
  g.destroy();
  return tex;
}

export class NoteRenderer {
  private app: PIXI.Application;
  private laneContainer: PIXI.Container;
  private notesContainer: PIXI.Container;
  private hitZone: PIXI.Graphics;
  private pressedReceptors: PIXI.Graphics[];
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
  private holdHeadTexture: PIXI.RenderTexture | null = null;

  // Hold body sprite pool
  private holdPool: HoldBodySprite[] = [];
  private holdTexture: PIXI.RenderTexture | null = null;
  private activeHolds: HoldBodySprite[] = [];
  private holdBodyWidth: number = 0;

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
    this.scrollDirection = scrollDirection;
    this.scrollSpeed = scrollSpeed;
    this.percyMaxLengthPx = percyMaxLengthPx || 99999; // guard stale null from localStorage
    const scale = app.screen.height / REF_H;
    // Reference: 162px between column centres, head r71, receptor ring r73, body 125px, receptor 128px from the edge.
    const spacing = (keyCount === 4 ? 162 : 116) * scale;
    const k = spacing / 162;
    this.columnWidth = 125 * k;
    this.laneGap = spacing - this.columnWidth;
    this.laneWidth =
      this.columnWidth * keyCount + this.laneGap * (keyCount - 1);
    this.laneX = (app.screen.width - this.laneWidth) / 2;
    this.hitZoneY = scrollDirection === "down"
      ? app.screen.height - 128 * scale
      : 128 * scale;
    this.parsedColors = keyCount === 4 ? PARSED_COLORS_4K : PARSED_COLORS_7K;
    this.radius = 71 * k;
    this.holdBodyWidth = this.columnWidth;
    const receptorR = 73 * k;

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

    // Receptors: grey ring, replaced by a white ring while the key is held (drawn once, toggled).
    // Rings only, never a filled circle, so a press never covers the head pinned on the receptor.
    this.hitZone = new PIXI.Graphics();
    for (let i = 0; i < keyCount; i++) {
      this.hitZone.lineStyle(6 * k, RECEPTOR_COLOR, 1);
      this.hitZone.drawCircle(this.centerXs[i], this.hitZoneY, receptorR);
    }
    if (hidden) this.addHiddenCover(app.screen.height);
    this.laneContainer.addChild(this.hitZone);

    this.pressedReceptors = [];
    for (let i = 0; i < keyCount; i++) {
      const ring = new PIXI.Graphics();
      ring.lineStyle(9 * k, RECEPTOR_PRESSED_COLOR, 1);
      ring.drawCircle(this.centerXs[i], this.hitZoneY, receptorR);
      ring.visible = false;
      this.laneContainer.addChild(ring);
      this.pressedReceptors.push(ring);
    }

    const rim = Math.max(2, 3 * k);
    this.noteTexture = circleTexture(app, this.radius, TAP_HEAD_COLOR, rim);
    this.holdHeadTexture = circleTexture(app, this.radius, HOLD_HEAD_COLOR, rim);

    // Hold body: flat grey bar with a thin darker edge; NineSlice keeps the edge 2px at any length.
    const holdW = Math.round(this.holdBodyWidth);
    const holdG = new PIXI.Graphics();
    holdG.beginFill(HOLD_BODY_EDGE);
    holdG.drawRect(0, 0, holdW, 8);
    holdG.endFill();
    holdG.beginFill(HOLD_BODY_COLOR);
    holdG.drawRect(2, 0, holdW - 4, 8);
    holdG.endFill();
    this.holdTexture = PIXI.RenderTexture.create({
      width: holdW,
      height: 8,
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
      const s = new PIXI.NineSlicePlane(this.holdTexture!, 3, 0, 3, 0);
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

  /** Show the pressed receptor while a column's key is held. Called straight from the key handlers. */
  setColumnPressed(column: number, pressed: boolean): void {
    const ring = this.pressedReceptors[column];
    if (ring && !ring.destroyed) ring.visible = pressed;
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
      const centerX = this.centerXs[note.column];
      // A hold whose head was hit (held now, or let go early) never goes back past the receptor:
      // its remaining body slides in from the receptor instead of jumping to where the head would be.
      const pinned = note.isHoldNote && !!note.headHit;
      const startY = pinned
        ? (isDown ? Math.min(y, this.hitZoneY) : Math.max(y, this.hitZoneY))
        : y;

      // ─── HOLD BODY: flat bar from the head to the tail ───
      if (note.isHoldNote) {
        const endDiff = note.endTime - currentTime;
        const endY = isDown
          ? this.hitZoneY - endDiff * pxPerMs
          : this.hitZoneY + endDiff * pxPerMs;
        const bodyH = Math.min(Math.abs(endY - startY), this.percyMaxLengthPx);

        if (bodyH > 0) {
          let hold = this.holdPool.pop();
          if (!hold) {
            const s = new PIXI.NineSlicePlane(this.holdTexture!, 3, 0, 3, 0);
            s.pivot.set(this.holdBodyWidth / 2, 0);
            s.visible = false;
            this.notesContainer.addChildAt(s, 0);
            hold = { sprite: s, inUse: true };
          }
          hold.sprite.visible = true;
          hold.sprite.tint = note.holdMissed ? 0x707070 : 0xffffff;
          hold.sprite.alpha = note.holdMissed ? 0.6 : 1;
          hold.sprite.height = bodyH;
          hold.sprite.x = centerX;
          hold.sprite.y = isDown ? startY - bodyH : startY;
          hold.inUse = true;
          this.activeHolds.push(hold);
        }
      }

      // ─── HEAD: pinned to the receptor while held, gone once the hold is let go ───
      if (pinned && note.holdMissed) continue;
      const headY = note.isActiveHold ? this.hitZoneY : y;
      if (headY > -100 && headY < screenH + 100) {
        let sprite = this.notePool.pop();
        if (!sprite) {
          sprite = new PIXI.Sprite(this.noteTexture!);
          sprite.anchor.set(0.5);
          this.notesContainer.addChild(sprite);
        }
        sprite.texture = note.isHoldNote ? this.holdHeadTexture! : this.noteTexture!;
        sprite.visible = true;
        const missed = note.isHoldNote && note.holdMissed;
        sprite.tint = missed ? 0x707070 : 0xffffff;
        sprite.alpha = missed ? 0.5 : 1;
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
    this.holdEndTimes.clear();
  }
}
