// Chantier D (15/10/2026) : les stories se règlent une à la fois (avant : toutes
// empilées, 5 à 9 écrans de haut). Une rangée de numéros + précédente / suivante.
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight } from "lucide-react";

export default function StoryNav({ count, current, onChange }: { count: number; current: number; onChange: (index: number) => void }) {
  if (count < 2) return null;
  return (
    <nav aria-label="Choisir la story à régler" className="flex flex-wrap items-center gap-1.5">
      <Button type="button" variant="outline" size="sm" className="h-8 gap-1 px-2" disabled={current === 0} onClick={() => onChange(current - 1)} aria-label="Story précédente">
        <ArrowLeft className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Précédente</span>
      </Button>
      <span className="text-xs text-muted-foreground">Story</span>
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          aria-label={`Voir la story ${i + 1}`}
          aria-current={i === current ? "step" : undefined}
          onClick={() => onChange(i)}
          className={`h-8 min-w-8 rounded-md border px-2 text-xs font-semibold ${i === current ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:border-primary"}`}
        >
          {i + 1}
        </button>
      ))}
      <Button type="button" variant="outline" size="sm" className="h-8 gap-1 px-2" disabled={current === count - 1} onClick={() => onChange(current + 1)} aria-label="Story suivante">
        <span className="hidden sm:inline">Suivante</span> <ArrowRight className="h-3.5 w-3.5" />
      </Button>
    </nav>
  );
}
