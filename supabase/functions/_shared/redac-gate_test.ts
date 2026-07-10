import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { analyzeCarouselRedac, normalizeCaptionHashtags } from "./redac-gate.ts";

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
