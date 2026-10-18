// Chantier S (18/10/2026) : une idée choisie sur l'écran « De quoi veux-tu
// parler ? » prend le même chemin que « Créer ce contenu » de Mes idées
// (titre, angle, format, canal, fiche reliée, droit aux questions).
// Mêmes règles que l'arrivée par l'URL (`use-creer-entry-init.ts`) : un
// carrousel ou un post sans angle passe par l'écran Format, des stories ou un
// reel à plusieurs sujets aussi ; sinon on va droit aux questions.
import { useEffect, useState } from "react";
import { normalizeObjective } from "@/lib/content-structures";
import { cleanIdeaTitle, type IdeaToCreate } from "@/lib/idea-create-link";
import { FORMAT_MAP, SUPPORTED_FORMATS } from "@/features/creer/creer-step";
import { multiSubjectChoicePending } from "../../../supabase/functions/_shared/multi-subject";

export interface IdeaStartPlan {
  subject: string;
  angle: string | null;
  format: string | null;
  objective: string | null;
  canal: "instagram" | "linkedin" | null;
  linkedinCarousel: boolean;
  next: "format" | "questions";
}

export function ideaStartPlan(idea: IdeaToCreate): IdeaStartPlan {
  const subject = cleanIdeaTitle(idea.titre);
  const raw = idea.format ? FORMAT_MAP[idea.format] || idea.format : null;
  const format = raw && SUPPORTED_FORMATS.has(raw) ? raw : null;
  const angle = idea.angle?.trim() || null;
  const canal = idea.canal === "linkedin" ? "linkedin" : idea.canal === "instagram" ? "instagram" : null;
  const objective = idea.objectif ? normalizeObjective(idea.objectif) ?? idea.objectif : null;
  const toFormat = !format
    || ((format === "story" || format === "reel") && multiSubjectChoicePending(subject))
    || ((format === "carousel" || format === "post") && !angle);
  return { subject, angle, format, objective, canal, linkedinCarousel: canal === "linkedin" && format === "carousel", next: toFormat ? "format" : "questions" };
}

type FormatNext = (format: string, angle?: string, options?: { overrideSubject?: string; linkedinCarousel?: boolean }) => unknown;

/** Appelé par CreerUnifie après `useFormatNext`. `handleIdeaNext` fait le
 * travail commun à toute idée (fiche reliée, contenu neuf, écran Format) ;
 * on remet ensuite le format, l'angle et le canal de l'idée. Les questions
 * partent au rendu suivant, quand tout cet état est posé. */
export function useIdeaPick(o: {
  handleIdeaNext: (idea: string, ideaId?: string) => void;
  handleFormatNext: FormatNext;
  setObjective: (v: string | null) => void;
  setSelectedFormat: (v: string | null) => void;
  setEditorialAngle: (v: string | null) => void;
  setIsLinkedInCarousel: (v: boolean) => void;
  setForcedChannel: (v: "instagram" | "linkedin") => void;
}) {
  const [pending, setPending] = useState<IdeaStartPlan | null>(null);
  useEffect(() => {
    if (!pending?.format) return;
    setPending(null);
    void o.handleFormatNext(pending.format, pending.angle ?? undefined, { overrideSubject: pending.subject, ...(pending.linkedinCarousel ? { linkedinCarousel: true } : {}) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  return (idea: IdeaToCreate) => {
    const plan = ideaStartPlan(idea);
    o.handleIdeaNext(plan.subject, idea.id);
    if (plan.objective) o.setObjective(plan.objective);
    if (plan.canal) o.setForcedChannel(plan.canal);
    o.setIsLinkedInCarousel(plan.linkedinCarousel);
    if (!plan.format) return;
    o.setSelectedFormat(plan.format);
    o.setEditorialAngle(plan.angle);
    if (plan.next === "questions") setPending(plan);
  };
}
