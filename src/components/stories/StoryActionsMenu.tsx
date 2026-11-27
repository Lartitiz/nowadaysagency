// Actions sur une story (12/11/2026). Ordi : boutons visibles, comme avant.
// Téléphone : un seul bouton « … » qui regroupe Avant, Après, Dupliquer,
// Ajouter et Supprimer, pour que l'aperçu de la story reste sur le premier
// écran. « Refaire cette story » n'y est plus depuis le 27/11/2026 (choix de
// Laetitia) : sur téléphone, c'est l'onglet « Demander à l'IA » du panneau
// (StoryEditorPanel.tsx), une seule entrée au lieu de deux.
import { ArrowLeft, ArrowRight, Copy, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/use-mobile";
import { MAX_STORIES } from "@/lib/story-sequence-ops";
import StoryRedo from "@/components/stories/StoryRedo";

type RedoProps = Omit<ComponentProps<typeof StoryRedo>, "renderTrigger">;

export function StoryActionsMenu({ index, count, redo, onDelete, onMove, onDuplicate, onAdd, hideDelete }: {
  index: number;
  count: number;
  /** Ordinateur seulement : « Refaire cette story », écrit en bas du panneau. */
  redo: RedoProps;
  onDelete: () => void;
  onMove: (to: number) => void;
  onDuplicate: () => void;
  onAdd: () => void;
  /** Ordi : « Supprimer la story » est sous les vignettes (stories comme le carrousel). */
  hideDelete?: boolean;
}) {
  const isMobile = useIsMobile();
  if (!isMobile) {
    return (
      <>
        {count > 1 && !hideDelete && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2.5 text-2xs gap-1.5 font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Supprimer la story
          </Button>
        )}
        <StoryRedo {...redo} inline />
      </>
    );
  }
  const full = count >= MAX_STORIES;
  const n = index + 1;
  return (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-7 w-9 px-0 ml-auto" aria-label={`Actions sur la story ${n}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {count > 1 && (
              <>
                <DropdownMenuItem disabled={index === 0} onSelect={() => onMove(index - 1)}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Placer avant
                </DropdownMenuItem>
                <DropdownMenuItem disabled={index === count - 1} onSelect={() => onMove(index + 1)}>
                  <ArrowRight className="mr-2 h-4 w-4" /> Placer après
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem disabled={full} onSelect={onDuplicate}>
              <Copy className="mr-2 h-4 w-4" /> Dupliquer
            </DropdownMenuItem>
            <DropdownMenuItem disabled={full} onSelect={onAdd}>
              <Plus className="mr-2 h-4 w-4" /> Ajouter une story après
            </DropdownMenuItem>
            {full && <p className="px-2 pb-1 text-2xs text-muted-foreground">{MAX_STORIES} stories au plus dans une séquence</p>}
            {count > 1 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" /> Supprimer la story
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
  );
}
