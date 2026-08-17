// Tests de social-oauth-start : génération de l'URL d'autorisation + génération/
// signature du state anti-CSRF.
//
// La fonction ne prend aucun client injectable (elle appelle directement
// authenticateRequest via supabase-js) : on capture le handler passé à
// Deno.serve() et on simule le SEUL appel réseau qu'il déclenche côté
// authentification (GET /auth/v1/user) avec un fetch mocké. Aucune logique
// métier de index.ts n'est modifiée par ce fichier.
//
// Lancer : deno test --no-check --allow-all supabase/functions/social-oauth-start/index_test.ts

import { assertEquals, assertExists, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { verifyState, codeChallengeS256 } from "../_shared/oauth-state.ts";

const SUPABASE_URL = "http://localhost:54321";
const STATE_SECRET = "test-state-secret";
const GOOD_TOKEN = "good-user-token";
const USER_ID = "user-42";

Deno.env.set("SUPABASE_URL", SUPABASE_URL);
Deno.env.set("SUPABASE_ANON_KEY", "anon-key-test");
Deno.env.set("OAUTH_STATE_SECRET", STATE_SECRET);
Deno.env.set("ALLOWED_ORIGIN", "https://nowadays-assistant.fr");
Deno.env.set("INSTAGRAM_APP_ID", "ig-app-id");
Deno.env.set("LINKEDIN_CLIENT_ID", "li-app-id");
Deno.env.set("LINKEDIN_ANALYTICS_CLIENT_ID", "li-analytics-app-id");
Deno.env.set("CANVA_CLIENT_ID", "canva-app-id");
Deno.env.set("PINTEREST_CLIENT_ID", "pinterest-app-id");
Deno.env.set("GOOGLE_CLIENT_ID", "google-app-id");

// ---------- fetch mock : seul /auth/v1/user est appelé par ce handler ----------

const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.includes("/auth/v1/user")) {
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const auth = headers.get("authorization") || headers.get("Authorization");
    if (auth === `Bearer ${GOOD_TOKEN}`) {
      return new Response(
        JSON.stringify({ id: USER_ID, aud: "authenticated", role: "authenticated", email: "u@example.com" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ code: 401, error_code: "bad_jwt", msg: "invalid JWT" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  throw new Error(`Unmocked fetch in social-oauth-start test: ${url}`);
}) as typeof fetch;

// ---------- capture du handler Deno.serve ----------

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
globalThis.fetch = originalFetch; // le module importé, on rebranche le vrai fetch par défaut

function call(req: Request): Promise<Response> {
  return capturedHandler!(req);
}

function authedReq(body: Record<string, unknown>, token = GOOD_TOKEN): Request {
  return new Request("https://edge.local/social-oauth-start", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function withMockedAuthFetch<T>(fn: () => Promise<T>): Promise<T> {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
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
    throw new Error(`Unmocked fetch in social-oauth-start test: ${url}`);
  }) as typeof fetch;
  return fn().finally(() => {
    globalThis.fetch = originalFetch;
  });
}

Deno.test("social-oauth-start: pas d'Authorization -> 401, aucun appel réseau", async () => {
  const req = new Request("https://edge.local/social-oauth-start", {
    method: "POST",
    body: JSON.stringify({ platform: "instagram" }),
  });
  const res = await call(req);
  assertEquals(res.status, 401);
});

Deno.test("social-oauth-start: token invalide -> 401", () =>
  withMockedAuthFetch(async () => {
    const res = await call(authedReq({ platform: "instagram" }, "mauvais-token"));
    assertEquals(res.status, 401);
  }));

Deno.test("social-oauth-start: plateforme non supportée -> 400", () =>
  withMockedAuthFetch(async () => {
    const res = await call(authedReq({ platform: "tiktok" }));
    assertEquals(res.status, 400);
    const body = await res.json();
    assertExists(body.error);
  }));

Deno.test("social-oauth-start: instagram -> URL d'autorisation correcte + state signé valide", () =>
  withMockedAuthFetch(async () => {
    const res = await call(authedReq({ platform: "instagram", workspace_id: "ws-9" }));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertExists(body.url);

    const url = new URL(body.url);
    assertEquals(url.origin + url.pathname, "https://www.instagram.com/oauth/authorize");
    assertEquals(url.searchParams.get("client_id"), "ig-app-id");
    assertEquals(url.searchParams.get("redirect_uri"), `${SUPABASE_URL}/functions/v1/social-oauth-callback`);
    assertEquals(url.searchParams.get("response_type"), "code");
    assertEquals(
      url.searchParams.get("scope"),
      "instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights",
    );

    // Le state doit être un state HMAC valide qui identifie bien l'utilisateur authentifié
    // et le workspace demandé — c'est la protection anti-CSRF du flux.
    const state = url.searchParams.get("state");
    assertExists(state);
    // deno-lint-ignore no-explicit-any
    const decoded = await verifyState<any>(state!, STATE_SECRET);
    assertExists(decoded);
    assertEquals(decoded.user_id, USER_ID);
    assertEquals(decoded.workspace_id, "ws-9");
    assertEquals(decoded.platform, "instagram");
    assertExists(decoded.nonce);
    assertExists(decoded.ts);
  }));

Deno.test("social-oauth-start: deux appels génèrent des nonces différents (state non réutilisable)", () =>
  withMockedAuthFetch(async () => {
    const res1 = await call(authedReq({ platform: "instagram" }));
    const res2 = await call(authedReq({ platform: "instagram" }));
    const state1 = new URL((await res1.json()).url).searchParams.get("state");
    const state2 = new URL((await res2.json()).url).searchParams.get("state");
    assertNotEquals(state1, state2);
  }));

Deno.test("social-oauth-start: workspace_id absent -> state.workspace_id = null (mode legacy)", () =>
  withMockedAuthFetch(async () => {
    const res = await call(authedReq({ platform: "instagram" }));
    const state = new URL((await res.json()).url).searchParams.get("state")!;
    // deno-lint-ignore no-explicit-any
    const decoded = await verifyState<any>(state, STATE_SECRET);
    assertEquals(decoded.workspace_id, null);
  }));

Deno.test("social-oauth-start: return_to fourni -> devient l'origin encodé dans le state", () =>
  withMockedAuthFetch(async () => {
    const res = await call(authedReq({ platform: "instagram", return_to: "https://custom.example.com" }));
    const state = new URL((await res.json()).url).searchParams.get("state")!;
    // deno-lint-ignore no-explicit-any
    const decoded = await verifyState<any>(state, STATE_SECRET);
    assertEquals(decoded.origin, "https://custom.example.com");
  }));

Deno.test("social-oauth-start: canva -> PKCE (code_challenge S256 cohérent avec le verifier signé dans le state)", () =>
  withMockedAuthFetch(async () => {
    const res = await call(authedReq({ platform: "canva" }));
    assertEquals(res.status, 200);
    const body = await res.json();
    const url = new URL(body.url);
    assertEquals(url.searchParams.get("code_challenge_method"), "s256");
    const challenge = url.searchParams.get("code_challenge");
    assertExists(challenge);

    const state = url.searchParams.get("state")!;
    // deno-lint-ignore no-explicit-any
    const decoded = await verifyState<any>(state, STATE_SECRET);
    assertExists(decoded.code_verifier);
    const recomputed = await codeChallengeS256(decoded.code_verifier);
    assertEquals(recomputed, challenge);
  }));

Deno.test("social-oauth-start: config serveur incomplète (appId manquant) -> 500", () =>
  withMockedAuthFetch(async () => {
    const prev = Deno.env.get("INSTAGRAM_APP_ID");
    Deno.env.delete("INSTAGRAM_APP_ID");
    try {
      const res = await call(authedReq({ platform: "instagram" }));
      assertEquals(res.status, 500);
    } finally {
      if (prev !== undefined) Deno.env.set("INSTAGRAM_APP_ID", prev);
    }
  }));

Deno.test("social-oauth-start: OPTIONS -> pas d'authentification requise (préflight CORS)", async () => {
  const res = await call(new Request("https://edge.local/social-oauth-start", { method: "OPTIONS" }));
  assertEquals(res.status, 200);
});
