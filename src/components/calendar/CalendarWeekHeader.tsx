import { useNavigate } from "react-router-dom";
import { type CalendarPost } from "@/lib/calendar-constants";

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

  return (
    <div className={`rounded-xl border px-4 py-3 mb-4 transition-colors ${
      isComplete ? "border-[hsl(160_60%_45%)]/30 bg-[hsl(160_60%_45%)]/5" : "border-border bg-card"
    }`}>
      <div className="flex items-center gap-2 mb-1.5">
        <p className="font-display text-sm font-bold text-foreground">📅 {weekLabel}</p>
        {isComplete && (
          <span className="text-xs font-medium text-[hsl(160_60%_45%)] flex items-center gap-1">
            🔥 Semaine complète !
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>Posts prévus : <span className="font-medium text-foreground">{total}/{postsPerWeekTarget}</span></span>
        <span>Rédigés : <span className="font-medium text-foreground">{drafted}</span></span>
        <span>Publiés : <span className={`font-medium ${isComplete ? "text-[hsl(160_60%_45%)]" : "text-foreground"}`}>{published}</span></span>
      </div>
      <div className="flex flex-wrap gap-x-3 mt-1 text-xs text-muted-foreground">
        <span>Mix : 🔵 {visCount} visibilité · 🟢 {confCount} confiance · 🟠 {venteCount} vente</span>
      </div>
      {missing > 0 && !isComplete && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">💡 Il te manque {missing} post{missing > 1 ? "s" : ""} cette semaine.</span>
          <button onClick={() => navigate("/instagram/creer")}
            className="text-xs font-medium text-primary hover:underline">
            ✨ Suggérer un sujet →
          </button>
        </div>
      )}
    </div>
  );
}
