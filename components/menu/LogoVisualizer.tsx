"use client";

import { useEffect, useRef } from "react";
import { useMusicStore } from "@/lib/store/useMusicStore";
import { armMenuAnalyser, getMenuAnalyser } from "@/lib/audio/menuAnalyser";
import { useAmbientPaused } from "@/components/ui/AmbientMotionController";

const BARS = 120;
/** Bar length at full volume, as a fraction of the logo radius. */
const MAX_LENGTH = 0.45;

/** Radial bars around the menu logo, driven by the playing track (lazer-style logo visualizer). */
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
    let raf = 0;
    let data: Uint8Array<ArrayBuffer> | null = null;
    const levels = new Float32Array(BARS);

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const size = canvas.clientWidth * devicePixelRatio;
      if (canvas.width !== size) canvas.width = canvas.height = size;
      g.clearRect(0, 0, size, size);

      const analyser = getMenuAnalyser();
      const audio = useMusicStore.getState().currentAudio;
      if (analyser && audio && !audio.paused) {
        data ??= new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
      }
      // Bars mirror the lower ~70% of the spectrum around the circle; fall off smoothly when the music stops.
      const bins = data ? Math.floor(data.length * 0.7) : 0;
      for (let i = 0; i < BARS; i++) {
        const v = data && !audio?.paused ? data[Math.floor(((i < BARS / 2 ? i : BARS - 1 - i) / (BARS / 2)) * bins)] / 255 : 0;
        levels[i] = Math.max(v, levels[i] * 0.9);
      }

      const c = size / 2;
      const r = size * 0.31; // the logo circle is 62% of the canvas
      g.strokeStyle = "rgba(255,255,255,0.28)";
      g.lineWidth = (2 * Math.PI * r) / BARS * 0.55;
      g.beginPath();
      for (let i = 0; i < BARS; i++) {
        const len = levels[i] * r * MAX_LENGTH;
        if (len < 1) continue;
        const a = (i / BARS) * Math.PI * 2 - Math.PI / 2;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        g.moveTo(c + cos * r, c + sin * r);
        g.lineTo(c + cos * (r + len), c + sin * (r + len));
      }
      g.stroke();
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [paused]);

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[161%] w-[161%] -translate-x-1/2 -translate-y-1/2" />;
}
