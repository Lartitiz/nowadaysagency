// Tests de bout en bout de l'edge social-instagram-publish, sans réseau réel :
// on intercepte `Deno.serve` (pour récupérer le handler sans ouvrir de port) et
// `fetch` (pour simuler Supabase Auth/REST + l'API Graph Instagram).
//
// Lancer : deno test --no-check --allow-all supabase/functions/social-instagram-publish/index_test.ts

// deno-lint-ignore-file no-explicit-any
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.env.set("SUPABASE_URL", "http://fake.local");
Deno.env.set("SUPABASE_ANON_KEY", "anon-key");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-key");
// Pas de TOKEN_ENCRYPTION_KEY : decryptConnTokens devient un no-op (jetons en clair), cf. token-crypto.ts.

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

interface RouterConfig {
  /** null => Supabase Auth renvoie une erreur (jeton invalide/expiré). */
  user?: { id: string } | null;
  /** Ligne social_connections renvoyée par le select (null => aucun compte connecté). */
  connection?: Record<string, unknown> | null;
  media?: (callIndex: number, url: URL) => { status: number; body: unknown };
  status?: (callIndex: number, url: URL) => { status: number; body: unknown };
  publish?: (callIndex: number, url: URL) => { status: number; body: unknown };
}

function makeRouter(cfg: RouterConfig) {
  const calls: { method: string; url: string }[] = [];
  let mediaCalls = 0;
  let statusCalls = 0;
  let publishCalls = 0;

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

    if (url.hostname === "graph.instagram.com") {
      if (req.method === "POST" && url.pathname.endsWith("/media_publish")) {
        const r = cfg.publish
          ? cfg.publish(publishCalls++, url)
          : { status: 200, body: { id: `post-${publishCalls++}` } };
        return jsonResponse(r.status, r.body);
      }
      if (req.method === "POST" && url.pathname.endsWith("/media")) {
        const r = cfg.media ? cfg.media(mediaCalls, url) : { status: 200, body: { id: `container-${mediaCalls}` } };
        mediaCalls++;
        return jsonResponse(r.status, r.body);
      }
      if (req.method === "GET") {
        const r = cfg.status ? cfg.status(statusCalls, url) : { status: 200, body: { status_code: "FINISHED" } };
        statusCalls++;
        return jsonResponse(r.status, r.body);
      }
    }

    throw new Error(`URL non gérée par le fake fetch: ${req.method} ${req.url}`);
  }) as typeof fetch;

  return { fetchFn, calls };
}

/** Importe le module edge en interceptant Deno.serve pour récupérer le handler sans ouvrir de port réel. */
async function loadHandler(): Promise<(req: Request) => Promise<Response>> {
  let captured: ((req: Request) => Promise<Response>) | null = null;
  const originalServe = Deno.serve;
  // @ts-ignore: monkeypatch le temps de l'import, pour capturer le handler sans lancer de vrai listener.
  Deno.serve = ((arg: any) => {
    captured = typeof arg === "function" ? arg : arg?.fetch;
    return {
      finished: Promise.resolve(),
      shutdown: async () => {},
      unref: () => {},
      ref: () => {},
      addr: { hostname: "fake", port: 0, transport: "tcp" },
    } as any;
  }) as typeof Deno.serve;

  // Cache-bust : chaque appel de test doit réimporter le module pour repartir d'un état propre
  // (le module n'a pas d'état mutable ici, mais on garde le import frais pour rester robuste).
  await import(`../social-instagram-publish/index.ts?t=${Date.now()}-${Math.random()}`);

  // @ts-ignore restore
  Deno.serve = originalServe;
  if (!captured) throw new Error("Deno.serve n'a pas été appelé par le module importé.");
  return captured;
}

function authedRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://edge.local/social-instagram-publish", {
    method: "POST",
    headers: { authorization: "Bearer user-token", "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const CONN = {
  id: "conn-1",
  access_token: "ig-token",
  platform_account_id: "igacct-1",
  platform_account_name: "lea.photo",
  // Pas de token_expires_at : refreshTokenIfNeeded court-circuite (pas d'appel réseau de refresh).
};

Deno.test("social-instagram-publish — pas d'en-tête Authorization → 401, aucun appel réseau", async () => {
  const handler = await loadHandler();
  const { fetchFn, calls } = makeRouter({ user: { id: "u1" }, connection: CONN });
  globalThis.fetch = fetchFn;

  const req = new Request("http://edge.local/social-instagram-publish", {
    method: "POST",
    body: JSON.stringify({ imageUrl: "https://x/a.jpg" }),
  });
  const res = await handler(req);
  assertEquals(res.status, 401);
  const json = await res.json();
  assertEquals(json.error, "Non autorisé");
  assertEquals(calls.length, 0);
});

Deno.test("social-instagram-publish — aucune image/vidéo fournie → 400 local, aucun appel réseau média", async () => {
  const handler = await loadHandler();
  const { fetchFn, calls } = makeRouter({ user: { id: "u1" }, connection: CONN });
  globalThis.fetch = fetchFn;

  const res = await handler(authedRequest({ caption: "hello" }));
  assertEquals(res.status, 400);
  const json = await res.json();
  assertStringIncludes(json.error, "Au moins une URL de média");
  // Seul l'appel d'authentification a lieu (avant la validation locale) : ni social_connections, ni Graph API.
  assertEquals(calls.length, 1);
  assertStringIncludes(calls[0].url, "/auth/v1/user");
});

Deno.test("social-instagram-publish — carrousel de plus de 10 images → 400 local", async () => {
  const handler = await loadHandler();
  const { fetchFn } = makeRouter({ user: { id: "u1" }, connection: CONN });
  globalThis.fetch = fetchFn;

  const urls = Array.from({ length: 11 }, (_, i) => `https://x/${i}.jpg`);
  const res = await handler(authedRequest({ imageUrls: urls }));
  assertEquals(res.status, 400);
  const json = await res.json();
  assertStringIncludes(json.error, "maximum 10 images");
});

Deno.test("social-instagram-publish — aucun compte Instagram connecté → 400", async () => {
  const handler = await loadHandler();
  const { fetchFn } = makeRouter({ user: { id: "u1" }, connection: null });
  globalThis.fetch = fetchFn;

  const res = await handler(authedRequest({ imageUrl: "https://x/a.jpg" }));
  assertEquals(res.status, 400);
  const json = await res.json();
  assertStringIncludes(json.error, "Aucun compte Instagram connecté");
});

Deno.test("social-instagram-publish — image simple : succès, bon payload envoyé, bonne réponse renvoyée", async () => {
  const handler = await loadHandler();
  const { fetchFn, calls } = makeRouter({ user: { id: "u1" }, connection: CONN });
  globalThis.fetch = fetchFn;

  const res = await handler(authedRequest({ caption: "Ma légende", imageUrl: "https://x/a.jpg" }));
  assertEquals(res.status, 200);
  const json = await res.json();
  assertEquals(json.success, true);
  assertEquals(json.postId, "post-0");
  assertEquals(json.permalink, "https://www.instagram.com/lea.photo/");

  // Vérifie le payload envoyé à l'API Graph : image_url + caption sur le container, puis publish.
  const createCall = calls.find((c) => c.method === "POST" && c.url.includes("/media") && !c.url.includes("media_publish"));
  const createUrl = new URL(createCall!.url);
  assertEquals(createUrl.searchParams.get("image_url"), "https://x/a.jpg");
  assertEquals(createUrl.searchParams.get("caption"), "Ma légende");

  const publishCall = calls.find((c) => c.url.includes("media_publish"));
  const publishUrl = new URL(publishCall!.url);
  assertEquals(publishUrl.searchParams.get("creation_id"), "container-0");
});

Deno.test("social-instagram-publish — carrousel : succès, children corrects, appelle bien tous les statuts", async () => {
  const handler = await loadHandler();
  const { fetchFn, calls } = makeRouter({ user: { id: "u1" }, connection: CONN });
  globalThis.fetch = fetchFn;

  const res = await handler(
    authedRequest({ caption: "Carrousel", imageUrls: ["https://x/1.jpg", "https://x/2.jpg", "https://x/3.jpg"] }),
  );
  assertEquals(res.status, 200);
  const json = await res.json();
  assertEquals(json.success, true);

  // 3 enfants + 1 container CAROUSEL = 4 appels de création média.
  const createCalls = calls.filter((c) => c.method === "POST" && c.url.includes("/media") && !c.url.includes("media_publish"));
  assertEquals(createCalls.length, 4);
  const carouselCreate = new URL(createCalls[3].url);
  assertEquals(carouselCreate.searchParams.get("media_type"), "CAROUSEL");
  assertEquals(carouselCreate.searchParams.get("children"), "container-0,container-1,container-2");
});

Deno.test("social-instagram-publish — erreur Graph API à la création du container → message propre, pas de crash", async () => {
  const handler = await loadHandler();
  const { fetchFn } = makeRouter({
    user: { id: "u1" },
    connection: CONN,
    media: () => ({ status: 400, body: { error: { message: "Média invalide (format non supporté)." } } }),
  });
  globalThis.fetch = fetchFn;

  const res = await handler(authedRequest({ imageUrl: "https://x/a.jpg" }));
  assertEquals(res.status, 400);
  const json = await res.json();
  assertEquals(json.error, "Média invalide (format non supporté).");
  assertEquals(json.success, undefined);
});

Deno.test("social-instagram-publish — vidéo refusée par Instagram (status ERROR) → message dédié, pas de faux succès", async () => {
  const handler = await loadHandler();
  const { fetchFn } = makeRouter({
    user: { id: "u1" },
    connection: CONN,
    status: () => ({ status: 200, body: { status_code: "ERROR" } }),
  });
  globalThis.fetch = fetchFn;

  const res = await handler(authedRequest({ videoUrl: "https://x/reel.mp4" }));
  assertEquals(res.status, 400);
  const json = await res.json();
  assertStringIncludes(json.error, "Instagram a refusé la vidéo");
  assertEquals(json.success, undefined);
});

Deno.test("social-instagram-publish — jeton expiré à la publication finale → erreur propre, pas de succès silencieux", async () => {
  const handler = await loadHandler();
  const { fetchFn } = makeRouter({
    user: { id: "u1" },
    connection: CONN,
    publish: () => ({ status: 400, body: { error: { message: "Erreur (#190) Jeton d'accès expiré." } } }),
  });
  globalThis.fetch = fetchFn;

  const res = await handler(authedRequest({ imageUrl: "https://x/a.jpg" }));
  assertEquals(res.status, 400);
  const json = await res.json();
  assertEquals(json.error, "Erreur (#190) Jeton d'accès expiré.");
  assertEquals(json.success, undefined);
});

Deno.test("social-instagram-publish — OPTIONS (préflight CORS) → 200 sans toucher au réseau", async () => {
  const handler = await loadHandler();
  const { fetchFn, calls } = makeRouter({ user: { id: "u1" }, connection: CONN });
  globalThis.fetch = fetchFn;

  const res = await handler(new Request("http://edge.local/social-instagram-publish", { method: "OPTIONS" }));
  assertEquals(res.status, 200);
  assertEquals(calls.length, 0);
});
