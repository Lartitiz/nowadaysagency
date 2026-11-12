// Gestes de séquence des stories (chantier 4, 12/11/2026) branchés sur l'état
// de StoryResult. Chaque story garde une clé stable : une story déplacée garde
// son état d'écran (suggestions de photos, « Refaire » en cours) et une
// proposition « Refaire » revient sur la bonne story même si l'ordre a changé.
// Les nouvelles listes passent par onStoriesUpdate, comme les autres éditions.
import { useCallback, useRef } from "react";
import { toast } from "sonner";
import { duplicateStoryAt, insertBlankStoryAfter, MAX_STORIES, moveStory } from "@/lib/story-sequence-ops";

// Les clés ne repartent JAMAIS de zéro quand le parent renvoie la séquence
// (enregistrement automatique, édition qui revient par la prop) : sinon toutes les
// cartes sont recréées, l'aperçu se recharge et le curseur quitte le champ de texte.
export function useStoryStructure({ stories, setStories, onStoriesUpdate, setCurrent, prepare }: {
  stories: any[];
  setStories: (stories: any[]) => void;
  onStoriesUpdate?: (stories: any[]) => void;
  setCurrent: (index: number) => void;
  /** Fige ce qui dépend de la place d'une story (photos attachées) avant le geste. */
  prepare: (stories: any[]) => any[];
}) {
  const keys = useRef<number[]>([]);
  const counter = useRef(0);
  while (keys.current.length < stories.length) keys.current.push(++counter.current);
  if (keys.current.length > stories.length) keys.current = keys.current.slice(0, stories.length);

  const commit = (next: any[], nextKeys: number[], current: number) => {
    keys.current = nextKeys;
    setStories(next);
    onStoriesUpdate?.(next);
    setCurrent(current);
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= stories.length) return;
    commit(moveStory(prepare(stories), from, to), moveStory(keys.current, from, to), to);
  };

  const duplicate = (index: number) => {
    if (stories.length >= MAX_STORIES) return;
    const k = [...keys.current];
    k.splice(index + 1, 0, ++counter.current);
    commit(duplicateStoryAt(prepare(stories), index), k, index + 1);
    toast.success(`Story ${index + 1} dupliquée : la copie est la story ${index + 2}.`);
  };

  const add = (index: number) => {
    if (stories.length >= MAX_STORIES) return;
    const k = [...keys.current];
    k.splice(index + 1, 0, ++counter.current);
    commit(insertBlankStoryAfter(prepare(stories), index), k, index + 1);
  };

  /** À appeler juste avant de retirer la story `index` de l'état. */
  const forget = (index: number) => {
    keys.current = keys.current.filter((_, i) => i !== index);
  };

  const indexOfKey = useCallback((key: number) => keys.current.indexOf(key), []);

  return { keys: keys.current, move, duplicate, add, forget, indexOfKey };
}
