import { OBJECTIVE_CARD_COLORS, STATUS_BORDER_STYLE } from "@/lib/calendar-helpers";

const OBJECTIVE_LEGEND = [
  { key: "visibilite", label: "Visibilité" },
  { key: "confiance", label: "Confiance" },
  { key: "vente", label: "Vente" },
  { key: "stories", label: "Stories" },
];

const STATUS_LEGEND = [
  { key: "idea", label: "Idée" },
  { key: "a_rediger", label: "Planifié" },
  { key: "ready", label: "Rédigé" },
  { key: "published", label: "Publié" },
];

export function CalendarLegend() {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground border border-border rounded-xl px-3 py-2 bg-card">
      {/* Couleurs = objectifs */}
      <span className="font-semibold text-foreground text-[10px]">Objectif :</span>
      {OBJECTIVE_LEGEND.map((item) => {
        const c = OBJECTIVE_CARD_COLORS[item.key];
        return (
          <span key={item.key} className="flex items-center gap-1">
            <span
              className="inline-block w-3 h-3 rounded-sm"
              style={{ backgroundColor: c.bg, border: `1.5px solid ${c.borderLeft}` }}
            />
            {item.label}
          </span>
        );
      })}

      <span className="text-border">|</span>

      {/* Borders = statuts */}
      <span className="font-semibold text-foreground text-[10px]">Statut :</span>
      {STATUS_LEGEND.map((item) => {
        const s = STATUS_BORDER_STYLE[item.key];
        return (
          <span key={item.key} className="flex items-center gap-1">
            <span
              className="inline-block w-4 h-0 rounded-sm"
              style={{
                borderTop: `2px ${s.style} hsl(0, 0%, 50%)`,
                opacity: s.opacity,
              }}
            />
            {item.label}
          </span>
        );
      })}
    </div>
  );
}
