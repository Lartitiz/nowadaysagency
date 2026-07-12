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

Deno.test("analyzeTextRedac attrape l'amorce moulée « Ce qui me dérange » (audit qualité 11/07)", () => {
  const a = analyzeTextRedac("Ce qui me dérange dans la façon dont on regarde la céramique, c'est qu'on la juge comme un produit.");
  assertEquals(a.moulded.length, 1);
});

Deno.test("analyzeTextRedac attrape la variante « Ce qui me gêne »", () => {
  const a = analyzeTextRedac("Ce qui me gêne, c'est le discours ambiant sur la régularité.");
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

Deno.test("les chiffres dupliqués comptent une fois (dédup par valeur)", () => {
  const parsed = {
    slides: [
      { slide_number: 1, title: "", body: "Le prix est de 42 euros. Oui, 42 euros. Je répète : 42." },
    ],
    caption: {},
  };
  const a = analyzeCarouselRedac(parsed, new Set<string>());
  assertEquals(a.fabricatedNumbers.length, 1);
});

Deno.test("la règle 50 mots mesure le corps, pas le titre", () => {
  const longTitle = "Un titre volontairement très long qui ne doit pas compter dans la mesure du corps de la slide du tout";
  const body = Array(40).fill("mot").join(" ");
  const a = analyzeCarouselRedac(
    { slides: [{ slide_number: 1, title: longTitle, body }], caption: {} },
    undefined,
  );
  assertEquals(a.overlongSlides.length, 0);
});

// ── Chute de caption imposée (caption v2, 12/07) ──
import { captionEndingViolated } from "./redac-gate.ts";

Deno.test("captionEndingViolated : question exigée mais absente", () => {
  const parsed = { caption: { hook: "h", body: "b", cta: "Écris BOL en commentaire." } };
  assertEquals(captionEndingViolated(parsed, { requiresQuestion: true, instruction: "une QUESTION" }), true);
});

Deno.test("captionEndingViolated : question exigée et présente", () => {
  const parsed = { caption: { hook: "h", body: "b", cta: "Tu gardes lequel chez toi ?" } };
  assertEquals(captionEndingViolated(parsed, { requiresQuestion: true, instruction: "une QUESTION" }), false);
});

Deno.test("captionEndingViolated : forme non-question mais cta en question", () => {
  const parsed = { caption: { hook: "h", body: "b", cta: "Et toi, tu justifies ou tu expliques ?" } };
  assertEquals(captionEndingViolated(parsed, { requiresQuestion: false, instruction: "une AFFIRMATION" }), true);
});

Deno.test("captionEndingViolated : forme non-question respectée (cta vide, body affirmatif)", () => {
  const parsed = { caption: { hook: "h", body: "Je préfère vendre moins vite, au juste prix.", cta: "" } };
  assertEquals(captionEndingViolated(parsed, { requiresQuestion: false, instruction: "une CHUTE SOBRE" }), false);
});

Deno.test("captionEndingViolated : sans règle, jamais de violation", () => {
  const parsed = { caption: { hook: "h", body: "b", cta: "Une question ?" } };
  assertEquals(captionEndingViolated(parsed, undefined), false);
});

// ── Overlays > 28 mots (audit carrousel photo 12/07, lot D) ──

Deno.test("analyzeCarouselRedac mesure les overlays photo trop longs (> 28 mots)", () => {
  const long = Array.from({ length: 30 }, (_, i) => `mot${i}`).join(" ");
  const parsed = {
    slides: [
      { slide_number: 1, overlay_text: "Une phrase courte qui tient sur la photo." },
      { slide_number: 2, overlay_text: long },
      { slide_number: 3, title: "t", body: "slide texte sans overlay" },
    ],
    caption: { hook: "h", body: "b", cta: "c" },
  };
  const a = analyzeCarouselRedac(parsed);
  assertEquals(a.overlongOverlays.length, 1);
  assertEquals(a.overlongOverlays[0].slide, 2);
  assertEquals(a.overlongOverlays[0].words, 30);
});

Deno.test("analyzeCarouselRedac : overlay à 25 mots = conforme (tolérance 28)", () => {
  const ok = Array.from({ length: 25 }, (_, i) => `mot${i}`).join(" ");
  const a = analyzeCarouselRedac({ slides: [{ slide_number: 1, overlay_text: ok }], caption: {} });
  assertEquals(a.overlongOverlays.length, 0);
});
