// Régression du fix "pas de crédit sur fallback IA" (voir CLAUDE.md, pattern
// checkQuota -> appel IA -> logUsage UNIQUEMENT en cas de succès). Ici le cas
// particulier est un échec de PARSING JSON de la réponse IA (l'appel Anthropic
// réussit, mais le texte renvoyé n'est pas un JSON valide) : depuis le
// passage à tryParseAiJson (plus de fallback muet), une réponse illisible
// renvoie une erreur 502 explicite, SANS débiter de crédit.
//
// Lancer : deno test --allow-env --allow-read supabase/functions/engagement-coaching/index_test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  captureServeHandler,
  installFetchMock,
  setTestEnv,
  authedRequest,
  anthropicTextSuccess,
  TEST_SUPABASE_URL,
} from "../_shared/test-edge-harness.ts";

setTestEnv();
const MODULE_URL = new URL("./index.ts", import.meta.url).href;
const handler = await captureServeHandler(MODULE_URL);

const REQUEST_BODY = {
  post_text: "Un post exemple sur LinkedIn",
  objectif: "visibilite",
  ton_envie: "authentique",
  platform: "linkedin",
};

Deno.test("réponse IA = JSON valide -> logUsage appelé (1 ligne ai_usage)", async () => {
  const mock = installFetchMock({
    anthropic: () =>
      anthropicTextSuccess(
        JSON.stringify({
          comments: [{ type: "court", text: "Super point de vue !", strategy: "..." }],
          tip: "Réponds vite pour maximiser la visibilité.",
        }),
      ),
  });
  try {
    const res = await handler(
      authedRequest(`${TEST_SUPABASE_URL}/functions/v1/engagement-coaching`, REQUEST_BODY),
    );
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.comments.length, 1);
    assertEquals(mock.aiUsageInserts.length, 1);
    assertEquals(mock.aiUsageInserts[0].category, "coach");
    assertEquals(mock.aiUsageInserts[0].action_type, "engagement_coaching");
  } finally {
    mock.restore();
  }
});

Deno.test("réponse IA = texte non-JSON -> erreur 502 explicite SANS logUsage", async () => {
  const mock = installFetchMock({
    anthropic: () => anthropicTextSuccess("Voici mes suggestions de commentaires, sans le JSON demandé."),
  });
  try {
    const res = await handler(
      authedRequest(`${TEST_SUPABASE_URL}/functions/v1/engagement-coaching`, REQUEST_BODY),
    );
    assertEquals(res.status, 502);
    const body = await res.json();
    assertEquals(typeof body.error, "string");
    assertEquals(mock.aiUsageInserts.length, 0);
  } finally {
    mock.restore();
  }
});
