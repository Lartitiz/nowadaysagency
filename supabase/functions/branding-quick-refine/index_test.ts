// Tests de branding-quick-refine (« On affine ensemble » en une passe, 23/10/2026).
// Lancer : deno test --no-check --allow-env --allow-read --node-modules-dir=none supabase/functions/branding-quick-refine/index_test.ts
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { installFetchMock, setTestEnv, anthropicTextSuccess, TEST_SUPABASE_URL } from "../_shared/test-edge-harness.ts";

setTestEnv();
const { handleQuickRefineRequest, SECTION_FORMATS } = await import("./index.ts");

function req(body: Record<string, unknown>, auth = true): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) headers.Authorization = "Bearer test-token";
  return new Request(`${TEST_SUPABASE_URL}/functions/v1/branding-quick-refine`, { method: "POST", headers, body: JSON.stringify(body) });
}

const ANSWERS = [{ question: "Qu'est-ce qui t'a donné envie de te lancer ?", answer: "Un savon qui a calmé la peau de ma fille." }];

Deno.test("branding-quick-refine : sans Authorization -> 401", async () => {
  const res = await handleQuickRefineRequest(req({ section: "story", answers: ANSWERS }, false));
  assertEquals(res.status, 401);
});

Deno.test("branding-quick-refine : section inconnue -> 400", async () => {
  const res = await handleQuickRefineRequest(req({ section: "inconnue", answers: ANSWERS }));
  assertEquals(res.status, 400);
});

Deno.test("branding-quick-refine : réponses toutes vides -> 400 sans appel à l'IA", async () => {
  const mock = installFetchMock({ anthropic: () => anthropicTextSuccess("{}") });
  try {
    const res = await handleQuickRefineRequest(req({ section: "story", answers: [{ question: "Q", answer: "   " }] }));
    assertEquals(res.status, 400);
    assertEquals(mock.anthropicCallCount, 0);
  } finally { mock.restore(); }
});

Deno.test("branding-quick-refine : une passe = un appel à l'IA, un crédit, la carte au format de la relecture", async () => {
  const mock = installFetchMock({ anthropic: () => anthropicTextSuccess(JSON.stringify({ full_story: "Tout a commencé avec la peau de ma fille." })) });
  try {
    const res = await handleQuickRefineRequest(req({ section: "story", current: { full_story: "Ancienne histoire" }, answers: ANSWERS }));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.section_data.full_story, "Tout a commencé avec la peau de ma fille.");
    assertEquals(mock.anthropicCallCount, 1);
    assertEquals(mock.aiUsageInserts.length, 1);
    assertEquals(mock.aiUsageInserts[0].category, "coach");
    assertEquals(mock.aiUsageInserts[0].action_type, "branding_quick_refine");
    const sent = JSON.stringify(mock.anthropicRequests[0]);
    assertStringIncludes(sent, "Un savon qui a calmé la peau de ma fille.");
    assertStringIncludes(sent, "full_story");
  } finally { mock.restore(); }
});

Deno.test("branding-quick-refine : réponse illisible -> 502, aucun crédit compté", async () => {
  const mock = installFetchMock({ anthropic: () => anthropicTextSuccess("je ne sais pas") });
  try {
    const res = await handleQuickRefineRequest(req({ section: "story", answers: ANSWERS }));
    assertEquals(res.status, 502);
    assertEquals(mock.aiUsageInserts.length, 0);
  } finally { mock.restore(); }
});

Deno.test("branding-quick-refine : chaque carte de la relecture a son format", () => {
  for (const s of ["story", "persona", "value_proposition", "tone_style", "content_strategy", "offers", "charter"]) {
    assertEquals(typeof SECTION_FORMATS[s], "string");
  }
});
