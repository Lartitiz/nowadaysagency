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
