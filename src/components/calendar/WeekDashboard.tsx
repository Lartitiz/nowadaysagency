import { useState, useEffect } from "react";
import { OBJECTIFS, type CalendarPost } from "@/lib/calendar-constants";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  const [statsOpen, setStatsOpen] = useState(false);
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

  const handleObjectifClick = (id: string) => {
    const next = activeFilter === id ? null : id;
    setActiveFilter(next);
    onObjectifFilter?.(next);
  };

  // Simple one-line summary
  const summaryText = isComplete
    ? `${weekLabel} : ${total} contenus planifiés, ${published} publiés ✅`
    : `${weekLabel} : ${total} contenus planifiés, ${published} publié${published > 1 ? "s" : ""}`;

  return (
    <div className="mb-4">
      {/* Simple summary line */}
      <Collapsible open={statsOpen} onOpenChange={setStatsOpen}>
        <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-2.5">
          <span className={cn_simple(
            "text-sm font-medium",
            isComplete ? "text-[hsl(160,60%,45%)]" : "text-foreground"
          )}>
            {isComplete && "🔥 "}{summaryText}
          </span>
          <CollapsibleTrigger asChild>
            <button className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted">
              <ChevronDown className={`h-4 w-4 transition-transform ${statsOpen ? "rotate-180" : ""}`} />
            </button>
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent>
          <div
            className="flex flex-wrap items-center gap-4 rounded-b-xl border border-t-0 border-border bg-card px-5 py-3"
          >
            {/* Objective chips */}
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

            {/* Progress bar */}
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-muted-foreground">{published}/{total}</span>
              <div className="flex h-2 w-20 rounded-full overflow-hidden bg-muted">
                {total > 0 && (
                  <div
                    className="transition-all duration-500 rounded-full"
                    style={{
                      width: `${(published / total) * 100}%`,
                      backgroundColor: isComplete ? "hsl(160, 60%, 45%)" : "hsl(var(--primary))",
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// Simple utility to avoid importing cn just for this
function cn_simple(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}
