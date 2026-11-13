import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { rebindReceiptsAfterFinalTouches } from "./steps/finalize.ts";
import { progressionMaterial } from "../_shared/carousel-editorial-snapshot.ts";
import { invalidateProgressionReceipt } from "../_shared/carousel-editorial-snapshot.ts";

// Passe complète du 16/10/2026 : le contrôle tu/vous a changé « vous serez »
// en « tu seras » après la relecture du fil → l'appli disait « Tu as modifié le
// texte » à une cliente qui n'avait rien touché, et cachait les pistes du relecteur.

const base = () => ({
  slides: [
    { slide_number: 1, title: "Mes bijoux coûteraient moins cher en grande série", body: "" },
    { slide_number: 2, title: "Petite série", body: "Vous serez peu nombreuses à la porter." },
  ],
  caption: { hook: "", body: "", cta: "", hashtags: [] },
});

Deno.test("retouche après relecture : reçu à jour réempreint, aucun « Tu as modifié le texte »", async () => {
  const reviewed = base();
  const before = progressionMaterial(reviewed);
  const doc: any = { ...base(), progression_review: { execution_status: "completed", verdict: "acceptable", issues: [], reviewed_material: before, reviewed_text_hash: "x" }, structure_warnings: [] };
  doc.slides[1] = { ...doc.slides[1], body: "Tu seras peu nombreuse à la porter." };
  const out = await rebindReceiptsAfterFinalTouches(before, doc);
  assertEquals(out.progression_review.reviewed_material, progressionMaterial(out));
  assert(out.progression_review.reviewed_text_hash !== "x");
  assertEquals(out.progression_review.touched_after_review, true);
  assertEquals(invalidateProgressionReceipt(out).progression_review.execution_status, "completed");
});

Deno.test("reçu déjà périmé ou texte inchangé : laissé tel quel", async () => {
  const doc: any = { ...base(), progression_review: { execution_status: "completed", reviewed_material: "autre" } };
  const before = progressionMaterial(base());
  assertEquals(await rebindReceiptsAfterFinalTouches(before, doc), doc);
  const same: any = { ...base(), progression_review: { reviewed_material: before } };
  assertEquals(await rebindReceiptsAfterFinalTouches(before, same), same);
});

Deno.test("fin du carrousel (13/11/2026) : la question finale remplit une légende sans appel", async () => {
  const { fillClosingCta } = await import("./steps/finalize.ts");
  const doc = { slides: [{ body: "Début." }, { body: "Je traite ce lot d'abord. Sur votre dernière opération, lequel est parti en dernier ?" }], caption: { hook: "h", body: "b", cta: "" } };
  const out = fillClosingCta(doc);
  if (out.caption.cta !== "Sur votre dernière opération, lequel est parti en dernier ?") throw new Error(out.caption.cta);
  const photo = fillClosingCta({ slides: [{ overlay_text: "Fin.", detail: "Et ta vitrine, elle dit quoi ?" }], caption: { cta: " " } });
  if (photo.caption.cta !== "Et ta vitrine, elle dit quoi ?") throw new Error(photo.caption.cta);
  const kept = fillClosingCta({ slides: [{ body: "Une question ?" }], caption: { cta: "Garde-moi." } });
  if (kept.caption.cta !== "Garde-moi.") throw new Error("cta existant écrasé");
  const none = fillClosingCta({ slides: [{ body: "Pas de question." }], caption: { cta: "" } });
  if (none.caption.cta !== "") throw new Error("cta inventé");
});
