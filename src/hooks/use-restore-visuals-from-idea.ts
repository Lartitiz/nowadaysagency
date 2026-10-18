import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { stripFontImportLeakFromSlides } from "@/lib/strip-font-import-leak";

// Rechargement d'un carrousel dont les visuels étaient trop lourds pour la
// copie de l'onglet (chantier U, 18/10/2026 ; voir flow-state-slim.ts) : la
// version retouchée est dans Mes idées, on la relit au lieu de proposer
// « Créer les visuels » (1 crédit). Tant que la relecture n'est pas finie,
// la page coupe la sauvegarde automatique (elle écrirait un carrousel sans
// visuels par-dessus la fiche) et le bouton payant.

type Slide = { slide_number: number; html: string };

export function useRestoreVisualsFromIdea({ ps, setResult, setVisualSlides }: {
  ps: { visualsInCloud?: boolean; editingIdeaId?: string | null; result?: any; visualSlides?: Slide[] } | null;
  setResult: (update: (prev: any) => any) => void;
  setVisualSlides: (slides: Slide[]) => void;
}) {
  const ideaId = ps?.visualsInCloud && !ps.visualSlides?.length && ps.result ? ps.editingIdeaId : null;
  const [restoring, setRestoring] = useState(!!ideaId);

  useEffect(() => {
    if (!ideaId) return;
    let alive = true;
    const fail = () => { if (alive) toast("Je n'ai pas pu rouvrir tes visuels ici. Ton carrousel est dans Mes idées.", { id: "carousel-storage-warning", duration: 10000 }); };
    // Réseau bloqué : au bout de 20 s, on rend la main (bouton et sauvegarde).
    const giveUp = setTimeout(() => { fail(); alive = false; setRestoring(false); }, 20_000);
    supabase.from("saved_ideas").select("content_data").eq("id", ideaId).maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        const raw: any = data?.content_data;
        if (Array.isArray(raw?.visual_html) && raw.visual_html.length) {
          setResult((prev) => (prev ? { ...prev, raw } : { type: "carousel", raw }));
          setVisualSlides(stripFontImportLeakFromSlides(raw.visual_html));
        } else fail();
      }, fail)
      .then(() => { clearTimeout(giveUp); if (alive) setRestoring(false); });
    return () => { alive = false; clearTimeout(giveUp); };
    // Une seule relecture, à l'ouverture de la page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ideaId]);

  return { restoring };
}
