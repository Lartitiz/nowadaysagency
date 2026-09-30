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

export function invalidateProgressionReceipt<T extends Record<string, any>>(
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
