// Tests de social-oauth-callback : validation du state anti-CSRF, échange du code
// contre un token (mocké), stockage chiffré, et gestion d'un refus d'autorisation.
//
// Comme social-oauth-start, ce handler n'accepte aucun client injectable : on capture
// le handler Deno.serve() et on mocke fetch pour les appels externes (Instagram OAuth)
// et pour PostgREST (getServiceClient().from("social_connections")...). Aucune
// logique métier de index.ts n'est modifiée par ce fichier.
//
// Lancer : deno test --no-check --allow-all supabase/functions/social-oauth-callback/index_test.ts

import { assertEquals, assertExists, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { signState } from "../_shared/oauth-state.ts";
import { decryptToken } from "../_shared/token-crypto.ts";

const SUPABASE_URL = "http://localhost:54321";
const STATE_SECRET = "test-state-secret";
const USER_ID = "user-42";

Deno.env.set("SUPABASE_URL", SUPABASE_URL);
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test");
Deno.env.set("OAUTH_STATE_SECRET", STATE_SECRET);
Deno.env.set("ALLOWED_ORIGIN", "https://nowadays-assistant.fr");
Deno.env.set("INSTAGRAM_APP_ID", "ig-app-id");
Deno.env.set("INSTAGRAM_APP_SECRET", "ig-app-secret");
// Clé AES-256-GCM valide (32 octets) pour tester le chiffrement réel des tokens stockés.
Deno.env.set("TOKEN_ENCRYPTION_KEY", btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))));

// ---------- capture du handler Deno.serve (aucun fetch mocké pendant l'import) ----------

let capturedHandler: ((req: Request) => Promise<Response>) | null = null;
{
  const originalServe = Deno.serve;
  // deno-lint-ignore no-explicit-any
  (Deno as any).serve = (handler: any) => {
    capturedHandler = handler;
    // deno-lint-ignore no-explicit-any
    return { finished: Promise.resolve(), shutdown: async () => {} } as any;
  };
  await import("./index.ts");
  // deno-lint-ignore no-explicit-any
  (Deno as any).serve = originalServe;
}

function call(req: Request): Promise<Response> {
  return capturedHandler!(req);
}

const originalFetch = globalThis.fetch;

interface RestCall { method: string; url: string; body: unknown }

/**
 * Mock fetch couvrant :
 * - l'échange de code Instagram (2 échanges de token + lecture du compte)
 * - PostgREST /rest/v1/social_connections (select existant, insert, update)
 * `existingRow` simule la ligne trouvée par le SELECT .maybeSingle() (upsert manuel).
 */
function installMockFetch(opts: {
  existingRow?: { id: string } | null;
  igShortToken?: { ok: boolean; body: unknown };
  igLongToken?: { ok: boolean; body: unknown };
  igMe?: { ok: boolean; body: unknown };
  restWriteStatus?: number;
  restWriteErrorBody?: unknown;
}) {
  const calls: RestCall[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();

    if (url.startsWith("https://api.instagram.com/oauth/access_token")) {
      const r = opts.igShortToken ?? { ok: true, body: { access_token: "short-tok" } };
      return new Response(JSON.stringify(r.body), {
        status: r.ok ? 200 : 400,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.startsWith("https://graph.instagram.com/access_token")) {
      const r = opts.igLongToken ?? { ok: true, body: { access_token: "long-lived-token", expires_in: 5184000 } };
      return new Response(JSON.stringify(r.body), {
        status: r.ok ? 200 : 400,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.startsWith("https://graph.instagram.com/v23.0/me")) {
      const r = opts.igMe ?? { ok: true, body: { user_id: "ig-123", username: "monusername" } };
      return new Response(JSON.stringify(r.body), {
        status: r.ok ? 200 : 400,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/rest/v1/social_connections")) {
      let bodyParsed: unknown = null;
      if (init?.body && typeof init.body === "string") {
        try { bodyParsed = JSON.parse(init.body); } catch { /* ignore */ }
      }
      calls.push({ method, url, body: bodyParsed });
      if (method === "GET") {
        // .select("id")....maybeSingle() : réponse = tableau JSON (postgrest-js déballe côté client)
        return new Response(JSON.stringify(opts.existingRow ? [opts.existingRow] : []), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      // POST (insert) / PATCH (update)
      if (opts.restWriteStatus && opts.restWriteStatus >= 400) {
        return new Response(JSON.stringify(opts.restWriteErrorBody ?? { message: "db error" }), {
          status: opts.restWriteStatus,
          headers: { "content-type": "application/json" },
        });
      }
      const status = opts.restWriteStatus ?? (method === "POST" ? 201 : 204);
      const noBodyStatuses = [204, 205, 304];
      return new Response(noBodyStatuses.includes(status) ? null : "", { status });
    }
    throw new Error(`Unmocked fetch in social-oauth-callback test: ${method} ${url}`);
  }) as typeof fetch;
  return calls;
}

function restore() {
  globalThis.fetch = originalFetch;
}

function makeState(overrides: Record<string, unknown> = {}) {
  return signState(
    {
      user_id: USER_ID,
      workspace_id: null,
      platform: "instagram",
      origin: "https://nowadays-assistant.fr",
      nonce: crypto.randomUUID(),
      ts: Date.now(),
      ...overrides,
    },
    STATE_SECRET,
  );
}

function callbackReq(params: Record<string, string>): Request {
  const url = new URL("https://edge.local/social-oauth-callback");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

// ---------- protection anti-CSRF (state) ----------

Deno.test("callback: state absent -> redirection d'erreur, pas d'échange de code", async () => {
  const calls = installMockFetch({});
  try {
    const res = await call(callbackReq({ code: "some-code" }));
    assertEquals(res.status, 302);
    const location = res.headers.get("Location")!;
    assertStringIncludes(location, "connected=error");
    assertStringIncludes(location, "message=");
    assertEquals(calls.length, 0);
  } finally {
    restore();
  }
});

Deno.test("callback: state invalide/falsifié -> rejeté (protection anti-CSRF)", async () => {
  const calls = installMockFetch({});
  try {
    const goodState = await makeState();
    const tampered = goodState.slice(0, -2) + "xx";
    const res = await call(callbackReq({ code: "some-code", state: tampered }));
    assertEquals(res.status, 302);
    assertStringIncludes(res.headers.get("Location")!, "connected=error");
    assertEquals(calls.length, 0); // le code n'a jamais été échangé
  } finally {
    restore();
  }
});

Deno.test("callback: state signé avec un autre secret -> rejeté", async () => {
  const calls = installMockFetch({});
  try {
    const foreignState = await signState(
      { user_id: "attacker", platform: "instagram", origin: "https://evil.example.com", ts: Date.now() },
      "secret-different-de-celui-du-serveur",
    );
    const res = await call(callbackReq({ code: "some-code", state: foreignState }));
    assertEquals(res.status, 302);
    // L'origin falsifiée ne doit PAS être utilisée puisque le state est invalide : on retombe sur le fallback.
    assertStringIncludes(res.headers.get("Location")!, "nowadays-assistant.fr");
    assertEquals(calls.length, 0);
  } finally {
    restore();
  }
});

Deno.test("callback: state expiré (> 10 min) -> rejeté", async () => {
  const calls = installMockFetch({});
  try {
    const oldState = await makeState({ ts: Date.now() - 11 * 60 * 1000 });
    const res = await call(callbackReq({ code: "some-code", state: oldState }));
    assertEquals(res.status, 302);
    assertStringIncludes(res.headers.get("Location")!, "connected=error");
    assertEquals(calls.length, 0);
  } finally {
    restore();
  }
});

Deno.test("callback: code absent (mais state valide) -> rejeté", async () => {
  const calls = installMockFetch({});
  try {
    const state = await makeState();
    const res = await call(callbackReq({ state }));
    assertEquals(res.status, 302);
    assertStringIncludes(res.headers.get("Location")!, "connected=error");
    assertEquals(calls.length, 0);
  } finally {
    restore();
  }
});

// ---------- refus d'autorisation côté réseau social ----------

Deno.test("callback: l'utilisateur refuse l'autorisation (error param) -> redirection d'erreur avec le message, pas d'échange", async () => {
  const calls = installMockFetch({});
  try {
    const state = await makeState();
    const res = await call(
      callbackReq({ state, error: "access_denied", error_description: "L'utilisateur a refusé l'accès." }),
    );
    assertEquals(res.status, 302);
    const location = res.headers.get("Location")!;
    assertStringIncludes(location, "connected=error");
    assertEquals(new URL(location).searchParams.get("message"), "L'utilisateur a refusé l'accès.");
    assertEquals(calls.length, 0);
  } finally {
    restore();
  }
});

// ---------- échange de code + stockage chiffré ----------

Deno.test("callback: succès (nouvelle connexion) -> échange du code, insert avec token chiffré, redirection connected=instagram", async () => {
  const calls = installMockFetch({ existingRow: null });
  try {
    const state = await makeState();
    const res = await call(callbackReq({ code: "auth-code-123", state }));
    assertEquals(res.status, 302);
    const location = res.headers.get("Location")!;
    assertStringIncludes(location, "/parametres/connexions");
    assertStringIncludes(location, "connected=instagram");

    const writeCall = calls.find((c) => c.method === "POST");
    assertExists(writeCall);
    // deno-lint-ignore no-explicit-any
    const row = writeCall!.body as any;
    assertEquals(row.user_id, USER_ID);
    assertEquals(row.platform, "instagram");
    assertEquals(row.platform_account_id, "ig-123");
    assertEquals(row.platform_account_name, "monusername");

    // Le token stocké doit être chiffré (préfixe enc.v1:), jamais en clair.
    assertStringIncludes(row.access_token, "enc.v1:");
    const decrypted = await decryptToken(row.access_token);
    assertEquals(decrypted, "long-lived-token");
  } finally {
    restore();
  }
});

Deno.test("callback: succès (connexion déjà existante) -> UPDATE plutôt qu'INSERT", async () => {
  const calls = installMockFetch({ existingRow: { id: "conn-1" } });
  try {
    const state = await makeState();
    const res = await call(callbackReq({ code: "auth-code-123", state }));
    assertEquals(res.status, 302);

    const inserts = calls.filter((c) => c.method === "POST");
    const updates = calls.filter((c) => c.method === "PATCH");
    assertEquals(inserts.length, 0);
    assertEquals(updates.length, 1);
  } finally {
    restore();
  }
});

Deno.test("callback: échec de l'échange de code Instagram -> redirection d'erreur, pas d'écriture en base", async () => {
  const calls = installMockFetch({
    igShortToken: { ok: false, body: { error_message: "Invalid authorization code" } },
  });
  try {
    const state = await makeState();
    const res = await call(callbackReq({ code: "bad-code", state }));
    assertEquals(res.status, 302);
    const location = res.headers.get("Location")!;
    assertStringIncludes(location, "connected=error");
    assertEquals(new URL(location).searchParams.get("message"), "Invalid authorization code");
    assertEquals(calls.length, 0);
  } finally {
    restore();
  }
});

Deno.test("callback: échec d'écriture en base (insert) -> redirection d'erreur avec le message DB", async () => {
  const calls = installMockFetch({
    existingRow: null,
    restWriteStatus: 500,
    restWriteErrorBody: { message: "connection pool exhausted" },
  });
  try {
    const state = await makeState();
    const res = await call(callbackReq({ code: "auth-code-123", state }));
    assertEquals(res.status, 302);
    const location = res.headers.get("Location")!;
    assertStringIncludes(location, "connected=error");
    assertEquals(new URL(location).searchParams.get("message"), "connection pool exhausted");
    assertEquals(calls.filter((c) => c.method === "POST").length, 1);
  } finally {
    restore();
  }
});

Deno.test("callback: OPTIONS -> pas de traitement OAuth", async () => {
  const res = await call(new Request("https://edge.local/social-oauth-callback", { method: "OPTIONS" }));
  assertEquals(res.status, 200);
});
