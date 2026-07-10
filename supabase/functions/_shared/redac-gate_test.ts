import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { analyzeCarouselRedac, analyzeTextRedac, buildTextFixInstructions, normalizeCaptionHashtags, numbersIn } from "./redac-gate.ts";

// Cas réels de l'audit rédactionnel du 10/07 (carrousels 07 et 18).

Deno.test("analyzeCarouselRedac compte la famille des retournements par négation", () => {
  const parsed = {
    slides: [
      { slide_number: 1, title: "Hook", body: "" },
      { slide_number: 2, title: "", body: "Ce n'est pas de la maladresse : c'est la nature du matériau." },
      { slide_number: 3, title: "", body: "Le problème n'est pas le prix de l'artisanat. C'est le prix de référence qu'on a laissé s'installer." },
    ],
    caption: { hook: "", body: "Je ne dis pas ça pour me justifier. Je le dis parce que j'ai l'impression qu'on a accepté.", cta: "" },
  };
  const a = analyzeCarouselRedac(parsed);
  assertEquals(a.reversals.length >= 2, true);
  assertEquals(a.moulded.length, 1); // « Je ne dis pas ça pour me justifier »
});

Deno.test("analyzeCarouselRedac détecte le CTA de caption qui répète la slide finale", () => {
  const cta = "C'est quoi l'objet fait main qui t'a le plus surprise par son prix, en bien ou en mal ?";
  const parsed = {
    slides: [
      { slide_number: 1, title: "Hook", body: "" },
      { slide_number: 7, title: "La prochaine fois, pose la vraie question", body: `Quand le prix surprend, demande-toi ce qui a permis au prix d'en face de rester bas. ${cta}` },
    ],
    caption: { hook: "Autre chose", body: "Un corps différent.", cta },
  };
  assertEquals(analyzeCarouselRedac(parsed).ctaDuplicated, true);
});

Deno.test("analyzeCarouselRedac tolère un carrousel sain", () => {
  const parsed = {
    slides: [
      { slide_number: 1, title: "Une tasse met trois semaines à exister", body: "" },
      { slide_number: 2, title: "Le séchage décide", body: "La terre sèche à son rythme. On attend, on surveille, on retourne les pièces." },
    ],
    caption: { hook: "On me demande souvent le temps que ça prend.", body: "Trois semaines en moyenne.", cta: "Tu veux voir les étapes ? Dis-le moi." },
  };
  const a = analyzeCarouselRedac(parsed);
  assertEquals(a.reversals.length, 0);
  assertEquals(a.ctaDuplicated, false);
  assertEquals(a.moulded.length, 0);
  assertEquals(a.overlongSlides.length, 0);
});

Deno.test("normalizeCaptionHashtags : cap 3 IG, sans #, dédoublonnés", () => {
  const parsed = { caption: { hashtags: ["#ceramique", "ceramique", "#faitmain", "poterie", "slowmade", "atelier"] } };
  normalizeCaptionHashtags(parsed, false);
  assertEquals(parsed.caption.hashtags, ["ceramique", "faitmain", "poterie"]);
});

Deno.test("normalizeCaptionHashtags : cap 2 LinkedIn", () => {
  const parsed = { caption: { hashtags: ["artisanat", "ceramique", "entrepreneuriat"] } };
  normalizeCaptionHashtags(parsed, true);
  assertEquals(parsed.caption.hashtags, ["artisanat", "ceramique"]);
});


// ── Lot 3 : chiffres inventés (cas réels : « 10-20 % » / « 45 minutes » fabriqués) ──

Deno.test("les chiffres absents du brief sont détectés, ceux du brief sont autorisés", () => {
  const allowed = numbersIn("Pourquoi une tasse faite main coûte 35 euros (et pourquoi c'est normal)");
  const parsed = {
    slides: [
      { slide_number: 1, title: "35 euros pour une tasse ?", body: "" },
      { slide_number: 2, title: "", body: "On compte en moyenne 10 à 20% de pièces perdues, après 45 minutes de façonnage." },
    ],
    caption: { hook: "", body: "", cta: "" },
  };
  const a = analyzeCarouselRedac(parsed, allowed);
  const joined = a.fabricatedNumbers.join(" | ");
  assertEquals(a.fabricatedNumbers.length, 3); // 10, 20, 45 — mais pas 35
  assertEquals(joined.includes("35"), false);
});

Deno.test("les ordinaux ne comptent pas comme chiffres inventés", () => {
  const a = analyzeCarouselRedac(
    { slides: [{ slide_number: 1, title: "", body: "Ma 1re fournée, dès le 2e essai." }], caption: {} },
    new Set<string>(),
  );
  assertEquals(a.fabricatedNumbers.length, 0);
});

// ── Lot 4 : gate texte (LinkedIn/newsletter) ──

Deno.test("analyzeTextRedac attrape la variante moulée « Je ne dis pas ça pour dénigrer »", () => {
  const a = analyzeTextRedac("Je ne dis pas ça pour dénigrer qui achète en grande surface. Je dis juste qu'il faut comparer.");
  assertEquals(a.moulded.length, 1);
});

Deno.test("buildTextFixInstructions vide quand le texte est sain", () => {
  const a = analyzeTextRedac("Un bol met trois semaines à exister. Le séchage décide du rythme, pas moi.", new Set<string>());
  assertEquals(buildTextFixInstructions(a), "");
});

Deno.test("le gate texte compte les retournements au-delà de 1", () => {
  const t = "Ce n'est pas un saut vers la liberté. C'est un saut vers la contrainte. Ce qu'on gagne, ce n'est pas moins de contraintes. C'est des contraintes qui ont du sens.";
  const a = analyzeTextRedac(t);
  assertEquals(a.reversals.length >= 2, true);
  assertEquals(buildTextFixInstructions(a).includes("RETOURNEMENTS"), true);
});
