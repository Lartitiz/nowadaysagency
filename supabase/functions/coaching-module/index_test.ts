// Régression du fix "pas de crédit sur fallback IA" (voir CLAUDE.md, pattern
// checkQuota -> appel IA -> logUsage UNIQUEMENT en cas de succès).
//
// Lancer : deno test --allow-env --allow-read supabase/functions/coaching-module/index_test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  captureServeHandler,
  installFetchMock,
  setTestEnv,
  authedRequest,
  anthropicToolSuccess,
  anthropicFailure,
  TEST_SUPABASE_URL,
} from "../_shared/test-edge-harness.ts";

setTestEnv();
const MODULE_URL = new URL("./index.ts", import.meta.url).href;
// Le module ne peut être importé (donc son Deno.serve() capté) qu'UNE FOIS
// par process deno test (cache ESM) : on capte le handler une seule fois et
// on le réutilise dans tous les tests de ce fichier.
const handler = await captureServeHandler(MODULE_URL);

Deno.test("phase questions: succès IA -> logUsage appelé (1 ligne ai_usage)", async () => {
  const mock = installFetchMock({
    anthropic: () =>
      anthropicToolSuccess("rendre_questions", {
        questions: [{ numero: 1, question: "Q1", placeholder: "" }],
        intro: "Salut",
      }),
  });
  try {
    const res = await handler(
      authedRequest(`${TEST_SUPABASE_URL}/functions/v1/coaching-module`, {
        phase: "questions",
        module: "persona",
      }),
    );
    assertEquals(res.status, 200);
    await res.text();
    assertEquals(mock.anthropicCallCount, 1);
    assertEquals(mock.aiUsageInserts.length, 1);
    assertEquals(mock.aiUsageInserts[0].category, "suggestion");
    assertEquals(mock.aiUsageInserts[0].action_type, "coaching_questions");
  } finally {
    mock.restore();
  }
});

Deno.test("phase questions: échec IA -> fallback renvoyé SANS logUsage (aucune ligne ai_usage)", async () => {
  const mock = installFetchMock({
    anthropic: () => anthropicFailure(),
  });
  try {
    const res = await handler(
      authedRequest(`${TEST_SUPABASE_URL}/functions/v1/coaching-module`, {
        phase: "questions",
        module: "persona",
      }),
    );
    assertEquals(res.status, 200); // le fallback répond quand même 200 (UX préservée)
    const body = await res.json();
    // Fallback = les 4 questions de base de MODULE_QUESTIONS.persona, pas du contenu IA.
    assertEquals(Array.isArray(body.questions), true);
    assertEquals(body.questions.length, 4);
    assertEquals(mock.aiUsageInserts.length, 0);
  } finally {
    mock.restore();
  }
});
