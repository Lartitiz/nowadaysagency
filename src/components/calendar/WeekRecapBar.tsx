import { type CalendarPost } from "@/lib/calendar-constants";

interface Props {
  posts: CalendarPost[];
  compact?: boolean;
}

const STATUS_LEGEND = [
  { key: "idea", label: "À faire", color: "hsl(217, 91%, 60%)" },
  { key: "drafting", label: "En cours", color: "hsl(38, 92%, 50%)" },
  { key: "ready", label: "Prêt", color: "hsl(142, 71%, 45%)" },
  { key: "published", label: "Publié", color: "hsl(var(--muted-foreground))" },
];

export function WeekRecapBar({ posts, compact = true }: Props) {
  if (posts.length === 0) return null;

  const statusCounts: Record<string, number> = {};
  posts.forEach((p) => {
    // Map to simplified statuses
    const simplified = p.status === "a_rediger" || p.status === "planned" || p.status === "idea" ? "idea"
      : p.status === "drafting" ? "drafting"
      : p.status === "ready" || p.status === "draft_ready" ? "ready"
      : p.status === "published" ? "published" : "idea";
    statusCounts[simplified] = (statusCounts[simplified] || 0) + 1;
  });

  if (compact) {
    return (
      <div className="text-[10px] px-1.5 py-1 flex items-center gap-2 flex-wrap text-muted-foreground">
        <span className="font-medium">{posts.length} contenus</span>
        {statusCounts.published > 0 && <span>· ✅ {statusCounts.published} publiés</span>}
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-4 flex-wrap rounded-xl border border-border bg-card mt-3"
      style={{ padding: "8px 16px", fontSize: 12 }}
    >
      {/* Status legend — simplified to 4 */}
      <div className="flex items-center gap-3 ml-auto flex-wrap">
        {STATUS_LEGEND.map((s) => (
          <span key={s.key} className="flex items-center gap-1 text-muted-foreground" style={{ fontSize: 10 }}>
            <span
              className="shrink-0 rounded-full"
              style={{ width: 6, height: 6, backgroundColor: s.color }}
            />
            {s.label}
            {statusCounts[s.key] ? ` (${statusCounts[s.key]})` : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
