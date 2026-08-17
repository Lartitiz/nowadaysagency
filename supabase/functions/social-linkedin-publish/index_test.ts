// Tests de bout en bout de l'edge social-linkedin-publish, sans réseau réel :
// on intercepte `Deno.serve` (pour récupérer le handler sans ouvrir de port) et
// `fetch` (pour simuler Supabase Auth/REST + l'API LinkedIn).
//
// Lancer : deno test --no-check --allow-all supabase/functions/social-linkedin-publish/index_test.ts

// deno-lint-ignore-file no-explicit-any
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.env.set("SUPABASE_URL", "http://fake.local");
Deno.env.set("SUPABASE_ANON_KEY", "anon-key");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-key");
// Pas de TOKEN_ENCRYPTION_KEY : decryptConnTokens devient un no-op (jetons en clair).

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

interface RouterConfig {
  user?: { id: string } | null;
  connection?: Record<string, unknown> | null;
  /** POST /v2/ugcPosts (texte ou image). */
  ugcPost?: (callIndex: number) => { status: number; body?: unknown; headers?: Record<string, string> };
  /** Réponse à la récupération de l'image source (fetch(imageUrl)). */
  imageFetch?: () => { status: number };
  registerUpload?: () => { status: number; body: unknown };
  binaryUpload?: () => { status: number };
}

function makeRouter(cfg: RouterConfig) {
  const calls: { method: string; url: string }[] = [];
  let ugcCalls = 0;

  const fetchFn = (async (input: any, init?: any): Promise<Response> => {
    const req = input instanceof Request ? input : new Request(input, init);
    const url = new URL(req.url);
    calls.push({ method: req.method, url: req.url });

    if (url.pathname.endsWith("/auth/v1/user")) {
      if (!cfg.user) return jsonResponse(401, { message: "invalid JWT" });
      return jsonResponse(200, cfg.user);
    }
    if (url.pathname.includes("/rest/v1/social_connections")) {
      if (req.method === "GET") return jsonResponse(200, cfg.connection ?? null);
      if (req.method === "PATCH") return jsonResponse(200, {});
    }
    if (url.hostname === "api.linkedin.com" && url.pathname === "/v2/ugcPosts" && req.method === "POST") {
      const r = cfg.ugcPost ? cfg.ugcPost(ugcCalls++) : { status: 200, body: { id: `urn:li:share:${ugcCalls++}` } };
      return jsonResponse(r.status, r.body ?? {}, r.headers);
    }
    if (url.hostname === "api.linkedin.com" && url.pathname === "/v2/assets") {
      const r = cfg.registerUpload
        ? cfg.registerUpload()
        : {
            status: 200,
            body: {
              value: {
                uploadMechanism: {
                  "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest": { uploadUrl: "https://upload.linkedin.com/x" },
                },
                asset: "urn:li:digitalmediaAsset:abc",
              },
            },
          };
      return jsonResponse(r.status, r.body);
    }
    if (url.href === "https://upload.linkedin.com/x") {
      const r = cfg.binaryUpload ? cfg.binaryUpload() : { status: 201 };
      return new Response(null, { status: r.status });
    }
    if (url.href.startsWith("https://images.example/")) {
      const r = cfg.imageFetch ? cfg.imageFetch() : { status: 200 };
      return new Response(new Uint8Array([1, 2, 3]), { status: r.status, headers: { "content-type": "image/jpeg" } });
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

  await import(`../social-linkedin-publish/index.ts?t=${Date.now()}-${Math.random()}`);

  // @ts-ignore restore
  Deno.serve = originalServe;
  if (!captured) throw new Error("Deno.serve n'a pas été appelé par le module importé.");
  return captured;
}

function authedRequest(body: unknown): Request {
  return new Request("http://edge.local/social-linkedin-publish", {
    method: "POST",
    headers: { authorization: "Bearer user-token", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const CONN = { id: "conn-1", access_token: "li-token", platform_account_id: "member-1" };

Deno.test("social-linkedin-publish — pas d'en-tête Authorization → 401, aucun appel réseau", async () => {
  const handler = await loadHandler();
  const { fetchFn, calls } = makeRouter({ user: { id: "u1" }, connection: CONN });
  globalThis.fetch = fetchFn;

  const res = await handler(new Request("http://edge.local/social-linkedin-publish", { method: "POST", body: "{}" }));
  assertEquals(res.status, 401);
  assertEquals(calls.length, 0);
});

Deno.test("social-linkedin-publish — texte, image et PDF absents → 400 local", async () => {
  const handler = await loadHandler();
  const { fetchFn } = makeRouter({ user: { id: "u1" }, connection: CONN });
  globalThis.fetch = fetchFn;

  const res = await handler(authedRequest({ text: "   " }));
  assertEquals(res.status, 400);
  const json = await res.json();
  assertStringIncludes(json.error, "Ajoute du texte, une image ou un PDF");
});

Deno.test("social-linkedin-publish — aucun compte LinkedIn connecté → 400", async () => {
  const handler = await loadHandler();
  const { fetchFn } = makeRouter({ user: { id: "u1" }, connection: null });
  globalThis.fetch = fetchFn;

  const res = await handler(authedRequest({ text: "Hello" }));
  assertEquals(res.status, 400);
  const json = await res.json();
  assertStringIncludes(json.error, "Aucun compte LinkedIn connecté");
});

Deno.test("social-linkedin-publish — post texte : succès, bon payload envoyé, bonne réponse renvoyée", async () => {
  const handler = await loadHandler();
  const { fetchFn, calls } = makeRouter({ user: { id: "u1" }, connection: CONN });
  globalThis.fetch = fetchFn;

  const res = await handler(authedRequest({ text: "Mon post LinkedIn" }));
  assertEquals(res.status, 200);
  const json = await res.json();
  assertEquals(json.success, true);
  assertEquals(json.postId, "urn:li:share:0");
  assertEquals(json.permalink, "https://www.linkedin.com/feed/update/urn:li:share:0/");

  const postCall = calls.find((c) => c.url.includes("/v2/ugcPosts"));
  assertEquals(postCall !== undefined, true);
});

Deno.test("social-linkedin-publish — jeton LinkedIn expiré (401) → message clair, pas de succès", async () => {
  const handler = await loadHandler();
  const { fetchFn } = makeRouter({
    user: { id: "u1" },
    connection: CONN,
    ugcPost: () => ({ status: 401, body: { message: "invalid access token" } }),
  });
  globalThis.fetch = fetchFn;

  const res = await handler(authedRequest({ text: "Mon post" }));
  assertEquals(res.status, 400);
  const json = await res.json();
  assertStringIncludes(json.error, "Jeton LinkedIn expiré ou invalide");
  assertEquals(json.success, undefined);
});

Deno.test("social-linkedin-publish — contenu refusé par LinkedIn (400) → message serveur propagé", async () => {
  const handler = await loadHandler();
  const { fetchFn } = makeRouter({
    user: { id: "u1" },
    connection: CONN,
    ugcPost: () => ({ status: 422, body: { message: "Contenu non conforme aux règles LinkedIn." } }),
  });
  globalThis.fetch = fetchFn;

  const res = await handler(authedRequest({ text: "Mon post" }));
  assertEquals(res.status, 400);
  const json = await res.json();
  assertEquals(json.error, "Contenu non conforme aux règles LinkedIn.");
});

Deno.test("social-linkedin-publish — post image : succès, dispatch vers publishImagesToLinkedIn", async () => {
  const handler = await loadHandler();
  const { fetchFn, calls } = makeRouter({ user: { id: "u1" }, connection: CONN });
  globalThis.fetch = fetchFn;

  const res = await handler(authedRequest({ text: "Avec image", media_urls: ["https://images.example/a.jpg"] }));
  assertEquals(res.status, 200);
  const json = await res.json();
  assertEquals(json.success, true);

  assertEquals(calls.some((c) => c.url.includes("/v2/assets")), true);
  assertEquals(calls.some((c) => c.url === "https://upload.linkedin.com/x"), true);
});

Deno.test("social-linkedin-publish — OPTIONS (préflight CORS) → 200 sans toucher au réseau", async () => {
  const handler = await loadHandler();
  const { fetchFn, calls } = makeRouter({ user: { id: "u1" }, connection: CONN });
  globalThis.fetch = fetchFn;

  const res = await handler(new Request("http://edge.local/social-linkedin-publish", { method: "OPTIONS" }));
  assertEquals(res.status, 200);
  assertEquals(calls.length, 0);
});
