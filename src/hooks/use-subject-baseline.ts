import { useEffect, useRef } from "react";

/** Sujet sur lequel le contenu en cours a été écrit : figé pendant l'étape
 * « idée », où la saisie modifie le sujet lettre à lettre. */
export function useSubjectBaseline(step: string, ideaText: string) {
  const baseline = useRef(ideaText);
  useEffect(() => { if (step !== "idea") baseline.current = ideaText; }, [step, ideaText]);
  return baseline;
}

/** Fiche (saved_ideas) à relier au contenu qui démarre après « De quoi veux-tu parler ? ».
 * Une idée du diagnostic choisie est toujours reliée ; un autre sujet alors qu'un
 * contenu est déjà écrit démarre un contenu neuf (`freshContent`) : plus rien ne
 * s'écrit dans l'ancienne fiche, qui reste intacte dans Mes idées. Sans contenu
 * écrit, reformuler le sujet garde la fiche (ex. idée ouverte depuis Mes idées). */
export function nextIdeaLink(o: {
  pickedIdeaId?: string;
  editingIdeaId: string | null;
  subject: string;
  previousSubject: string;
  hasContent: boolean;
}): { ideaId: string | null; freshContent: boolean } {
  const otherIdea = !!o.pickedIdeaId && o.pickedIdeaId !== o.editingIdeaId;
  const freshContent = o.hasContent && (otherIdea || o.subject.trim() !== o.previousSubject.trim());
  return { ideaId: o.pickedIdeaId ?? (freshContent ? null : o.editingIdeaId), freshContent };
}
