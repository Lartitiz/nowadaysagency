// Petits éléments d'affichage de la relecture de marque (badge de confiance,
// pastille, source analysée). Sortis de BrandingReview.tsx (fiche 14, lot 1).

export function getConfidence(section: any): string {
  return section?.confidence || "low";
}

export function ConfidenceBadge({ level }: { level: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    high: { bg: "bg-success-bg", text: "text-success", label: "Confiant·e" },
    medium: { bg: "bg-warning-bg", text: "text-warning", label: "À vérifier" },
    low: { bg: "bg-rose-pale", text: "text-bordeaux", label: "À compléter" },
  };
  const s = map[level] || map.low;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded-full ${s.bg} ${s.text}`}>
      <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: level === "high" ? "#22c55e" : level === "medium" ? "#f59e0b" : "hsl(var(--primary))" }} />
      {s.label}
    </span>
  );
}

export function Chip({ children }: { children: React.ReactNode }) {
  return <span className="inline-block px-3 py-1 text-sm rounded-[8px] bg-[#ffa7c6]/20 text-bordeaux font-medium">{children}</span>;
}

export function SourceTag({ name, ok }: { name: string; ok: boolean }) {
  const labels: Record<string, string> = { website: "Site", instagram: "Instagram", linkedin: "LinkedIn", documents: "Documents" };
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${ok ? "bg-success-bg text-success" : "bg-muted text-muted-foreground line-through"}`}>
      {labels[name] || name} {ok ? "✓" : "✗"}
    </span>
  );
}
