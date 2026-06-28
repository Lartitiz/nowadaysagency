import { useState } from "react";
import { SlidersHorizontal, X, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CANAL_FILTERS } from "@/lib/calendar-constants";
import { CalendarSeriesFilter } from "@/components/calendar/CalendarSeriesFilter";

const OBJECTIVE_FILTERS = [
  { id: "visibilite", emoji: "👁️", label: "Visibilité" },
  { id: "confiance", emoji: "🤝", label: "Confiance" },
  { id: "vente", emoji: "💰", label: "Vente" },
  { id: "credibilite", emoji: "🏆", label: "Crédibilité" },
  { id: "launch", emoji: "🚀", label: "Lancement" },
  { id: "a_rediger", emoji: "📝", label: "À rédiger" },
];

interface Props {
  canalFilter: string;
  onCanalChange: (v: string) => void;
  categoryFilter: string;
  onCategoryChange: (v: string) => void;
  seriesFilter: string;
  onSeriesChange: (v: string) => void;
  seriesCounts?: Record<string, number>;
}

/**
 * Une seule barre repliable pour TOUS les filtres (canal + objectif + série).
 * Par défaut : un simple bouton « Filtrer » calme. Un compteur indique les
 * filtres actifs et un bouton « Réinitialiser » apparaît quand il y en a.
 */
export function CalendarFilterBar({
  canalFilter,
  onCanalChange,
  categoryFilter,
  onCategoryChange,
  seriesFilter,
  onSeriesChange,
  seriesCounts,
}: Props) {
  const [open, setOpen] = useState(false);

  const activeCount =
    (canalFilter !== "all" ? 1 : 0) +
    (categoryFilter !== "all" ? 1 : 0) +
    (seriesFilter !== "all" ? 1 : 0);
  const hasActive = activeCount > 0;

  const resetAll = () => {
    onCanalChange("all");
    onCategoryChange("all");
    onSeriesChange("all");
  };

  const pillBase =
    "whitespace-nowrap rounded-pill px-3 py-1.5 text-xs font-medium border transition-all shrink-0";
  const pillOn = "bg-primary text-primary-foreground border-primary";
  const pillOff = "bg-card text-foreground border-border hover:border-primary/40";
  const pillDisabled = "bg-muted text-muted-foreground border-border opacity-60 cursor-not-allowed";

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mb-4">
      <div className="flex items-center gap-2">
        <CollapsibleTrigger asChild>
          <button
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${
              hasActive
                ? "bg-primary/10 text-primary border-primary/30"
                : "bg-card text-muted-foreground border-border hover:border-primary/40"
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filtrer
            {hasActive && (
              <span className="ml-0.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-2xs font-bold">
                {activeCount}
              </span>
            )}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>

        {hasActive && (
          <button
            onClick={resetAll}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3 w-3" /> Réinitialiser
          </button>
        )}
      </div>

      <CollapsibleContent>
        <div className="mt-3 space-y-3 rounded-xl border border-border bg-card p-3">
          {/* Canal */}
          <div>
            <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Canal</p>
            <div className="flex gap-1.5 flex-wrap">
              {CANAL_FILTERS.map((ch) => (
                <button
                  key={ch.id}
                  onClick={() => ch.enabled && onCanalChange(ch.id)}
                  disabled={!ch.enabled}
                  className={`${pillBase} ${
                    canalFilter === ch.id ? pillOn : ch.enabled ? pillOff : pillDisabled
                  }`}
                >
                  {ch.label}
                  {!ch.enabled && <span className="ml-1 text-2xs">(Bientôt)</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Objectif */}
          <div>
            <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Objectif</p>
            <div className="flex gap-1.5 flex-wrap">
              <button
                onClick={() => onCategoryChange("all")}
                className={`${pillBase} ${categoryFilter === "all" ? pillOn : pillOff}`}
              >
                Tout
              </button>
              {OBJECTIVE_FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => onCategoryChange(f.id)}
                  className={`${pillBase} ${categoryFilter === f.id ? pillOn : pillOff}`}
                >
                  <span className="mr-1">{f.emoji}</span>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Série */}
          <div>
            <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Série</p>
            <CalendarSeriesFilter value={seriesFilter} onChange={onSeriesChange} counts={seriesCounts} />
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
