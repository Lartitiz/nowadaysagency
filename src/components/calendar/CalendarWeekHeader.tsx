import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { type CalendarPost } from "@/lib/calendar-constants";
import confetti from "canvas-confetti";

interface Props {
  weekLabel: string;
  weekPosts: CalendarPost[];
  postsPerWeekTarget?: number;
}

export function CalendarWeekHeader({ weekLabel, weekPosts, postsPerWeekTarget = 3 }: Props) {
  const navigate = useNavigate();
  const total = weekPosts.length;
  const drafted = weekPosts.filter(p => p.content_draft || p.status === "ready" || p.status === "drafting").length;
  const published = weekPosts.filter(p => p.status === "published").length;

  const visCount = weekPosts.filter(p => p.objectif === "visibilite" || p.category === "visibilite").length;
  const confCount = weekPosts.filter(p => p.objectif === "confiance" || p.category === "confiance").length;
  const venteCount = weekPosts.filter(p => p.objectif === "vente" || p.category === "vente").length;

  const missing = Math.max(0, postsPerWeekTarget - total);
  const isComplete = total > 0 && published === total;

  const progressPercent = postsPerWeekTarget > 0
    ? Math.min(100, Math.round((total / postsPerWeekTarget) * 100))
    : 0;

  const getProgressColor = () => {
    if (isComplete) return "hsl(160, 60%, 45%)";
    if (progressPercent >= 80) return "hsl(142, 71%, 45%)";
    if (progressPercent >= 50) return "hsl(48, 96%, 53%)";
    if (progressPercent >= 25) return "hsl(25, 95%, 53%)";
    return "hsl(346, 77%, 50%)";
  };

  const [celebrated, setCelebrated] = useState(false);

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

  return (
    <div className={`rounded-xl border px-4 py-3 mb-4 transition-all duration-300 ${
      isComplete
        ? "border-[hsl(160_60%_45%)]/40 bg-[hsl(160_60%_45%)]/5 shadow-sm"
        : "border-border bg-card"
    }`}>
      {/* Label + badge */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <p className="font-display text-sm font-bold text-foreground">{weekLabel}</p>
          {isComplete && (
            <span className="text-xs font-semibold text-[hsl(160_60%_45%)] bg-[hsl(160_60%_45%)]/10 px-2 py-0.5 rounded-full animate-in fade-in duration-500">
              🔥 Semaine complète !
            </span>
          )}
        </div>
        <span className="text-sm font-bold text-foreground">
          {total}/{postsPerWeekTarget}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2.5 rounded-full bg-muted overflow-hidden mb-2">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${progressPercent}%`,
            backgroundColor: getProgressColor(),
          }}
        />
      </div>

      {/* Status pills */}
      <div className="flex flex-wrap gap-2 text-[11px]">
        {(total - drafted - published) > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            💡 {total - drafted - published} idée{(total - drafted - published) > 1 ? "s" : ""}
          </span>
        )}
        {drafted > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
            ✏️ {drafted} rédigé{drafted > 1 ? "s" : ""}
          </span>
        )}
        {published > 0 && (
          <span className={`px-2 py-0.5 rounded-full ${
            isComplete ? "bg-[hsl(160_60%_45%)]/10 text-[hsl(160_60%_45%)] font-semibold" : "bg-emerald-50 text-emerald-700"
          }`}>
            ✅ {published} publié{published > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Objective mix */}
      <div className="flex flex-wrap gap-x-3 mt-1.5 text-[11px] text-muted-foreground">
        {visCount > 0 && <span>👁️ {visCount} visibilité</span>}
        {confCount > 0 && <span>🤝 {confCount} confiance</span>}
        {venteCount > 0 && <span>💰 {venteCount} vente</span>}
      </div>

      {/* Encouragement */}
      {missing > 0 && !isComplete && (
        <div className="mt-2 pt-2 border-t border-border/50 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {progressPercent === 0
              ? "🌱 C'est le moment de planifier ta semaine !"
              : progressPercent < 50
                ? `💪 Encore ${missing} post${missing > 1 ? "s" : ""} et ta semaine prend forme.`
                : `🔥 Plus que ${missing} post${missing > 1 ? "s" : ""} — tu y es presque !`}
          </span>
          <button onClick={() => navigate("/creer")}
            className="text-xs font-medium text-primary hover:underline shrink-0">
            ✨ Suggérer →
          </button>
        </div>
      )}
    </div>
  );
}
