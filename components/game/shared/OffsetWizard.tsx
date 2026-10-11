"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { notify } from "@/lib/store/useNotificationStore";
import { useSettingsStore } from "@/lib/store/useSettingsStore";
import {
  DEFAULT_CALIBRATION,
  OffsetCalibrator,
  type CalibrationResult,
  type CalibrationStatus,
} from "@/lib/game/OffsetCalibration";

type View = "idle" | "running" | "result";

const fmtSigned = (ms: number) => `${ms > 0 ? "+" : ""}${ms}`;

/** Tap along to a metronome; the average gap between taps and beeps becomes the Audio Offset. */
export default function OffsetWizard() {
  const globalOffset = useSettingsStore((s) => s.globalOffset);
  const setGlobalOffset = useSettingsStore((s) => s.setGlobalOffset);

  const [view, setView] = useState<View>("idle");
  const [status, setStatus] = useState<CalibrationStatus | null>(null);
  const [lastError, setLastError] = useState<number | null>(null);
  const [result, setResult] = useState<CalibrationResult | null>(null);
  const calibrator = useRef<OffsetCalibrator | null>(null);

  const getCalibrator = () => (calibrator.current ??= new OffsetCalibrator(() => new AudioContext()));

  const stop = useCallback(() => {
    calibrator.current?.cancel();
    setView("idle");
    setStatus(null);
    setLastError(null);
  }, []);

  const start = async () => {
    (document.activeElement as HTMLElement | null)?.blur();
    setResult(null);
    setLastError(null);
    try {
      await getCalibrator().start();
      setView("running");
    } catch (err) {
      console.error("Offset calibration could not start:", err);
      toast.error("Could not start audio for calibration");
    }
  };

  // Poll progress while running and finish when the last beep has passed.
  useEffect(() => {
    if (view !== "running") return;
    const id = setInterval(() => {
      const cal = calibrator.current;
      if (!cal) return;
      const s = cal.status();
      setStatus(s);
      if (s.phase === "finished") {
        setResult(cal.result());
        cal.cancel();
        setView("result");
      }
    }, 100);
    return () => clearInterval(id);
  }, [view]);

  // Any key taps; Escape cancels. Captured so the Sheet/buttons never see these keys while calibrating.
  useEffect(() => {
    if (view !== "running") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return; // leave browser/OS shortcuts alone
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") return stop();
      if (e.repeat) return;
      const fb = calibrator.current?.tap(e.timeStamp);
      if (fb) setLastError(fb.errorMs);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, [view, stop]);

  useEffect(() => () => calibrator.current?.cancel(), []);

  const apply = () => {
    if (!result?.ok) return;
    setGlobalOffset(result.offsetMs);
    notify(`Audio offset set to ${fmtSigned(result.offsetMs)} ms`);
    setView("idle");
    setResult(null);
  };

  const box = "flex flex-col gap-3 rounded-xl border border-white/10 bg-black/30 p-4";
  const primary =
    "h-10 rounded-lg bg-lf-accent/20 border border-lf-accent/50 text-lf-accent text-sm font-game-display font-bold tracking-wider uppercase hover:bg-lf-accent/30 transition-colors cursor-pointer";
  const secondary =
    "h-10 rounded-lg bg-white/5 border border-white/10 text-white/70 text-sm font-game-display tracking-wider uppercase hover:bg-white/10 hover:text-white transition-colors cursor-pointer";

  if (view === "running") {
    const warmup = status?.warmup ?? DEFAULT_CALIBRATION.warmup;
    const measured = status?.measured ?? DEFAULT_CALIBRATION.measured;
    const total = warmup + measured;
    const beat = status?.beat ?? -1;
    return (
      <div className={box}>
        <p className="text-sm font-game-body text-white/80">
          {status?.phase === "running"
            ? beat < warmup
              ? "Get the rhythm… tap with each beep."
              : "Keep tapping with each beep."
            : "Get ready — beeps start in a moment."}
        </p>
        <div className="flex flex-wrap gap-1.5" aria-hidden>
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={`h-2.5 w-2.5 rounded-full ${
                i === beat ? "bg-lf-accent shadow-[0_0_8px_rgba(185,189,230,0.9)]" : i < beat ? "bg-white/40" : "bg-white/10"
              } ${i < warmup ? "opacity-50" : ""}`}
            />
          ))}
        </div>
        <button
          type="button"
          onPointerDown={(e) => {
            const fb = calibrator.current?.tap(e.timeStamp);
            if (fb) setLastError(fb.errorMs);
          }}
          className="h-20 rounded-xl border-2 border-lf-accent/40 bg-lf-accent/10 text-lf-accent font-game-display font-bold tracking-[0.2em] uppercase active:bg-lf-accent/30 cursor-pointer select-none"
        >
          Tap here or press any key
        </button>
        <p className="h-5 text-xs font-game-mono text-white/60 tabular-nums">
          {lastError === null
            ? " "
            : `${lastError > 0 ? "Late" : "Early"} ${Math.abs(Math.round(lastError))} ms`}
          {status ? `  ·  ${status.tapsCounted}/${measured} counted` : ""}
        </p>
        <button type="button" onClick={stop} className={secondary}>
          Cancel (Esc)
        </button>
      </div>
    );
  }

  if (view === "result") {
    return (
      <div className={box}>
        {result?.ok ? (
          <>
            <p className="text-sm font-game-body text-white/80">
              You tap on average{" "}
              <b className="text-white">{Math.abs(Math.round(result.meanErrorMs))} ms</b>{" "}
              {result.meanErrorMs > 0 ? "late" : "early"}. Suggested Audio Offset:
            </p>
            <p className="text-3xl font-game-mono font-bold text-lf-accent tabular-nums">
              {fmtSigned(result.offsetMs)} ms
            </p>
            <p className="text-xs font-game-mono text-white/50">
              {result.used} taps used{result.rejected ? `, ${result.rejected} ignored` : ""} · spread ±
              {Math.round(result.stdMs)} ms
            </p>
            {result.stdMs > 30 && (
              <p className="text-xs font-game-body text-lf-warning">
                Your taps were quite uneven, so this may be off. Try again for a steadier result.
              </p>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={apply} className={`${primary} flex-1`}>
                Apply
              </button>
              <button type="button" onClick={start} className={`${secondary} flex-1`}>
                Retry
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm font-game-body text-lf-warning">
              Not enough taps were detected ({result?.used ?? 0} of {DEFAULT_CALIBRATION.measured}). Tap on every beep and try again.
            </p>
            <button type="button" onClick={start} className={primary}>
              Try again
            </button>
          </>
        )}
        <button type="button" onClick={() => setView("idle")} className={secondary}>
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-game-body text-white/50 leading-relaxed">
        Not sure what offset to use? Tap along to a metronome and Lany works it out. This measures the delay
        between what you hear and when you press; it does not measure display lag. Headphones work best.
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={start} className={`${primary} flex-1`}>
          Calibrate
        </button>
        {globalOffset !== 0 && (
          <button type="button" onClick={() => setGlobalOffset(0)} className={`${secondary} px-4`}>
            Reset to 0
          </button>
        )}
      </div>
    </div>
  );
}
