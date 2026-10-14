import { getSlideCtaText, hasSlideCta } from "@/lib/carousel-html-edit";

/**
 * Carrousel texte (lot 8b, 14/10/2026) : à l'arrivée des visuels, le libellé du
 * bouton d'appel à l'action dessiné dans le HTML (data-slide-cta) est rangé
 * dans la slide (cta_label), comme le font déjà « Modifier » / « Retirer » de
 * l'écran de résultat et patchElement de l'éditeur visuel. Le HTML ne change
 * pas : seul le texte de la slide suit ce que montre le visuel.
 *
 * - bouton présent : cta_label = son libellé ;
 * - bouton absent alors que la slide gardait un libellé (rendu précédent) :
 *   cta_label = "" (retiré) ;
 * - sinon la slide est laissée telle quelle (aucun champ ajouté).
 *
 * Une slide texte n'envoie jamais cta_label à carousel-visual
 * (visualSlidePayload) : le prochain rendu ne change pas.
 *
 * Retourne le même `raw` si rien ne change (pas de sauvegarde inutile).
 */
export function withVisualCtaLabels<R extends Record<string, any>>(raw: R, visuals: { slide_number: number; html: string }[]): R {
  if (!raw || !Array.isArray(raw.slides) || !Array.isArray(visuals) || !visuals.length) return raw;
  const bySlide = new Map(visuals.map((v) => [v.slide_number, v.html]));
  let changed = false;
  const slides = raw.slides.map((s: any, i: number) => {
    const html = bySlide.get(s?.slide_number || i + 1);
    if (typeof html !== "string") return s;
    const label = hasSlideCta(html) ? getSlideCtaText(html) ?? "" : typeof s?.cta_label === "string" && s.cta_label ? "" : undefined;
    if (label === undefined || s?.cta_label === label) return s;
    changed = true;
    return { ...s, cta_label: label };
  });
  return changed ? { ...raw, slides } : raw;
}
