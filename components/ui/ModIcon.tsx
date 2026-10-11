import { MODS } from "@/lib/game/Mods";

/** scores.mods is a JSON array (`["HT"]`); older rows may hold plain text. */
export function parseMods(mods: string | null | undefined): string[] {
  if (!mods) return [];
  try {
    const list = JSON.parse(mods);
    if (Array.isArray(list)) return list.map(String);
  } catch {
    // fall through to the plain-text split
  }
  return mods.split(/[^A-Za-z0-9]+/).filter(Boolean).map((m) => m.toUpperCase());
}

/** Same group colours as Mod Select (reduction green, increase red). */
const modColor = (acronym: string) => {
  const category = MODS.find((m) => m.acronym === acronym)?.category;
  return category === "reduction" ? "var(--color-lf-success)" : category === "increase" ? "var(--color-lf-danger)" : "var(--color-lf-primary)";
};

/** Small hexagon mod icon with the acronym, as on lazer score cards. */
export function ModIcon({ acronym, size = 22 }: { acronym: string; size?: number }) {
  return (
    <svg width={size * 1.25} height={size} viewBox="0 0 30 24" role="img" aria-label={acronym} className="shrink-0">
      <path d="M8 1h14l7 11-7 11H8L1 12z" fill={modColor(acronym)} stroke="rgb(0 0 0 / 0.35)" strokeWidth="1.5" strokeLinejoin="round" />
      <text x="15" y="16.2" textAnchor="middle" fontSize="10.5" fontWeight="800" fill="rgb(0 0 0 / 0.8)" fontFamily="inherit">
        {acronym}
      </text>
    </svg>
  );
}

export function ModIcons({ mods, size }: { mods: string | null | undefined; size?: number }) {
  const list = parseMods(mods);
  if (!list.length) return null;
  return (
    <span className="flex gap-0.5">
      {list.map((m) => (
        <ModIcon key={m} acronym={m} size={size} />
      ))}
    </span>
  );
}
