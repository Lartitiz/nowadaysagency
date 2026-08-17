// Tests de social-disconnect : suppression effective du token en base, y compris
// le cas Canva (révocation côté Canva avant suppression locale).
//
// Le handler ne prend aucun client injectable : on capture le handler Deno.serve()
// et on mocke fetch pour /auth/v1/user (GoTrue), /rest/v1/social_connections
// (PostgREST) et l'endpoint de révocation Canva. Aucune logique métier de index.ts
// n'est modifiée par ce fichier.
//
// Lancer : deno test --no-check --allow-all supabase/functions/social-disconnect/index_test.ts

import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = "http://localhost:54321";
const GOOD_TOKEN = "good-user-token";
const USER_ID = "user-42";

Deno.env.set("SUPABASE_URL", SUPABASE_URL);
Deno.env.set("SUPABASE_ANON_KEY", "anon-key-test");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test");
Deno.env.set("ALLOWED_ORIGIN", "https://nowadays-assistant.fr");
Deno.env.set("CANVA_CLIENT_ID", "canva-app-id");
Deno.env.set("CANVA_CLIENT_SECRET", "canva-app-secret");

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
  existingConn?: { access_token: string | null; refresh_token: string | null } | null;
  deleteStatus?: number;
  deleteErrorBody?: unknown;
  canvaRevokeOk?: boolean;
}) {
  const calls: RestCall[] = [];
  const revokeCalls: RestCall[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();

    if (url.includes("/auth/v1/user")) {
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      const auth = headers.get("authorization") || headers.get("Authorization");
      if (auth === `Bearer ${GOOD_TOKEN}`) {
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
    if (url.includes("api.canva.com/rest/v1/oauth/revoke")) {
      revokeCalls.push({ url, method });
      return new Response("", { status: (opts.canvaRevokeOk ?? true) ? 200 : 400 });
    }
    if (url.includes("/rest/v1/social_connections")) {
      calls.push({ url, method });
      if (method === "GET") {
        // .select(...).maybeSingle() (lecture avant révocation Canva)
        return new Response(JSON.stringify(opts.existingConn ? [opts.existingConn] : []), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (method === "DELETE") {
        const status = opts.deleteStatus ?? 204;
        if (status >= 400) {
          return new Response(JSON.stringify(opts.deleteErrorBody ?? { message: "db error" }), {
            status,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(null, { status });
      }
    }
    throw new Error(`Unmocked fetch in social-disconnect test: ${method} ${url}`);
  }) as typeof fetch;
  return { calls, revokeCalls };
}

function restore() {
  globalThis.fetch = originalFetch;
}

function authedReq(body: Record<string, unknown>, token = GOOD_TOKEN): Request {
  return new Request("https://edge.local/social-disconnect", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

Deno.test("social-disconnect: pas d'Authorization -> 401", async () => {
  const res = await call(new Request("https://edge.local/social-disconnect", { method: "POST", body: "{}" }));
  assertEquals(res.status, 401);
});

Deno.test("social-disconnect: token invalide -> 401", async () => {
  installMockFetch({});
  try {
    const res = await call(authedReq({ platform: "instagram" }, "mauvais-token"));
    assertEquals(res.status, 401);
  } finally {
    restore();
  }
});

Deno.test("social-disconnect: plateforme invalide -> 400", async () => {
  installMockFetch({});
  try {
    const res = await call(authedReq({ platform: "tiktok" }));
    assertEquals(res.status, 400);
  } finally {
    restore();
  }
});

Deno.test("social-disconnect: instagram -> DELETE envoyé avec les bons filtres, succès", async () => {
  const { calls } = installMockFetch({});
  try {
    const res = await call(authedReq({ platform: "instagram" }));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.success, true);

    const deletes = calls.filter((c) => c.method === "DELETE");
    assertEquals(deletes.length, 1);
    const q = new URL(deletes[0].url).searchParams;
    assertEquals(q.get("platform"), "eq.instagram");
    assertEquals(q.get("user_id"), "eq.user-42");
  } finally {
    restore();
  }
});

Deno.test("social-disconnect: workspace_id fourni -> filtre par workspace_id + user_id", async () => {
  const { calls } = installMockFetch({});
  try {
    const res = await call(authedReq({ platform: "linkedin", workspace_id: "ws-9" }));
    assertEquals(res.status, 200);
    const deletes = calls.filter((c) => c.method === "DELETE");
    const q = new URL(deletes[0].url).searchParams;
    assertEquals(q.get("workspace_id"), "eq.ws-9");
    assertEquals(q.get("user_id"), "eq.user-42");
  } finally {
    restore();
  }
});

Deno.test("social-disconnect: échec de suppression en base -> 500, aucun succès rapporté", async () => {
  installMockFetch({ deleteStatus: 500, deleteErrorBody: { message: "db down" } });
  try {
    const res = await call(authedReq({ platform: "instagram" }));
    assertEquals(res.status, 500);
    const body = await res.json();
    assertExists(body.error);
  } finally {
    restore();
  }
});

Deno.test("social-disconnect: canva -> révoque le token côté Canva AVANT de supprimer la ligne locale", async () => {
  const { calls, revokeCalls } = installMockFetch({
    existingConn: { access_token: "plain-access-tok", refresh_token: "plain-refresh-tok" },
  });
  try {
    const res = await call(authedReq({ platform: "canva" }));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.success, true);

    assertEquals(revokeCalls.length, 1);
    const deletes = calls.filter((c) => c.method === "DELETE");
    assertEquals(deletes.length, 1);
  } finally {
    restore();
  }
});

Deno.test("social-disconnect: canva sans connexion existante -> pas d'appel de révocation, DELETE quand même envoyé", async () => {
  const { calls, revokeCalls } = installMockFetch({ existingConn: null });
  try {
    const res = await call(authedReq({ platform: "canva" }));
    assertEquals(res.status, 200);
    assertEquals(revokeCalls.length, 0);
    assertEquals(calls.filter((c) => c.method === "DELETE").length, 1);
  } finally {
    restore();
  }
});

Deno.test("social-disconnect: canva -> un échec de révocation (best-effort) n'empêche PAS la suppression locale", async () => {
  const { calls, revokeCalls } = installMockFetch({
    existingConn: { access_token: "plain-access-tok", refresh_token: null },
    canvaRevokeOk: false,
  });
  try {
    const res = await call(authedReq({ platform: "canva" }));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.success, true);
    assertEquals(revokeCalls.length, 1);
    assertEquals(calls.filter((c) => c.method === "DELETE").length, 1);
  } finally {
    restore();
  }
});

Deno.test("social-disconnect: OPTIONS -> pas d'authentification requise", async () => {
  const res = await call(new Request("https://edge.local/social-disconnect", { method: "OPTIONS" }));
  assertEquals(res.status, 200);
});
