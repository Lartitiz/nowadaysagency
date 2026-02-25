import { type CalendarPost } from "@/lib/calendar-constants";

interface Props {
  posts: CalendarPost[];
  compact?: boolean;
}

const STATUS_LEGEND = [
  { key: "idea", label: "Idée", color: "hsl(220, 9%, 76%)" },
  { key: "a_rediger", label: "À rédiger", color: "hsl(217, 91%, 60%)" },
  { key: "drafting", label: "Brouillon", color: "hsl(38, 92%, 50%)" },
  { key: "ready", label: "Prêt", color: "hsl(338, 96%, 61%)", outline: true },
  { key: "published", label: "Publié", color: "hsl(142, 71%, 45%)" },
];

export function WeekRecapBar({ posts, compact = true }: Props) {
  if (posts.length === 0) return null;

  const catCounts: Record<string, number> = {};
  const statusCounts: Record<string, number> = {};
  posts.forEach((p) => {
    const cat = p.objectif || p.category || "autre";
    catCounts[cat] = (catCounts[cat] || 0) + 1;
    statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
  });

  const storiesCount = posts.filter((p) => !!(p.stories_count || p.stories_sequence_id || p.stories_structure)).length;
  const feedCount = posts.length - storiesCount;
  const publishedCount = statusCounts["published"] || 0;
  const readyCount = statusCounts["ready"] || statusCounts["draft_ready"] || 0;
  const draftingCount = statusCounts["drafting"] || 0;
  const toWriteCount = statusCounts["a_rediger"] || 0;
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
    <div
      className="flex items-center gap-4 flex-wrap rounded-2xl border border-border bg-card mt-3"
      style={{ padding: "10px 20px", fontSize: 12, boxShadow: "0 2px 12px -4px hsl(var(--foreground) / 0.08)" }}
    >
      {/* Left: counts */}
      <span className="text-muted-foreground whitespace-nowrap">
        📊 Cette semaine : <strong className="text-foreground">{posts.length}</strong> contenus
      </span>
      {storiesCount > 0 && (
        <span className="text-muted-foreground whitespace-nowrap">
          · 📱 <strong className="text-foreground">{storiesCount}</strong> séq. stories
        </span>
      )}

      {/* Separator */}
      <div className="w-px h-4 bg-border shrink-0" />

      {/* Status counts */}
      {publishedCount > 0 && (
        <span className="text-muted-foreground whitespace-nowrap">✅ <strong className="text-foreground">{publishedCount}</strong> publiés</span>
      )}
      {readyCount > 0 && (
        <span className="text-muted-foreground whitespace-nowrap">📝 <strong className="text-foreground">{readyCount}</strong> prêts</span>
      )}
      {draftingCount > 0 && (
        <span className="text-muted-foreground whitespace-nowrap">✏️ <strong className="text-foreground">{draftingCount}</strong> brouillons</span>
      )}
      {toWriteCount > 0 && (
        <span className="text-muted-foreground whitespace-nowrap">📝 <strong className="text-foreground">{toWriteCount}</strong> à rédiger</span>
      )}

      {/* Right: status legend */}
      <div className="flex items-center gap-3 ml-auto flex-wrap">
        {STATUS_LEGEND.map((s) => (
          <span key={s.key} className="flex items-center gap-1 text-muted-foreground" style={{ fontSize: 10 }}>
            <span
              className="shrink-0 rounded-full"
              style={{
                width: 6,
                height: 6,
                backgroundColor: s.color,
                ...(s.outline
                  ? { outline: "2px solid hsl(var(--primary) / 0.25)", outlineOffset: 1 }
                  : {}),
              }}
            />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
