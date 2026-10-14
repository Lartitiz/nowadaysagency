// Contrat de ai-text-action, le menu IA sur une sélection de texte (lot 9,
// 14/10/2026 ; voir docs/creation-contenu/CARTE.md, section 5).
//
// index_test.ts couvre la re-passe de dérive (redac-gate). Ce fichier fige le
// reste du câblage, dans le handler déployé (Supabase et Claude simulés, voir
// _shared/test-edge-harness.ts) :
//   - quota : checkQuota refusé → 429 sans appel IA ; succès → un seul
//     logUsage("adaptation") APRÈS l'appel IA ; échec IA → aucun débit ;
//   - authentification : sans jeton ou jeton refusé → 401, rien d'autre ;
//   - workspace_id : espace d'autrui → 403 avant le quota ; espace dont on est
//     membre → branding, quota et débit rattachés à cet espace.
//
// Lancer : deno test --no-check --allow-env --allow-read --node-modules-dir=none supabase/functions/ai-text-action/contract_test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  anthropicFailure,
  anthropicTextSuccess,
  authedRequest,
  captureServeHandler,
  installFetchMock,
  setTestEnv,
  TEST_SUPABASE_URL,
} from "../_shared/test-edge-harness.ts";

setTestEnv();
const handler = await captureServeHandler(new URL("./index.ts", import.meta.url).href);
const URL_FN = `${TEST_SUPABASE_URL}/functions/v1/ai-text-action`;
const WS = "11111111-2222-3333-4444-555555555555";

const BODY = {
  selected_text: "Le café du coin est bon, l'accueil est chaleureux.",
  action_prompt: "Raccourcis ce texte",
};
const REWRITE = "Café bon, accueil chaleureux.";

interface Scenario {
  // deno-lint-ignore no-explicit-any
  anthropic: (body?: any) => { status: number; body: unknown };
  /** Lignes ai_usage déjà consommées ce mois-ci (plan free : 23 au total). */
  usedThisMonth?: number;
  /** L'utilisatrice est membre de l'espace demandé. */
  member?: boolean;
  /** Réponse de Supabase Auth à la vérification du jeton. */
  authStatus?: number;
}

/**
 * installFetchMock, plus : quota consommé, appartenance à l'espace, refus du
 * jeton, et la chronologie quota → IA → débit. mock.restore() remet le vrai
 * fetch et jette donc aussi cette enveloppe.
 */
function install(s: Scenario) {
  const timeline: string[] = [];
  const restUrls: string[] = [];
  const mock = installFetchMock({
    anthropic: (body) => {
      timeline.push("ia");
      return s.anthropic(body);
    },
  });
  const inner = globalThis.fetch;
  // deno-lint-ignore no-explicit-any
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    const method = (init?.method || "GET").toUpperCase();
    if (url.startsWith(TEST_SUPABASE_URL)) {
      const path = url.slice(TEST_SUPABASE_URL.length).split("?")[0];
      if (path.startsWith("/rest/v1/")) restUrls.push(`${method} ${decodeURIComponent(url.slice(TEST_SUPABASE_URL.length))}`);
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
      if (path === "/auth/v1/user" && s.authStatus && s.authStatus !== 200) {
        return json({ message: "invalid JWT" }, s.authStatus);
      }
      if (path === "/rest/v1/workspace_members" && method === "GET") {
        return json(s.member ? [{ role: "owner", workspace_id: WS }] : []);
      }
      if (path === "/rest/v1/ai_usage" && method === "GET") {
        timeline.push("quota");
        return json(Array.from({ length: s.usedThisMonth ?? 0 }, () => ({ category: "content" })));
      }
      if (path === "/rest/v1/rpc/record_ai_usage" && method === "POST") timeline.push("débit");
    }
    return inner(input, init);
  }) as typeof fetch;
  return { mock, timeline, restUrls };
}

Deno.test("ai-text-action — quota refusé : 429, AUCUN appel IA, aucun débit", async () => {
  const { mock, timeline } = install({
    anthropic: () => {
      throw new Error("Claude ne doit pas être appelé quand le quota est refusé");
    },
    usedThisMonth: 23,
  });
  try {
    const res = await handler(authedRequest(URL_FN, BODY));
    const json = await res.json();
    assertEquals(res.status, 429, JSON.stringify(json));
    assertEquals(json.quota?.allowed, false);
    assert(typeof json.error === "string" && json.error.length > 0, "le 429 porte un message lisible");
    assertEquals(mock.anthropicCallCount, 0);
    assertEquals(mock.aiUsageInserts.length, 0);
    assertEquals(timeline, ["quota"]);
  } finally {
    mock.restore();
  }
});

Deno.test("ai-text-action — succès : quota puis IA puis UN logUsage « adaptation » / text_action", async () => {
  const { mock, timeline } = install({ anthropic: () => anthropicTextSuccess(REWRITE) });
  try {
    const res = await handler(authedRequest(URL_FN, BODY));
    const json = await res.json();
    assertEquals(res.status, 200, JSON.stringify(json));
    assertEquals(json, { result: REWRITE });
    assertEquals(timeline, ["quota", "ia", "débit"]);
    assertEquals(mock.aiUsageInserts.length, 1);
    assertEquals(mock.aiUsageInserts[0].category, "adaptation");
    assertEquals(mock.aiUsageInserts[0].action_type, "text_action");
    assertEquals(mock.aiUsageInserts[0].tokens_used, 150);
    // Le texte sélectionné et l'instruction arrivent tels quels à Claude.
    const sent = mock.anthropicRequests[0].messages[0].content as string;
    assert(sent.includes(BODY.selected_text) && sent.includes(BODY.action_prompt), sent);
  } finally {
    mock.restore();
  }
});

Deno.test("ai-text-action — échec de l'IA : 500 et AUCUN crédit débité", async () => {
  const { mock, timeline } = install({ anthropic: () => anthropicFailure() });
  try {
    const res = await handler(authedRequest(URL_FN, BODY));
    await res.body?.cancel();
    assertEquals(res.status, 500);
    assertEquals(mock.aiUsageInserts.length, 0);
    assert(!timeline.includes("débit"), timeline.join(", "));
  } finally {
    mock.restore();
  }
});

Deno.test("ai-text-action — re-passe de dérive en échec : réécriture d'origine gardée, un seul débit", async () => {
  let call = 0;
  const { mock } = install({
    anthropic: () =>
      ++call === 1
        ? anthropicTextSuccess("Ce n'est pas un café ordinaire, c'est une expérience à vivre.")
        : anthropicFailure(),
  });
  try {
    const res = await handler(authedRequest(URL_FN, BODY));
    const json = await res.json();
    assertEquals(res.status, 200, JSON.stringify(json));
    assertEquals(json.result, "Ce n'est pas un café ordinaire, c'est une expérience à vivre.");
    assertEquals(mock.anthropicCallCount, 2);
    assertEquals(mock.aiUsageInserts.length, 1);
  } finally {
    mock.restore();
  }
});

Deno.test("ai-text-action — sans jeton : 401, ni quota, ni IA, ni débit", async () => {
  const { mock, timeline } = install({ anthropic: () => anthropicTextSuccess(REWRITE) });
  try {
    const res = await handler(new Request(URL_FN, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(BODY),
    }));
    await res.body?.cancel();
    assertEquals(res.status, 401);
    assertEquals(timeline, []);
    assertEquals(mock.aiUsageInserts.length, 0);
  } finally {
    mock.restore();
  }
});

Deno.test("ai-text-action — jeton refusé par Supabase : 401, ni quota, ni IA, ni débit", async () => {
  const { mock, timeline } = install({ anthropic: () => anthropicTextSuccess(REWRITE), authStatus: 401 });
  try {
    const res = await handler(authedRequest(URL_FN, BODY));
    await res.body?.cancel();
    assertEquals(res.status, 401);
    assertEquals(timeline, []);
    assertEquals(mock.aiUsageInserts.length, 0);
  } finally {
    mock.restore();
  }
});

Deno.test("ai-text-action — texte ou instruction manquant : 400 avant le quota", async () => {
  const { mock, timeline } = install({ anthropic: () => anthropicTextSuccess(REWRITE) });
  try {
    const res = await handler(authedRequest(URL_FN, { selected_text: BODY.selected_text }));
    await res.body?.cancel();
    assertEquals(res.status, 400);
    assertEquals(timeline, []);
  } finally {
    mock.restore();
  }
});

Deno.test("ai-text-action — workspace_id d'un espace dont on n'est pas membre : 403 avant le quota", async () => {
  const { mock, timeline } = install({ anthropic: () => anthropicTextSuccess(REWRITE), member: false });
  try {
    const res = await handler(authedRequest(URL_FN, { ...BODY, workspace_id: WS }));
    const json = await res.json();
    assertEquals(res.status, 403);
    assertEquals(json.error, "workspace_access_denied");
    assertEquals(timeline, []);
    assertEquals(mock.aiUsageInserts.length, 0);
  } finally {
    mock.restore();
  }
});

Deno.test("ai-text-action — workspace_id d'un espace dont on est membre : branding, quota et débit sur cet espace", async () => {
  const { mock, timeline, restUrls } = install({ anthropic: () => anthropicTextSuccess(REWRITE), member: true });
  try {
    const res = await handler(authedRequest(URL_FN, { ...BODY, workspace_id: WS }));
    const json = await res.json();
    assertEquals(res.status, 200, JSON.stringify(json));
    assertEquals(timeline, ["quota", "ia", "débit"]);
    assertEquals(mock.aiUsageInserts.length, 1);
    assertEquals(mock.aiUsageInserts[0].workspace_id, WS);
    const branding = restUrls.filter((u) => /\/rest\/v1\/brand_(profile|proposition)\?/.test(u));
    assertEquals(branding.length, 2, restUrls.join("\n"));
    for (const u of branding) assert(u.includes(`workspace_id=eq.${WS}`) && !u.includes("user_id=eq."), u);
    const quota = restUrls.find((u) => u.startsWith("GET /rest/v1/ai_usage?"));
    assert(quota?.includes(`workspace_id=eq.${WS}`), quota);
  } finally {
    mock.restore();
  }
});

Deno.test("ai-text-action — sans workspace_id : branding lu par user_id (compte mono-espace)", async () => {
  const { mock, restUrls } = install({ anthropic: () => anthropicTextSuccess(REWRITE) });
  try {
    const res = await handler(authedRequest(URL_FN, BODY));
    await res.body?.cancel();
    assertEquals(res.status, 200);
    const branding = restUrls.filter((u) => /\/rest\/v1\/brand_(profile|proposition)\?/.test(u));
    assertEquals(branding.length, 2, restUrls.join("\n"));
    for (const u of branding) assert(u.includes("user_id=eq.test-user-id") && !u.includes("workspace_id=eq."), u);
  } finally {
    mock.restore();
  }
});
