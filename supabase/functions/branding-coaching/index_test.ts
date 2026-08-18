// Tests de branding-coaching : le plus gros handler de coaching de marque
// (~900 lignes), jamais testé jusqu'ici. Couvre le chemin nominal (question
// suivante posée + logUsage), le rejet d'un appel non authentifié, et le
// filet de sécurité qui force is_complete quand tous les sujets sont couverts
// mais que l'IA ne l'a pas signalé (bug silencieux possible : une session de
// coaching qui ne se termine jamais côté front alors que tout est rempli).
//
// Particularité : ce fichier utilise `serve()` de std/http (pas `Deno.serve`
// global) pour l'entrypoint de prod, qui ouvre un VRAI socket TCP au
// chargement du module ET n'expose pas le handler qu'on lui passe (contrairement
// à `Deno.serve`, capté par _shared/test-edge-harness.ts). Le handler est donc
// exporté séparément (`handleBrandingCoachingRequest`) et appelé directement ici,
// derrière un guard `if (import.meta.main)` côté index.ts qui laisse le
// comportement de prod inchangé (voir aussi stripe-webhook/index.ts, même patron).
//
// Lancer : deno test --no-check --allow-env --allow-read --node-modules-dir=none supabase/functions/branding-coaching/index_test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  installFetchMock,
  setTestEnv,
  anthropicToolSuccess,
  TEST_SUPABASE_URL,
} from "../_shared/test-edge-harness.ts";

setTestEnv();
const { handleBrandingCoachingRequest } = await import("./index.ts");

function call(req: Request): Promise<Response> {
  return handleBrandingCoachingRequest(req);
}

const URL_BASE = `${TEST_SUPABASE_URL}/functions/v1/branding-coaching`;

function req(body: Record<string, unknown>, opts: { auth?: boolean } = { auth: true }): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.auth !== false) headers.Authorization = "Bearer test-token";
  return new Request(URL_BASE, { method: "POST", headers, body: JSON.stringify(body) });
}

Deno.test("branding-coaching: ping ne nécessite pas d'authentification", async () => {
  const res = await call(req({ ping: true }, { auth: false }));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.ok, true);
});

Deno.test("branding-coaching: sans Authorization -> 401 (AuthError)", async () => {
  const res = await call(req({ section: "story", messages: [] }, { auth: false }));
  assertEquals(res.status, 401);
});

Deno.test("branding-coaching: section manquante -> 400 (ValidationError)", async () => {
  const res = await call(req({ messages: [] }));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(typeof body.error, "string");
});

Deno.test("branding-coaching: question suivante -> 200 + logUsage appelé une fois", async () => {
  const mock = installFetchMock({
    anthropic: () =>
      anthropicToolSuccess("poser_question", {
        question: "Comment tout a commencé pour toi ?",
        question_type: "textarea",
        is_complete: false,
        completion_percentage: 10,
        covered_topic: null,
      }),
  });
  try {
    const res = await call(req({
      section: "story",
      messages: [{ role: "user", content: "Je veux raconter mon histoire." }],
      covered_topics: [],
    }));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.response.question, "Comment tout a commencé pour toi ?");
    assertEquals(body.response.is_complete, false);
    assertEquals(mock.anthropicCallCount, 1);
    assertEquals(mock.aiUsageInserts.length, 1);
    assertEquals(mock.aiUsageInserts[0].category, "coach");
    assertEquals(mock.aiUsageInserts[0].action_type, "branding_coaching");
  } finally {
    mock.restore();
  }
});

Deno.test("branding-coaching: réponse IA illisible (pas de JSON) -> 502, pas de logUsage", async () => {
  const mock = installFetchMock({
    // Tool appelé mais sans `input` du tout -> toolInputText renvoie "" -> tryParseAiJson("") === null
    anthropic: () => anthropicToolSuccess("poser_question", undefined),
  });
  try {
    const res = await call(req({
      section: "story",
      messages: [{ role: "user", content: "Salut" }],
    }));
    assertEquals(res.status, 502);
    assertEquals(mock.aiUsageInserts.length, 0);
  } finally {
    mock.restore();
  }
});

Deno.test("branding-coaching: filet de sécurité — tous les sujets couverts mais is_complete=false renvoyé par l'IA -> forcé à true côté serveur", async () => {
  // Checklist "story" = 5 sujets. On simule 4 déjà couverts en entrée, et l'IA
  // qui couvre le 5e (story_vision) dans cette réponse SANS positionner
  // is_complete=true : sans le filet de sécurité, la session de coaching ne se
  // termine jamais côté front alors que la fiche est en réalité complète.
  const mock = installFetchMock({
    anthropic: () =>
      anthropicToolSuccess("poser_question", {
        question: "",
        question_type: "text",
        is_complete: false,
        completion_percentage: 90,
        covered_topic: "story_vision",
      }),
  });
  try {
    const res = await call(req({
      section: "story",
      messages: [{ role: "user", content: "Voilà ma vision pour la suite." }],
      covered_topics: ["story_origin", "story_turning_point", "story_struggles", "story_unique"],
    }));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.response.is_complete, true);
    assertEquals(body.response.completion_percentage, 100);
    assertEquals(typeof body.response.final_summary, "string");
  } finally {
    mock.restore();
  }
});
