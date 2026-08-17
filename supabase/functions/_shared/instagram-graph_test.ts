// Tests de _shared/instagram-graph.ts (publication + rafraîchissement de jeton Instagram),
// sans réseau réel : `fetch` est intercepté pour simuler l'API Graph Instagram.
//
// Lancer : deno test --no-check --allow-all supabase/functions/_shared/instagram-graph_test.ts

// deno-lint-ignore-file no-explicit-any
import { assertEquals, assertRejects, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { publishImagesToInstagram, publishReelToInstagram, refreshTokenIfNeeded } from "./instagram-graph.ts";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

interface RouterConfig {
  refresh?: (url: URL) => { status: number; body: unknown };
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

    if (url.pathname.endsWith("/refresh_access_token")) {
      const r = cfg.refresh ? cfg.refresh(url) : { status: 200, body: { access_token: "refreshed-token", expires_in: 5184000 } };
      return jsonResponse(r.status, r.body);
    }
    if (req.method === "POST" && url.pathname.endsWith("/media_publish")) {
      const r = cfg.publish ? cfg.publish(publishCalls++, url) : { status: 200, body: { id: `post-${publishCalls++}` } };
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

const BASE_CONN = { id: "conn-1", access_token: "tok", platform_account_id: "igacct-1" };

// ── publishImagesToInstagram ──────────────────────────────────────────────

Deno.test("publishImagesToInstagram — image simple : bon payload, bon id renvoyé", async () => {
  const { fetchFn, calls } = makeRouter({});
  globalThis.fetch = fetchFn;
  const { client } = fakeSupabase();

  const id = await publishImagesToInstagram(client, BASE_CONN, "Ma légende", ["https://x/a.jpg"]);
  assertEquals(id, "post-0");

  const createCall = calls.find((c) => c.url.includes("/media") && !c.url.includes("media_publish"));
  const createUrl = new URL(createCall!.url);
  assertEquals(createUrl.searchParams.get("image_url"), "https://x/a.jpg");
  assertEquals(createUrl.searchParams.get("caption"), "Ma légende");
});

Deno.test("publishImagesToInstagram — carrousel : children corrects dans l'ordre", async () => {
  const { fetchFn, calls } = makeRouter({});
  globalThis.fetch = fetchFn;
  const { client } = fakeSupabase();

  const id = await publishImagesToInstagram(client, BASE_CONN, "", ["https://x/1.jpg", "https://x/2.jpg"]);
  assertEquals(id, "post-0");

  const createCalls = calls.filter((c) => c.url.includes("/media") && !c.url.includes("media_publish"));
  assertEquals(createCalls.length, 3); // 2 enfants + 1 container CAROUSEL
  const carousel = new URL(createCalls[2].url);
  assertEquals(carousel.searchParams.get("children"), "container-0,container-1");
});

Deno.test("publishImagesToInstagram — aucune image → erreur immédiate, aucun appel réseau", async () => {
  const { fetchFn, calls } = makeRouter({});
  globalThis.fetch = fetchFn;
  const { client } = fakeSupabase();

  await assertRejects(() => publishImagesToInstagram(client, BASE_CONN, "", []), Error, "Au moins une image");
  assertEquals(calls.length, 0);
});

Deno.test("publishImagesToInstagram — plus de 10 images → erreur immédiate, aucun appel réseau", async () => {
  const { fetchFn, calls } = makeRouter({});
  globalThis.fetch = fetchFn;
  const { client } = fakeSupabase();

  const urls = Array.from({ length: 11 }, (_, i) => `https://x/${i}.jpg`);
  await assertRejects(() => publishImagesToInstagram(client, BASE_CONN, "", urls), Error, "maximum 10 images");
  assertEquals(calls.length, 0);
});

Deno.test("publishImagesToInstagram — l'API refuse la création du média → erreur propre, pas de crash silencieux", async () => {
  const { fetchFn } = makeRouter({
    media: () => ({ status: 400, body: { error: { message: "Format d'image non supporté." } } }),
  });
  globalThis.fetch = fetchFn;
  const { client } = fakeSupabase();

  await assertRejects(
    () => publishImagesToInstagram(client, BASE_CONN, "", ["https://x/a.jpg"]),
    Error,
    "Format d'image non supporté.",
  );
});

Deno.test("publishImagesToInstagram — statut ERROR au polling → erreur propre, pas de faux succès", async () => {
  const { fetchFn } = makeRouter({ status: () => ({ status: 200, body: { status_code: "ERROR" } }) });
  globalThis.fetch = fetchFn;
  const { client } = fakeSupabase();

  await assertRejects(
    () => publishImagesToInstagram(client, BASE_CONN, "", ["https://x/a.jpg"]),
    Error,
    "n'a pas pu traiter l'image",
  );
});

// ── publishReelToInstagram ────────────────────────────────────────────────

Deno.test("publishReelToInstagram — succès : bon payload vidéo, bon id renvoyé", async () => {
  const { fetchFn, calls } = makeRouter({});
  globalThis.fetch = fetchFn;
  const { client } = fakeSupabase();

  const id = await publishReelToInstagram(client, BASE_CONN, "Mon reel", "https://x/reel.mp4");
  assertEquals(id, "post-0");

  const createCall = calls.find((c) => c.url.includes("/media") && !c.url.includes("media_publish"));
  const createUrl = new URL(createCall!.url);
  assertEquals(createUrl.searchParams.get("media_type"), "REELS");
  assertEquals(createUrl.searchParams.get("video_url"), "https://x/reel.mp4");
});

Deno.test("publishReelToInstagram — vidéo refusée (status ERROR) → erreur propre", async () => {
  const { fetchFn } = makeRouter({ status: () => ({ status: 200, body: { status_code: "ERROR" } }) });
  globalThis.fetch = fetchFn;
  const { client } = fakeSupabase();

  await assertRejects(
    () => publishReelToInstagram(client, BASE_CONN, "", "https://x/reel.mp4"),
    Error,
    "Instagram a refusé la vidéo",
  );
});

// ── refreshTokenIfNeeded ───────────────────────────────────────────────────

Deno.test("refreshTokenIfNeeded — jeton loin de l'expiration → aucun appel réseau, jeton inchangé", async () => {
  const { fetchFn, calls } = makeRouter({});
  globalThis.fetch = fetchFn;
  const { client, updates } = fakeSupabase();

  const farFuture = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
  const token = await refreshTokenIfNeeded(client, { ...BASE_CONN, token_expires_at: farFuture });
  assertEquals(token, "tok");
  assertEquals(calls.length, 0);
  assertEquals(updates.length, 0);
});

Deno.test("refreshTokenIfNeeded — jeton bientôt expiré → rafraîchi, connexion mise à jour en base", async () => {
  const { fetchFn } = makeRouter({});
  globalThis.fetch = fetchFn;
  const { client, updates } = fakeSupabase();

  const soon = new Date(Date.now() + 24 * 3600 * 1000).toISOString(); // < 7 jours
  const token = await refreshTokenIfNeeded(client, { ...BASE_CONN, token_expires_at: soon });
  assertEquals(token, "refreshed-token");
  assertEquals(updates.length, 1);
  assertEquals(updates[0].table, "social_connections");
  assertEquals(updates[0].data.access_token, "refreshed-token");
  assertEquals(updates[0].eqVal, "conn-1");
});

Deno.test("refreshTokenIfNeeded — échec du rafraîchissement → fail-open, garde l'ancien jeton, ne jette pas", async () => {
  const { fetchFn } = makeRouter({ refresh: () => ({ status: 400, body: { error: "invalid_grant" } }) });
  globalThis.fetch = fetchFn;
  const { client, updates } = fakeSupabase();

  const soon = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const token = await refreshTokenIfNeeded(client, { ...BASE_CONN, token_expires_at: soon });
  assertEquals(token, "tok");
  assertEquals(updates.length, 0);
});
