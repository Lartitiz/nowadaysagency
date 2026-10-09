import { progressionMaterial } from "../../supabase/functions/_shared/carousel-editorial-snapshot";

// Carrousel « Photos brutes » : 1 photo = 1 slide photo pleine, AUCUN texte
// sur la photo (seule la légende est écrite). Liste blanche (pas de spread) :
// les champs des gabarits texte-sur-photo (kicker, points, big_number,
// template, cta_label…) transportent du texte qui serait re-composé sur la photo.
export function purePhotoSlides(slides: any[], photoCount: number): any[] {
  const base = slides.slice(0, photoCount);
  while (base.length < photoCount) base.push({ role: "body" });
  return base.map((s: any, i: number) => ({
    slide_number: i + 1,
    role: s?.role || "body",
    slide_type: "photo_full",
    overlay_text: null,
    title: "",
    body: "",
    photo_index: i + 1,
    // Champs internes de l'éditeur (editor_id, editor_locked…, aucun texte) :
    // ils doivent survivre au nettoyage. Les retirer faisait reconnaître à
    // l'éditeur une « nouvelle » liste de slides, qu'il relisait et renvoyait
    // avec ces champs → re-nettoyage → boucle infinie ~1 fois/s (contrôle
    // qualité et sauvegarde jamais finis, vignettes blanches, retour forcé à la
    // slide 1 — contenus figés du 08-09/10). #1412 ne gardait que editor_id.
    ...editorFields(s),
  }));
}

/** Champs posés par l'éditeur sur chaque slide (documentOutput) : jamais du texte. */
function editorFields(s: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s || {})) if (k.startsWith("editor_")) out[k] = v;
  return out;
}

/**
 * Le raw déjà nettoyé, ou null s'il faut le nettoyer. Indispensable pour que
 * l'effet qui l'applique s'ARRÊTE : chaque nettoyage crée un nouveau raw, qui
 * re-déclenche l'effet ; sans ce test, la boucle ne finissait jamais et la
 * pré-génération des visuels s'abandonnait à chaque tour (visite du 05/10 :
 * « Analyse de ta charte graphique… » sans fin, aucun appel carousel-visual).
 */
export function purePhotoRawOrNull(raw: any, photoCount: number): any | null {
  if (!raw || !Array.isArray(raw.slides) || raw.slides.length === 0 || photoCount === 0) return null;
  const cleaned = purePhotoSlides(raw.slides, photoCount);
  const already = raw.no_overlay === true && raw.carousel_type === "photo" &&
    raw.slides.length === cleaned.length &&
    raw.slides.every((s: any, i: number) =>
      Object.keys(s).length === Object.keys(cleaned[i]).length &&
      Object.entries(cleaned[i]).every(([k, v]) => s[k] === v));
  return already ? null : withoutTextReceipts({ ...raw, slides: cleaned, no_overlay: true, carousel_type: "photo" }, raw);
}

const FIL_TEXT_WARNINGS = [
  "Le contrôle final du fil n’a pas abouti. Relis l’enchaînement des slides avant de publier.",
  "Le texte a changé depuis sa relecture. Vérifie le fil avant de publier.",
  "Le texte ou les photos ont changé depuis leur vérification. Vérifie leurs associations avant de publier.",
];

/**
 * Le juge du fil a relu un texte que le nettoyage vient d'effacer : ses
 * constats (et « le texte a changé ») parleraient d'un fil que l'utilisatrice
 * ne verra jamais (visite du 08/10). Son reçu passe « sans objet » et
 * s'empreint sur les slides nettoyées ; le reçu photo garde ses constats mais
 * s'empreint aussi. Les autres avertissements (légende, photos) restent.
 */
function withoutTextReceipts(doc: any, before: any): any {
  const fil = before.progression_review;
  // « La photo 3 revient sur 5 slides » (final-photo-match) : faux ici, chaque
  // photo n'est plus posée qu'une fois (1 photo = 1 slide).
  const repeats: string[] = before.photo_review?.repeat_warnings || [];
  const drop = new Set([...FIL_TEXT_WARNINGS, ...(fil?.issues || []), ...repeats]);
  const out: any = { ...doc, structure_warnings: (before.structure_warnings || []).filter((w: string) => !drop.has(w)) };
  const material = progressionMaterial(out);
  if (fil) out.progression_review = { ...fil, execution_status: "not_applicable", verdict: null, reason: "pure-photo-no-text", reviewed_material: material };
  if (before.photo_review) out.photo_review = { ...before.photo_review, reviewed_material: material,
    ...(repeats.length ? { issues: (before.photo_review.issues || []).filter((w: string) => !repeats.includes(w)), repeat_warnings: [], repeated_photos: [] } : {}) };
  return out;
}
