// Le cœur d'« Annuler / Rétablir », commun aux stories et au texte (27/11/2026).
// Avant, la même pile était écrite deux fois (use-story-history.ts,
// use-text-edit-history.ts) avec les mêmes règles ; une correction faite d'un
// côté ne l'était pas de l'autre. Ici : la pile et ses règles, sans React.
// Chaque écran garde son branchement (ce qu'il annule, combien d'étapes).
// L'éditeur de carrousel garde sa propre pile (CarouselEditor.tsx) : son cœur
// ne se touche pas (docs/robustesse/gros-fichiers.md, fiche 8).
// Test : src/test/edit-history.test.ts.

/** Des frappes à moins de 800 ms d'écart, dans la même famille, comptent pour une seule étape. */
export const HISTORY_GROUP_MS = 800;

export interface EditHistory<T> {
  past: T[];
  future: T[];
  /** Famille du dernier changement ; null = ne se regroupe avec rien. */
  key: string | null;
  time: number;
}

export function emptyHistory<T>(): EditHistory<T> {
  return { past: [], future: [], key: null, time: 0 };
}

/**
 * À appeler juste avant d'appliquer un changement : garde `previous` comme
 * étape d'Annuler, sauf si ce changement prolonge le précédent (même famille
 * `key`, moins de 800 ms). `key` null = toujours une nouvelle étape.
 * Tout nouveau changement vide « Rétablir ».
 */
export function recordStep<T>(h: EditHistory<T>, previous: T, key: string | null, max: number, now = Date.now()): void {
  const continues = key !== null && key === h.key && now - h.time <= HISTORY_GROUP_MS && h.past.length > 0;
  if (!continues) h.past = [...h.past, previous].slice(-max);
  h.future = [];
  h.key = key;
  h.time = now;
}

/**
 * Annuler (ou Rétablir avec `redo`) : rend la valeur à afficher, ou undefined
 * s'il n'y a rien. Le changement suivant sera toujours une nouvelle étape.
 */
export function travelHistory<T>(h: EditHistory<T>, current: T, redo = false): T | undefined {
  const from = redo ? h.future : h.past;
  if (!from.length) return undefined;
  const next = from.pop() as T;
  (redo ? h.past : h.future).push(current);
  h.key = null;
  h.time = 0;
  return next;
}
