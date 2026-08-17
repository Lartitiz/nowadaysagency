// Tests de bout en bout de l'edge social-pinterest-publish, sans réseau réel :
// on intercepte `Deno.serve` (pour récupérer le handler sans ouvrir de port) et
// `fetch` (pour simuler Supabase Auth/REST + l'API Pinterest v5).
//
// Lancer : deno test --no-check --allow-all supabase/functions/social-pinterest-publish/index_test.ts

// deno-lint-ignore-file no-explicit-any
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.env.set("SUPABASE_URL", "http://fake.local");
Deno.env.set("SUPABASE_ANON_KEY", "anon-key");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-key");
// Pas de TOKEN_ENCRYPTION_KEY : decryptConnTokens devient un no-op (jetons en clair).

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

interface RouterConfig {
  user?: { id: string } | null;
  connection?: Record<string, unknown> | null;
  pins?: (callIndex: number, body: any) => { status: number; body: unknown };
}

function makeRouter(cfg: RouterConfig) {
  const calls: { method: string; url: string; body?: any }[] = [];
  let pinCalls = 0;

  const fetchFn = (async (input: any, init?: any): Promise<Response> => {
    const req = input instanceof Request ? input : new Request(input, init);
    const url = new URL(req.url);
    const parsedBody = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ method: req.method, url: req.url, body: parsedBody });

    if (url.pathname.endsWith("/auth/v1/user")) {
      if (!cfg.user) return jsonResponse(401, { message: "invalid JWT" });
      return jsonResponse(200, cfg.user);
    }
    if (url.pathname.includes("/rest/v1/social_connections")) {
      if (req.method === "GET") return jsonResponse(200, cfg.connection ?? null);
      if (req.method === "PATCH") return jsonResponse(200, {});
    }
    if (url.hostname === "api.pinterest.com" && url.pathname === "/v5/pins" && req.method === "POST") {
      const r = cfg.pins ? cfg.pins(pinCalls++, parsedBody) : { status: 201, body: { id: `pin-${pinCalls++}` } };
      return jsonResponse(r.status, r.body);
    }
    throw new Error(`URL non gérée par le fake fetch: ${req.method} ${req.url}`);
  }) as typeof fetch;

  return { fetchFn, calls };
}

async function loadHandler(): Promise<(req: Request) => Promise<Response>> {
  let captured: ((req: Request) => Promise<Response>) | null = null;
  const originalServe = Deno.serve;
  // @ts-ignore: monkeypatch le temps de l'import, pour capturer le handler sans lancer de vrai listener.
  Deno.serve = ((arg: any) => {
    captured = typeof arg === "function" ? arg : arg?.fetch;
    return { finished: Promise.resolve(), shutdown: async () => {}, unref: () => {}, ref: () => {}, addr: {} } as any;
  }) as typeof Deno.serve;

  await import(`../social-pinterest-publish/index.ts?t=${Date.now()}-${Math.random()}`);

  // @ts-ignore restore
  Deno.serve = originalServe;
  if (!captured) throw new Error("Deno.serve n'a pas été appelé par le module importé.");
  return captured;
}

function authedRequest(body: unknown): Request {
  return new Request("http://edge.local/social-pinterest-publish", {
    method: "POST",
    headers: { authorization: "Bearer user-token", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Ni token_expires_at ni refresh_token : refreshPinterestTokenIfNeeded court-circuite
// (pas d'appel réseau de rafraîchissement, pas besoin de PINTEREST_CLIENT_ID/SECRET).
const CONN = { id: "conn-1", access_token: "pin-token", platform_account_id: "pinacct-1" };

Deno.test("social-pinterest-publish — pas d'en-tête Authorization → 401, aucun appel réseau", async () => {
  const handler = await loadHandler();
  const { fetchFn, calls } = makeRouter({ user: { id: "u1" }, connection: CONN });
  globalThis.fetch = fetchFn;

  const res = await handler(new Request("http://edge.local/social-pinterest-publish", { method: "POST", body: "{}" }));
  assertEquals(res.status, 401);
  assertEquals(calls.length, 0);
});

Deno.test("social-pinterest-publish — pas de board_id → 400 local", async () => {
  const handler = await loadHandler();
  const { fetchFn } = makeRouter({ user: { id: "u1" }, connection: CONN });
  globalThis.fetch = fetchFn;

  const res = await handler(authedRequest({ image_url: "https://x/a.jpg" }));
  assertEquals(res.status, 400);
  const json = await res.json();
  assertStringIncludes(json.error, "tableau de destination est requis");
});

Deno.test("social-pinterest-publish — aucune image → 400 local", async () => {
  const handler = await loadHandler();
  const { fetchFn } = makeRouter({ user: { id: "u1" }, connection: CONN });
  globalThis.fetch = fetchFn;

  const res = await handler(authedRequest({ board_id: "b1" }));
  assertEquals(res.status, 400);
  const json = await res.json();
  assertStringIncludes(json.error, "Au moins une image publique est requise");
});

Deno.test("social-pinterest-publish — aucun compte Pinterest connecté → 400", async () => {
  const handler = await loadHandler();
  const { fetchFn } = makeRouter({ user: { id: "u1" }, connection: null });
  globalThis.fetch = fetchFn;

  const res = await handler(authedRequest({ board_id: "b1", image_url: "https://x/a.jpg" }));
  assertEquals(res.status, 400);
  const json = await res.json();
  assertStringIncludes(json.error, "Aucun compte Pinterest connecté");
});

Deno.test("social-pinterest-publish — épingle simple : succès, bon payload envoyé, bonne réponse renvoyée", async () => {
  const handler = await loadHandler();
  const { fetchFn, calls } = makeRouter({ user: { id: "u1" }, connection: CONN });
  globalThis.fetch = fetchFn;

  const res = await handler(
    authedRequest({ board_id: "board-1", image_url: "https://x/a.jpg", title: "Titre", description: "Desc" }),
  );
  assertEquals(res.status, 200);
  const json = await res.json();
  assertEquals(json.success, true);
  assertEquals(json.postId, "pin-0");
  assertEquals(json.permalink, "https://www.pinterest.com/pin/pin-0/");

  const pinCall = calls.find((c) => c.url.endsWith("/v5/pins"));
  assertEquals(pinCall!.body.board_id, "board-1");
  assertEquals(pinCall!.body.media_source, { source_type: "image_url", url: "https://x/a.jpg" });
  assertEquals(pinCall!.body.title, "Titre");
});

Deno.test("social-pinterest-publish — carrousel (2+ images) → media_source multiple_image_urls", async () => {
  const handler = await loadHandler();
  const { fetchFn, calls } = makeRouter({ user: { id: "u1" }, connection: CONN });
  globalThis.fetch = fetchFn;

  const res = await handler(
    authedRequest({ board_id: "board-1", image_urls: ["https://x/1.jpg", "https://x/2.jpg"] }),
  );
  assertEquals(res.status, 200);

  const pinCall = calls.find((c) => c.url.endsWith("/v5/pins"));
  assertEquals(pinCall!.body.media_source.source_type, "multiple_image_urls");
  assertEquals(pinCall!.body.media_source.items, [{ url: "https://x/1.jpg" }, { url: "https://x/2.jpg" }]);
});

Deno.test("social-pinterest-publish — jeton Pinterest expiré (401) → message clair, pas de succès", async () => {
  const handler = await loadHandler();
  const { fetchFn } = makeRouter({
    user: { id: "u1" },
    connection: CONN,
    pins: () => ({ status: 401, body: { message: "invalid token" } }),
  });
  globalThis.fetch = fetchFn;

  const res = await handler(authedRequest({ board_id: "board-1", image_url: "https://x/a.jpg" }));
  assertEquals(res.status, 400);
  const json = await res.json();
  assertStringIncludes(json.error, "Jeton Pinterest expiré ou invalide");
  assertEquals(json.success, undefined);
});

Deno.test("social-pinterest-publish — Pinterest refuse le contenu (400) → message serveur propagé", async () => {
  const handler = await loadHandler();
  const { fetchFn } = makeRouter({
    user: { id: "u1" },
    connection: CONN,
    pins: () => ({ status: 400, body: { message: "Le tableau indiqué est introuvable." } }),
  });
  globalThis.fetch = fetchFn;

  const res = await handler(authedRequest({ board_id: "board-invalide", image_url: "https://x/a.jpg" }));
  assertEquals(res.status, 400);
  const json = await res.json();
  assertEquals(json.error, "Le tableau indiqué est introuvable.");
});

Deno.test("social-pinterest-publish — OPTIONS (préflight CORS) → 200 sans toucher au réseau", async () => {
  const handler = await loadHandler();
  const { fetchFn, calls } = makeRouter({ user: { id: "u1" }, connection: CONN });
  globalThis.fetch = fetchFn;

  const res = await handler(new Request("http://edge.local/social-pinterest-publish", { method: "OPTIONS" }));
  assertEquals(res.status, 200);
  assertEquals(calls.length, 0);
});
