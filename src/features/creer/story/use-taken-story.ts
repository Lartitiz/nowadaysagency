// Histoire prise pour la création en cours (story-answers.ts) : gardée dans
// sessionStorage sous la clé de la création, comme les visuels (creerResultKey),
// pour survivre au rechargement sans toucher à la sauvegarde du parcours.
import { useCallback, useEffect, useState } from "react";
import { storyStillApplies, type TakenStory } from "./story-answers";

export { storyStillApplies, storyContextForQuestions, withStoryAnswers } from "./story-answers";

const readStory = (key: string): TakenStory | null => {
  try {
    const raw = sessionStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed.subject === "string" && Array.isArray(parsed.answers) ? parsed : null;
  } catch { return null; }
};

export function storyStorageKey(creationKey: string) {
  return `creer_story:${creationKey}`;
}

export function useTakenStory(creationKey: string) {
  const key = storyStorageKey(creationKey);
  const [story, setStory] = useState<TakenStory | null>(() => readStory(key));
  // Autre création (nouvelle clé) : son histoire à elle, ou rien.
  useEffect(() => { setStory(readStory(key)); }, [key]);
  useEffect(() => {
    try {
      if (story) sessionStorage.setItem(key, JSON.stringify(story));
      else sessionStorage.removeItem(key);
    } catch { /* stockage plein ou bloqué : l'histoire reste en mémoire */ }
  }, [key, story]);

  const takeStory = useCallback((next: TakenStory) => setStory(next), []);
  /** Au passage à l'étape Format : lâche l'histoire si elle a écrit un autre sujet. */
  const followSubject = useCallback((subject: string) => {
    setStory((current) => (current && !storyStillApplies(current, subject) ? null : current));
  }, []);
  const dropStory = useCallback(() => setStory(null), []);
  return { story, takeStory, followSubject, dropStory };
}
