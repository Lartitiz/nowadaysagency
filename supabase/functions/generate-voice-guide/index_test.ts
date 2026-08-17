// Régression du fix "succès menteur" (audit 17/08) : l'écriture dans
// voice_guides n'était jamais vérifiée — en cas d'échec, le guide généré
// disparaissait au rechargement, la réponse restait 200 et logUsage
// débitait quand même un crédit. Pattern projet : checkQuota -> appel IA ->
// logUsage UNIQUEMENT après succès COMPLET (écriture incluse).
//
// Lancer : deno test --allow-env --allow-read supabase/functions/generate-voice-guide/index_test.ts

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
// Un seul import possible par process (cache ESM) : handler capté une fois.
const handler = await captureServeHandler(MODULE_URL);

const GUIDE_INPUT = {
  brand_name: "Test",
  voice_summary: "Voix chaleureuse et directe.",
  tone_keywords: ["chaleureux", "direct"],
  do_say: ["On y va ensemble"],
  dont_say: ["Optimisez votre ROI"],
  words_to_use: ["ensemble"],
  words_to_avoid: ["synergie"],
};

function voiceGuideRequest(): Request {
  return authedRequest(`${TEST_SUPABASE_URL}/functions/v1/generate-voice-guide`, {});
}

/** Fait échouer toute ÉCRITURE (POST/PATCH) sur /rest/v1/voice_guides, délègue le reste au mock installé. */
function failVoiceGuideWrites(): () => void {
  const innerFetch = globalThis.fetch;
  // deno-lint-ignore no-explicit-any
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    const method = (init?.method || "GET").toUpperCase();
    if (url.startsWith(`${TEST_SUPABASE_URL}/rest/v1/voice_guides`) && method !== "GET") {
      return new Response(
        JSON.stringify({ message: "permission denied for table voice_guides", code: "42501" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }
    return innerFetch(input, init);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = innerFetch;
  };
}

Deno.test("succès IA + écriture OK -> 200 avec guide + logUsage appelé (1 ligne ai_usage)", async () => {
  const mock = installFetchMock({
    anthropic: () => anthropicToolSuccess("rendre_guide_voix", GUIDE_INPUT),
  });
  try {
    const res = await handler(voiceGuideRequest());
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.guide.voice_summary, GUIDE_INPUT.voice_summary);
    assertEquals(mock.anthropicCallCount, 1);
    assertEquals(mock.aiUsageInserts.length, 1);
    assertEquals(mock.aiUsageInserts[0].category, "content");
    assertEquals(mock.aiUsageInserts[0].action_type, "voice_guide");
  } finally {
    mock.restore();
  }
});

Deno.test("échec écriture voice_guides -> 500 SANS logUsage (aucune ligne ai_usage)", async () => {
  const mock = installFetchMock({
    anthropic: () => anthropicToolSuccess("rendre_guide_voix", GUIDE_INPUT),
  });
  const restoreWrites = failVoiceGuideWrites();
  try {
    const res = await handler(voiceGuideRequest());
    assertEquals(res.status, 500);
    const body = await res.json();
    // Message exploitable côté front, pas le catch générique.
    assertEquals(typeof body.error, "string");
    assertEquals(body.error.includes("enregistré"), true);
    assertEquals(mock.anthropicCallCount, 1);
    assertEquals(mock.aiUsageInserts.length, 0);
  } finally {
    restoreWrites();
    mock.restore();
  }
});

Deno.test("tone_keywords renvoyé en chaîne -> normalisé en tableau avant enregistrement ET dans la réponse", async () => {
  const mock = installFetchMock({
    anthropic: () =>
      anthropicToolSuccess("rendre_guide_voix", {
        ...GUIDE_INPUT,
        // Le cas vu en prod le 17/08 : l'API ne garantit pas le type array du schema.
        tone_keywords: "chaleureux, direct, engagé",
        do_say: "On y va ensemble\n• Chaque pas compte",
      }),
  });
  // Capte le POST d'insertion voice_guides pour vérifier ce qui part en BDD.
  const innerFetch = globalThis.fetch;
  const voiceGuideWrites: Record<string, unknown>[] = [];
  // deno-lint-ignore no-explicit-any
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    const method = (init?.method || "GET").toUpperCase();
    if (url.startsWith(`${TEST_SUPABASE_URL}/rest/v1/voice_guides`) && method !== "GET" && init?.body) {
      voiceGuideWrites.push(JSON.parse(init.body as string));
    }
    return innerFetch(input, init);
  }) as typeof fetch;
  try {
    const res = await handler(voiceGuideRequest());
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.guide.tone_keywords, ["chaleureux", "direct", "engagé"]);
    assertEquals(body.guide.do_say, ["On y va ensemble", "Chaque pas compte"]);
    assertEquals(voiceGuideWrites.length, 1);
    const saved = voiceGuideWrites[0].guide_data as Record<string, unknown>;
    assertEquals(saved.tone_keywords, ["chaleureux", "direct", "engagé"]);
  } finally {
    globalThis.fetch = innerFetch;
    mock.restore();
  }
});

Deno.test("échec IA -> 500 SANS logUsage (aucune ligne ai_usage)", async () => {
  const mock = installFetchMock({
    anthropic: () => anthropicFailure(),
  });
  try {
    const res = await handler(voiceGuideRequest());
    assertEquals(res.status, 500);
    await res.text();
    assertEquals(mock.aiUsageInserts.length, 0);
  } finally {
    mock.restore();
  }
});
