// Consignes de re-passe de _shared/redac-gate.ts figées AVANT son découpage
// (docs/robustesse/gros-fichiers.md, fiche 7, lot 0, test 2). Ce sont les
// phrases exactes que le correcteur reçoit : buildTextFixInstructions (texte)
// et buildFixInstructions (carrousel, non exportée, captée dans la requête
// envoyée par runRedacGate, chute de légende comprise).
//
// Un test rouge ici n'est PAS forcément un bug : si le changement de consigne
// est VOULU, régénère et relis le diff du .snap comme une relecture de prompt :
//   deno test --no-check --allow-env --allow-read --allow-write --node-modules-dir=none supabase/functions/_shared/redac-gate-fix-instructions_snapshot_test.ts -- --update
//
// Lancer : deno test --no-check --allow-env --allow-read --node-modules-dir=none supabase/functions/_shared/redac-gate-fix-instructions_snapshot_test.ts

import { assertSnapshot } from "../../edge-tests/snapshot.ts";
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { anthropicTextSuccess, installFetchMock, setTestEnv } from "./test-edge-harness.ts";
import { analyzeCarouselRedac, buildTextFixInstructions, numbersIn, researchNumbers, runRedacGate, type TextRedacAnalysis } from "./redac-gate.ts";

setTestEnv();

// ── Variante texte : une analyse où chaque famille est présente ──
const TEXT_ANALYSIS: TextRedacAnalysis = {
  reversals: ["n'est pas un choix esthétique. C'est"],
  moulded: ["Ce qui me dérange", "Je ne dis pas ça pour "],
  fabricatedNumbers: ["70 (« …70 % des clientes ne le savent pas… »)"],
  unsourcedResearchNumbers: ["42 (« 42 % des artisans d'art vendent en direct. ») — dans la recherche : « Selon l'Insee (2023), 42 % des artisans d'art vendent en direct. »"],
  inventedTestimonials: ["Une cliente me disait récemment qu'elle ne comprenait pas mes prix."],
  inventedExperiences: ["J'ai essayé de baisser mes prix. Résultat : rien n'a changé."],
  brandCopyOverlap: ["Je me bats pour que chaque artisane puisse vivre dignement de son savoir-faire"],
  hookEchoes: ["J'ai arrêté les remises sur mes bols"],
};

Deno.test("buildTextFixInstructions : toutes les familles", async (t) => {
  await assertSnapshot(t, buildTextFixInstructions(TEXT_ANALYSIS));
});

Deno.test("buildTextFixInstructions : rien à corriger = chaîne vide", () => {
  assertEquals(buildTextFixInstructions({ reversals: [], moulded: [], fabricatedNumbers: [], brandCopyOverlap: [], hookEchoes: [] }), "");
});

// ── Variante carrousel : consignes captées dans la requête du correcteur ──
const BRAND = "Je me bats pour que chaque artisane puisse vivre dignement de son savoir-faire sans brader son travail";
const INPUT = "Brief : mes prix de céramiste. Réponses : plus aucune remise depuis un an.";
const RESEARCH = "Selon l'Insee (2023), 42 % des artisans d'art vendent en direct.";
const RECENT = "Chaque pièce sort de mon atelier après de longues heures de tournage et de patience.";
const ECHO = { previousHooks: ["J'ai arrêté les remises sur mes bols"], subject: "mes prix", recentTexts: [RECENT] };
const DOC = {
  slides: [
    { slide_number: 1, title: "J'ai arrêté les remises", body: "Ce n'est pas un choix esthétique. C'est une stratégie de survie." },
    { slide_number: 2, title: "Le temps", body: "Ce qui me dérange, c'est qu'on oublie le temps. Il faut trois semaines pour un bol. 70 % des clientes ne le savent pas." },
    { slide_number: 3, title: "Une cliente", body: "Une cliente me disait récemment qu'elle ne comprenait pas mes prix. J'ai testé une baisse. Résultat : rien n'a changé." },
    { slide_number: 4, title: "Les chiffres", body: `42 % des artisans d'art vendent en direct. ${BRAND}.` },
    { slide_number: 5, title: "L'atelier", body: RECENT },
    { slide_number: 6, title: "À toi", body: "Dis-moi en commentaire ce que tu en penses." },
  ],
  caption: { hook: "Mes prix", body: "Un bol demande un mois de travail.", cta: "Dis-moi en commentaire ce que tu en penses.", hashtags: ["#a", "#b", "#c", "#d"] },
};

async function fixesSentFor(captionEnding: { requiresQuestion: boolean; instruction: string }) {
  // Réponse trop courte : le correcteur rend l'original, seule la requête compte ici.
  const mock = installFetchMock({ anthropic: () => anthropicTextSuccess("ok") });
  try {
    await runRedacGate(JSON.stringify(DOC), {
      isLinkedIn: false,
      inputText: `${INPUT}\n${RESEARCH}`,
      researchText: RESEARCH,
      brandGuardText: BRAND,
      echo: ECHO,
      testimonySource: INPUT,
      captionEnding,
      correction: { enabled: true, skipIfShorterThan: 0, logger: () => {} },
    });
    // 1re requête = la re-passe ciblée ; les passes dédiées (sources, témoignages) suivent.
    assert(mock.anthropicRequests.length >= 1, "aucune requête au correcteur");
    const user = String(mock.anthropicRequests[0].messages[0].content);
    const head = "CORRECTIONS CIBLÉES À APPLIQUER EN PRIORITÉ (mesurées par code, non négociables) :\n";
    assert(user.includes(head), "consignes ciblées absentes de la requête");
    return user.slice(user.indexOf(head) + head.length, user.indexOf("\n\nVoici les textes du carrousel à corriger"));
  } finally {
    mock.restore();
  }
}

Deno.test("buildFixInstructions (carrousel) : le fixture déclenche bien chaque famille", () => {
  const allowed = numbersIn(`${INPUT}\n${RESEARCH}`);
  const a = analyzeCarouselRedac(DOC, allowed, BRAND, ECHO, researchNumbers(numbersIn(INPUT), RESEARCH, INPUT), INPUT);
  assert(a.reversals.length && a.moulded.length && a.fabricatedNumbers.length && a.durationConflicts.length);
  assert(a.unsourcedResearchNumbers?.length && a.inventedTestimonials?.length && a.inventedExperiences?.length);
  assert(a.brandCopyOverlap.length && a.hookEchoes.length && a.recentEchoes?.length && a.ctaDuplicated);
});

Deno.test("buildFixInstructions (carrousel) : consignes envoyées au correcteur, chute en question", async (t) => {
  const fixes = await fixesSentFor({ requiresQuestion: true, instruction: "une question ouverte sur le sujet" });
  assertStringIncludes(fixes, "CHUTE DE CAPTION NON CONFORME");
  await assertSnapshot(t, fixes);
});

Deno.test("buildFixInstructions (carrousel) : chute imposée sans question, cta en question", async (t) => {
  const saved = DOC.caption.cta;
  DOC.caption.cta = "Et toi, tu fais comment ?";
  try {
    const fixes = await fixesSentFor({ requiresQuestion: false, instruction: "une confidence courte" });
    await assertSnapshot(t, fixes.slice(fixes.indexOf("CHUTE DE CAPTION")));
  } finally {
    DOC.caption.cta = saved;
  }
});
