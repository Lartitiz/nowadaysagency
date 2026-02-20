import { OBJECTIFS } from "@/lib/calendar-constants";

/** Small colored badge for objectif — used in calendar cells */
export function ObjectifBadge({ objectif, size = "sm" }: { objectif: string | null; size?: "sm" | "md" }) {
  const obj = OBJECTIFS.find((o) => o.id === objectif);
  if (!obj) return null;

  if (size === "sm") {
    return (
      <span
        className="inline-flex items-center gap-0.5 rounded-pill px-1.5 py-px text-[9px] font-semibold shrink-0"
        style={{
          backgroundColor: `hsl(var(--${obj.cssVar}-bg))`,
          color: `hsl(var(--${obj.cssVar}))`,
        }}
        title={obj.label}
      >
        {obj.emoji}
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[11px] font-semibold"
      style={{
        backgroundColor: `hsl(var(--${obj.cssVar}-bg))`,
        color: `hsl(var(--${obj.cssVar}))`,
      }}
    >
      {obj.emoji} {obj.label}
    </span>
  );
}
