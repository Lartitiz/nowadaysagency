// Brief de la création (table content_briefs) : enregistrement à la sortie des
// questions et compteur affiché sur l'étape questions.
// Sorti à l'identique de CreerUnifie.tsx (lot C, docs/robustesse/gros-fichiers.md, fiche 1).
// ⚠️ Le filtre workspace est écrit à la main (pas useWorkspaceFilter) : gardé
// tel quel au déplacement, le corriger est un autre chantier.
import { supabase } from "@/integrations/supabase/client";

/** Nombre de briefs existants (scope workspace). */
export function countContentBriefs(userId: string, workspaceId: string | null | undefined): PromiseLike<number> {
  let q = supabase.from("content_briefs")
    .select("id", { count: "exact", head: true });
  // Scope workspace : un·e manager voit le compteur de l'espace actif, pas le sien.
  q = workspaceId && workspaceId !== userId
    ? q.eq("workspace_id", workspaceId)
    : q.eq("user_id", userId);
  return q.then(({ count }: any) => count || 0);
}

type SaveContentBriefInput = {
  userId: string;
  workspaceId: string | null | undefined;
  incomingBriefId: string | null;
  ideaText: string;
  objective: string | null | undefined;
  selectedFormat: string | null | undefined;
  editorialAngle: string | null | undefined;
  questions: { id: string; question: string }[];
  answers: Record<string, string>;
};

/** Enregistre le brief ; renvoie son id (null si l'insertion n'en renvoie pas). Lève en cas d'erreur. */
export async function saveContentBrief({
  userId, workspaceId, incomingBriefId, ideaText, objective, selectedFormat, editorialAngle, questions, answers: ans,
}: SaveContentBriefInput): Promise<string | null> {
  if (incomingBriefId) {
    // Vient de « Créer à partir de ce brief » : on met à jour le brief
    // existant au lieu d'en créer un doublon.
    const { error } = await supabase.from("content_briefs").update({
      objective: objective || null,
      format: selectedFormat || null,
      editorial_angle: editorialAngle || null,
      questions: questions.map(q => ({ id: q.id, question: q.question })),
      answers: ans,
    } as any).eq("id", incomingBriefId);
    if (error) throw error;
    return incomingBriefId;
  } else {
    const { data: briefData, error } = await supabase.from("content_briefs").insert({
      user_id: userId,
      workspace_id: workspaceId && workspaceId !== userId ? workspaceId : null,
      subject: ideaText,
      objective: objective || null,
      format: selectedFormat || null,
      editorial_angle: editorialAngle || null,
      questions: questions.map(q => ({ id: q.id, question: q.question })),
      answers: ans,
    } as any).select("id").maybeSingle();
    if (error) throw error;
    return briefData?.id ?? null;
  }
}
