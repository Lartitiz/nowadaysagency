// Barre d'une photo posée DANS la slide sans cacher le texte (28/11/2026).
//
// Vu dans le Loom de Laetitia du 28/11 : sur une photo plein cadre, la barre
// « Photo · Ombre · … » n'a la place ni au-dessus ni en dessous de la slide
// (menu en haut, vignettes juste dessous). Elle se pose alors dans la slide, en
// haut ou en bas selon une égalité au pixel près (photo de 0 à 1350) : selon
// l'arrondi, elle tombait en bas, pile sur le texte (posé en bas par défaut),
// et la dernière ligne paraissait « coupée net au bord ». Ici, quand la barre
// recouvre l'élément choisi, on choisit le bord (haut ou bas) qui cache le
// moins de texte ; à égalité, la place calculée d'origine est gardée.

export type Rect = { left: number; top: number; width: number; height: number };

const overlapArea = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left)) *
  Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));

/**
 * Corrige la place de la barre quand elle est DANS l'élément choisi.
 * `base` = place donnée par placeToolbar ; `avoid` = textes de la slide (même échelle).
 */
export function keepToolbarOffText(
  base: { left: number; top: number },
  box: Rect,
  bar: { width: number; height: number },
  canvas: { width: number; height: number },
  avoid: Rect[] | undefined,
  margin = 4,
): { left: number; top: number } {
  if (!avoid?.length) return base;
  // Barre hors de la slide (au-dessus ou en dessous) : rien à corriger.
  if (base.top < 0 || base.top >= canvas.height) return base;
  const at = (top: number): Rect => ({ left: base.left, top, width: bar.width, height: bar.height });
  // La barre ne recouvre pas l'élément choisi : elle a trouvé sa place à côté.
  if (overlapArea(at(base.top), box) === 0) return base;
  const hidden = (top: number) => avoid.reduce((sum, r) => sum + overlapArea(at(top), r), 0);
  const topEnd = margin, bottomEnd = Math.max(margin, canvas.height - bar.height - margin);
  const current = hidden(base.top);
  if (current === 0) return base;
  const best = [topEnd, bottomEnd].sort((a, b) => hidden(a) - hidden(b))[0];
  return hidden(best) < current ? { left: base.left, top: best } : base;
}

/** Rectangles des textes d'une slide (coordonnées du document de l'aperçu). */
export function slideTextRects(doc: Document | null | undefined): Rect[] {
  if (!doc) return [];
  return [...doc.querySelectorAll<HTMLElement>("[data-slide-text],[data-pptx-editable]")]
    .filter((el) => !el.closest("svg") && !el.parentElement?.closest("[data-slide-text],[data-pptx-editable]") && (el.textContent || "").trim())
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0)
    .map((r) => ({ left: r.left, top: r.top, width: r.width, height: r.height }));
}
