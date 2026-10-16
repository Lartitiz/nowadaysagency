// Propositions d'image IA de l'écran « carrousel photo » (CarouselPhotoResult),
// rangées par position de slide. Quand une slide monte, descend ou disparaît, sa
// proposition la suit (sinon elle s'afficherait sur une autre slide).
//
// Une génération en cours porte un jeton : sa réponse est rangée là où se trouve
// la slide au moment où elle arrive, et ignorée si la slide a été supprimée.

export interface SlideGenEntry {
  loading: boolean;
  image?: string;
  error?: string;
  token?: object;
}

export type SlideGenState = Record<number, SlideGenEntry>;

/** Échange les propositions de deux positions (monter / descendre une slide). */
export function swapGenEntries(state: SlideGenState, a: number, b: number): SlideGenState {
  const next: SlideGenState = { ...state };
  delete next[a];
  delete next[b];
  if (state[b]) next[a] = state[b];
  if (state[a]) next[b] = state[a];
  return next;
}

/** Retire la proposition d'une position, sans toucher aux autres. */
export function withoutGenEntry(state: SlideGenState, idx: number): SlideGenState {
  const next: SlideGenState = { ...state };
  delete next[idx];
  return next;
}

/** Slide supprimée : sa proposition disparaît, celles d'après remontent d'un cran. */
export function removeGenEntryAt(state: SlideGenState, idx: number): SlideGenState {
  const next: SlideGenState = {};
  for (const [key, entry] of Object.entries(state)) {
    const pos = Number(key);
    if (pos < idx) next[pos] = entry;
    else if (pos > idx) next[pos - 1] = entry;
  }
  return next;
}

/** Met à jour la proposition qui porte ce jeton, où qu'elle soit (rien si la slide a disparu). */
export function patchGenEntry(
  state: SlideGenState,
  token: object,
  patch: (entry: SlideGenEntry) => SlideGenEntry,
): SlideGenState {
  const key = Object.keys(state).find((k) => state[Number(k)]?.token === token);
  if (key === undefined) return state;
  return { ...state, [key]: patch(state[Number(key)]) };
}
