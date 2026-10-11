/**
 * Frequency data of the menu music for the logo visualizer.
 *
 * The menu track is a blob: URL (unpacked by BeatmapLoader), so routing it through Web Audio is same-origin.
 * Once an element is routed, it is only heard while the AudioContext runs, so the graph is built inside a
 * user gesture (where resume() is allowed) and never while the context could stay suspended.
 */
let analyser: AnalyserNode | null = null;
let armed = false;

export function armMenuAnalyser(audio: HTMLAudioElement) {
  if (armed || typeof window === "undefined") return;
  armed = true;
  const build = () => {
    window.removeEventListener("pointerdown", build);
    window.removeEventListener("keydown", build);
    try {
      const ctx = new AudioContext();
      const node = ctx.createAnalyser();
      node.fftSize = 256;
      node.smoothingTimeConstant = 0.75;
      ctx.createMediaElementSource(audio).connect(node);
      node.connect(ctx.destination);
      ctx.resume().catch(() => {});
      analyser = node;
    } catch {
      // ponytail: no Web Audio (or already routed) = no visualizer; the music itself is untouched.
    }
  };
  window.addEventListener("pointerdown", build);
  window.addEventListener("keydown", build);
}

export const getMenuAnalyser = () => analyser;
