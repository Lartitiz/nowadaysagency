// Tests de social-status : détection correcte de l'état d'une connexion, y compris
// "connecté mais token à renouveler" (expiresAt passé transmis tel quel au front,
// pas silencieusement traité comme déconnecté).
//
// Le handler ne prend aucun client injectable : on capture le handler Deno.serve()
// et on mocke fetch pour /auth/v1/user (GoTrue) et /rest/v1/social_connections
// (PostgREST). Aucune logique métier de index.ts n'est modifiée par ce fichier.
//
// Lancer : deno test --no-check --allow-all supabase/functions/social-status/index_test.ts

import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = "http://localhost:54321";
const GOOD_TOKEN = "good-user-token";
const USER_ID = "user-42";

Deno.env.set("SUPABASE_URL", SUPABASE_URL);
Deno.env.set("SUPABASE_ANON_KEY", "anon-key-test");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test");
Deno.env.set("ALLOWED_ORIGIN", "https://nowadays-assistant.fr");

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

interface RestCall { url: string; method: string }

function installMockFetch(opts: {
  rows?: unknown[];
  restStatus?: number;
  restErrorBody?: unknown;
  authOk?: boolean;
}) {
  const authOk = opts.authOk ?? true;
  const calls: RestCall[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();

    if (url.includes("/auth/v1/user")) {
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      const auth = headers.get("authorization") || headers.get("Authorization");
      if (authOk && auth === `Bearer ${GOOD_TOKEN}`) {
        return new Response(JSON.stringify({ id: USER_ID, aud: "authenticated" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ code: 401, error_code: "bad_jwt", msg: "invalid JWT" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/rest/v1/social_connections")) {
      calls.push({ url, method });
      if (opts.restStatus && opts.restStatus >= 400) {
        return new Response(JSON.stringify(opts.restErrorBody ?? { message: "db error" }), {
          status: opts.restStatus,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify(opts.rows ?? []), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unmocked fetch in social-status test: ${method} ${url}`);
  }) as typeof fetch;
  return calls;
}

function restore() {
  globalThis.fetch = originalFetch;
}

function authedReq(body: Record<string, unknown> = {}, token = GOOD_TOKEN): Request {
  return new Request("https://edge.local/social-status", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

Deno.test("social-status: pas d'Authorization -> 401", async () => {
  const res = await call(new Request("https://edge.local/social-status", { method: "POST", body: "{}" }));
  assertEquals(res.status, 401);
});

Deno.test("social-status: token invalide -> 401", async () => {
  installMockFetch({});
  try {
    const res = await call(authedReq({}, "mauvais-token"));
    assertEquals(res.status, 401);
  } finally {
    restore();
  }
});

Deno.test("social-status: aucune connexion -> tableau vide", async () => {
  installMockFetch({ rows: [] });
  try {
    const res = await call(authedReq({}));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.connections, []);
  } finally {
    restore();
  }
});

Deno.test("social-status: connexion avec token EXPIRÉ -> reste 'connected: true', expiresAt transmis tel quel (le front calcule le renouvellement)", async () => {
  const pastDate = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  installMockFetch({
    rows: [
      {
        platform: "instagram",
        platform_account_name: "monusername",
        platform_account_id: "ig-123",
        token_expires_at: pastDate,
      },
    ],
  });
  try {
    const res = await call(authedReq({}));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.connections.length, 1);
    const conn = body.connections[0];
    // Le serveur ne masque JAMAIS une connexion expirée derrière "non connecté" :
    // c'est au front de comparer expiresAt à la date courante pour proposer le renouvellement.
    assertEquals(conn.connected, true);
    assertEquals(conn.expiresAt, pastDate);
    assertEquals(conn.platform, "instagram");
    assertEquals(conn.accountName, "monusername");
  } finally {
    restore();
  }
});

Deno.test("social-status: connexion Google sans propriété choisie -> needsProperty: true", async () => {
  installMockFetch({
    rows: [
      {
        platform: "google",
        platform_account_name: "Google Analytics",
        platform_account_id: "",
        token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      },
    ],
  });
  try {
    const res = await call(authedReq({}));
    const body = await res.json();
    assertEquals(body.connections[0].needsProperty, true);
  } finally {
    restore();
  }
});

Deno.test("social-status: connexion Google AVEC propriété choisie -> needsProperty: false", async () => {
  installMockFetch({
    rows: [
      {
        platform: "google",
        platform_account_name: "Ma propriété GA4",
        platform_account_id: "properties/123456",
        token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      },
    ],
  });
  try {
    const res = await call(authedReq({}));
    const body = await res.json();
    assertEquals(body.connections[0].needsProperty, false);
  } finally {
    restore();
  }
});

Deno.test("social-status: connexion non-Google sans platform_account_id -> needsProperty toujours false", async () => {
  installMockFetch({
    rows: [
      {
        platform: "linkedin",
        platform_account_name: "LinkedIn",
        platform_account_id: "",
        token_expires_at: null,
      },
    ],
  });
  try {
    const res = await call(authedReq({}));
    const body = await res.json();
    assertEquals(body.connections[0].needsProperty, false);
  } finally {
    restore();
  }
});

Deno.test("social-status: aucun token exposé dans la réponse (pas de fuite de secret)", async () => {
  installMockFetch({
    rows: [
      {
        platform: "instagram",
        platform_account_name: "monusername",
        platform_account_id: "ig-123",
        token_expires_at: new Date().toISOString(),
      },
    ],
  });
  try {
    const res = await call(authedReq({}));
    const body = await res.json();
    const json = JSON.stringify(body);
    assertEquals(json.includes("access_token"), false);
    assertEquals(json.includes("refresh_token"), false);
  } finally {
    restore();
  }
});

Deno.test("social-status: workspace_id fourni -> filtre par workspace_id + user_id (pas par user_id seul)", async () => {
  const calls = installMockFetch({ rows: [] });
  try {
    const res = await call(authedReq({ workspace_id: "ws-9" }));
    assertEquals(res.status, 200);
    assertEquals(calls.length, 1);
    const q = new URL(calls[0].url).searchParams;
    assertEquals(q.get("workspace_id"), "eq.ws-9");
    assertEquals(q.get("user_id"), "eq.user-42");
  } finally {
    restore();
  }
});

Deno.test("social-status: erreur de lecture DB -> 500, message générique (pas de détail DB exposé)", async () => {
  installMockFetch({ restStatus: 500, restErrorBody: { message: "connection refused" } });
  try {
    const res = await call(authedReq({}));
    assertEquals(res.status, 500);
    const body = await res.json();
    assertExists(body.error);
  } finally {
    restore();
  }
});

Deno.test("social-status: OPTIONS -> pas d'authentification requise", async () => {
  const res = await call(new Request("https://edge.local/social-status", { method: "OPTIONS" }));
  assertEquals(res.status, 200);
});
