// Reel : 55 s au plus (QA du 12/11/2026, compte de démo). Le montage
// automatique s'arrête à 60 s ; les scripts sortaient à 62-75 s alors que
// l'accroche annonçait « ~25 s ».
// Lancer : deno test --no-check --no-lock --allow-env --allow-read --node-modules-dir=none supabase/functions/creative-flow/reel_duree_test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  REEL_MAX_SECONDS,
  clampHookDuration,
  normalizeHooksResponse,
  reelScriptSeconds,
  reelSpokenWordCap,
} from "./formats/reel.ts";
import { recalibrateReelTimings } from "../_shared/reel-postprocess.ts";

Deno.test("reel : le plafond de mots tient sous 55 s, arrondi par section compris", () => {
  assertEquals(REEL_MAX_SECONDS, 55);
  for (const objective of [null, "visibilite", "confiance", "vente", "credibilite", "engagement"]) {
    const cap = reelSpokenWordCap(objective);
    // Pire cas d'arrondi : 8 sections (maximum du socle), mots répartis à égalité.
    const perSection = Math.floor(cap / 8);
    const reel: any = { script: Array.from({ length: 8 }, () => ({ texte_parle: Array(perSection).fill("mot").join(" ") })) };
    recalibrateReelTimings(reel);
    const secs = reelScriptSeconds(reel);
    assertEquals(secs <= REEL_MAX_SECONDS, true, `${objective} : ${secs} s pour ${cap} mots`);
  }
  assertEquals(reelSpokenWordCap("visibilite") < reelSpokenWordCap("vente"), true);
});

Deno.test("reel : durée lue sur duree_cible recalculée", () => {
  assertEquals(reelScriptSeconds({ duree_cible: "52 sec" }), 52);
  assertEquals(reelScriptSeconds({}), 0);
});

Deno.test("accroches : la durée annoncée ne promet jamais plus que le script", () => {
  assertEquals(clampHookDuration("~40 sec", null), "~40 sec");
  assertEquals(clampHookDuration("~40-60 s", "vente"), "~45 s");
  assertEquals(clampHookDuration("~75 sec", null), "~45 s");
  assertEquals(clampHookDuration("~25 sec", "visibilite"), "~25 sec");
  assertEquals(clampHookDuration("~45 sec", "visibilite"), "~25 s");
  assertEquals(clampHookDuration("", null), "~45 s");
  assertEquals(clampHookDuration(undefined, "visibilite"), "~25 s");
});

Deno.test("accroches : normalisation borne la durée de chaque accroche", () => {
  const parsed: any = {
    hooks: [
      { text: "On me dit de baisser mes prix.", duree_cible: "~70 sec" },
      { text: "Un savon pas cher, c'est jamais un cadeau.", duree_cible: "~30 sec" },
      "Tu préfères payer moins ?",
    ],
  };
  const res = normalizeHooksResponse(parsed, { body: {}, rawContent: "", corsHeaders: {}, effectiveObjective: null });
  assertEquals(res, null);
  assertEquals(parsed.hooks.map((h: any) => h.duree_cible), ["~45 s", "~30 sec", "~45 s"]);
});
