// Reel : 55 s au plus (QA du 12/11/2026, compte de démo). Le montage
// automatique s'arrête à 60 s ; les scripts sortaient à 62-75 s alors que
// l'accroche annonçait « ~25 s ».
// Lancer : deno test --no-check --no-lock --allow-env --allow-read --node-modules-dir=none supabase/functions/creative-flow/reel_duree_test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  REEL_MAX_SECONDS,
  REEL_CUT_MAX_ATTEMPTS,
  clampHookDuration,
  enforceReelMaxWords,
  normalizeHooksResponse,
  reelSectionBudgets,
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

// Compte d'Auriana, 12/11/2026 : script sorti à 184 mots, coupe unique à 144
// (plafond 130) → reel de 59 s. Budgets par passage + deuxième passe.
const mots = (n: number) => Array(n).fill("mot").join(" ");
const reel184 = () => ({ script: [24, 40, 70, 30, 20].map((n) => ({ texte_parle: mots(n) })) });
const nbMots = (r: any) => r.script.reduce((a: number, s: any) => a + s.texte_parle.split(" ").length, 0);

Deno.test("coupe : budget par passage, accroche intacte, total visé sous le plafond", () => {
  const budgets = reelSectionBudgets(reel184(), 120);
  assertEquals(budgets.some((b) => b.section === 1), false);
  const kept = 24 + budgets.reduce((a, b) => a + b.max, 0);
  assertEquals(kept <= 120, true, `${kept} mots`);
  assertEquals(budgets.every((b) => b.max >= 8 && b.max < b.words), true);
});

Deno.test("coupe : une deuxième passe quand la première coupe trop peu", async () => {
  const consignes: string[] = [];
  // Fausse passe qui, comme Haiku en production, ne coupe que ~20 %.
  const pass: any = async (p: any, o: any) => {
    consignes.push(o.extraInstructions);
    return { script: p.script.map((s: any, i: number) => ({ texte_parle: i === 0 ? s.texte_parle : mots(Math.ceil(s.texte_parle.split(" ").length * 0.8)) })) };
  };
  const r: any = reel184();
  await enforceReelMaxWords(r, { body: {}, effectiveObjective: "credibilite", fullContext: "", pass });
  assertEquals(consignes.length, REEL_CUT_MAX_ATTEMPTS);
  assertEquals(nbMots(r) <= reelSpokenWordCap("credibilite"), true, `${nbMots(r)} mots`);
  assertEquals(r.script[0].texte_parle, mots(24));
  assertEquals(consignes[0].includes("[SECTION 3 - PARLE] : 70 mots →"), true);
});

Deno.test("coupe : rien si le script tient déjà, version gardée seulement si elle raccourcit", async () => {
  let appels = 0;
  const court: any = { script: [{ texte_parle: mots(20) }, { texte_parle: mots(60) }] };
  await enforceReelMaxWords(court, { body: {}, fullContext: "", pass: (async () => { appels++; return null; }) as any });
  assertEquals(appels, 0);
  const long: any = reel184();
  await enforceReelMaxWords(long, { body: {}, fullContext: "", pass: (async (p: any) => ({ script: [...p.script, { texte_parle: mots(5) }] })) as any });
  assertEquals(nbMots(long), 184);
});
