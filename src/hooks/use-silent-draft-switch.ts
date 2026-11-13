import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { draftLinkedToIdea, draftMatchesSavedIdea } from "@/features/creer/draft-saved-check";
import { isCreerDraftStage } from "@/features/creer/creer-draft-idea";
import { loadFlowState, loadPhotosLocal } from "@/hooks/use-flow-persistence";
import { waitForPendingDraftWrites, writeCreerDraft } from "@/hooks/use-creer-draft-idea";

// Contenu en cours déjà enregistré dans Mes idées : on ouvre le contenu choisi
// sans la fenêtre « Tu as déjà un contenu en cours » (draft-saved-check.ts).
// Contenu commencé pas encore généré (dès la 2e étape) : on le range dans Mes
// idées à l'instant, puis on ouvre le contenu choisi (creer-draft-idea.ts).
// Tant que la vérification tourne, la fenêtre attend ; au moindre doute, elle s'affiche.
const RETRY_MS = 1500; // dernière retouche encore en route vers Mes idées

/** Brouillon pas encore généré, à ranger dans Mes idées avant de le quitter. */
export function draftToStore(conflict: { draft: any; flow?: any } | null | undefined): boolean {
  const d = conflict?.draft;
  if (!d || !conflict?.flow) return false;
  return isCreerDraftStage({
    step: d.step, hasResult: !!d.result, hasEditContent: !!d.editContent?.trim(),
    photoCount: d.photoCount ?? 0, subject: d.ideaText || d.photoSubject || "",
  });
}

export function useSilentDraftSwitch({ draftConflict, onSwitch, userId, workspaceId }: {
  draftConflict: { draft: any; flow?: any } | null;
  onSwitch: () => void;
  userId?: string;
  workspaceId?: string;
}) {
  const storeFirst = !!userId && !!workspaceId && draftToStore(draftConflict);
  const eligible = !!draftConflict && (draftLinkedToIdea(draftConflict.draft) || storeFirst);
  const [checking, setChecking] = useState(eligible);
  const stored = useRef<Promise<boolean> | null>(null); // une seule écriture, même si l'effet est rejoué
  const switchRef = useRef(onSwitch);
  switchRef.current = onSwitch;

  useEffect(() => {
    if (!eligible || !draftConflict) return;
    let alive = true;
    const draft = draftConflict.draft;
    const matches = async () => {
      const { data, error } = await supabase.from("saved_ideas").select("content_data").eq("id", draft.editingIdeaId).maybeSingle();
      if (error) return false;
      return draftMatchesSavedIdea(draft, data?.content_data);
    };
    const store = async () => {
      // La page quittée range peut-être encore ce brouillon : on attend sa fiche.
      await waitForPendingDraftWrites();
      const ideaId = draft.editingIdeaId ?? loadFlowState()?.editingIdeaId ?? null;
      const photos = await loadPhotosLocal();
      const saved = await writeCreerDraft({
        userId: userId!, workspaceId: workspaceId!, flowState: { ...draftConflict.flow, editingIdeaId: ideaId }, photos, ideaId,
      });
      return !!saved;
    };
    (async () => {
      let same: boolean;
      if (storeFirst) same = await (stored.current ??= store().catch(() => false));
      else {
        same = await matches().catch(() => false);
        // Seconde lecture seulement si une sauvegarde automatique peut être en route.
        if (!same && alive && draft.result?.raw?._carousel_cloud) {
          await new Promise((r) => setTimeout(r, RETRY_MS));
          if (alive) same = await matches().catch(() => false);
        }
      }
      if (!alive) return;
      if (same) {
        switchRef.current();
        toast("Ton contenu précédent est enregistré dans Mes idées.", { id: "draft-switch-saved" });
      }
      setChecking(false);
    })();
    return () => { alive = false; };
    // Une seule vérification, à l'arrivée sur la page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { checking };
}
