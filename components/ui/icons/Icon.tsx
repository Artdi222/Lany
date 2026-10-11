import type { ReactNode, SVGProps } from "react";

/**
 * Set ikon SVG Lany (24x24, stroke currentColor). Digambar dari foto referensi top bar di image/TODO/,
 * bukan dari ingatan ikon osu!. Elemen beraksen (jarum jam) memakai `--lf-icon-accent`.
 * Detail per ikon dan bagian yang disederhanakan: docs/design-system.md.
 */
const ICONS = {
  settings: (
    <>
      <path d="M18.88 9.87 L21.46 10.38 L21.46 13.62 L18.88 14.13 L18.37 15.36 L19.84 17.54 L17.54 19.84 L15.36 18.37 L14.13 18.88 L13.62 21.46 L10.38 21.46 L9.87 18.88 L8.64 18.37 L6.46 19.84 L4.16 17.54 L5.63 15.36 L5.12 14.13 L2.54 13.62 L2.54 10.38 L5.12 9.87 L5.63 8.64 L4.16 6.46 L6.46 4.16 L8.64 5.63 L9.87 5.12 L10.38 2.54 L13.62 2.54 L14.13 5.12 L15.36 5.63 L17.54 4.16 L19.84 6.46 L18.37 8.64 Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  home: <path d="M3.5 11 L12 3.5 L20.5 11 M5.5 9.5 V20.5 H18.5 V9.5" />,
  /** Ruleset mania: lingkaran dengan 4 batang (luar pendek, dalam panjang). */
  "ruleset-mania": (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M8 10 V14 M10.7 7.5 V16.5 M13.3 7.5 V16.5 M16 10 V14" />
    </>
  ),
  chat: (
    <>
      <path d="M12 3.5 C16.97 3.5 20.5 7 20.5 11.5 C20.5 16 16.97 19.5 12 19.5 C10.8 19.5 9.7 19.3 8.7 18.9 L4 20.5 L5.3 16.4 C4.2 15 3.5 13.3 3.5 11.5 C3.5 7 7.03 3.5 12 3.5 Z" />
      <path d="M8.5 10 H15.5 M8.5 13.5 H13" />
    </>
  ),
  /** Disederhanakan: foto menampilkan benua terisi; di sini garis bujur/lintang. */
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12 H21 M12 3 C14.5 5.5 15.5 8.7 15.5 12 C15.5 15.3 14.5 18.5 12 21 C9.5 18.5 8.5 15.3 8.5 12 C8.5 8.7 9.5 5.5 12 3 Z" />
    </>
  ),
  music: (
    <>
      <path d="M9 18 V5.5 L19 3.5 V16" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 6.5 V12 L15 10" />
      <path d="M12 12 L17.5 14.5" stroke="var(--lf-icon-accent, currentColor)" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16.5 V11 C6 7.4 8.7 4.5 12 4.5 C15.3 4.5 18 7.4 18 11 V16.5 L19.5 18 H4.5 Z" />
      <path d="M12 2.5 V4.5 M10 20.5 C10.4 21.3 11.1 21.7 12 21.7 C12.9 21.7 13.6 21.3 14 20.5" />
    </>
  ),
  /** Podium + bintang (foto rankings). */
  rankings: (
    <>
      <path d="M9 20.5 V12.5 H15 V20.5 M3.5 20.5 V15.5 H9 M15 16.5 H20.5 V20.5 M2.5 20.5 H21.5" />
      <path d="M12 3.5 L12.9 5.6 L15 5.8 L13.4 7.2 L13.9 9.3 L12 8.2 L10.1 9.3 L10.6 7.2 L9 5.8 L11.1 5.6 Z" />
    </>
  ),
  /** Pemisah vertikal di samping ikon musik. */
  divider: <path d="M12 3 V21" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof ICONS;
export const ICON_NAMES = Object.keys(ICONS) as IconName[];

type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  name: IconName;
  /** Ukuran px atau string CSS; default 1em (ikut font-size). */
  size?: number | string;
  /** Teks untuk pembaca layar. Tanpa title, ikon dianggap dekoratif. */
  title?: string;
};

export function Icon({ name, size = "1em", title, strokeWidth = 1.8, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      {...props}
    >
      {title && <title>{title}</title>}
      {ICONS[name]}
    </svg>
  );
}
