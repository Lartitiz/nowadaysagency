// Légende qui recopie les slides (étude Instagram du 26/11/2026).
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { analyzeCarouselRedac } from "./redac-gate.ts";
import { buildFixInstructions } from "./redac-gate/fix-instructions.ts";
import { redacViolations } from "./redac-gate/scoring.ts";

const slides = [
  { slide_number: 1, title: "Une tasse met trois semaines à exister", body: "" },
  { slide_number: 2, title: "", body: "La terre sèche lentement dans l'atelier, et chaque pièce attend son tour sur l'étagère du fond." },
  { slide_number: 3, title: "", body: "La cuisson dure toute une nuit, puis le four refroidit pendant deux journées entières." },
  { slide_number: 4, title: "", body: "L'émail demande une seconde cuisson, plus chaude, qui révèle enfin la couleur choisie." },
];

Deno.test("légende recopiée des slides : signalée, comptée et corrigée", () => {
  const a = analyzeCarouselRedac({
    slides,
    caption: {
      hook: "La terre sèche lentement dans l'atelier, et chaque pièce attend son tour sur l'étagère du fond.",
      body: "La cuisson dure toute une nuit, puis le four refroidit pendant deux journées entières.\n\nL'émail demande une seconde cuisson, plus chaude, qui révèle enfin la couleur choisie.",
      cta: "",
    },
  });
  assertEquals(a.captionCopiedSentences?.length, 3);
  assertEquals(redacViolations(a), 1);
  assertEquals(buildFixInstructions(a).includes("LÉGENDE QUI RECOPIE LES SLIDES"), true);
});

Deno.test("légende qui complète les slides : rien de signalé", () => {
  const a = analyzeCarouselRedac({
    slides,
    caption: {
      hook: "On me demande souvent pourquoi mes tasses ne sont pas prêtes en quelques jours.",
      body: "J'ai longtemps répondu trop vite, sans prendre le temps d'expliquer.\n\nCe carrousel reprend les étapes dans l'ordre, pour celles qui commandent avant les fêtes.",
      cta: "",
    },
  });
  assertEquals(a.captionCopiedSentences, []);
  assertEquals(redacViolations(a), 0);
  assertEquals(buildFixInstructions(a).includes("LÉGENDE QUI RECOPIE"), false);
});

Deno.test("une seule phrase reprise, ou photos brutes sans texte : rien de signalé", () => {
  const une = analyzeCarouselRedac({
    slides,
    caption: {
      hook: "La cuisson dure toute une nuit, puis le four refroidit pendant deux journées entières.",
      body: "C'est la partie que personne ne voit quand la pièce arrive emballée dans son papier.\n\nJe la montre rarement, parce que l'atelier est alors plongé dans le noir complet.",
      cta: "",
    },
  });
  assertEquals(une.captionCopiedSentences, []);
  const brutes = analyzeCarouselRedac({ slides: [{ slide_number: 1 }, { slide_number: 2 }], caption: { hook: "Une légende seule, sans aucun texte posé sur les photos du carrousel.", body: "", cta: "" } });
  assertEquals(brutes.captionCopiedSentences, []);
});
