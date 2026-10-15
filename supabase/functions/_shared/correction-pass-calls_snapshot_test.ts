// Tests SNAPSHOT des APPELS de _shared/correction-pass.ts, AVANT son découpage
// (docs/robustesse/gros-fichiers.md, fiche 9, lot 0, points 2 et 3).
//
// Pour chaque relecture, on fige la requête envoyée à Claude (modèle, système,
// messages, température, max_tokens) et ce que la fonction renvoie, avec une
// réponse simulée (installFetchMock, aucun réseau). C'est aussi le seul moyen
// de figer CAROUSEL_CORRECTION_PROMPT (non exporté) et de vérifier que l'import
// dynamique de reel-postprocess.ts se charge. Les replis (réponse trop courte,
// sans marqueur, hors bornes, erreur) doivent rendre l'original.
//
// Un test rouge ici n'est PAS forcément un bug : si le changement est VOULU,
// régénère et relis le diff du .snap :
//   deno test --no-check --allow-env --allow-read --allow-write --node-modules-dir=none supabase/functions/_shared/correction-pass-calls_snapshot_test.ts -- --update
//
// Lancer (flags de la CI, script npm test:edges) :
//   deno test --no-check --allow-env --allow-read --node-modules-dir=none supabase/functions/_shared/correction-pass-calls_snapshot_test.ts

import { assertSnapshot } from "../../edge-tests/snapshot.ts";
import { assert, assertEquals, assertStrictEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { anthropicFailure, anthropicTextSuccess, installFetchMock, setTestEnv } from "./test-edge-harness.ts";
import {
  applyCorrectionPass,
  applyCorrectionPassCarousel,
  applyCorrectionPassReel,
  applyCorrectionPassStories,
  applyResearchExcessPass,
  applyResearchSourcingPass,
  applyTestimonyRemovalPass,
} from "./correction-pass.ts";

setTestEnv();

/** Lance `run` avec Claude simulé (une réponse texte par appel) ; rend les requêtes et le résultat. */
// deno-lint-ignore no-explicit-any
async function withClaude<T>(replies: (string | "FAIL")[], run: () => Promise<T>): Promise<{ requests: any[]; result: T }> {
  let i = 0;
  const mock = installFetchMock({
    anthropic: () => {
      const reply = replies[Math.min(i++, replies.length - 1)];
      return reply === "FAIL" ? anthropicFailure() : anthropicTextSuccess(reply);
    },
  });
  try {
    const result = await run();
    return { requests: mock.anthropicRequests, result };
  } finally {
    mock.restore();
  }
}

const quiet = { logger: () => {} };

const POST = `Il y a deux ans, j'ai arrêté de baisser mes prix pour rassurer mes clientes.

Ce que j'ai compris : un prix bas ne rassure personne, il fait douter de la valeur du travail.

Depuis, je présente mon tarif sans m'excuser, et les personnes qui réservent sont celles qui me font confiance.`;
const POST_CORRIGE = `Il y a deux ans, j'ai arrêté de baisser mes prix pour rassurer mes clientes.

Ce que j'ai compris : un prix bas ne rassure personne, il fait douter de la valeur de mon travail.

Depuis, je présente mon tarif sans m'excuser, et les personnes qui réservent me font confiance.`;

// ── Relecture texte générique ─────────────────────────────────────────────
Deno.test("applyCorrectionPass : requête et résultat figés", async (t) => {
  const cases: [string, Parameters<typeof applyCorrectionPass>[1], Parameters<typeof applyCorrectionPass>[2]][] = [
    ["linkedin, sans option", "linkedin", {}],
    ["linkedin, corrections ciblées", "linkedin", { extraInstructions: "- Réécris « valeur du travail » avec un mot concret." }],
    ["newsletter, avec source", "newsletter", { sourceContext: "Tarifs affichés depuis janvier. Aucune remise.", currentBrief: "Post sur mes prix" }],
    ["légende Instagram, phrases de la personne", "instagram_caption", { authoredText: "un prix bas ne rassure personne" }],
    ["reel, modèle imposé sans source", "reel", { model: "claude-haiku-4-5" }],
    ["stories, modèle imposé mais source fournie", "stories", { model: "claude-haiku-4-5", sourceContext: "Tarifs affichés depuis janvier." }],
  ];
  for (const [name, format, options] of cases) {
    await t.step(name, async (s) => {
      const out = await withClaude([POST_CORRIGE], () => applyCorrectionPass(POST, format, { ...quiet, ...options }));
      assertEquals(out.requests.length, 1);
      await assertSnapshot(s, out);
    });
  }
});

Deno.test("applyCorrectionPass : replis sur l'original", async (t) => {
  await t.step("désactivée : aucun appel", async () => {
    const out = await withClaude([POST_CORRIGE], () => applyCorrectionPass(POST, "linkedin", { ...quiet, enabled: false }));
    assertEquals(out.requests.length, 0);
    assertStrictEquals(out.result, POST);
  });
  await t.step("trop court sans corrections ciblées : aucun appel", async () => {
    const out = await withClaude([POST_CORRIGE], () => applyCorrectionPass("Court.", "linkedin", quiet));
    assertEquals(out.requests.length, 0);
    assertStrictEquals(out.result, "Court.");
  });
  await t.step("réponse trop courte", async () => {
    const out = await withClaude(["Trop court."], () => applyCorrectionPass(POST, "linkedin", quiet));
    assertEquals(out.requests.length, 1);
    assertStrictEquals(out.result, POST);
  });
  await t.step("erreur de l'API", async () => {
    const out = await withClaude(["FAIL"], () => applyCorrectionPass(POST, "linkedin", quiet));
    assertStrictEquals(out.result, POST);
  });
  await t.step("réponse emballée en bloc de code : l'emballage est retiré", async () => {
    const out = await withClaude(["```\n" + POST_CORRIGE + "\n```"], () => applyCorrectionPass(POST, "linkedin", quiet));
    assertEquals(out.result, POST_CORRIGE);
  });
});

// ── Carrousel, chemin balisé (fige CAROUSEL_CORRECTION_PROMPT) ────────────
const CAROUSEL = {
  slides: [
    { hook: "Tes prix ne rassurent personne" },
    { title: "Le réflexe", body: "Baisser son prix pour rassurer, c'est envoyer le message inverse." },
    { title: "Ce qui marche", body: "Présenter son tarif sans s'excuser.", punchline: "Ton prix dit ta valeur." },
    { overlay_text: "Et toi, tu t'excuses encore ?" },
  ],
  caption: { hook: "Un prix bas fait douter.", body: "J'ai mis deux ans à le comprendre.", cta: "Dis-moi en commentaire.", hashtags: ["#tarifs"] },
};
const CAROUSEL_JSON = "Voici le carrousel :\n" + JSON.stringify(CAROUSEL) + "\nFin.";
const CAROUSEL_REPLY = `[SLIDE 1 - HOOK] Tes prix ne rassurent personne
[SLIDE 2 - TITLE] Le réflexe
[SLIDE 2 - BODY] Baisser son prix pour rassurer envoie le message inverse.
[SLIDE 3 - TITLE] Ce qui marche
[SLIDE 3 - BODY] Présenter son tarif sans s'excuser.
[SLIDE 3 - PUNCHLINE] Ton prix dit ta valeur.
[SLIDE 4 - OVERLAY] Et toi, tu t'excuses encore ?
[CAPTION - HOOK] Un prix bas fait douter.
[CAPTION - BODY] J'ai mis deux ans à le comprendre.
[CAPTION - CTA] Dis-moi en commentaire.`;

Deno.test("applyCorrectionPassCarousel (chemin balisé) : requête et résultat figés", async (t) => {
  await t.step("sans option", async (s) => {
    const out = await withClaude([CAROUSEL_REPLY], () => applyCorrectionPassCarousel(CAROUSEL_JSON, { ...quiet, skipIfShorterThan: 1 }));
    assertEquals(out.requests.length, 1);
    assert(out.result.startsWith("Voici le carrousel :\n") && out.result.endsWith("\nFin."), "le texte autour du JSON est gardé");
    await assertSnapshot(s, out);
  });
  await t.step("corrections ciblées et source", async (s) => {
    const out = await withClaude([CAROUSEL_REPLY], () =>
      applyCorrectionPassCarousel(CAROUSEL_JSON, { ...quiet, skipIfShorterThan: 1, extraInstructions: "- Slide 2 : retire « c'est »." , sourceContext: "Tarifs affichés depuis janvier." }));
    await assertSnapshot(s, out);
  });
});

Deno.test("applyCorrectionPassCarousel : replis sur l'original", async (t) => {
  await t.step("pas de JSON : aucun appel", async () => {
    const out = await withClaude([CAROUSEL_REPLY], () => applyCorrectionPassCarousel("pas de json ici", quiet));
    assertEquals(out.requests.length, 0);
    assertStrictEquals(out.result, "pas de json ici");
  });
  await t.step("textes trop courts (seuil par défaut 300) : aucun appel", async () => {
    const short = JSON.stringify({ slides: [{ hook: "Court" }, { title: "Deux", body: "Trois mots ici" }] });
    const out = await withClaude([CAROUSEL_REPLY], () => applyCorrectionPassCarousel(short, quiet));
    assertEquals(out.requests.length, 0);
    assertStrictEquals(out.result, short);
  });
  await t.step("réponse trop courte", async () => {
    const out = await withClaude(["[SLIDE 1 - HOOK] Court"], () => applyCorrectionPassCarousel(CAROUSEL_JSON, { ...quiet, skipIfShorterThan: 1 }));
    assertStrictEquals(out.result, CAROUSEL_JSON);
  });
  await t.step("erreur de l'API", async () => {
    const out = await withClaude(["FAIL"], () => applyCorrectionPassCarousel(CAROUSEL_JSON, { ...quiet, skipIfShorterThan: 1 }));
    assertStrictEquals(out.result, CAROUSEL_JSON);
  });
});

// ── Stories ───────────────────────────────────────────────────────────────
const STORIES = [
  { text: "Hier, une cliente m'a demandé pourquoi je n'affiche pas de promo.", visual: { title_pill: "Pas de promo" } },
  { text: "Parce qu'un prix bas fait douter de la valeur du travail.", visual: { title_pill: "La raison", list_pills: ["valeur", "confiance"] } },
  { text: "Et toi, tu as déjà baissé tes prix pour rassurer ?" },
];
const STORIES_REPLY = `[STORY 1 - TEXT] Hier, une cliente m'a demandé pourquoi je n'affiche jamais de promo.
[STORY 1 - TITLE] Jamais de promo
[STORY 2 - TEXT] Parce qu'un prix bas fait douter de la valeur de mon travail.
[STORY 2 - TITLE] Un titre beaucoup trop long pour tenir dans la petite pastille
[STORY 3 - TEXT] Et toi, tu as déjà baissé tes prix pour rassurer ?`;

Deno.test("applyCorrectionPassStories : requête et résultat figés", async (t) => {
  await t.step("sans option", async (s) => {
    const out = await withClaude([STORIES_REPLY], () => applyCorrectionPassStories(STORIES, { ...quiet, skipIfShorterThan: 1 }));
    assertEquals(out.requests.length, 1);
    assertEquals(STORIES[0].text, "Hier, une cliente m'a demandé pourquoi je n'affiche pas de promo.", "l'original n'est pas muté");
    await assertSnapshot(s, out);
  });
  await t.step("corrections ciblées et source", async (s) => {
    const out = await withClaude([STORIES_REPLY], () =>
      applyCorrectionPassStories(STORIES, { ...quiet, skipIfShorterThan: 1, extraInstructions: "- Story 2 : un mot concret.", sourceContext: "Pas de promo depuis 2024." }));
    await assertSnapshot(s, out);
  });
});

Deno.test("applyCorrectionPassStories : replis sur l'original", async (t) => {
  await t.step("réponse sans marqueur [STORY 1 - ", async () => {
    const out = await withClaude(["Voici la séquence corrigée, sans marqueurs."], () => applyCorrectionPassStories(STORIES, { ...quiet, skipIfShorterThan: 1 }));
    assertStrictEquals(out.result.stories, STORIES);
    assertEquals(out.result.changed, 0);
  });
  await t.step("liste vide : aucun appel", async () => {
    const out = await withClaude([STORIES_REPLY], () => applyCorrectionPassStories([], quiet));
    assertEquals(out.requests.length, 0);
    assertEquals(out.result.changed, 0);
  });
  await t.step("erreur de l'API", async () => {
    const out = await withClaude(["FAIL"], () => applyCorrectionPassStories(STORIES, { ...quiet, skipIfShorterThan: 1 }));
    assertStrictEquals(out.result.stories, STORIES);
    assertEquals(out.result.changed, 0);
  });
});

// ── Reel (vérifie aussi l'import dynamique de reel-postprocess.ts) ────────
const REEL = {
  script: [
    { texte_parle: "Tu baisses tes prix pour rassurer ? Mauvaise nouvelle.", texte_overlay: "Tu baisses tes prix ?" },
    { texte_parle: "Un prix bas fait douter de la valeur de ton travail.", texte_overlay: "Un prix bas fait douter" },
    { texte_parle: "Présente ton tarif sans t'excuser, et observe qui reste.", texte_overlay: "Sans t'excuser" },
  ],
  caption: { text: "J'ai mis deux ans à arrêter de m'excuser de mes prix.", cta: "Dis-moi en commentaire." },
  amplification_stories: [{ text: "Nouveau reel sur les prix." }],
  cover_text: "Tes prix ne rassurent personne",
  timing: "30 sec",
};
const REEL_REPLY = `[SECTION 1 - PARLE]
Tu baisses tes prix pour rassurer ? Mauvaise idée.

[SECTION 1 - OVERLAY]
Tu baisses tes prix ?

[SECTION 2 - PARLE]
Un prix bas fait douter de la valeur de ton travail.

[CAPTION]
J'ai mis deux ans à arrêter de m'excuser de mes prix.

[COVER]
Tes prix ne rassurent personne`;

Deno.test("applyCorrectionPassReel : requête et résultat figés", async (t) => {
  await t.step("sans option", async (s) => {
    const out = await withClaude([REEL_REPLY], () => applyCorrectionPassReel(REEL, { ...quiet, skipIfShorterThan: 1 }));
    assertEquals(out.requests.length, 1, "l'import dynamique de reel-postprocess.ts s'est chargé et l'appel est parti");
    assertEquals(REEL.script[0].texte_parle, "Tu baisses tes prix pour rassurer ? Mauvaise nouvelle.", "l'original n'est pas muté");
    await assertSnapshot(s, out);
  });
  await t.step("corrections ciblées et source", async (s) => {
    const out = await withClaude([REEL_REPLY], () =>
      applyCorrectionPassReel(REEL, { ...quiet, skipIfShorterThan: 1, extraInstructions: "- Section 1 : pas de « Mauvaise nouvelle ».", sourceContext: "Tarifs affichés depuis janvier." }));
    await assertSnapshot(s, out);
  });
});

Deno.test("applyCorrectionPassReel : replis sur l'original", async (t) => {
  await t.step("réponse sans marqueur [SECTION 1", async () => {
    const out = await withClaude(["Voici le script corrigé, mais sans aucun marqueur de section, ce qui le rend inutilisable par le code."], () =>
      applyCorrectionPassReel(REEL, { ...quiet, skipIfShorterThan: 1 }));
    assertStrictEquals(out.result, REEL);
  });
  await t.step("réponse trop courte", async () => {
    const out = await withClaude(["[SECTION 1 - PARLE]\nCourt."], () => applyCorrectionPassReel(REEL, { ...quiet, skipIfShorterThan: 1 }));
    assertStrictEquals(out.result, REEL);
  });
  await t.step("désactivée : aucun appel", async () => {
    const out = await withClaude([REEL_REPLY], () => applyCorrectionPassReel(REEL, { ...quiet, enabled: false }));
    assertEquals(out.requests.length, 0);
    assertStrictEquals(out.result, REEL);
  });
  await t.step("erreur de l'API", async () => {
    const out = await withClaude(["FAIL"], () => applyCorrectionPassReel(REEL, { ...quiet, skipIfShorterThan: 1 }));
    assertStrictEquals(out.result, REEL);
  });
});

// ── Passes factuelles ─────────────────────────────────────────────────────
const FACTS = `Selon une étude, 2 à 5 % de tes contacts voient tes posts.

Une cliente me disait la semaine dernière qu'elle ne publiait plus.

Moi, j'ai doublé mes réservations en affichant mes prix.`;
// Variante corrigée de longueur proche (dans toutes les bornes) et même structure.
const FACTS_OK = `Selon une étude Hootsuite de 2024, 2 à 5 % de tes contacts voient tes posts.

Beaucoup d'indépendantes finissent par ne plus publier du tout.

Moi, j'ai doublé mes réservations en affichant mes prix.`;
const TOO_LONG = FACTS + "\n\n" + FACTS;

Deno.test("passes factuelles : requête et résultat figés", async (t) => {
  await t.step("applyResearchSourcingPass", async (s) => {
    const out = await withClaude([FACTS_OK], () =>
      applyResearchSourcingPass(FACTS, { ...quiet, items: ["2 à 5 %"], researchText: "Étude Hootsuite 2024 : 2 à 5 % de portée organique." }));
    assertEquals(out.requests.length, 1);
    await assertSnapshot(s, out);
  });
  await t.step("applyTestimonyRemovalPass (passages et vécus)", async (s) => {
    const out = await withClaude([FACTS_OK], () =>
      applyTestimonyRemovalPass(FACTS, { ...quiet, items: ["Une cliente me disait la semaine dernière"], experiences: ["j'ai doublé mes réservations"] }));
    await assertSnapshot(s, out);
  });
  await t.step("applyTestimonyRemovalPass (modèle imposé)", async (s) => {
    const out = await withClaude([FACTS_OK], () =>
      applyTestimonyRemovalPass(FACTS, { ...quiet, items: ["Une cliente me disait la semaine dernière"], model: "claude-sonnet-4-6" }));
    await assertSnapshot(s, out);
  });
  await t.step("applyResearchExcessPass", async (s) => {
    const out = await withClaude([FACTS_OK], () => applyResearchExcessPass(FACTS, { ...quiet, items: ["2 à 5 %", "1,8 million"], keep: 1 }));
    await assertSnapshot(s, out);
  });
});

Deno.test("passes factuelles : rien à faire = aucun appel", async () => {
  const out = await withClaude([FACTS_OK], async () => [
    await applyResearchSourcingPass(FACTS, { ...quiet, items: [], researchText: "x" }),
    await applyResearchSourcingPass(FACTS, { ...quiet, items: ["2 à 5 %"], researchText: "  " }),
    await applyTestimonyRemovalPass(FACTS, { ...quiet, items: [], experiences: [] }),
    await applyResearchExcessPass(FACTS, { ...quiet, items: ["2 à 5 %"], keep: 1 }),
  ]);
  assertEquals(out.requests.length, 0);
  for (const r of out.result) assertStrictEquals(r, FACTS);
});

Deno.test("passes factuelles : hors des bornes de longueur ou en erreur = l'original", async (t) => {
  const passes: [string, () => Promise<string>][] = [
    ["sourcing (0,7-1,3)", () => applyResearchSourcingPass(FACTS, { ...quiet, items: ["2 à 5 %"], researchText: "Étude 2024." })],
    ["témoignages (0,6-1,2)", () => applyTestimonyRemovalPass(FACTS, { ...quiet, items: ["Une cliente me disait"] })],
    ["excédent (0,5-1,1)", () => applyResearchExcessPass(FACTS, { ...quiet, items: ["a", "b"], keep: 1 })],
  ];
  for (const [name, run] of passes) {
    await t.step(`${name} : trop long`, async () => {
      const out = await withClaude([TOO_LONG], run);
      assertStrictEquals(out.result, FACTS);
    });
    await t.step(`${name} : trop court`, async () => {
      const out = await withClaude(["Trop court."], run);
      assertStrictEquals(out.result, FACTS);
    });
    await t.step(`${name} : erreur de l'API`, async () => {
      const out = await withClaude(["FAIL"], run);
      assertStrictEquals(out.result, FACTS);
    });
  }
});
