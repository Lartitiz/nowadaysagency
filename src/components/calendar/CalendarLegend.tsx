import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { CATEGORY_CARD_COLORS } from "@/lib/calendar-helpers";

const LEGEND_ITEMS = [
  { key: "visibilite", emoji: "👁️", label: "Visibilité" },
  { key: "confiance", emoji: "🤝", label: "Confiance" },
  { key: "vente", emoji: "💰", label: "Vente" },
  { key: "post_lancement", emoji: "🌿", label: "Post-lanc." },
];

const STATUS_LEGEND = [
  { label: "📝 À rédiger", desc: "(pointillés)" },
  { label: "✏️ Brouillon", desc: "" },
  { label: "✅ Planifié", desc: "" },
  { label: "🚀 = lancement", desc: "" },
];

export function CalendarLegend() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-4">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <span>Légende</span>
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {open && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground border border-border rounded-xl px-3 py-2 bg-card">
          {LEGEND_ITEMS.map((item) => {
            const c = CATEGORY_CARD_COLORS[item.key];
            return (
              <span key={item.key} className="flex items-center gap-1">
                <span
                  className="inline-block w-3 h-3 rounded-sm border"
                  style={{ backgroundColor: c.bg, borderColor: c.borderLeft, borderLeftWidth: "2px" }}
                />
                {item.emoji} {item.label}
              </span>
            );
          })}
          <span className="text-border">|</span>
          {STATUS_LEGEND.map((s, i) => (
            <span key={i}>{s.label} {s.desc}</span>
          ))}
        </div>
      )}
    </div>
  );
}
