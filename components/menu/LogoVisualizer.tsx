"use client";

import { useEffect, useRef } from "react";
import { useMusicStore } from "@/lib/store/useMusicStore";
import { armMenuAnalyser, getMenuAnalyser } from "@/lib/audio/menuAnalyser";
import { useAmbientPaused } from "@/components/ui/AmbientMotionController";

// Modelled on lazer's logo visualiser (menu photo `1791442764396`): 200 thin translucent bars repeated in 5 rounds
// (72° apart), linear amplitudes so most bars stay short and only peaks spike, bars decay slowly, and the
// amplitude-to-bar mapping shifts every 50 ms so the spikes travel around the logo.
const BARS = 200;
const ROUNDS = 5;
const DECAY_PER_MS = 0.0024;
const SHIFT_EVERY_MS = 50;
const SHIFT_STEP = 5;
/** Bar length at amplitude 1, as a fraction of the logo radius. */
const MAX_LENGTH = 1;
/** Linear FFT magnitudes are small; this brings loud peaks near 1 (tuned by eye against the photo). */
const GAIN = 4;

/** Radial bars around the menu logo, driven by the playing track; also drives the logo's beat kick (`--beat`). */
export function LogoVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paused = useAmbientPaused();

  useEffect(() => {
    const audio = useMusicStore.getState().currentAudio;
    if (audio) armMenuAnalyser(audio);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const g = canvas?.getContext("2d");
    if (!canvas || !g || paused) return;
    const host = canvas.parentElement;
    const amps = new Float32Array(BARS);
    let db: Float32Array<ArrayBuffer> | null = null;
    let raf = 0;
    let last = performance.now();
    let shiftClock = 0;
    let offset = 0;
    // Kick detection: bass energy against its slow running average; fast attack, slow release.
    let bassAvg = 0;
    let beat = 0;

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const dt = Math.min(100, now - last);
      last = now;
      const size = canvas.clientWidth * devicePixelRatio;
      if (canvas.width !== size) canvas.width = canvas.height = size;
      g.clearRect(0, 0, size, size);

      const analyser = getMenuAnalyser();
      const audio = useMusicStore.getState().currentAudio;
      const live = !!analyser && !!audio && !audio.paused;
      if (live) {
        db ??= new Float32Array(analyser.frequencyBinCount);
        analyser.getFloatFrequencyData(db);
      }
      for (let i = 0; i < BARS; i++) {
        const fresh = live && db ? Math.min(1, Math.pow(10, db[i] / 20) * GAIN) : 0;
        amps[i] = Math.max(fresh, amps[i] - DECAY_PER_MS * dt);
      }

      const bass = live ? (amps[0] + amps[1] + amps[2] + amps[3]) / 4 : 0;
      bassAvg = bassAvg * 0.96 + bass * 0.04;
      beat = Math.max(Math.min(1, Math.max(0, bass - bassAvg * 1.08) * 4 + bass * bass * 0.3), beat * 0.86);
      host?.style.setProperty("--beat", beat.toFixed(3));

      shiftClock += dt;
      while (shiftClock >= SHIFT_EVERY_MS) {
        shiftClock -= SHIFT_EVERY_MS;
        offset = (offset + SHIFT_STEP) % BARS;
      }

      const c = size / 2;
      const r = size * 0.25; // the logo circle is half the canvas, leaving room for full-radius spikes
      g.strokeStyle = "rgba(255,255,255,0.2)";
      g.lineWidth = (2 * Math.PI * r) / BARS;
      // One stroke per round so overlapping rounds add up, as lazer's additive bars do.
      for (let j = 0; j < ROUNDS; j++) {
        g.beginPath();
        for (let i = 0; i < BARS; i++) {
          const len = amps[(i + offset) % BARS] * r * MAX_LENGTH;
          if (len < 1) continue;
          const a = (i / BARS + j / ROUNDS) * Math.PI * 2;
          const cos = Math.cos(a);
          const sin = Math.sin(a);
          g.moveTo(c + cos * r, c + sin * r);
          g.lineTo(c + cos * (r + len), c + sin * (r + len));
        }
        g.stroke();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      host?.style.removeProperty("--beat");
    };
  }, [paused]);

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[200%] w-[200%] -translate-x-1/2 -translate-y-1/2" />;
}
