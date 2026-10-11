"use client";
import { M_PLUS_Rounded_1c } from "next/font/google";
import { motion } from "framer-motion";
import { useGameStore } from "@/lib/store/useGameStore";
import { useProgressStore } from "@/lib/store/useProgressStore";

// Rounded bold title as in the pause photo (docs/ui-spec/pause.md); scoped to this component.
const rounded = M_PLUS_Rounded_1c({ weight: "800", subsets: ["latin"] });

interface PauseOverlayProps {
  onResume: () => void;
  onRetry: () => void;
  onQuit: () => void;
}

// Faint outlined triangles, tiled behind each bar (spec: docs/ui-spec/pause.md).
const TRIANGLES = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="110" fill="none" stroke="white" stroke-opacity=".18" stroke-width="2"><path d="M40 110 L110 10 L180 110Z M230 100 L280 20 L330 100Z M150 40 L190 -10 L230 40Z"/></svg>',
)}")`;

const BUTTONS = [
  { label: "Continue", color: "#6a7294", action: "onResume" },
  { label: "Retry", color: "#4f5266", action: "onRetry" },
  { label: "Quit", color: "#a35a66", action: "onQuit" },
] as const;

export default function PauseOverlay(props: PauseOverlayProps) {
  const retryCount = useGameStore((s) => s.retryTrigger);
  const accuracy = useGameStore((s) => s.accuracy);
  const progress = useProgressStore((s) => s.progress);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col items-center bg-black/85 text-white"
    >
      <h2 className={`mt-[12vh] ${rounded.className} text-6xl lowercase tracking-[0.25em] text-[#dddded]`}>
        paused
      </h2>

      <div className="mt-[10vh] flex w-[75vw] flex-col gap-[5px]">
        {BUTTONS.map(({ label, color, action }) => (
          <button
            key={label}
            onClick={props[action]}
            style={{ backgroundColor: color, backgroundImage: TRIANGLES }}
            className="h-[10.2vh] -skew-x-[10deg] cursor-pointer rounded-lg font-game-display text-3xl font-bold shadow-lg transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.99]"
          >
            <span className="inline-block skew-x-[10deg]">{label}</span>
          </button>
        ))}
      </div>

      <p className="mt-auto mb-[15vh] text-center font-game-body text-xl leading-snug">
        Retry count: <b>{retryCount}</b>
        <br />
        Song progress: <b>{Math.round(progress)}%</b>
        <br />
        Accuracy: <b>{accuracy.toFixed(2)}%</b>
      </p>
    </motion.div>
  );
}
