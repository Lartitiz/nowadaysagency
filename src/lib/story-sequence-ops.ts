// Gestes de séquence des stories (chantier 4, 12/11/2026) : ajouter, dupliquer,
// changer l'ordre. Fonctions pures, sans IA ni crédit : StoryResult les applique
// puis passe la nouvelle liste à onStoriesUpdate, comme les autres éditions.

/** Au-delà, une séquence de stories perd ses spectateurs : on bloque l'ajout. */
export const MAX_STORIES = 15;

/** Story vierge : fond couleur de la marque, texte à écrire. */
export function blankStory(): any {
  return {
    text: "",
    face_cam: false,
    format: "photo",
    visual: {
      gabarit: "fond_pills",
      background: "fond_couleur",
      title_pill: null,
      body_pill: "",
      list_pills: null,
      quote: null,
    },
  };
}

function deepCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

/** Insère une story vierge juste après `index`. */
export function insertBlankStoryAfter(stories: any[], index: number): any[] {
  if (stories.length >= MAX_STORIES) return stories;
  const at = Math.min(Math.max(index + 1, 0), stories.length);
  return [...stories.slice(0, at), blankStory(), ...stories.slice(at)];
}

/**
 * Copie de la story `index`, posée juste après. Une story n'a qu'un seul
 * mot clé d'accroche (story 1) : la copie ne le garde pas.
 */
export function duplicateStoryAt(stories: any[], index: number): any[] {
  if (stories.length >= MAX_STORIES || !stories[index]) return stories;
  const copy = deepCopy(stories[index]);
  if (copy?.visual && typeof copy.visual === "object") copy.visual.mot_cle = null;
  return [...stories.slice(0, index + 1), copy, ...stories.slice(index + 1)];
}

/** Déplace la story `from` à la place `to` (les autres glissent). */
export function moveStory<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
