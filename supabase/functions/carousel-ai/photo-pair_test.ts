import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { beforeAfterMatchRule, beforeAfterPairRule, detectBeforeAfterPair, detectBeforeAfterPairs } from "./photo-pair.ts";
import { buildPhotoContextRecap } from "./shared.ts";
import { matchFinalPhotos } from "./final-photo-match.ts";

// Paire avant / après écrite par l'étape « Que montre chaque photo ? » de /creer
// (src/features/creer/photo-context-step.ts : même marqueur « AVANT — » / « APRÈS — »).
Deno.test("paire : un AVANT et un APRÈS exactement, numéros 1-based", () => {
  assertEquals(detectBeforeAfterPair([{ context: "AVANT — cuisine" }, { context: "façade" }, { context: "APRÈS — cuisine" }]), { before: 1, after: 3 });
  assertEquals(detectBeforeAfterPair([{ context: "APRÈS" }, { context: "AVANT" }]), { before: 2, after: 1 });
  assertEquals(detectBeforeAfterPair([{ context: "AVANT — a" }, { context: "AVANT — b" }, { context: "APRÈS — c" }]), null);
  assertEquals(detectBeforeAfterPair([{ context: "Avant de commencer" }, { context: "APRÈS — cuisine" }]), null);
  assertEquals(detectBeforeAfterPair([{ context: "AVANTAGE client" }, { context: "APRÈS — x" }]), null);
  assertEquals(detectBeforeAfterPair(undefined), null);
  assertEquals(beforeAfterPairRule(null), "");
  assertEquals(beforeAfterMatchRule(null), "");
});

Deno.test("paire : la consigne part dans le récapitulatif lu par tous les parcours", () => {
  const recap = buildPhotoContextRecap([{ context: "AVANT — cuisine" }, { context: "façade" }, { context: "APRÈS — cuisine" }]);
  assert(recap.includes("Photo 1 — contexte fourni par la personne : AVANT — cuisine"));
  assert(recap.includes("la photo 1 est l'avant, la photo 3 est l'après"));
  assert(recap.includes("deux slides photo qui se suivent"));
  // Sans paire, le texte reste celui d'avant (snapshots inchangés).
  assert(!buildPhotoContextRecap([{ context: "cuisine" }]).includes("AVANT / APRÈS"));
});

Deno.test("paire : l'association finale des photos reçoit la consigne", async () => {
  const doc = { slides: [
    { slide_type: "photo_full", photo_index: 1, overlay_text: "La cuisine avant." },
    { slide_type: "photo_full", photo_index: 2, overlay_text: "La cuisine après." },
  ], caption: { body: "x" } };
  const systems: string[] = [];
  await matchFinalPhotos(doc, {
    body: { photos: [{ base64: "YQ==", context: "AVANT — cuisine" }, { base64: "Yg==", context: "APRÈS — cuisine" }] },
    startedAt: Date.now(), usage: {}, emitStatus() {},
    call: async (o: any) => { systems.push(o.system); throw new Error("stop"); },
  });
  assert(systems.length > 0);
  assert(systems[0].includes("PHOTO 1 = avant, PHOTO 2 = après"));
});

Deno.test("paires : plusieurs avant / après, associés dans l'ordre des photos", () => {
  const photos = [{ context: "AVANT — chambre" }, { context: "APRÈS — chambre" }, { context: "façade" }, { context: "AVANT — couloir" }, { context: "APRÈS — couloir" }];
  assertEquals(detectBeforeAfterPairs(photos), [{ before: 1, after: 2 }, { before: 4, after: 5 }]);
  assertEquals(detectBeforeAfterPair(photos), null);
  assertEquals(detectBeforeAfterPairs([{ context: "AVANT — a" }, { context: "AVANT — b" }, { context: "APRÈS — c" }]), []);
  const rule = beforeAfterPairRule(detectBeforeAfterPairs(photos));
  assert(rule.includes("2 PAIRES"));
  assert(rule.includes("photo 1 (avant) et photo 2 (après) ; photo 4 (avant) et photo 5 (après)"));
  assert(beforeAfterMatchRule(detectBeforeAfterPairs(photos)).includes("PHOTO 4 = avant et PHOTO 5 = après"));
  // Une seule paire : texte identique à celui d'avant (snapshots inchangés).
  const one = [{ context: "AVANT — cuisine" }, { context: "APRÈS — cuisine" }];
  assertEquals(beforeAfterPairRule(detectBeforeAfterPairs(one)), beforeAfterPairRule(detectBeforeAfterPair(one)));
  assertEquals(beforeAfterMatchRule(detectBeforeAfterPairs(one)), beforeAfterMatchRule(detectBeforeAfterPair(one)));
});

Deno.test("paires : le récapitulatif porte les deux paires", () => {
  const recap = buildPhotoContextRecap([{ context: "AVANT — chambre" }, { context: "APRÈS — chambre" }, { context: "AVANT — couloir" }, { context: "APRÈS — couloir" }]);
  assert(recap.includes("photo 3 (avant) et photo 4 (après)"));
});
