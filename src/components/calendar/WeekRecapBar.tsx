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

  const storiesCount = posts.filter((p) => !!(p.stories_count || p.stories_sequence_id || p.stories_structure)).length;
  const feedCount = posts.length - storiesCount;
  const publishedCount = statusCounts["published"] || 0;
  const isComplete = posts.length > 0 && publishedCount === posts.length;

  if (compact) {
    return (
      <div className={`text-[10px] px-1.5 py-1 flex items-center gap-2 flex-wrap ${
        isComplete ? "text-[hsl(160_60%_45%)]" : "text-muted-foreground"
      }`}>
        {isComplete && <span>🔥</span>}
        <span className="font-medium">{feedCount} contenus</span>
        {storiesCount > 0 && <span>📱{storiesCount} stories</span>}
        {catCounts.visibilite && <span>👁️{catCounts.visibilite}</span>}
        {catCounts.confiance && <span>🤝{catCounts.confiance}</span>}
        {catCounts.vente && <span>💰{catCounts.vente}</span>}
        {catCounts.post_lancement && <span>🌿{catCounts.post_lancement}</span>}
        {publishedCount > 0 && <span className="font-medium">· ✅ {publishedCount} publiés</span>}
      </div>
    );
  }

  return (
    <div className={`text-xs bg-card border rounded-xl px-4 py-2.5 mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 ${
      isComplete ? "border-[hsl(160_60%_45%)]/30 bg-[hsl(160_60%_45%)]/5 text-foreground" : "border-border text-muted-foreground"
    }`}>
      {isComplete && <span>🔥</span>}
      <span className="font-medium text-foreground">📊 Cette semaine : {feedCount} contenus</span>
      {storiesCount > 0 && <span className="font-medium text-foreground">· 📱 {storiesCount} séq. stories</span>}
      {catCounts.visibilite && <span>👁️ Visibilité : {catCounts.visibilite}</span>}
      {catCounts.confiance && <span>🤝 Confiance : {catCounts.confiance}</span>}
      {catCounts.vente && <span>💰 Vente : {catCounts.vente}</span>}
      {catCounts.post_lancement && <span>🌿 Post-lanc. : {catCounts.post_lancement}</span>}
      <span className="text-border">|</span>
      {statusCounts.a_rediger && <span>📝 À rédiger : {statusCounts.a_rediger}</span>}
      {statusCounts.drafting && <span>✏️ Brouillon : {statusCounts.drafting}</span>}
      {statusCounts.ready && <span>✅ Planifié : {statusCounts.ready}</span>}
      {publishedCount > 0 && <span className={isComplete ? "font-bold" : ""}>✅ Publiés : {publishedCount}</span>}
    </div>
  );
}
