import { useState, useEffect } from "react";
import { OBJECTIFS, type CalendarPost } from "@/lib/calendar-constants";
import confetti from "canvas-confetti";

interface WeekDashboardProps {
  weekPosts: CalendarPost[];
  weekLabel: string;
  postsPerWeekTarget?: number;
  onObjectifFilter?: (objectifId: string | null) => void;
}

const OBJECTIF_COLORS: Record<string, string> = {
  visibilite: "hsl(217, 91%, 60%)",
  confiance: "hsl(38, 92%, 50%)",
  vente: "hsl(142, 71%, 45%)",
  credibilite: "hsl(271, 81%, 56%)",
};

export function WeekDashboard({
  weekPosts,
  weekLabel,
  postsPerWeekTarget = 3,
  onObjectifFilter,
}: WeekDashboardProps) {
  const total = weekPosts.length;
  const published = weekPosts.filter((p) => p.status === "published").length;
  const isComplete = total > 0 && published === total;
  const [celebrated, setCelebrated] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  useEffect(() => {
    if (isComplete && !celebrated) {
      setCelebrated(true);
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.7 },
        colors: ["#E91E8C", "#FFD700", "#FF6B6B", "#4ECDC4"],
      });
    }
    if (!isComplete) setCelebrated(false);
  }, [isComplete]);

  const counts = OBJECTIFS.map((o) => ({
    ...o,
    count: weekPosts.filter(
      (p) => p.objectif === o.id || p.category === o.id
    ).length,
    color: OBJECTIF_COLORS[o.id] || "hsl(var(--muted-foreground))",
  }));

  const assignedTotal = counts.reduce((s, c) => s + c.count, 0);

  const handleObjectifClick = (id: string) => {
    const next = activeFilter === id ? null : id;
    setActiveFilter(next);
    onObjectifFilter?.(next);
  };

  return (
    <div
      className="sticky top-0 z-20 flex flex-wrap items-center gap-5 rounded-2xl border border-border bg-card px-5 py-3 mb-4"
      style={{ boxShadow: "0 2px 12px -4px hsl(var(--foreground) / 0.08)" }}
    >
      {/* LEFT: Week label + segmented bar */}
      <div className="flex items-center gap-3 min-w-[180px]">
        <span className="text-sm font-semibold text-foreground whitespace-nowrap">
          📊 Semaine {total}/{postsPerWeekTarget}
        </span>
        <div className="flex h-2 w-28 rounded-full overflow-hidden bg-muted shrink-0">
          {counts.map(
            (c) =>
              c.count > 0 && (
                <div
                  key={c.id}
                  className="transition-all duration-500"
                  style={{
                    width: `${(c.count / Math.max(total, 1)) * 100}%`,
                    backgroundColor: c.color,
                  }}
                />
              )
          )}
          {total > assignedTotal && (
            <div
              className="bg-muted-foreground/20 transition-all"
              style={{
                width: `${((total - assignedTotal) / Math.max(total, 1)) * 100}%`,
              }}
            />
          )}
        </div>
      </div>

      {/* CENTER: Objective chips */}
      <div className="flex items-center gap-3 flex-1 justify-center flex-wrap">
        {counts.map((c) => (
          <button
            key={c.id}
            onClick={() => handleObjectifClick(c.id)}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-all cursor-pointer border ${
              activeFilter === c.id
                ? "bg-accent border-border shadow-sm"
                : "border-transparent hover:bg-muted hover:border-border"
            }`}
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: c.color }}
            />
            <span className="text-muted-foreground">{c.label}</span>
            <span className="font-bold text-foreground">{c.count}</span>
          </button>
        ))}
      </div>

      {/* RIGHT: Published badge */}
      <span
        className={`text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap shrink-0 ${
          isComplete
            ? "bg-[hsl(160_60%_45%)]/10 text-[hsl(160_60%_45%)]"
            : "bg-primary/10 text-primary"
        }`}
      >
        🔥 {published} publié{published > 1 ? "s" : ""} / {total}
      </span>
    </div>
  );
}
