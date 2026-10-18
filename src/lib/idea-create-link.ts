import { resumeIdea } from "@/lib/resume-idea";
import { actuContext, isSavedActu } from "@/lib/actu-context";
import type { IdeaForCalendar } from "@/lib/idea-to-calendar";

/** Une idée de Mes idées, telle que « Créer ce contenu » la transmet à /creer. */
export interface IdeaToCreate {
  id: string;
  titre: string;
  angle?: string | null;
  format?: string | null;
  canal?: string | null;
  objectif?: string | null;
  source_module?: string | null;
}

/** Titre sans l'emoji de rangement (« 📱 Mon sujet » → « Mon sujet »). */
export function cleanIdeaTitle(titre: string): string {
  return (titre || "").replace(/^[\p{Extended_Pictographic}️\s]+/u, "").trim() || titre;
}

/** « Créer ce contenu » (Mes idées, accueil) : ouvre /creer avec le titre,
 * l'angle, le format, le canal et la fiche de l'idée (chantier S, 18/10/2026).
 * /creer lit ces paramètres dans `use-creer-entry-init.ts`. */
export function ideaCreateLink(idea: IdeaForCalendar & { id: string; source_module?: string | null }) {
  // Actu sauvegardée : son résumé, sa source et ses faits suivent (actu-context.ts) ; « actu » n'est pas un format.
  const actu = isSavedActu(idea);
  const params = new URLSearchParams({
    sujet: cleanIdeaTitle(idea.titre),
    angle: idea.angle || "",
    format: actu ? "" : idea.format || "",
    canal: idea.canal || "instagram",
    objectif: idea.objectif || "",
    idea_id: idea.id,
  });
  return {
    to: `/creer?${params.toString()}`,
    state: { resumeIdea: resumeIdea(idea), ideaId: idea.id, ...(actu ? { context: actuContext(idea) ?? undefined } : {}) },
  };
}
