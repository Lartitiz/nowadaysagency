import { carouselEditorialFields } from "./carousel-editorial-review.ts";

/** Pure shared projection: the browser and server invalidate the same receipt. */
export function progressionMaterial(doc: any): string {
  const slides = Array.isArray(doc?.slides) ? doc.slides : [];
  return JSON.stringify({
    slides: slides.map((s: any, i: number) => ({
      id: `slides.${i}`,
      type: s.slide_type ?? null,
      photo: s.photo_index ?? null,
      no_text: Boolean(s.no_overlay || doc.no_overlay),
    })),
    fields: carouselEditorialFields(doc).map(({ id, text }) => ({ id, text })),
  });
}

function invalidateTextReceipt<T extends Record<string, any>>(
  doc: T,
): T {
  const receipt = doc.progression_review;
  if (
    !receipt || receipt.execution_status === "stale" ||
    receipt.reviewed_material === progressionMaterial(doc)
  ) return doc;
  // Keep prior findings as history in the receipt, never as verdicts on edited text.
  const prior = new Set(receipt.issues || []);
  return {
    ...doc,
    progression_review: {
      ...receipt,
      execution_status: "stale",
      verdict: null,
      reason: "content-edited",
    },
    structure_warnings: [
      ...(doc.structure_warnings || []).filter((s: string) => !prior.has(s)),
      "Le texte a changé depuis sa relecture. Vérifie le fil avant de publier.",
    ],
  };
}

/** A visual verdict applies only to the reviewed text/order/photo assignments. */
export function invalidateProgressionReceipt<T extends Record<string, any>>(doc: T): T {
  const result = invalidateTextReceipt(doc);
  const photo = result.photo_review;
  if (!photo || photo.execution_status === "stale" || photo.reviewed_material === progressionMaterial(result)) return result;
  const prior = new Set(photo.issues || []);
  return { ...result,
    photo_review: { ...photo, execution_status: "stale", verdict: null, reason: "content-edited" },
    structure_warnings: [
      ...(result.structure_warnings || []).filter((s: string) => !prior.has(s)),
      "Le texte ou les photos ont changé depuis leur vérification. Vérifie leurs associations avant de publier.",
    ],
  };
}

/**
 * Changement AUTOMATIQUE de photos (casting bibliothèque du mode « texte
 * d'abord ») : le texte relu n'a pas bougé, seules les photos ont été posées.
 * Un reçu à jour avant le changement est ré-empreint (comme final-photo-match
 * côté serveur) ; un reçu déjà périmé le reste. Sans ça, l'appli affichait
 * « Le texte a changé depuis sa relecture » sur chaque mixte casté.
 */
export function rebindReceiptsAfterPhotoCast<T extends Record<string, any>>(before: any, after: T): T {
  const old = progressionMaterial(before), now = progressionMaterial(after);
  if (old === now) return after;
  const out: any = { ...after };
  if (after.progression_review?.reviewed_material === old) {
    out.progression_review = { ...after.progression_review, reviewed_material: now, photos_reassigned_after_text_review: true };
  }
  if (after.photo_review?.reviewed_material === old) {
    out.photo_review = { ...after.photo_review, reviewed_material: now };
  }
  return out;
}
