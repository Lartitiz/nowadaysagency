// Tests de _shared/pinterest-graph.ts (publication, liste des tableaux, rafraîchissement
// de jeton Pinterest), sans réseau réel : `fetch` est intercepté pour simuler l'API v5.
//
// Lancer : deno test --no-check --allow-all supabase/functions/_shared/pinterest-graph_test.ts

// deno-lint-ignore-file no-explicit-any
import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { publishPinToPinterest, listPinterestBoards, refreshPinterestTokenIfNeeded } from "./pinterest-graph.ts";

// Nécessaire uniquement pour les tests de rafraîchissement (basicAuthHeader) ; inoffensif ailleurs.
Deno.env.set("PINTEREST_CLIENT_ID", "client-id");
Deno.env.set("PINTEREST_CLIENT_SECRET", "client-secret");

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

interface RouterConfig {
  pins?: (body: any) => { status: number; body: unknown };
  boards?: () => { status: number; body: unknown };
  refresh?: () => { status: number; body: unknown };
}

function makeRouter(cfg: RouterConfig) {
  const calls: { method: string; url: string; body?: any; headers: Headers }[] = [];

  const fetchFn = (async (input: any, init?: any): Promise<Response> => {
    const req = input instanceof Request ? input : new Request(input, init);
    const url = new URL(req.url);
    const rawBody = init?.body;
    const parsedBody =
      typeof rawBody === "string" && req.headers.get("content-type")?.includes("json") ? JSON.parse(rawBody) : rawBody;
    calls.push({ method: req.method, url: req.url, body: parsedBody, headers: req.headers });

    if (url.pathname === "/v5/oauth/token") {
      const r = cfg.refresh ? cfg.refresh() : { status: 200, body: { access_token: "new-token", expires_in: 2592000 } };
      return jsonResponse(r.status, r.body);
    }
    if (url.pathname === "/v5/pins" && req.method === "POST") {
      const r = cfg.pins ? cfg.pins(parsedBody) : { status: 201, body: { id: "pin-1" } };
      return jsonResponse(r.status, r.body);
    }
    if (url.pathname === "/v5/boards" && req.method === "GET") {
      const r = cfg.boards
        ? cfg.boards()
        : { status: 200, body: { items: [{ id: "b1", name: "Recettes" }, { id: "b2", name: "" }] } };
      return jsonResponse(r.status, r.body);
    }
    throw new Error(`URL non gérée par le fake fetch: ${req.method} ${req.url}`);
  }) as typeof fetch;

  return { fetchFn, calls };
}

function fakeSupabase() {
  const updates: { table: string; data: any; eqCol: string; eqVal: any }[] = [];
  return {
    updates,
    client: {
      from: (table: string) => ({
        update: (data: any) => ({
          eq: (col: string, val: any) => {
            updates.push({ table, data, eqCol: col, eqVal: val });
            return Promise.resolve({ data: null, error: null });
          },
        }),
      }),
    } as any,
  };
}

// Ni token_expires_at ni refresh_token : refreshPinterestTokenIfNeeded court-circuite (aucun appel réseau).
const CONN = { id: "conn-1", access_token: "pin-token", platform_account_id: "pinacct-1" };

// ── publishPinToPinterest ──────────────────────────────────────────────────

Deno.test("publishPinToPinterest — épingle simple : bon payload, bon id renvoyé", async () => {
  const { fetchFn, calls } = makeRouter({});
  globalThis.fetch = fetchFn;
  const { client } = fakeSupabase();

  const id = await publishPinToPinterest(client, CONN, {
    boardId: "board-1",
    imageUrls: ["https://x/a.jpg"],
    title: "Titre",
    description: "Desc",
    link: "https://site.example",
    altText: "alt",
  });
  assertEquals(id, "pin-1");

  const call = calls.find((c) => c.url.endsWith("/v5/pins"));
  assertEquals(call!.body.board_id, "board-1");
  assertEquals(call!.body.media_source, { source_type: "image_url", url: "https://x/a.jpg" });
  assertEquals(call!.body.title, "Titre");
  assertEquals(call!.body.link, "https://site.example");
});

Deno.test("publishPinToPinterest — carrousel : multiple_image_urls, plafonné à 5 images", async () => {
  const { fetchFn, calls } = makeRouter({});
  globalThis.fetch = fetchFn;
  const { client } = fakeSupabase();

  const urls = Array.from({ length: 7 }, (_, i) => `https://x/${i}.jpg`);
  await publishPinToPinterest(client, CONN, { boardId: "board-1", imageUrls: urls });

  const call = calls.find((c) => c.url.endsWith("/v5/pins"));
  assertEquals(call!.body.media_source.source_type, "multiple_image_urls");
  assertEquals(call!.body.media_source.items.length, 5);
});

Deno.test("publishPinToPinterest — aucune image valide → erreur immédiate, aucun appel réseau", async () => {
  const { fetchFn, calls } = makeRouter({});
  globalThis.fetch = fetchFn;
  const { client } = fakeSupabase();

  await assertRejects(
    () => publishPinToPinterest(client, CONN, { boardId: "board-1", imageUrls: ["not-a-url"] }),
    Error,
    "Au moins une image publique",
  );
  assertEquals(calls.length, 0);
});

Deno.test("publishPinToPinterest — pas de boardId → erreur immédiate", async () => {
  const { fetchFn, calls } = makeRouter({});
  globalThis.fetch = fetchFn;
  const { client } = fakeSupabase();

  await assertRejects(
    () => publishPinToPinterest(client, CONN, { boardId: "", imageUrls: ["https://x/a.jpg"] }),
    Error,
    "tableau de destination est requis",
  );
  assertEquals(calls.length, 0);
});

Deno.test("publishPinToPinterest — jeton expiré (401) → message dédié reconnexion, pas de faux succès", async () => {
  const { fetchFn } = makeRouter({ pins: () => ({ status: 401, body: { message: "invalid token" } }) });
  globalThis.fetch = fetchFn;
  const { client } = fakeSupabase();

  await assertRejects(
    () => publishPinToPinterest(client, CONN, { boardId: "board-1", imageUrls: ["https://x/a.jpg"] }),
    Error,
    "Jeton Pinterest expiré ou invalide",
  );
});

Deno.test("publishPinToPinterest — Pinterest refuse le contenu → message serveur propagé", async () => {
  const { fetchFn } = makeRouter({ pins: () => ({ status: 400, body: { message: "Tableau introuvable." } }) });
  globalThis.fetch = fetchFn;
  const { client } = fakeSupabase();

  await assertRejects(
    () => publishPinToPinterest(client, CONN, { boardId: "board-x", imageUrls: ["https://x/a.jpg"] }),
    Error,
    "Tableau introuvable.",
  );
});

Deno.test("publishPinToPinterest — 200 mais pas d'id renvoyé → erreur explicite, pas de faux succès", async () => {
  const { fetchFn } = makeRouter({ pins: () => ({ status: 200, body: {} }) });
  globalThis.fetch = fetchFn;
  const { client } = fakeSupabase();

  await assertRejects(
    () => publishPinToPinterest(client, CONN, { boardId: "board-1", imageUrls: ["https://x/a.jpg"] }),
    Error,
    "Publication Pinterest échouée",
  );
});

// ── listPinterestBoards ────────────────────────────────────────────────────

Deno.test("listPinterestBoards — succès : tableaux correctement mappés", async () => {
  const { fetchFn } = makeRouter({});
  globalThis.fetch = fetchFn;
  const { client } = fakeSupabase();

  const boards = await listPinterestBoards(client, CONN);
  assertEquals(boards, [{ id: "b1", name: "Recettes" }, { id: "b2", name: "Tableau" }]);
});

Deno.test("listPinterestBoards — jeton expiré (401) → message dédié reconnexion", async () => {
  const { fetchFn } = makeRouter({ boards: () => ({ status: 401, body: { message: "invalid token" } }) });
  globalThis.fetch = fetchFn;
  const { client } = fakeSupabase();

  await assertRejects(() => listPinterestBoards(client, CONN), Error, "Jeton Pinterest expiré ou invalide");
});

Deno.test("listPinterestBoards — erreur serveur → message propre avec statut HTTP", async () => {
  const { fetchFn } = makeRouter({ boards: () => ({ status: 500, body: {} }) });
  globalThis.fetch = fetchFn;
  const { client } = fakeSupabase();

  await assertRejects(() => listPinterestBoards(client, CONN), Error, "HTTP 500");
});

// ── refreshPinterestTokenIfNeeded ──────────────────────────────────────────

Deno.test("refreshPinterestTokenIfNeeded — jeton loin de l'expiration → aucun appel réseau, jeton inchangé", async () => {
  const { fetchFn, calls } = makeRouter({});
  globalThis.fetch = fetchFn;
  const { client, updates } = fakeSupabase();

  const farFuture = new Date(Date.now() + 20 * 24 * 3600 * 1000).toISOString();
  const token = await refreshPinterestTokenIfNeeded(client, { ...CONN, token_expires_at: farFuture, refresh_token: "r1" });
  assertEquals(token, "pin-token");
  assertEquals(calls.length, 0);
  assertEquals(updates.length, 0);
});

Deno.test("refreshPinterestTokenIfNeeded — expiré mais pas de refresh_token → jeton tel quel, aucun appel réseau", async () => {
  const { fetchFn, calls } = makeRouter({});
  globalThis.fetch = fetchFn;
  const { client } = fakeSupabase();

  const past = new Date(Date.now() - 1000).toISOString();
  const token = await refreshPinterestTokenIfNeeded(client, { ...CONN, token_expires_at: past });
  assertEquals(token, "pin-token");
  assertEquals(calls.length, 0);
});

Deno.test("refreshPinterestTokenIfNeeded — bientôt expiré + refresh_token → rafraîchi, connexion mise à jour", async () => {
  const { fetchFn, calls } = makeRouter({});
  globalThis.fetch = fetchFn;
  const { client, updates } = fakeSupabase();

  const soon = new Date(Date.now() + 24 * 3600 * 1000).toISOString(); // < 3 jours
  const token = await refreshPinterestTokenIfNeeded(client, { ...CONN, token_expires_at: soon, refresh_token: "r1" });
  assertEquals(token, "new-token");

  const call = calls.find((c) => c.url.endsWith("/v5/oauth/token"));
  assertEquals(call!.headers.get("authorization"), "Basic " + btoa("client-id:client-secret"));
  assertEquals(updates.length, 1);
  assertEquals(updates[0].data.access_token, "new-token");
});

Deno.test("refreshPinterestTokenIfNeeded — échec du rafraîchissement → fail-open, garde l'ancien jeton", async () => {
  const { fetchFn } = makeRouter({ refresh: () => ({ status: 400, body: { error: "invalid_grant" } }) });
  globalThis.fetch = fetchFn;
  const { client, updates } = fakeSupabase();

  const soon = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const token = await refreshPinterestTokenIfNeeded(client, { ...CONN, token_expires_at: soon, refresh_token: "r1" });
  assertEquals(token, "pin-token");
  assertEquals(updates.length, 0);
});
