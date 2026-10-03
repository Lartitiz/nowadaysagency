import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { invalidateProgressionReceipt, progressionMaterial, rebindReceiptsAfterPhotoCast } from "./carousel-editorial-snapshot.ts";

const base = () => {
  const doc: any = { slides: [{ slide_type: "photo_integrated", photo_index: null, title: "Le tri", body: "Pièce par pièce." }, { slide_type: "text_only", title: "Et toi ?", body: "Combien en gardes-tu ?" }] };
  doc.progression_review = { execution_status: "completed", verdict: "acceptable", issues: [], reviewed_material: progressionMaterial(doc) };
  doc.photo_review = { execution_status: "completed", verdict: "acceptable", issues: [], reviewed_material: progressionMaterial(doc) };
  return doc;
};
const withPhoto = (doc: any) => ({ ...doc, slides: [{ ...doc.slides[0], photo_index: 1 }, doc.slides[1]] });

Deno.test("choisir une photo n'affiche jamais « Le texte a changé » ; le reçu photo, lui, se périme", () => {
  const out = invalidateProgressionReceipt(withPhoto(base()));
  assertEquals(out.progression_review.execution_status, "completed");
  assertEquals(out.photo_review.execution_status, "stale");
  assertEquals(out.structure_warnings, ["Le texte ou les photos ont changé depuis leur vérification. Vérifie leurs associations avant de publier."]);
});

Deno.test("modifier le texte périme toujours la relecture du fil", () => {
  const doc = base();
  const out = invalidateProgressionReceipt({ ...doc, slides: [doc.slides[0], { ...doc.slides[1], body: "Autre chose." }] });
  assertEquals(out.progression_review.execution_status, "stale");
});

Deno.test("casting automatique des photos : les reçus à jour restent valables, un reçu périmé le reste", () => {
  const before = base();
  const rebound = rebindReceiptsAfterPhotoCast(before, withPhoto(before));
  const out = invalidateProgressionReceipt(rebound);
  assertEquals([out.progression_review.execution_status, out.photo_review.execution_status], ["completed", "completed"]);
  assertEquals(out.structure_warnings, undefined);
  const stale = { ...before, photo_review: { ...before.photo_review, reviewed_material: "autre" } };
  assertEquals(rebindReceiptsAfterPhotoCast(stale, withPhoto(stale)).photo_review.reviewed_material, "autre");
});
