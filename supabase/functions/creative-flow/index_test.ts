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
const { runDeepResearchWebSearch, runLinkedInTwoStep } = await import("./index.ts");
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
