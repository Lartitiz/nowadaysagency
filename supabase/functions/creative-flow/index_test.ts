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
import { buildVisionGenerateBrief, buildVisionQuestionsPrompt } from "../_shared/vision-prompts.ts";

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
const { retiredCarouselStreamResponse, runDeepResearchWebSearch, runLinkedInTwoStep, correctPostStreamContent, applyStoriesCorrectionPass, applyNewsletterCorrectionPass, applyLinkedInCorrectionPass } = await import("./index.ts");
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

Deno.test("runLinkedInTwoStep : texte propre -> pas d'extraInstructions, mais clarté et faits source conservés", async () => {
  const generated = { content: "Le brief était clair dès le départ, alors on a foncé sans hésiter une seconde." };
  const corrected = { content: "Version corrigée d'un texte déjà propre.", accroche: "accroche", corrections_applied: [] };
  const { mock, capturedBodies } = installAnthropicBodyCapture([
    { status: 200, body: { content: [{ type: "text", text: JSON.stringify(generated) }], stop_reason: "end_turn", usage: { input_tokens: 50, output_tokens: 30 } } },
    { status: 200, body: { content: [{ type: "text", text: JSON.stringify(corrected) }], stop_reason: "end_turn", usage: { input_tokens: 60, output_tokens: 40 } } },
  ]);
  try {
    await runLinkedInTwoStep({ ...LINKEDIN_BASE_PARAMS, body: { ...LINKEDIN_BASE_PARAMS.body, context: "La réunion sert à valider le brief du projet." } });
    const correctionUserMsg = capturedBodies[1].messages[0].content as string;
    assertEquals(correctionUserMsg.includes("CORRECTIONS CIBLÉES À APPLIQUER EN PRIORITÉ"), false);
    assertEquals(correctionUserMsg.includes('Voici le post LinkedIn à corriger :'), true);
    assertEquals(correctionUserMsg.includes("La réunion sert à valider le brief du projet."), true);
    assertEquals(JSON.stringify(capturedBodies[1].system).includes("COMPRÉHENSION DU SUJET"), true);
    assertEquals(JSON.stringify(capturedBodies[1].system).includes("Le post corrigé fait entre 1300 et 1700 caractères"), false);
    assertEquals(JSON.stringify(capturedBodies[1].system).includes("La longueur du post corrigé suit la matière"), true);
    assertEquals(mock.anthropicCallCount, 2);
  } finally {
    mock.restore();
  }
});

Deno.test("post LinkedIn avec photos : la photo ne fournit ni pensée ni dialogue", () => {
  const prompt = buildVisionGenerateBrief("post_linkedin").formatBrief;
  assertEquals(prompt.includes("Une image seule ne prouve ni ce qu'elle a pensé"), true);
  assertEquals(prompt.includes("Respecte le registre de la marque"), true);
  assertEquals(prompt.includes("ADRESSE : VOUS"), false);
});

Deno.test("questions LinkedIn avec photos : le vécu passe avant le résultat business", () => {
  const prompt = buildVisionQuestionsPrompt({
    contentType: "post_linkedin",
    context: "Ce que j'aime dans la préparation d'un atelier",
    objective: "confiance",
    photo_description: null,
    per_photo_context: null,
  });
  assertEquals(prompt.includes("ce qu'elle pensait ou ressentait"), true);
  assertEquals(prompt.includes("résultat / chiffre concret, contexte business"), false);
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

Deno.test("applyStoriesCorrectionPass : formule moulée détectée -> texte et titre envoyés, correction réinjectée story par story, pastilles dérivées jamais réécrites, quality_check posé", async () => {
  const parsed: any = MOULDED_STORIES();
  const { mock, capturedBodies } = installAnthropicBodyCapture([
    anthropicText([
      "[STORY 1 - TEXT] Voir tout le monde stresser pour un post Instagram dont personne ne se souvient la semaine suivante, ça continue sans jamais changer.",
      "[STORY 1 - TITLE] LE POST QUE PERSONNE NE RETIENT",
      "[STORY 2 - TEXT] Bref, on respire, on avance, et on essaie de ne pas se laisser bouffer par la pression du contenu parfait tous les jours de la semaine.",
    ].join("\n")),
  ]);
  try {
    const gate = await applyStoriesCorrectionPass(parsed, STORIES_PASS_PARAMS);
    assertEquals(mock.anthropicCallCount, 1);
    const sent = JSON.stringify(capturedBodies[0]);
    assertEquals(sent.includes("[STORY 1 - TEXT]"), true);
    assertEquals(sent.includes("[STORY 1 - TITLE] CE QUI ME DÉRANGE"), true);
    assertEquals(sent.includes("[STORY 1 - BODY]"), false);
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

Deno.test("applyStoriesCorrectionPass : texte récitant la fiche de marque -> mesuré et corrigé", async () => {
  const brand = "Contre les savons industriels bourrés de tensioactifs agressifs qui dessèchent la peau, et contre le greenwashing des marques naturelles aux listes illisibles.";
  const parsed: any = {
    stories: [
      { text: "Une journée à l'atelier, de la pesée des huiles au démoulage. Contre les savons industriels bourrés de tensioactifs agressifs qui dessèchent la peau.", visual: { photo_directive: "la pesée des huiles" } },
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

Deno.test("stories : un brief explicite déclenche la vérification même sans tic mesuré", async () => {
  const text = "Ce porte-savon en céramique blanche se pose au bord du lavabo pour laisser sécher le savon après utilisation. Ses rainures laissent un espace sous le savon, et le format trouve sa place près du robinet.";
  const parsed: any = { stories: [{ text, visual: null, photo_id: "photo-stable" }] };
  const { mock, capturedBodies } = installAnthropicBodyCapture([anthropicText(`[STORY 1 - TEXT] ${text}`)]);
  try {
    await applyStoriesCorrectionPass(parsed, { body: { context: "Porte-savon céramique blanche, trois rainures, 18 euros." }, fullContext: "" });
    assertEquals(mock.anthropicCallCount, 1);
    assertEquals(JSON.stringify(capturedBodies[0]).includes("fabrication ou conception"), true);
    assertEquals(parsed.stories[0].text, text);
    assertEquals(parsed.stories[0].photo_id, "photo-stable");
  } finally { mock.restore(); }
});

Deno.test("newsletter : la même relecture reçoit et corrige aussi les champs courts visibles", async () => {
  const content = "Ce porte-savon en céramique blanche se pose au bord du lavabo pour laisser sécher le savon après utilisation. Ses rainures laissent un espace sous le savon, et le format trouve sa place près du robinet. Il mesure onze centimètres de long.";
  const parsed: any = { subject: "Je l'ai fabriqué", preview_text: "Je l'ai dessiné", content, campaign: "stable" };
  const { mock, capturedBodies } = installAnthropicBodyCapture([anthropicText(`[NEWSLETTER subject]\nLe porte-savon\n\n[NEWSLETTER preview_text]\nLaisser sécher le savon\n\n[NEWSLETTER content]\n${content}`)]);
  try {
    await applyNewsletterCorrectionPass(parsed, { body: { context: "Porte-savon en céramique blanche, trois rainures, 11 cm." }, context: "Porte-savon en céramique blanche, trois rainures, 11 cm.", fullContext: "" });
    assertEquals(mock.anthropicCallCount, 1);
    const sent = JSON.stringify(capturedBodies[0]);
    assertEquals(sent.includes("Je l'ai fabriqué"), true);
    assertEquals(sent.includes("Je l'ai dessiné"), true);
    assertEquals(parsed.subject, "Le porte-savon");
    assertEquals(parsed.preview_text, "Laisser sécher le savon");
    assertEquals(parsed.content, content);
    assertEquals(parsed.campaign, "stable");
  } finally { mock.restore(); }
});

// ── Ancien circuit carrousel (stream + passe de correction) retiré ──
// Sa passe de correction demandait d'effacer la numérotation des conseils
// (régression « 1, 2, 3 » perdus). Plus aucun appelant : réponse 410 claire,
// sans appel IA ni crédit débité. Les carrousels passent par carousel-ai.
Deno.test("circuit carrousel stream retiré : 410 explicite, aucun appel IA", async () => {
  const mock = installFetchMock({ anthropic: () => { throw new Error("aucun appel IA attendu"); } });
  try {
    const res = retiredCarouselStreamResponse({ "Access-Control-Allow-Origin": "*" });
    assertEquals(res.status, 410);
    assertEquals(res.headers.get("Content-Type"), "application/json");
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
    const json = await res.json();
    assertEquals(json.error, "carousel_flow_retired");
    assertEquals(/carousel-ai/.test(json.message), true);
    assertEquals(mock.anthropicCallCount, 0);
    assertEquals(mock.aiUsageInserts.length, 0);
  } finally {
    mock.restore();
  }
});

// ═══ Post LinkedIn newsjacking : les chiffres sourcés de la recherche web ═══
// La recherche était ajoutée au prompt, mais absente de la liste blanche de la
// correction : un chiffre sourcé repris tel quel était retiré comme « sans source ».
const LI_RESEARCH_POST = "Je le dis sans détour : 62 % des indépendantes interrogées (Ifop, 2025) disent repousser leurs posts par peur du jugement. Ce chiffre m'énerve, parce qu'il dit une norme sociale bien plus qu'un manque de courage individuel.";

Deno.test("LinkedIn + recherche : un chiffre sourcé par la recherche web n'est pas signalé comme sans source", async () => {
  const { mock, capturedBodies } = installAnthropicBodyCapture([
    { status: 200, body: { content: [{ type: "text", text: LI_RESEARCH_POST }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 10 } } },
  ]);
  try {
    // creative-flow passe gateContext (profil + recherche) comme fullContext.
    const parsed = { content: LI_RESEARCH_POST };
    await applyLinkedInCorrectionPass(parsed, {
      body: { context: "La visibilité des indépendantes sur LinkedIn", answers: null, news_context: "" },
      fullContext: "profil\n--- RECHERCHE WEB ---\n62 % des indépendantes repoussent leurs posts (Ifop, 2025).",
    });
    assertEquals(capturedBodies.some((b) => JSON.stringify(b).includes("CHIFFRES SANS SOURCE")), false);
    assertEquals(parsed.content.includes("62 %"), true);
  } finally {
    mock.restore();
  }
});

Deno.test("LinkedIn sans recherche : le même chiffre reste signalé comme sans source", async () => {
  const { mock, capturedBodies } = installAnthropicBodyCapture([
    { status: 200, body: { content: [{ type: "text", text: LI_RESEARCH_POST }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 10 } } },
  ]);
  try {
    await applyLinkedInCorrectionPass({ content: LI_RESEARCH_POST }, {
      body: { context: "La visibilité des indépendantes sur LinkedIn", answers: null, news_context: "" },
      fullContext: "",
    });
    assertEquals(capturedBodies.some((b) => JSON.stringify(b).includes("CHIFFRES SANS SOURCE")), true);
  } finally {
    mock.restore();
  }
});

Deno.test("recherche web : chaque chiffre repris garde sa source", async () => {
  const mock = installFetchMock({
    anthropic: () => ({ status: 200, body: { content: [{ type: "text", text: "62 % (Ifop, 2025)." }], stop_reason: "end_turn", usage: { input_tokens: 5, output_tokens: 5 } } }),
  });
  try {
    const addendum = await runDeepResearchWebSearch(BASE_PARAMS);
    assertEquals(addendum.includes("Ne cite pas les sources"), false);
    assertEquals(addendum.includes("reste attaché à sa source"), true);
  } finally {
    mock.restore();
  }
});

Deno.test("runLinkedInTwoStep : la relecture garde la prise de position et n'ajoute ni précaution ni devoir", async () => {
  const { mock, capturedBodies } = installAnthropicBodyCapture([
    { status: 200, body: { content: [{ type: "text", text: JSON.stringify({ content: "Je trouve qu'on confond visibilité et exposition." }) }], stop_reason: "end_turn", usage: { input_tokens: 5, output_tokens: 5 } } },
    { status: 200, body: { content: [{ type: "text", text: JSON.stringify({ content: "Je trouve qu'on confond visibilité et exposition." }) }], stop_reason: "end_turn", usage: { input_tokens: 5, output_tokens: 5 } } },
  ]);
  try {
    await runLinkedInTwoStep(LINKEDIN_BASE_PARAMS);
    const system = JSON.stringify(capturedBodies[1].system);
    assertEquals(system.includes("Garde la prise de position assumée"), true);
    assertEquals(system.includes("ni devoir final"), true);
  } finally {
    mock.restore();
  }
});

Deno.test("runLinkedInTwoStep (chemin streamé) : la matière de recherche est une source pour la relecture", async () => {
  const { mock, capturedBodies } = installAnthropicBodyCapture([
    { status: 200, body: { content: [{ type: "text", text: JSON.stringify({ content: LI_RESEARCH_POST }) }], stop_reason: "end_turn", usage: { input_tokens: 5, output_tokens: 5 } } },
    { status: 200, body: { content: [{ type: "text", text: JSON.stringify({ content: LI_RESEARCH_POST }) }], stop_reason: "end_turn", usage: { input_tokens: 5, output_tokens: 5 } } },
  ]);
  try {
    await runLinkedInTwoStep({ ...LINKEDIN_BASE_PARAMS, researchSource: "MATIÈRE DE PROFONDEUR\n62 % des indépendantes repoussent leurs posts (Ifop, 2025)." });
    const correctionUserMsg = capturedBodies[1].messages[0].content as string;
    assertEquals(correctionUserMsg.includes("CHIFFRES SANS SOURCE"), false);
    assertEquals(correctionUserMsg.includes("Ifop, 2025"), true);
  } finally {
    mock.restore();
  }
});

// ── Recherche « creuser le sujet » pour posts, reels et stories (04/10/2026) ──
Deno.test("creativeDepthBlock : sujet + angle de l'actu envoyés à la recherche, bloc de matière renvoyé", async () => {
  const { _deps, creativeDepthBlock } = await import("./index.ts");
  const original = _deps.fetchDepthMaterial;
  // deno-lint-ignore no-explicit-any
  let seen: any = null;
  // deno-lint-ignore no-explicit-any
  _deps.fetchDepthMaterial = (async (opts: any) => {
    seen = opts;
    return "Le visage rassure parce qu'il signale une personne responsable de ce qu'elle vend ; Instagram favorise les contenus qui retiennent (Meta, 2025). Mais cette norme pèse surtout sur les femmes, jugées sur leur apparence.";
  }) as typeof original;
  try {
    const block = await creativeDepthBlock({ context: "Montre ton visage, le nouveau souris ?", newsContext: "Instagram pousse les visages", activity: "photographe" });
    assertEquals(seen.subject.includes("Montre ton visage"), true);
    assertEquals(seen.subject.includes("Instagram pousse les visages"), true);
    assertEquals(seen.activity, "photographe");
    assertEquals(seen.timeoutMs, 20_000);
    assertEquals(block.includes("MATIÈRE DE PROFONDEUR"), true);
    assertEquals(block.includes("(Meta, 2025)"), true);
  } finally {
    _deps.fetchDepthMaterial = original;
  }
});

Deno.test("creativeDepthBlock : recherche vide ou sans sujet -> aucun bloc, aucun appel sans sujet", async () => {
  const { _deps, creativeDepthBlock } = await import("./index.ts");
  const original = _deps.fetchDepthMaterial;
  let calls = 0;
  _deps.fetchDepthMaterial = (async () => { calls++; return "VIDE"; }) as typeof original;
  try {
    assertEquals(await creativeDepthBlock({ context: "Un sujet" }), "");
    assertEquals(await creativeDepthBlock({ context: "  " }), "");
    assertEquals(calls, 1);
  } finally {
    _deps.fetchDepthMaterial = original;
  }
});

// ═══ NON-RÉGRESSION LinkedIn (04/10/2026) ═══
// Un post de référence (paragraphes + liste numérotée + liste à puces +
// accroche + un **gras** glissé par l'IA) traverse toutes les gardes de
// production dans l'ordre réel : lecture du JSON → correction (simulée, qui
// CASSE la liste et reformule l'accroche) → garde de structure → filet
// d'élisions → accroche dérivée du texte → nettoyage avant publication.
// La liste, la numérotation, les sauts de paragraphe et chaque mot doivent
// survivre. Même famille de cause que la perte des « 1, 2, 3 » (PR #1191).
const { prepareLinkedInText } = await import("../_shared/linkedin-graph.ts");
const { alignLinkedInHookFields } = await import("../_shared/linkedin-hook.ts");

const LI_REFERENCE_POST = `J'ai mis trois ans à comprendre pourquoi mes posts ne prenaient pas.

Une question de **méthode**, surtout. Voici ce que j'ai changé, dans l'ordre :

1. J'écris d'abord pour une seule personne.
2. Je garde une seule idée par post.
3. Je relis à voix haute avant de publier.

Ce que j'ai arrêté :
– les listes de conseils génériques
– les accroches qui promettent tout
– les fins en question plaquée

Le résultat tient dans la durée, et je publie sans y passer mes soirées.`;

// Ce qu'une passe de correction peut renvoyer en appliquant ses règles
// (« fusionne les rafales », « casse la symétrie ») : listes fondues en prose,
// accroche « 210 premiers caractères » coupée au milieu d'une phrase.
const LI_BROKEN_CORRECTION = {
  content: `J'ai mis trois ans à comprendre pourquoi mes posts ne prenaient pas.

Une question de méthode, surtout. J'écris d'abord pour une seule personne, je garde une seule idée par post et je relis à voix haute avant de publier. J'ai aussi arrêté les conseils génériques, les accroches qui promettent tout et les fins en question plaquée.

Le résultat tient dans la durée.`,
  accroche: "J'ai mis trois ans à comprendre pourquoi",
  corrections_applied: ["énumérations désymétrisées"],
};

const words = (t: string) => t.replace(/\*\*/g, "").split(/\s+/).filter(Boolean);

function assertReferenceSurvives(published: string, accroche: string) {
  const expected = LI_REFERENCE_POST.replace(/\*\*/g, "");
  // Texte publié = texte d'avant correction, au mot et au saut de ligne près.
  assertEquals(published, expected);
  for (const line of ["1. J'écris d'abord pour une seule personne.", "2. Je garde une seule idée par post.", "3. Je relis à voix haute avant de publier.", "– les listes de conseils génériques", "– les accroches qui promettent tout", "– les fins en question plaquée"]) {
    assertEquals(published.split("\n").includes(line), true, `ligne de liste perdue : ${line}`);
  }
  assertEquals(published.split("\n\n").length, LI_REFERENCE_POST.split("\n\n").length);
  assertEquals(words(published), words(LI_REFERENCE_POST));
  assertEquals(published.includes("*"), false);
  // L'accroche est le début exact du texte (jamais affichée deux fois).
  assertEquals(accroche, "J'ai mis trois ans à comprendre pourquoi mes posts ne prenaient pas.");
  assertEquals(published.startsWith(accroche), true);
}

Deno.test("NON-RÉGRESSION LinkedIn (chemin streamé runLinkedInTwoStep) : liste, numérotation, paragraphes et mots survivent à une correction qui les casse", async () => {
  const generated = { content: LI_REFERENCE_POST, accroche: "Trois ans pour comprendre mes posts", format: "linkedin" };
  const { mock } = installAnthropicBodyCapture([
    { status: 200, body: { content: [{ type: "text", text: JSON.stringify(generated) }], stop_reason: "end_turn", usage: { input_tokens: 50, output_tokens: 30 } } },
    { status: 200, body: { content: [{ type: "text", text: JSON.stringify(LI_BROKEN_CORRECTION) }], stop_reason: "end_turn", usage: { input_tokens: 60, output_tokens: 40 } } },
  ]);
  try {
    const res = await runLinkedInTwoStep(LINKEDIN_BASE_PARAMS);
    const json = await res.json();
    assertEquals(json.content, LI_REFERENCE_POST);
    assertReferenceSurvives(prepareLinkedInText(json.content), json.accroche);
  } finally {
    mock.restore();
  }
});

Deno.test("NON-RÉGRESSION LinkedIn (chemin non streamé applyLinkedInCorrectionPass) : même garantie", async () => {
  const { mock } = installAnthropicBodyCapture([
    { status: 200, body: { content: [{ type: "text", text: LI_BROKEN_CORRECTION.content }], stop_reason: "end_turn", usage: { input_tokens: 60, output_tokens: 40 } } },
  ]);
  try {
    const parsed: any = { content: LI_REFERENCE_POST, accroche: "Trois ans pour comprendre mes posts" };
    await applyLinkedInCorrectionPass(parsed, { body: { context: "", answers: null, news_context: "" }, fullContext: "" });
    // Ordre du handler : correction → accroche dérivée du post final.
    alignLinkedInHookFields(parsed, () => {});
    assertEquals(parsed.content, LI_REFERENCE_POST);
    assertReferenceSurvives(prepareLinkedInText(parsed.content), parsed.accroche);
  } finally {
    mock.restore();
  }
});

Deno.test("runLinkedInTwoStep : correction gardée (structure intacte) → l'accroche suit la nouvelle première ligne", async () => {
  const generated = { content: LI_REFERENCE_POST, accroche: "J'ai mis trois ans à comprendre pourquoi mes posts ne prenaient pas." };
  const kept = {
    content: LI_REFERENCE_POST.replace("J'ai mis trois ans à comprendre pourquoi mes posts ne prenaient pas.", "Trois ans pour comprendre pourquoi mes posts ne trouvaient pas leur public."),
    accroche: "Trois ans pour comprendre pourquoi mes posts",
  };
  const { mock } = installAnthropicBodyCapture([
    { status: 200, body: { content: [{ type: "text", text: JSON.stringify(generated) }], stop_reason: "end_turn", usage: { input_tokens: 50, output_tokens: 30 } } },
    { status: 200, body: { content: [{ type: "text", text: JSON.stringify(kept) }], stop_reason: "end_turn", usage: { input_tokens: 60, output_tokens: 40 } } },
  ]);
  try {
    const json = await (await runLinkedInTwoStep(LINKEDIN_BASE_PARAMS)).json();
    assertEquals(json.content, kept.content);
    assertEquals(json.accroche, "Trois ans pour comprendre pourquoi mes posts ne trouvaient pas leur public.");
    assertEquals(json.content.startsWith(json.accroche), true);
  } finally {
    mock.restore();
  }
});
