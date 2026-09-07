// Régression du fix "pas de crédit sur fallback IA" (voir CLAUDE.md, pattern
// checkQuota -> appel IA -> logUsage UNIQUEMENT en cas de succès), sur le bloc
// Deep Research : si le fetch de recherche web échoue, logUsage(deep_research)
// ne doit PLUS être appelé (avant le fix, il l'était inconditionnellement).
//
// Particularité de ce fichier : creative-flow utilise `serve()` de std/http
// (pas `Deno.serve` global), qui ouvre un VRAI socket TCP au chargement du
// module — impossible à capturer comme les 4 autres edges de ce correctif
// (voir _shared/test-edge-harness.ts), et incompatible avec la commande CI
// réelle (`npm run test:edges` = `deno test --allow-env --allow-read`, SANS
// --allow-net). Le bloc Deep Research a donc été extrait en fonction exportée
// `runDeepResearchWebSearch` (voir index.ts), testable directement — même
// principe que _shared/plan-limiter_test.ts pour checkQuota/logUsage.
//
// Lancer : deno test --allow-env --allow-read supabase/functions/creative-flow/index_test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { installFetchMock, setTestEnv } from "../_shared/test-edge-harness.ts";

setTestEnv();

// Importer index.ts exécute AUSSI `serve(handler)` en haut de fichier (effet
// de bord non testé ici, voir en-tête). Sans neutraliser Deno.listen(), ça
// tente un vrai socket TCP et plante en CI (pas de --allow-net). On neutralise
// AVANT l'import (obligatoirement dynamique : un import statique s'exécute
// avant tout le reste du fichier, trop tôt pour patcher Deno.listen).
const realListen = Deno.listen;
// deno-lint-ignore no-explicit-any
(Deno as any).listen = () => ({
  [Symbol.asyncIterator]() {
    return { next: () => new Promise(() => {}) }; // ne se résout jamais : pas de crash, juste une tâche de fond inerte
  },
  accept: () => new Promise(() => {}),
  close() {},
  addr: { transport: "tcp", hostname: "localhost", port: 0 },
  rid: -1,
  ref() {},
  unref() {},
  // deno-lint-ignore no-explicit-any
}) as any;
const { runDeepResearchWebSearch, runLinkedInTwoStep, correctPostStreamContent, applyStoriesCorrectionPass } = await import("./index.ts");
// deno-lint-ignore no-explicit-any
(Deno as any).listen = realListen;

const BASE_PARAMS = {
  userId: "test-user-id",
  context: "Un sujet de test pour vérifier le bloc deep research",
};

Deno.test("web search OK -> logUsage(deep_research) appelé + texte de recherche renvoyé", async () => {
  const mock = installFetchMock({
    anthropic: () => ({
      status: 200,
      body: {
        content: [{ type: "text", text: "Point intéressant trouvé via la recherche web." }],
        stop_reason: "end_turn",
        usage: { input_tokens: 80, output_tokens: 40 },
      },
    }),
  });
  try {
    const addendum = await runDeepResearchWebSearch(BASE_PARAMS);
    assertEquals(mock.anthropicCallCount, 1);
    const deepResearchLogs = mock.aiUsageInserts.filter((r) => r.category === "deep_research");
    assertEquals(deepResearchLogs.length, 1);
    assertEquals(deepResearchLogs[0].action_type, "web_search");
    assertEquals(addendum.includes("Point intéressant trouvé via la recherche web."), true);
  } finally {
    mock.restore();
  }
});

Deno.test("web search échoue (500) -> AUCUN logUsage(deep_research), addendum vide", async () => {
  const mock = installFetchMock({
    anthropic: () => ({ status: 500, body: { error: { message: "web search down" } } }),
  });
  try {
    const addendum = await runDeepResearchWebSearch(BASE_PARAMS);
    assertEquals(mock.anthropicCallCount, 1);
    const deepResearchLogs = mock.aiUsageInserts.filter((r) => r.category === "deep_research");
    assertEquals(deepResearchLogs.length, 0);
    assertEquals(addendum, "");
  } finally {
    mock.restore();
  }
});

// ═══ runLinkedInTwoStep — chemin STREAMÉ, celui réellement utilisé en
// production (audit slop 18/08, constat 2) ═══
// Avant ce fix, ce chemin appelait toujours une 2e passe de correction mais
// SANS jamais lui donner d'instructions ciblées (pas de analyzeTextRedac /
// buildTextFixInstructions), contrairement à applyLinkedInCorrectionPass
// (chemin non-streamé) et runNewsletterTwoStep. On vérifie ici que le
// contenu réellement envoyé à Anthropic pour la 2e passe porte ces
// instructions quand une violation est mesurée, et n'en porte AUCUNE quand
// le texte est déjà propre (pas d'appel IA supplémentaire : la 2e passe est
// la même, juste enrichie ou non).

/** Capture les bodies des requêtes POST vers l'API Anthropic, dans l'ordre. */
function installAnthropicBodyCapture(responses: Array<{ status: number; body: unknown }>) {
  let call = 0;
  const mock = installFetchMock({
    anthropic: () => {
      const r = responses[Math.min(call, responses.length - 1)];
      call++;
      return r;
    },
  });
  const capturedBodies: any[] = [];
  const wrapped = globalThis.fetch;
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    if (url.startsWith("https://api.anthropic.com/v1/messages")) {
      capturedBodies.push(init?.body ? JSON.parse(init.body as string) : null);
    }
    return wrapped(input, init);
  }) as typeof fetch;
  return { mock, capturedBodies };
}

const LINKEDIN_BASE_PARAMS = {
  model: "claude-sonnet-4-6" as any,
  systemPrompt: "system prompt de test",
  userPrompt: "user prompt de test",
  corsHeaders: {},
  userId: "test-user-id",
  body: { context: "", answers: null, news_context: "" },
  fullContext: "",
};

Deno.test("runLinkedInTwoStep : formule moulée mesurée en code -> extraInstructions injectées dans la 2e passe (même appel, pas un appel en plus)", async () => {
  const generated = { content: "Ce qui me dérange, c'est le manque de clarté dans notre message de marque." };
  const corrected = { content: "Le manque de clarté dans notre message, c'est ce qui bloque tout le reste.", accroche: "accroche corrigée", corrections_applied: ["formule moulée réécrite"] };
  const { mock, capturedBodies } = installAnthropicBodyCapture([
    { status: 200, body: { content: [{ type: "text", text: JSON.stringify(generated) }], stop_reason: "end_turn", usage: { input_tokens: 50, output_tokens: 30 } } },
    { status: 200, body: { content: [{ type: "text", text: JSON.stringify(corrected) }], stop_reason: "end_turn", usage: { input_tokens: 60, output_tokens: 40 } } },
  ]);
  try {
    const res = await runLinkedInTwoStep(LINKEDIN_BASE_PARAMS);
    assertEquals(mock.anthropicCallCount, 2);
    const correctionCallBody = capturedBodies[1];
    const correctionUserMsg = correctionCallBody.messages[0].content as string;
    assertEquals(correctionUserMsg.includes("CORRECTIONS CIBLÉES À APPLIQUER EN PRIORITÉ"), true);
    assertEquals(correctionUserMsg.includes("FORMULE MOULÉE"), true);
    assertEquals(correctionUserMsg.includes("Ce qui me dérange"), true);
    const json = await res.json();
    assertEquals(json.content, corrected.content);
  } finally {
    mock.restore();
  }
});

Deno.test("runLinkedInTwoStep : texte propre -> pas d'extraInstructions, prompt de correction inchangé", async () => {
  const generated = { content: "Le brief était clair dès le départ, alors on a foncé sans hésiter une seconde." };
  const corrected = { content: "Version corrigée d'un texte déjà propre.", accroche: "accroche", corrections_applied: [] };
  const { mock, capturedBodies } = installAnthropicBodyCapture([
    { status: 200, body: { content: [{ type: "text", text: JSON.stringify(generated) }], stop_reason: "end_turn", usage: { input_tokens: 50, output_tokens: 30 } } },
    { status: 200, body: { content: [{ type: "text", text: JSON.stringify(corrected) }], stop_reason: "end_turn", usage: { input_tokens: 60, output_tokens: 40 } } },
  ]);
  try {
    await runLinkedInTwoStep(LINKEDIN_BASE_PARAMS);
    const correctionUserMsg = capturedBodies[1].messages[0].content as string;
    assertEquals(correctionUserMsg.includes("CORRECTIONS CIBLÉES À APPLIQUER EN PRIORITÉ"), false);
    assertEquals(correctionUserMsg.startsWith('Voici le post LinkedIn à corriger :'), true);
  } finally {
    mock.restore();
  }
});

Deno.test("runLinkedInTwoStep : élisions appliquées même si la 2e passe échoue (filet déterministe, fallback sur le brut)", async () => {
  const generated = { content: "On montre le avant/après qui brille, sans rien cacher." };
  const { mock } = installAnthropicBodyCapture([
    { status: 200, body: { content: [{ type: "text", text: JSON.stringify(generated) }], stop_reason: "end_turn", usage: { input_tokens: 50, output_tokens: 30 } } },
    // Réponse de correction illisible -> fallback sur le contenu brut
    { status: 200, body: { content: [{ type: "text", text: "pas du JSON valide" }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 } } },
  ]);
  try {
    const res = await runLinkedInTwoStep(LINKEDIN_BASE_PARAMS);
    const json = await res.json();
    assertEquals(json.content.includes("l'avant/après"), true);
    assertEquals(json.content.includes("le avant/après"), false);
  } finally {
    mock.restore();
  }
});

Deno.test("web search OK mais réponse vide -> logUsage quand même appelé (coût API réel), addendum vide", async () => {
  // Cas limite documenté : searchResponse.ok=true mais aucun bloc texte
  // exploitable. Le fetch a réussi (coût API réel engagé) -> comportement
  // inchangé du code de prod : logUsage reste appelé (searchResponse.ok
  // est la seule condition du gate), seul l'addendum est vide.
  const mock = installFetchMock({
    anthropic: () => ({
      status: 200,
      body: { content: [], stop_reason: "end_turn", usage: { input_tokens: 20, output_tokens: 0 } },
    }),
  });
  try {
    const addendum = await runDeepResearchWebSearch(BASE_PARAMS);
    const deepResearchLogs = mock.aiUsageInserts.filter((r) => r.category === "deep_research");
    assertEquals(deepResearchLogs.length, 1);
    assertEquals(addendum, "");
  } finally {
    mock.restore();
  }
});

// ═══ correctPostStreamContent — gate rédactionnel du post Instagram/Pinterest
// STREAMÉ (audit slop 18/08, constat 2) ═══
// Avant ce fix, streamDefaultPostSSE (chemin réellement utilisé en prod pour
// ces deux formats) n'avait NI détection (analyzeTextRedac) NI re-passe de
// correction : CORRECTION_PROMPTS.instagram_caption existait dans le code
// sans jamais être appelé. On vérifie ici que la fonction extraite (appelée
// dans le onDone de createClientSSEStream, juste avant l'event `done` final)
// déclenche bien la correction quand une violation est mesurée, et ne fait
// AUCUN appel IA supplémentaire quand le texte est déjà propre.

const POST_BASE_PARAMS = {
  body: { context: "", answers: null, news_context: "" },
  fullContext: "",
};

Deno.test("correctPostStreamContent : formule moulée mesurée en code -> correction déclenchée avec extraInstructions, content remplacé", async () => {
  const mouldedContent =
    "Ce qui me dérange dans la façon dont on regarde la céramique, c'est qu'on la juge comme un produit fini plutôt que comme un geste patient répété des centaines de fois avant d'obtenir la bonne forme, la bonne épaisseur.";
  const full = JSON.stringify({ content: mouldedContent, accroche: "accroche de test" });
  const correctedContent =
    "La céramique se juge beaucoup trop souvent comme un simple produit fini, presque jamais comme le geste patient répété des centaines de fois avant d'obtenir la bonne forme, la bonne épaisseur, la bonne tenue en main.";
  const { mock, capturedBodies } = installAnthropicBodyCapture([
    { status: 200, body: { content: [{ type: "text", text: correctedContent }], stop_reason: "end_turn", usage: { input_tokens: 60, output_tokens: 40 } } },
  ]);
  try {
    const result = await correctPostStreamContent(full, POST_BASE_PARAMS);
    assertEquals(mock.anthropicCallCount, 1);
    const correctionUserMsg = capturedBodies[0].messages[0].content as string;
    assertEquals(correctionUserMsg.includes("CORRECTIONS CIBLÉES À APPLIQUER EN PRIORITÉ"), true);
    assertEquals(correctionUserMsg.includes("FORMULE MOULÉE"), true);
    const parsedResult = JSON.parse(result!);
    assertEquals(parsedResult.content, correctedContent);
    assertEquals(parsedResult.accroche, "accroche de test"); // les autres champs du tool JSON restent intacts
  } finally {
    mock.restore();
  }
});

Deno.test("correctPostStreamContent : texte propre -> AUCUN appel IA supplémentaire, undefined (garde le `full` streamé tel quel)", async () => {
  const cleanContent =
    "J'ai changé quatre mots dans ma bio la semaine dernière et les messages privés ont doublé en trois jours, ce qui m'a appris que la clarté compte plus que l'esthétique dans ce métier.";
  const full = JSON.stringify({ content: cleanContent, accroche: "accroche propre" });
  const { mock } = installAnthropicBodyCapture([]);
  try {
    const result = await correctPostStreamContent(full, POST_BASE_PARAMS);
    assertEquals(mock.anthropicCallCount, 0);
    assertEquals(result, undefined);
  } finally {
    mock.restore();
  }
});

Deno.test("correctPostStreamContent : JSON invalide en entrée -> undefined sans planter, aucun appel IA", async () => {
  const { mock } = installAnthropicBodyCapture([]);
  try {
    const result = await correctPostStreamContent("pas du JSON valide", POST_BASE_PARAMS);
    assertEquals(mock.anthropicCallCount, 0);
    assertEquals(result, undefined);
  } finally {
    mock.restore();
  }
});

Deno.test("correctPostStreamContent : réponse de correction illisible/trop courte -> repli sur l'original (undefined = rien à remplacer dans le stream)", async () => {
  const mouldedContent =
    "Ce qui me dérange dans la façon dont on regarde la céramique, c'est qu'on la juge comme un produit fini plutôt que comme un geste patient répété des centaines de fois avant d'obtenir la bonne forme et la bonne tenue.";
  const full = JSON.stringify({ content: mouldedContent, accroche: "accroche de test" });
  const { mock } = installAnthropicBodyCapture([
    { status: 200, body: { content: [{ type: "text", text: "trop court" }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 } } },
  ]);
  try {
    const result = await correctPostStreamContent(full, POST_BASE_PARAMS);
    assertEquals(mock.anthropicCallCount, 1);
    // Depuis runTextRedacGate : une correction repliée sur l'original n'est plus
    // re-sérialisée — undefined dit au stream « garde le texte déjà émis »
    // (même état final côté client, sans réécriture inutile du payload).
    assertEquals(result, undefined);
  } finally {
    mock.restore();
  }
});

// ═══ applyStoriesCorrectionPass — la passe de correction stories, ACTIVE
// (audit stories 07/09/2026 : elle tournait en mode ombre depuis #896 et ne
// corrigeait jamais). Garanties : (1) 0 appel IA quand rien n'est mesuré ;
// (2) sur violation, le bloc annoté [STORY N - CHAMP] est envoyé et la
// correction est réinjectée story par story (texte ET pastilles) ; (3) une
// correction qui laisse plus de tics bruts est REJETÉE (original gardé) ;
// (4) quality_check est posé sur la réponse avec le score APRÈS passe.
const STORIES_PASS_PARAMS = { body: { context: "", answers: null }, fullContext: "" };
const MOULDED_STORIES = () => ({
  stories: [
    { number: 1, text: "Ce qui me dérange, c'est de voir tout le monde stresser pour un post Instagram alors que personne ne se souvient de ce qui a été publié la semaine dernière, et ça continue encore et encore sans jamais vraiment changer.", visual: { gabarit: "photo_pills", title_pill: "CE QUI ME DÉRANGE", body_pill: "Tout le monde stresse pour un post que personne ne retient.", list_pills: null, quote: null } },
    { number: 2, text: "Bref, on respire, on avance, et on essaie de ne pas se laisser bouffer par la pression du contenu parfait tous les jours de la semaine.", visual: null, face_cam: true },
  ],
});
const anthropicText = (text: string) => ({
  status: 200,
  body: { content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 40, output_tokens: 20 } },
});

Deno.test("applyStoriesCorrectionPass : formule moulée détectée -> bloc annoté envoyé, correction réinjectée story par story, quality_check posé", async () => {
  const parsed: any = MOULDED_STORIES();
  const { mock, capturedBodies } = installAnthropicBodyCapture([
    anthropicText([
      "[STORY 1 - TEXT] Voir tout le monde stresser pour un post Instagram dont personne ne se souvient la semaine suivante, ça continue sans jamais changer.",
      "[STORY 1 - TITLE] LE POST QUE PERSONNE NE RETIENT",
      "[STORY 1 - BODY] Tout le monde stresse pour un post que personne ne retient.",
      "[STORY 2 - TEXT] Bref, on respire, on avance, et on essaie de ne pas se laisser bouffer par la pression du contenu parfait tous les jours de la semaine.",
    ].join("\n")),
  ]);
  try {
    const gate = await applyStoriesCorrectionPass(parsed, STORIES_PASS_PARAMS);
    assertEquals(mock.anthropicCallCount, 1);
    const sent = JSON.stringify(capturedBodies[0]);
    assertEquals(sent.includes("[STORY 1 - TEXT]"), true);
    assertEquals(sent.includes("[STORY 1 - TITLE] CE QUI ME DÉRANGE"), true);
    assertEquals(parsed.stories[0].text.startsWith("Voir tout le monde stresser"), true);
    assertEquals(parsed.stories[0].visual.title_pill, "LE POST QUE PERSONNE NE RETIENT");
    assertEquals(parsed.stories[0].visual.body_pill, "Tout le monde stresse pour un post que personne ne retient.");
    assertEquals(parsed.stories[1].text.startsWith("Bref, on respire"), true);
    assertEquals(gate?.repassed, true);
    assertEquals(gate?.violations, 0);
    assertEquals(parsed.quality_check.source, "code");
    assertEquals(parsed.quality_check.score, 100);
  } finally {
    mock.restore();
  }
});

Deno.test("applyStoriesCorrectionPass : la correction réintroduit plus de tics -> rejetée, stories INCHANGÉES, reverted=true", async () => {
  const parsed: any = MOULDED_STORIES();
  const originalStoriesJson = JSON.stringify(parsed.stories);
  const mock = installFetchMock({
    anthropic: () => anthropicText([
      "[STORY 1 - TEXT] Ce qui me dérange, c'est le stress. Je ne dis pas ça pour râler, mais ce n'est pas le post qui compte, c'est la personne.",
      "[STORY 1 - TITLE] CE QUI ME DÉRANGE",
      "[STORY 1 - BODY] Ce n'est pas le post qui compte, c'est la personne.",
      "[STORY 2 - TEXT] Je ne dis pas ça pour me plaindre, on respire et on avance.",
    ].join("\n")),
  });
  try {
    const gate = await applyStoriesCorrectionPass(parsed, STORIES_PASS_PARAMS);
    assertEquals(mock.anthropicCallCount, 1);
    assertEquals(JSON.stringify(parsed.stories), originalStoriesJson);
    assertEquals(gate?.repassed, false);
    assertEquals(gate?.reverted, true);
  } finally {
    mock.restore();
  }
});

Deno.test("applyStoriesCorrectionPass : réponse sans marqueurs -> original gardé, quality_check reflète l'état avant", async () => {
  const parsed: any = MOULDED_STORIES();
  const originalStoriesJson = JSON.stringify(parsed.stories);
  const mock = installFetchMock({ anthropic: () => anthropicText("Version totalement réécrite par la passe de correction.") });
  try {
    const gate = await applyStoriesCorrectionPass(parsed, STORIES_PASS_PARAMS);
    assertEquals(mock.anthropicCallCount, 1);
    assertEquals(JSON.stringify(parsed.stories), originalStoriesJson);
    assertEquals(gate?.repassed, false);
    assertEquals(gate?.violations, 1);
    assertEquals(parsed.quality_check.score, 90);
  } finally {
    mock.restore();
  }
});

Deno.test("applyStoriesCorrectionPass : stories propres (0 violation) -> aucun appel Anthropic, quality_check 100", async () => {
  const parsed: any = {
    stories: [
      { text: "On a testé un nouveau format cette semaine, et ça a plutôt bien marché avec les abonnées qui ont réagi plus que d'habitude.", visual: { title_pill: "NOUVEAU FORMAT TESTÉ", body_pill: "Les abonnées ont réagi plus que d'habitude." } },
      { text: "Prochaine étape : voir si ça tient sur la durée, sans forcer le rythme ni se comparer aux autres comptes.", visual: null },
    ],
  };
  const mock = installFetchMock({ anthropic: () => anthropicText("ne devrait jamais être appelé") });
  try {
    const gate = await applyStoriesCorrectionPass(parsed, STORIES_PASS_PARAMS);
    assertEquals(mock.anthropicCallCount, 0);
    assertEquals(gate?.score, 100);
    assertEquals(parsed.quality_check.repassed, false);
  } finally {
    mock.restore();
  }
});

Deno.test("applyStoriesCorrectionPass : pastilles récitant la fiche de marque -> mesurées (le texte seul serait propre)", async () => {
  const brand = "Contre les savons industriels bourrés de tensioactifs agressifs qui dessèchent la peau, et contre le greenwashing des marques naturelles aux listes illisibles.";
  const parsed: any = {
    stories: [
      { text: "Une journée à l'atelier, de la pesée des huiles au démoulage, et le petit stress du dernier moment qui ne part jamais vraiment.", visual: { title_pill: "POURQUOI JE FAIS ÇA", body_pill: "Contre les savons industriels bourrés de tensioactifs agressifs qui dessèchent la peau." } },
      { text: "Le démoulage, à chaque fois j'ai un petit stress, même après tout ce temps, et ça me rappelle pourquoi je travaille en petites séries.", visual: null },
    ],
  };
  const mock = installFetchMock({ anthropic: () => anthropicText("réponse sans marqueur, ignorée") });
  try {
    const gate = await applyStoriesCorrectionPass(parsed, { ...STORIES_PASS_PARAMS, brandGuardText: brand });
    assertEquals(mock.anthropicCallCount, 1);
    assertEquals(gate?.violations, 1);
  } finally {
    mock.restore();
  }
});

Deno.test("applyStoriesCorrectionPass : pas de stories -> no-op silencieux", async () => {
  const parsed = { script: [] };
  const mock = installFetchMock({ anthropic: () => anthropicText("x") });
  try {
    const gate = await applyStoriesCorrectionPass(parsed, STORIES_PASS_PARAMS);
    assertEquals(mock.anthropicCallCount, 0);
    assertEquals(gate, null);
  } finally {
    mock.restore();
  }
});
