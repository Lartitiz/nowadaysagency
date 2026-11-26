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

// ── Suites du test en ligne du 26/11/2026 ──
import { captionEndingViolated } from "./redac-gate.ts";
import { findUnannouncedExampleDurations } from "./redac-gate/carousel-analysis.ts";
import { validateSchemaPlan } from "./schema-formatting.ts";

Deno.test("durée en lettres absente des sources : signalée, sauf annoncée comme exemple ou fournie", () => {
  const phrase = "Une opération rentable sur six mois peut devenir moyenne.";
  assertEquals(findUnannouncedExampleDurations([phrase], new Set()), [phrase]);
  assertEquals(findUnannouncedExampleDurations(["Par exemple, une opération rentable sur six mois peut devenir moyenne."], new Set()), []);
  assertEquals(findUnannouncedExampleDurations([phrase], new Set(["6"])), []);
  assertEquals(findUnannouncedExampleDurations([phrase], undefined), []);
  const a = analyzeCarouselRedac({ slides: [{ slide_number: 1, title: "Accroche", body: "" }, { slide_number: 2, title: phrase, body: "" }], caption: {} }, new Set());
  assertEquals(a.exampleDurations, [phrase]);
  assertEquals(buildFixInstructions(a).includes("DURÉE D'EXEMPLE NON ANNONCÉE"), true);
});

Deno.test("question de fin de légende : une question oui/non ne suffit pas", () => {
  const rule = { requiresQuestion: true, instruction: "une question" };
  assertEquals(captionEndingViolated({ caption: { body: "Texte.", cta: "Sur votre dernière opération, la durée réelle du portage a-t-elle correspondu à celle que vous aviez prévue ?" } }, rule), true);
  assertEquals(captionEndingViolated({ caption: { body: "Texte.", cta: "Sur vos dernières opérations, qu'est-ce qui a le plus allongé les délais ?" } }, rule), false);
  assertEquals(captionEndingViolated({ caption: { body: "Texte.", cta: "" } }, rule), true);
});

Deno.test("schéma dont deux éléments portent la même description : refusé", () => {
  const sl = [{ slide_number: 1, title: "Accroche" }, { slide_number: 2, title: "Le chantier et la revente ajoutent leurs délais.", body: "Chaque semaine de retard sur les travaux, puis chaque semaine où un lot attend son acquéreur, s'ajoute au portage." }];
  const redite = { type: "timeline", steps: [{ label: "Retard travaux", desc: "Chaque semaine s'ajoute au portage" }, { label: "Attente acquéreur", desc: "Chaque semaine s'ajoute au portage" }] };
  const utile = { type: "timeline", steps: [{ label: "Retard travaux", desc: "Le chantier prend du retard" }, { label: "Attente acquéreur", desc: "Un lot attend son acquéreur" }] };
  const rejected: string[] = [];
  assertEquals(validateSchemaPlan({ schemas: [{ slide_number: 2, visual_schema: redite }] }, sl, (_s, i) => i > 0, rejected).length, 0);
  assertEquals(rejected, ["timeline@2:redite"]);
  assertEquals(validateSchemaPlan({ schemas: [{ slide_number: 2, visual_schema: utile }] }, sl, (_s, i) => i > 0).length, 1);
});
