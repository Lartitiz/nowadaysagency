import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { invalidateProgressionReceipt, progressionMaterial, rebindReceiptsAfterPhotoCast } from "./carousel-editorial-snapshot.ts";

Deno.test("casting automatique des photos : le reçu à jour reste valable, un reçu périmé le reste", () => {
  const before: any = { slides: [{ slide_type: "photo_integrated", photo_index: null, title: "Le tri", body: "Pièce par pièce." }, { slide_type: "text_only", title: "Et toi ?", body: "Combien en gardes-tu ?" }] };
  before.progression_review = { execution_status: "completed", verdict: "acceptable", issues: [], reviewed_material: progressionMaterial(before) };
  const cast = { ...before, slides: [{ ...before.slides[0], photo_index: 1, cast_source: "library_auto" }, before.slides[1]] };
  assertEquals(invalidateProgressionReceipt(cast).progression_review.execution_status, "stale", "sans rebinding : faux « texte changé »");
  const rebound = rebindReceiptsAfterPhotoCast(before, cast);
  assertEquals(invalidateProgressionReceipt(rebound).progression_review.execution_status, "completed");
  assertEquals(invalidateProgressionReceipt(rebound).structure_warnings, undefined);
  const stale = { ...before, progression_review: { ...before.progression_review, reviewed_material: "autre" } };
  assertEquals(rebindReceiptsAfterPhotoCast(stale, { ...stale, slides: cast.slides }).progression_review.reviewed_material, "autre");
});
