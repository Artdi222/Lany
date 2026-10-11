/* eslint-disable @next/next/no-img-element */
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { LogoVisualizer } from "./LogoVisualizer";

type LogoButtonProps = ComponentProps<"button"> & {
  /** Gambar logo buatan user. Tanpa ini, dipakai placeholder teks "Lany". */
  src?: string;
  /** Berdenyut pelan (musik sedang diputar). */
  pulsing?: boolean;
  /** Kelas tambahan untuk lingkaran (mis. ukuran lain). */
  circleClassName?: string;
  /** Bar radial mengikuti musik menu (hanya menu utama). */
  visualizer?: boolean;
};

/** Logo menu: lingkaran dengan cincin putih. Placeholder sampai aset mascot/logo ada (docs/mascot-brief.md). */
export function LogoButton({ src, pulsing, circleClassName, visualizer, className, ...props }: LogoButtonProps) {
  return (
    <button type="button" aria-label="Lany" {...props} className={cn("group relative cursor-pointer focus:outline-hidden", className)}>
      {visualizer && <LogoVisualizer />}
      {/* --beat (0..1) is set every frame by LogoVisualizer: the logo kicks with the bass instead of breathing. */}
      <div style={visualizer ? { transform: "scale(calc(1 + var(--beat, 0) * 0.06))" } : undefined}>
      <div
        className={cn(
          "relative flex h-40 w-40 items-center justify-center overflow-hidden rounded-full text-3xl sm:text-5xl shadow-lf-glow transition-transform duration-200 ease-lf-out group-hover:scale-105 group-active:scale-95 sm:h-64 sm:w-64",
          // Logo gambar sudah punya cincin sendiri; placeholder teks butuh cincin + latar.
          !src && "border-[6px] border-white bg-linear-to-br from-lf-primary-hover to-lf-primary",
          pulsing && !visualizer && "animate-breathe",
          circleClassName,
        )}
      >
        {src ? (
          <img src={src} alt="" draggable={false} className="h-full w-full object-contain" />
        ) : (
          <span className="font-game-display font-bold tracking-wide text-white">Lany</span>
        )}
      </div>
      </div>
    </button>
  );
}
