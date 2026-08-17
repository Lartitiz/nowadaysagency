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
const { runDeepResearchWebSearch } = await import("./index.ts");
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
