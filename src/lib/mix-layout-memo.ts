/**
 * Mémoire de la disposition des slides d'un carrousel MIXTE (04/10/2026).
 *
 * `carousel-visual` renvoie, dans le même ordre que les slides envoyées, la
 * disposition dessinée de chaque slide photo (`mix_layout_memos`, source
 * « mise_en_forme »), ou null. On la garde sur la slide (`mix_layout_memo`),
 * donc dans les données sauvegardées du carrousel, pour que la régénération
 * des visuels reprenne exactement les mêmes dispositions. Ce n'est PAS une
 * disposition confirmée par l'utilisatrice (`photo_layout`) : l'edge la
 * revalide et la remplace si la slide a changé.
 */
export function applyMixLayoutMemos<T extends Record<string, any>>(slides: T[], memos: unknown): T[] {
  if (!Array.isArray(slides) || !Array.isArray(memos) || memos.length !== slides.length) return slides;
  let changed = false;
  const next = slides.map((s, i) => {
    const memo = memos[i];
    const valid = memo && typeof memo === "object" && (memo as any).source === "mise_en_forme" ? memo : null;
    if (JSON.stringify(s?.mix_layout_memo ?? null) === JSON.stringify(valid)) return s;
    changed = true;
    if (!valid) {
      const { mix_layout_memo: _drop, ...rest } = s;
      return rest as T;
    }
    return { ...s, mix_layout_memo: valid };
  });
  return changed ? next : slides;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Ce qu'un rendu du mixte laisse sur le carrousel : dispositions des slides,
 * reçu de l'étage de disposition et mise en forme (étapes, motifs) gardée pour
 * la prochaine régénération. Renvoie le MÊME objet si rien ne change : pas de
 * sauvegarde ni de relecture de l'éditeur pour rien.
 */
export function applyMixRenderMemory<R extends Record<string, any>>(raw: R, memory: { memos?: unknown; receipt?: unknown; formattingMemo?: unknown }): R {
  if (!raw) return raw;
  const slides = Array.isArray(raw.slides) && Array.isArray(memory.memos) ? applyMixLayoutMemos(raw.slides, memory.memos) : raw.slides;
  const receipt = memory.receipt ?? raw.mix_layout_formatting;
  const formatting = memory.formattingMemo ?? raw.mix_formatting_memo;
  if (slides === raw.slides && same(receipt, raw.mix_layout_formatting) && same(formatting, raw.mix_formatting_memo)) return raw;
  return { ...raw, slides, ...(receipt ? { mix_layout_formatting: receipt } : {}), ...(formatting ? { mix_formatting_memo: formatting } : {}) };
}

/** Champs tenus par la sauvegarde automatique, jamais par la copie de l'éditeur. */
const SAVE_OWNED = ["_carousel_cloud", "_carousel_base_updated_at"] as const;

/**
 * L'éditeur renvoie le carrousel ENTIER, construit à partir de la copie qu'il
 * avait au moment de son rendu. Si une sauvegarde s'est terminée entre-temps,
 * cette copie porte l'ancien reçu de sauvegarde : le remettre en place faisait
 * croire, à la prochaine reprise, qu'une « version plus récente existe »
 * ailleurs. Le reçu de sauvegarde et la mémoire du rendu restent ceux du
 * carrousel courant.
 */
export function mergeEditorRaw<R extends Record<string, any>>(current: Record<string, any> | null | undefined, fromEditor: R): R {
  if (!current) return fromEditor;
  const merged: Record<string, any> = { ...fromEditor };
  for (const key of SAVE_OWNED) {
    if (key in current) merged[key] = current[key];
    else delete merged[key];
  }
  for (const key of ["mix_layout_formatting", "mix_formatting_memo"]) if (current[key] !== undefined) merged[key] = current[key];
  // Disposition mémorisée d'une slide : celle du carrousel courant si la copie
  // de l'éditeur ne l'a pas encore (même slide, repérée par son identifiant).
  if (Array.isArray(merged.slides) && Array.isArray(current.slides)) {
    const memoById = new Map(current.slides.filter((s: any) => s?.editor_id && s.mix_layout_memo).map((s: any) => [s.editor_id, s.mix_layout_memo]));
    // Ne recréer la liste QUE si une slide reçoit vraiment sa mémoire : l'éditeur
    // reconnaît son propre écho à la RÉFÉRENCE de la liste des slides (inputKey).
    // Une nouvelle liste identique lui faisait croire à un changement venu
    // d'ailleurs → relecture → nouvel écho → boucle infinie (page figée, vu en
    // ligne le 04/10 sur un mixte à dispositions mémorisées).
    const needsMemo = (s: any) => s && !s.mix_layout_memo && memoById.has(s.editor_id);
    if (memoById.size && merged.slides.some(needsMemo)) merged.slides = merged.slides.map((s: any) => needsMemo(s) ? { ...s, mix_layout_memo: memoById.get(s.editor_id) } : s);
  }
  return merged as R;
}
