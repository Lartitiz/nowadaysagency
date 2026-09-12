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
        module: "tone",
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
        module: "tone",
      }),
    );
    assertEquals(res.status, 200); // le fallback répond quand même 200 (UX préservée)
    const body = await res.json();
    // Fallback = les 4 questions de base de MODULE_QUESTIONS.tone, pas du contenu IA.
    assertEquals(Array.isArray(body.questions), true);
    assertEquals(body.questions.length, 4);
    assertEquals(mock.aiUsageInserts.length, 0);
  } finally {
    mock.restore();
  }
});

const OFFER_A = "30000000-0000-0000-0000-000000000001";
const OFFER_B = "30000000-0000-0000-0000-000000000002";
const SPACE_A = "20000000-0000-0000-0000-000000000001";
const SPACE_B = "20000000-0000-0000-0000-000000000002";

Deno.test("offers: missing explicit target is rejected before AI", async () => {
  const mock = installFetchMock({ anthropic: () => anthropicToolSuccess("rendre_questions", {}) });
  try {
    const response = await handler(authedRequest(`${TEST_SUPABASE_URL}/functions/v1/coaching-module`, { phase: "questions", module: "offers" }));
    assertEquals(response.status, 400);
    await response.text();
    assertEquals(mock.anthropicCallCount, 0);
    assertEquals(mock.aiUsageInserts.length, 0);
  } finally { mock.restore(); }
});

for (const phase of ["questions", "diagnostic", "adjust"]) {
  Deno.test(`offers: ${phase} uses only the selected record and scopes the recommendation`, async () => {
    const mock = installFetchMock({ anthropic: () => anthropicToolSuccess(phase === "questions" ? "rendre_questions" : "rendre_diagnostic_coaching", phase === "questions" ? {
      questions: [{ numero: 1, question: "Q1", placeholder: "" }], intro: "Bonjour",
    } : { diagnostic: "D", pourquoi: "P", consequences: [], proposals: [{ label: "Description", field: "description_short", value: "Texte" }] }) });
    const fallback = globalThis.fetch;
    const seen: URL[] = [];
    let prompt = "";
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = new URL(typeof input === "string" ? input : input?.url || String(input));
      if (url.hostname === "api.anthropic.com") prompt = JSON.parse(init.body).system;
      if (url.pathname === "/rest/v1/workspace_members") return new Response(JSON.stringify([{ role: "manager" }]), { headers: { "Content-Type": "application/json" } });
      if (url.pathname === "/rest/v1/offers") {
        seen.push(url);
        return new Response(JSON.stringify({ id: OFFER_A, name: "Selected-only", promise_long: "Existing variant" }), { headers: { "Content-Type": "application/json" } });
      }
      if (url.pathname === "/rest/v1/audit_recommendations") seen.push(url);
      return fallback(input, init);
    }) as typeof fetch;
    try {
      const response = await handler(authedRequest(`${TEST_SUPABASE_URL}/functions/v1/coaching-module`, {
        phase, module: "offers", offer_id: OFFER_A, workspace_id: SPACE_A, rec_id: "recommendation-a",
        answers: [{ question: "Q", answer: "A" }], previous_diagnostic: { diagnostic: "Avant", proposals: [] }, adjustment_feedback: "Plus précis",
      }));
      assertEquals(response.status, 200);
      await response.text();
      const offerQuery = seen.find(u => u.pathname.endsWith("/offers"))!;
      assertEquals(offerQuery.searchParams.get("id"), `eq.${OFFER_A}`);
      assertEquals(offerQuery.searchParams.get("workspace_id"), `eq.${SPACE_A}`);
      assertEquals(seen.find(u => u.pathname.endsWith("/audit_recommendations"))!.searchParams.get("workspace_id"), `eq.${SPACE_A}`);
      assertEquals(JSON.stringify(prompt).includes("Selected-only"), true);
      assertEquals(mock.anthropicCallCount, 1);
    } finally { mock.restore(); }
  });
}

Deno.test("offers: another space or a failed target lookup never reaches the AI", async () => {
  for (const failure of ["foreign", "read-error"]) {
    const mock = installFetchMock({ anthropic: () => anthropicToolSuccess("rendre_questions", {}) });
    const fallback = globalThis.fetch;
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = new URL(typeof input === "string" ? input : input?.url || String(input));
      if (url.pathname === "/rest/v1/workspace_members") return new Response(JSON.stringify([{ role: "manager" }]), { headers: { "Content-Type": "application/json" } });
      if (url.pathname === "/rest/v1/offers") {
        assertEquals(url.searchParams.get("workspace_id"), `eq.${SPACE_B}`);
        assertEquals(url.searchParams.get("id"), `eq.${OFFER_B}`);
        return new Response(JSON.stringify({ message: failure }), { status: failure === "foreign" ? 406 : 503, headers: { "Content-Type": "application/json" } });
      }
      return fallback(input, init);
    }) as typeof fetch;
    try {
      const response = await handler(authedRequest(`${TEST_SUPABASE_URL}/functions/v1/coaching-module`, { phase: "questions", module: "offers", offer_id: OFFER_B, workspace_id: SPACE_B }));
      assertEquals(response.status, 404); await response.text();
      assertEquals(mock.anthropicCallCount, 0);
      assertEquals(mock.aiUsageInserts.length, 0);
    } finally { mock.restore(); }
  }
});
