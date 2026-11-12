import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { draftLinkedToIdea, draftMatchesSavedIdea } from "@/features/creer/draft-saved-check";

// Contenu en cours déjà enregistré dans Mes idées : on ouvre le contenu choisi
// sans la fenêtre « Tu as déjà un contenu en cours » (draft-saved-check.ts).
// Tant que la vérification tourne, la fenêtre attend ; au moindre doute, elle s'affiche.
const RETRY_MS = 1500; // dernière retouche encore en route vers Mes idées

export function useSilentDraftSwitch({ draftConflict, onSwitch }: {
  draftConflict: { draft: any } | null;
  onSwitch: () => void;
}) {
  const eligible = !!draftConflict && draftLinkedToIdea(draftConflict.draft);
  const [checking, setChecking] = useState(eligible);
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
    (async () => {
      let same = await matches().catch(() => false);
      if (!same && alive) {
        await new Promise((r) => setTimeout(r, RETRY_MS));
        if (alive) same = await matches().catch(() => false);
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
