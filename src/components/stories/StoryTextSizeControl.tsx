// Chantier 4 (12/11/2026) : taille du texte d'une story. Le choix vit dans
// visual.text_size ; story-visual.ts l'applique au HTML, que l'aperçu et les
// exports PNG / PPTX lisent tous.
import { Button } from "@/components/ui/button";
import type { StoryTextSize } from "@/lib/story-visual";

const SIZES: [StoryTextSize, string][] = [["petit", "Petit"], ["moyen", "Moyen"], ["grand", "Grand"]];

export default function StoryTextSizeControl({ value, onChange }: {
  value: unknown;
  onChange: (size: StoryTextSize) => void;
}) {
  const current = value === "petit" || value === "grand" ? value : "moyen";
  return (
    <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Taille du texte">
      <span className="text-2xs text-muted-foreground">Taille :</span>
      {SIZES.map(([size, label]) => (
        <Button key={size} type="button" size="sm" variant={current === size ? "secondary" : "ghost"}
          className="h-6 px-2 text-2xs" aria-pressed={current === size} data-story-text-size={size}
          onClick={() => onChange(size)}>
          {label}
        </Button>
      ))}
    </div>
  );
}
