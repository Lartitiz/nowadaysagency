import { useState } from "react";
import { Filter } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

const OBJECTIVE_FILTERS = [
  { id: "visibilite", emoji: "👁️", label: "Visibilité" },
  { id: "confiance", emoji: "🤝", label: "Confiance" },
  { id: "vente", emoji: "💰", label: "Vente" },
  { id: "launch", emoji: "🚀", label: "Lancement" },
  { id: "a_rediger", emoji: "📝", label: "À rédiger" },
];

export function CalendarCategoryFilters({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const hasActiveFilter = value !== "all";

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mb-4">
      <CollapsibleTrigger asChild>
        <button className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${
          hasActiveFilter
            ? "bg-primary/10 text-primary border-primary/30"
            : "bg-card text-muted-foreground border-border hover:border-primary/40"
        }`}>
          <Filter className="h-3.5 w-3.5" />
          {hasActiveFilter ? `Filtre : ${OBJECTIVE_FILTERS.find(f => f.id === value)?.label || value}` : "Filtres par objectif"}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex gap-1.5 flex-wrap mt-2">
          <button
            onClick={() => { onChange("all"); setOpen(false); }}
            className={`whitespace-nowrap rounded-pill px-3 py-1.5 text-xs font-medium border transition-all ${
              value === "all"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-foreground border-border hover:border-primary/40"
            }`}
          >
            Tout
          </button>
          {OBJECTIVE_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => { onChange(f.id); setOpen(false); }}
              className={`whitespace-nowrap rounded-pill px-3 py-1.5 text-xs font-medium border transition-all ${
                value === f.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-foreground border-border hover:border-primary/40"
              }`}
            >
              <span className="mr-1">{f.emoji}</span>
              {f.label}
            </button>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
