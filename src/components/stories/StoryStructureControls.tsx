// Chantier 4 (12/11/2026) : les gestes de base du carrousel, pour les stories.
// Déplacer, dupliquer, ajouter une story : sans IA, zéro crédit.
import { ArrowLeft, ArrowRight, Copy, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAX_STORIES } from "@/lib/story-sequence-ops";

const BTN = "h-7 px-2 text-2xs gap-1 font-medium text-muted-foreground hover:text-foreground";

export default function StoryStructureControls({ index, count, onMove, onDuplicate, onAdd }: {
  index: number;
  count: number;
  onMove: (to: number) => void;
  onDuplicate: () => void;
  onAdd: () => void;
}) {
  const full = count >= MAX_STORIES;
  const fullTitle = full ? `${MAX_STORIES} stories au plus dans une séquence` : undefined;
  return (
    <div className="flex items-center gap-0.5 flex-wrap" role="group" aria-label={`Organiser la story ${index + 1}`}>
      {count > 1 && (
        <>
          <Button type="button" variant="ghost" size="sm" className={BTN} disabled={index === 0}
            aria-label={`Placer la story ${index + 1} avant la story ${index}`} onClick={() => onMove(index - 1)}>
            <ArrowLeft className="h-3.5 w-3.5" /> Avant
          </Button>
          <Button type="button" variant="ghost" size="sm" className={BTN} disabled={index === count - 1}
            aria-label={`Placer la story ${index + 1} après la story ${index + 2}`} onClick={() => onMove(index + 1)}>
            Après <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
      <Button type="button" variant="ghost" size="sm" className={BTN} disabled={full} title={fullTitle}
        aria-label={`Dupliquer la story ${index + 1}`} onClick={onDuplicate}>
        <Copy className="h-3.5 w-3.5" /> Dupliquer
      </Button>
      <Button type="button" variant="ghost" size="sm" className={BTN} disabled={full} title={fullTitle}
        aria-label={`Ajouter une story après la story ${index + 1}`} onClick={onAdd}>
        <Plus className="h-3.5 w-3.5" /> Ajouter une story
      </Button>
    </div>
  );
}
