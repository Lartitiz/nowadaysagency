// « As-tu retouché ce carrousel ? » (répétition du 25/11/2026) : la fenêtre
// « Refaire les visuels ? » disait « Tes retouches seront remplacées » à une
// personne qui n'avait rien retouché. `carousel_editor_version` ne le dit pas :
// l'éditeur l'écrit dès qu'il reçoit des visuels, avant tout geste.
//
// `raw.carousel_retouched` :
//   - false : visuels tout juste créés ou refaits, aucun geste depuis ;
//   - true  : au moins un geste dans l'éditeur (texte, photo, mise en page…) ;
//   - absent : carrousel d'avant ce suivi → on ne sait pas, donc on prévient
//     comme avant (« Tes retouches seront remplacées »).
// Annuler / Rétablir ne changent pas la valeur.

type Slide = { html?: string };

const sameSlides = (a: unknown, b: unknown): boolean =>
  Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((s: Slide, i) => s?.html === (b[i] as Slide)?.html);

/**
 * Valeur à écrire quand des visuels arrivent dans l'éditeur ; `undefined` =
 * garder celle du carrousel. `firstImport` : première arrivée depuis que
 * l'éditeur est à l'écran (rechargement, reprise depuis Mes idées), où l'on ne
 * conclut rien d'un écart entre les deux copies des visuels.
 */
export function retouchedOnImport(raw: unknown, visualSlides: unknown, firstImport: boolean): boolean | undefined {
  const data = (raw as { raw?: unknown })?.raw || raw;
  const doc = (data || {}) as { carousel_editor_version?: unknown; visual_html?: unknown };
  if (!doc.carousel_editor_version) return false;
  if (!firstImport && Array.isArray(doc.visual_html) && !sameSlides(doc.visual_html, visualSlides)) return false;
  return undefined;
}

/** Pose la valeur sur ce que l'éditeur rend (sans y toucher si `undefined`). */
export function withRetouched<T extends { raw: object }>(output: T, retouched?: boolean): T {
  if (retouched !== undefined) (output.raw as { carousel_retouched?: boolean }).carousel_retouched = retouched;
  return output;
}

/** Faux seulement quand on sait qu'aucune retouche n'a été faite. */
export function hasRetouches(raw: unknown): boolean {
  return (raw as { carousel_retouched?: unknown } | null | undefined)?.carousel_retouched !== false;
}
