// Antithèse croyance / réalité (re-test réel LinkedIn 04/10/2026) : « On croit
// en faire plus. On en fait souvent moins. » passait sans être comptée.
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { analyzeTextRedac, buildTextFixInstructions } from "./redac-gate.ts";
import { extractReelTexts, reinjectReelTexts, reelAuditableText } from "./reel-postprocess.ts";

const REAL =
  "Et si on publie un nouveau post trop vite après le précédent, on prend le risque de couper l'élan de celui d'avant. On croit en faire plus. On en fait souvent moins.\n\nL'algorithme ne regarde pas seulement si on a aimé un post.";

Deno.test("antithèse : le passage réel est compté une fois, avec une instruction qui donne le mécanisme", () => {
  const a = analyzeTextRedac(REAL);
  assertEquals(a.reversals.length, 1, JSON.stringify(a.reversals));
  assertEquals(a.reversals[0].includes("On croit en faire plus. On en fait souvent moins."), true);
  const fix = buildTextFixInstructions(a);
  assertEquals(fix.includes("deux phrases miroir"), true);
});

Deno.test("antithèse : variantes détectées", () => {
  for (
    const s of [
      "Tu penses gagner du temps. Tu en perds.",
      "On croit être régulière. En réalité, on s'épuise.",
      "Vous pensez publier plus. Vous publiez moins bien.",
      "On a l'impression d'avancer. On tourne en rond.",
    ]
  ) {
    assertEquals(analyzeTextRedac(s).reversals.length, 1, `non détecté : ${s}`);
  }
});

Deno.test("antithèse : pas de faux positif sur une croyance suivie d'une vraie explication", () => {
  for (
    const s of [
      "On pense souvent que la régularité suffit. On va voir pourquoi le temps de lecture pèse davantage dans la distribution d'un post.",
      "Je pense que publier une fois par semaine suffit. Je le vois chaque mois.",
      "On croit ce qu'on voit.",
      "Tu penses à ton audience avant d'écrire, et c'est une bonne habitude.",
    ]
  ) {
    assertEquals(analyzeTextRedac(s).reversals, [], `faux positif : ${s}`);
  }
});

Deno.test("reel : le texte de couverture est envoyé aux relectures et réinjecté", () => {
  const parsed = {
    script: [{ texte_parle: "Publier plus ne fait pas décoller ta portée.", texte_overlay: "Publier plus ?" }],
    caption: { text: "Légende.", cta: "Dis-moi en commentaire." },
    cover_text: "J'ai testé 30 jours",
  };
  const block = extractReelTexts(parsed);
  assertEquals(block.includes("[COVER]\nJ'ai testé 30 jours"), true);
  const out = reinjectReelTexts(parsed, block.replace("J'ai testé 30 jours", "Publier plus, vraiment ?"));
  assertEquals(out.cover_text, "Publier plus, vraiment ?");
  assertEquals(out.caption.cta, "Dis-moi en commentaire.");
  assertEquals(reelAuditableText(out).includes("J'ai testé"), false);
  // Marqueur absent du bloc corrigé = couverture inchangée.
  assertEquals(reinjectReelTexts(parsed, block.replace(/\n\n\[COVER\][\s\S]*$/, "")).cover_text, "J'ai testé 30 jours");
});
