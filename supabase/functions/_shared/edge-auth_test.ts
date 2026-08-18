// Tests du bloc CORS+auth(+rate-limit+démo) partagé (voir edge-auth.ts).
// On mocke uniquement `/auth/v1/user` (comme test-edge-harness.ts) — pas de
// DB ni réseau réel. Le rate-limiter est exercé avec sa vraie logique
// (en mémoire, pas de mock) puisqu'il est déjà déterministe et sans I/O.
//
// Lancer : deno test supabase/functions/_shared/edge-auth_test.ts --allow-all

import {
  assertEquals,
  assertStrictEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { authenticateEdgeUser } from "./edge-auth.ts";

const SUPABASE_URL = "https://fake-supabase.test";
Deno.env.set("SUPABASE_URL", SUPABASE_URL);
Deno.env.set("SUPABASE_ANON_KEY", "test-anon-key");

const CORS = { "access-control-allow-origin": "*" };

type AuthOutcome = "success" | "invalid";

/** Mocke uniquement l'endpoint /auth/v1/user ; toute autre requête = fetch réel (passthrough). */
function mockAuthFetch(outcome: AuthOutcome, userId = "user-1") {
  const original = globalThis.fetch;
  // deno-lint-ignore no-explicit-any
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    if (url.startsWith(`${SUPABASE_URL}/auth/v1/user`)) {
      if (outcome === "success") {
        return new Response(
          JSON.stringify({ id: userId, email: "test@example.com", aud: "authenticated", role: "authenticated" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: "invalid token" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    return original(input, init);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

function authedRequest(token = "token-abc") {
  return new Request("https://edge.test/fn", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

Deno.test("missing header -> 401 with default message, no network call", async () => {
  const original = globalThis.fetch;
  // deno-lint-ignore no-explicit-any
  globalThis.fetch = ((..._args: any[]) => {
    throw new Error("fetch should not be called when the header is absent");
  }) as typeof fetch;
  try {
    const req = new Request("https://edge.test/fn", { method: "POST" });
    const res = await authenticateEdgeUser(req, CORS);
    assertStrictEquals(res instanceof Response, true);
    const r = res as Response;
    assertEquals(r.status, 401);
    assertEquals(await r.json(), { error: "Authentification requise" });
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("requireBearerPrefix: header without 'Bearer ' prefix -> missing message", async () => {
  const req = new Request("https://edge.test/fn", {
    method: "POST",
    headers: { Authorization: "raw-token-not-bearer" },
  });
  const res = await authenticateEdgeUser(req, CORS, { requireBearerPrefix: true });
  const r = res as Response;
  assertEquals(r.status, 401);
  assertEquals(await r.json(), { error: "Authentification requise" });
});

Deno.test("valid token -> returns userId + supabase client", async () => {
  const restore = mockAuthFetch("success", "user-42");
  try {
    const res = await authenticateEdgeUser(authedRequest(), CORS);
    assertStrictEquals(res instanceof Response, false);
    const ok = res as { userId: string; supabase: unknown };
    assertEquals(ok.userId, "user-42");
    assertStrictEquals(typeof ok.supabase, "object");
  } finally {
    restore();
  }
});

Deno.test("getUser() failure -> 401 invalid message", async () => {
  const restore = mockAuthFetch("invalid");
  try {
    const res = await authenticateEdgeUser(authedRequest(), CORS);
    const r = res as Response;
    assertEquals(r.status, 401);
    assertEquals(await r.json(), { error: "Authentification invalide" });
  } finally {
    restore();
  }
});

Deno.test("custom messages override the defaults", async () => {
  const restore = mockAuthFetch("invalid");
  try {
    const res = await authenticateEdgeUser(authedRequest(), CORS, {
      missingMessage: "Non autorisé",
      invalidMessage: "Non autorisé",
    });
    const r = res as Response;
    assertEquals(r.status, 401);
    assertEquals(await r.json(), { error: "Non autorisé" });
  } finally {
    restore();
  }
});

Deno.test("demoGuard: demo-user blocked with 403 + default message", async () => {
  const restore = mockAuthFetch("success", "demo-user");
  try {
    const res = await authenticateEdgeUser(authedRequest(), CORS, { demoGuard: true });
    const r = res as Response;
    assertEquals(r.status, 403);
    assertEquals(await r.json(), { error: "Demo mode: this feature is simulated" });
  } finally {
    restore();
  }
});

Deno.test("demoGuard: custom message honoured", async () => {
  const restore = mockAuthFetch("success", "demo-user");
  try {
    const res = await authenticateEdgeUser(authedRequest(), CORS, {
      demoGuard: { message: "Fonctionnalité non disponible en mode démo." },
    });
    const r = res as Response;
    assertEquals(r.status, 403);
    assertEquals(await r.json(), { error: "Fonctionnalité non disponible en mode démo." });
  } finally {
    restore();
  }
});

Deno.test("demoGuard: disabled -> demo-user passes through", async () => {
  const restore = mockAuthFetch("success", "demo-user");
  try {
    const res = await authenticateEdgeUser(authedRequest(), CORS);
    assertStrictEquals(res instanceof Response, false);
  } finally {
    restore();
  }
});

Deno.test("rateLimit: 21st request in the window is blocked with 429", async () => {
  const restore = mockAuthFetch("success", "rate-user-1");
  try {
    let last: Response | { userId: string } | undefined;
    for (let i = 0; i < 21; i++) {
      last = await authenticateEdgeUser(authedRequest(`t${i}`), CORS, { rateLimit: true });
    }
    const r = last as Response;
    assertStrictEquals(r instanceof Response, true);
    assertEquals(r.status, 429);
  } finally {
    restore();
  }
});

Deno.test("guardOrder demo-first: demo check short-circuits before the rate limiter ever counts", async () => {
  // userId must be exactly "demo-user" (isDemoUser is a strict equality check).
  const restore = mockAuthFetch("success", "demo-user");
  try {
    let last: Response | { userId: string } | undefined;
    for (let i = 0; i < 21; i++) {
      last = await authenticateEdgeUser(authedRequest(`t${i}`), CORS, {
        rateLimit: true,
        demoGuard: true,
        guardOrder: "demo-first",
      });
    }
    // All 21 calls hit the demo guard first, so checkRateLimit is never even
    // invoked for this userId — the 21st call still gets the demo message,
    // never a 429.
    const r = last as Response;
    assertEquals(r.status, 403);
    assertEquals(await r.json(), { error: "Demo mode: this feature is simulated" });
  } finally {
    restore();
  }
});

Deno.test("guardOrder rate-first: 429 wins once rate-limited, even for a demo user", async () => {
  // Reuses userId "demo-user": the previous test never called checkRateLimit
  // for it (demo-first short-circuits before reaching the rate limiter), so
  // its counter is still at 0 here.
  const restore = mockAuthFetch("success", "demo-user");
  try {
    let last: Response | { userId: string } | undefined;
    for (let i = 0; i < 21; i++) {
      last = await authenticateEdgeUser(authedRequest(`t${i}`), CORS, {
        rateLimit: true,
        demoGuard: true,
        guardOrder: "rate-first",
      });
    }
    const r = last as Response;
    assertEquals(r.status, 429);
  } finally {
    restore();
  }
});
