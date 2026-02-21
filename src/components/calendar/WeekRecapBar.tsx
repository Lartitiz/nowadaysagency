import { type CalendarPost } from "@/lib/calendar-constants";

interface Props {
  posts: CalendarPost[];
  compact?: boolean;
}

export function WeekRecapBar({ posts, compact = true }: Props) {
  if (posts.length === 0) return null;

  const catCounts: Record<string, number> = {};
  const statusCounts: Record<string, number> = {};
  posts.forEach((p) => {
    const cat = p.category || "autre";
    catCounts[cat] = (catCounts[cat] || 0) + 1;
    statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
  });

  if (compact) {
    return (
      <div className="text-[10px] text-muted-foreground px-1.5 py-1 flex items-center gap-2 flex-wrap">
        <span className="font-medium">{posts.length} contenus</span>
        {catCounts.visibilite && <span>👁️{catCounts.visibilite}</span>}
        {catCounts.confiance && <span>🤝{catCounts.confiance}</span>}
        {catCounts.vente && <span>💰{catCounts.vente}</span>}
        {catCounts.post_lancement && <span>🌿{catCounts.post_lancement}</span>}
      </div>
    );
  }

  return (
    <div className="text-xs text-muted-foreground bg-card border border-border rounded-xl px-4 py-2.5 mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
      <span className="font-medium text-foreground">📊 Cette semaine : {posts.length} contenus</span>
      {catCounts.visibilite && <span>👁️ Visibilité : {catCounts.visibilite}</span>}
      {catCounts.confiance && <span>🤝 Confiance : {catCounts.confiance}</span>}
      {catCounts.vente && <span>💰 Vente : {catCounts.vente}</span>}
      {catCounts.post_lancement && <span>🌿 Post-lanc. : {catCounts.post_lancement}</span>}
      <span className="text-border">|</span>
      {statusCounts.a_rediger && <span>📝 À rédiger : {statusCounts.a_rediger}</span>}
      {statusCounts.drafting && <span>✏️ Brouillon : {statusCounts.drafting}</span>}
      {statusCounts.ready && <span>✅ Planifié : {statusCounts.ready}</span>}
    </div>
  );
}
