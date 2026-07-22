// Tests de la garde de fidélité de la passe de correction (audit photo 22/07).
// Le round-trip extraction → réécriture Haiku → réinjection pouvait recoller des
// mots (« je l'aitrouvé commeça ») : keepUnlessRealEdit rejette toute
// « correction » qui ne diffère de l'original que par des espaces.
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { keepUnlessRealEdit } from "./correction-pass.ts";

Deno.test("keepUnlessRealEdit : espaces avalés → original conservé", () => {
  const original = "je l'ai trouvé comme ça";
  const corrupted = "je l'aitrouvé commeça";
  assertEquals(keepUnlessRealEdit(original, corrupted), original);
});

Deno.test("keepUnlessRealEdit : espaces ajoutés/doublés seulement → original conservé", () => {
  const original = "une phrase normale";
  assertEquals(keepUnlessRealEdit(original, "une  phrase  normale"), original);
});

Deno.test("keepUnlessRealEdit : vraie correction (mots changés) → correction gardée", () => {
  const original = "Le bruit du silence invisible";
  const corrected = "Le vacarme de l'atelier au petit matin";
  assertEquals(keepUnlessRealEdit(original, corrected), corrected);
});

Deno.test("keepUnlessRealEdit : original absent → correction gardée", () => {
  assertEquals(keepUnlessRealEdit(undefined, "texte corrigé"), "texte corrigé");
  assertEquals(keepUnlessRealEdit("", "texte corrigé"), "texte corrigé");
});

Deno.test("keepUnlessRealEdit : correction identique → inchangé", () => {
  assertEquals(keepUnlessRealEdit("pareil", "pareil"), "pareil");
});
