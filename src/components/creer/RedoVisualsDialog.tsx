import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cleanCarouselSnapshot } from "@/lib/carousel-autosave";
import { externalizeCarouselMedia } from "@/lib/carousel-media";

/** « Refaire les visuels » sur un carrousel retouché (chantier U, choix C4 de
    Laetitia du 18/10/2026) : fenêtre de l'app à la place de celle du
    navigateur, copie possible dans Mes idées, et rien ne bouge sur « Annuler ». */
export default function RedoVisualsDialog({ open, canCopy, onCancel, onConfirm }: {
  open: boolean;
  canCopy: boolean;
  onCancel: () => void;
  onConfirm: (keepCopy: boolean) => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <AlertDialogContent data-testid="redo-visuals-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Refaire les visuels ?</AlertDialogTitle>
          <AlertDialogDescription>
            Tes retouches seront remplacées par un nouveau design. Le texte reste.
            Cela compte 1 crédit. Tu pourras revenir à ta version pendant 30 secondes.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:flex-col-reverse sm:space-x-0">
          <AlertDialogCancel className="mt-0" onClick={onCancel}>Annuler</AlertDialogCancel>
          {canCopy && (
            <Button variant="outline" onClick={() => onConfirm(true)}>
              Garder une copie dans Mes idées
            </Button>
          )}
          <AlertDialogAction onClick={() => onConfirm(false)}>Refaire quand même</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// « Refaire les visuels » d'un carrousel retouché (chantier U, choix C4 de
// Laetitia du 18/10/2026). Remplace le `window.confirm` du navigateur :
//   - « Annuler » : rien ne change, aucun rendu ne part ;
//   - « Garder une copie dans Mes idées » : une fiche à part garde la version
//     retouchée, puis on refait ;
//   - « Refaire quand même » : on refait.
// Dans les deux derniers cas, la version d'avant est gardée par
// use-regeneration-backup.ts : « Revenir à ma version précédente » pendant 30 s.
// Appelé par « Refaire les visuels », « Créer les visuels » et, pour « Mes
// slides », « Refaire une version » (use-generate-visuals.ts, `confirmRedo`).

export interface CarouselCopySource {
  enabled: boolean;
  userId?: string;
  workspaceId: string;
  title: string;
  channel: string;
  raw: any;
}

/** Enregistre la version actuelle dans une nouvelle fiche de Mes idées. */
export async function saveCarouselCopyToIdeas(source: CarouselCopySource) {
  if (!source.userId || !source.raw) throw new Error("copie impossible");
  const content = await externalizeCarouselMedia(cleanCarouselSnapshot(source.raw), source.userId);
  const { error } = await supabase.from("saved_ideas").insert({
    user_id: source.userId,
    workspace_id: source.workspaceId !== source.userId ? source.workspaceId : null,
    titre: `${source.title.trim() || "Mon carrousel"} (ma version retouchée)`,
    angle: "Carrousel",
    format: "carousel",
    canal: source.channel,
    type: "draft",
    status: "to_explore",
    source_module: "creer",
    content_data: { ...content, _carousel_document_id: crypto.randomUUID() },
  });
  if (error) throw error;
}

export function useRedoVisualsConfirm({ beginBackup, copySource }: {
  beginBackup: () => void;
  copySource: () => CarouselCopySource;
}) {
  const [run, setRun] = useState<(() => void) | null>(null);
  const [copying, setCopying] = useState(false);

  /** Ouvre la fenêtre ; `next` refait les visuels une fois l'accord donné. */
  const ask = useCallback((next: () => void) => setRun(() => next), []);

  const confirm = async (keepCopy: boolean) => {
    if (!run || copying) return;
    if (keepCopy) {
      setCopying(true);
      try {
        await saveCarouselCopyToIdeas(copySource());
        toast.success("Ta version retouchée est gardée dans Mes idées.");
      } catch {
        toast.error("La copie n'a pas pu être enregistrée. Rien n'a été refait.");
        return;
      } finally {
        setCopying(false);
      }
    }
    setRun(null);
    beginBackup();
    run();
  };

  return {
    ask,
    dialog: { open: !!run, canCopy: copySource().enabled, onCancel: () => { if (!copying) setRun(null); }, onConfirm: (keepCopy: boolean) => void confirm(keepCopy) },
  };
}
