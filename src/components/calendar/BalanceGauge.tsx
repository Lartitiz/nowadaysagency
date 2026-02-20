import { OBJECTIFS, type CalendarPost } from "@/lib/calendar-constants";

export function BalanceGauge({ posts }: { posts: CalendarPost[] }) {
  const counts = OBJECTIFS.map((o) => ({
    ...o,
    count: posts.filter((p) => p.objectif === o.id).length,
  }));
  const total = counts.reduce((s, c) => s + c.count, 0);
  const noObj = posts.length - total;

  if (posts.length === 0) return null;

  // Detect imbalance: if one objective is >50% of assigned posts
  const dominant = total > 2 ? counts.find((c) => c.count / total > 0.5) : null;
  const missing = total > 0 ? counts.filter((c) => c.count === 0) : [];

  return (
    <div className="rounded-xl border border-border bg-card p-4 mb-6">
      <h3 className="text-sm font-semibold text-foreground mb-3">Équilibre des objectifs ce mois</h3>

      {/* Stacked bar */}
      <div className="flex h-3 rounded-full overflow-hidden bg-muted mb-3">
        {counts.map((c) =>
          c.count > 0 ? (
            <div
              key={c.id}
              className="transition-all"
              style={{
                width: `${(c.count / posts.length) * 100}%`,
                backgroundColor: `hsl(var(--${c.cssVar}))`,
              }}
            />
          ) : null
        )}
        {noObj > 0 && (
          <div className="bg-muted-foreground/20 transition-all" style={{ width: `${(noObj / posts.length) * 100}%` }} />
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-2">
        {counts.map((c) => (
          <span key={c.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: `hsl(var(--${c.cssVar}))` }}
            />
            <span>{c.label}</span>
            <span className="font-semibold text-foreground">{c.count}</span>
            {total > 0 && <span className="text-[10px]">({Math.round((c.count / posts.length) * 100)}%)</span>}
          </span>
        ))}
        {noObj > 0 && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/20 shrink-0" />
            <span>Sans objectif</span>
            <span className="font-semibold text-foreground">{noObj}</span>
          </span>
        )}
      </div>

      {/* Smart tips */}
      {(dominant || missing.length > 0) && (
        <div className="mt-2 pt-2 border-t border-border space-y-1">
          {dominant && (
            <p className="text-[11px] text-muted-foreground">
              💡 <span className="font-medium text-foreground">{dominant.emoji} {dominant.label}</span> domine ton mois — pense à varier pour toucher ton audience différemment.
            </p>
          )}
          {missing.length > 0 && missing.length <= 2 && (
            <p className="text-[11px] text-muted-foreground">
              🔍 Objectif{missing.length > 1 ? "s" : ""} absent{missing.length > 1 ? "s" : ""} :{" "}
              {missing.map((m) => `${m.emoji} ${m.label}`).join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
