// Tests du rafraîchissement proactif des jetons Instagram, sans réseau réel.
// Lancer : deno test --no-check --allow-env supabase/functions/_shared/instagram-token-sweep_test.ts
// TOKEN_ENCRYPTION_KEY absent : decryptConnTokens/encryptToken passent en clair.

// deno-lint-ignore-file no-explicit-any
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isSweepTick, refreshExpiringInstagramTokens, SWEEP_THRESHOLD_MS } from "./instagram-token-sweep.ts";

const DAY = 24 * 3600 * 1000;

function fakeSupabase(rows: any[], opts: { selectError?: any } = {}) {
  const filters: any[] = [];
  const updates: { data: any; id: any }[] = [];
  return {
    filters,
    updates,
    from(table: string) {
      const b: any = {
        select() { return b; },
        eq(col: string, val: any) { filters.push(["eq", col, val]); return b; },
        not(col: string, op: string, val: any) { filters.push(["not", col, op, val]); return b; },
        gt(col: string, val: any) { filters.push(["gt", col, val]); return b; },
        lte(col: string, val: any) { filters.push(["lte", col, val]); return b; },
        limit() {
          return Promise.resolve(opts.selectError ? { data: null, error: opts.selectError } : { data: rows, error: null });
        },
        update(data: any) {
          return { eq: (_c: string, id: any) => { updates.push({ data, id }); return Promise.resolve({ error: null }); } };
        },
      };
      if (table !== "social_connections") throw new Error("table inattendue " + table);
      return b;
    },
  };
}

function withFetch(handler: (url: URL) => Response, fn: () => Promise<void>) {
  return async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async (input: any) => handler(new URL(input instanceof Request ? input.url : String(input)))) as any;
    try { await fn(); } finally { globalThis.fetch = orig; }
  };
}

Deno.test("sweep : prolonge un jeton qui expire dans 3 jours et persiste la nouvelle date", withFetch(
  (url) => {
    assertEquals(url.pathname, "/refresh_access_token");
    assertEquals(url.searchParams.get("grant_type"), "ig_refresh_token");
    assertEquals(url.searchParams.get("access_token"), "old-token");
    return new Response(JSON.stringify({ access_token: "new-token", expires_in: 5184000 }), { status: 200 });
  },
  async () => {
    const now = Date.now();
    const sb = fakeSupabase([
      { id: "c1", platform: "instagram", platform_account_name: "nowadaysagency", access_token: "old-token", token_expires_at: new Date(now + 3 * DAY).toISOString() },
    ]);
    const r = await refreshExpiringInstagramTokens(sb, now);
    assertEquals(r, { checked: 1, refreshed: 1, failed: [] });
    assertEquals(sb.updates.length, 1);
    assertEquals(sb.updates[0].id, "c1");
    assertEquals(sb.updates[0].data.access_token, "new-token");
    const newExp = new Date(sb.updates[0].data.token_expires_at).getTime();
    assertEquals(newExp > now + 59 * DAY, true);
  },
));

Deno.test("sweep : ne cible que les jetons Instagram non expirés et sous 10 jours", async () => {
  const now = Date.now();
  const sb = fakeSupabase([]);
  await refreshExpiringInstagramTokens(sb, now);
  const f = Object.fromEntries(sb.filters.map((x: any[]) => [x[0] + ":" + x[1], x.slice(2)]));
  assertEquals(f["eq:platform"], ["instagram"]);
  assertEquals(f["gt:token_expires_at"], [new Date(now).toISOString()]);
  assertEquals(f["lte:token_expires_at"], [new Date(now + SWEEP_THRESHOLD_MS).toISOString()]);
});

Deno.test("sweep : un refus de l'API est journalisé sans lever ni écrire, et les autres continuent", withFetch(
  (url) => {
    const tok = url.searchParams.get("access_token");
    if (tok === "bad") return new Response(JSON.stringify({ error: { message: "Invalid OAuth" } }), { status: 400 });
    return new Response(JSON.stringify({ access_token: "fresh", expires_in: 5184000 }), { status: 200 });
  },
  async () => {
    const now = Date.now();
    const exp = new Date(now + 2 * DAY).toISOString();
    const sb = fakeSupabase([
      { id: "a", platform: "instagram", platform_account_name: "compte_a", access_token: "bad", token_expires_at: exp },
      { id: "b", platform: "instagram", platform_account_name: "compte_b", access_token: "good", token_expires_at: exp },
    ]);
    const r = await refreshExpiringInstagramTokens(sb, now);
    assertEquals(r.checked, 2);
    assertEquals(r.refreshed, 1);
    assertEquals(r.failed, [{ id: "a", account: "compte_a" }]);
    assertEquals(sb.updates.map((u) => u.id), ["b"]);
  },
));

Deno.test("sweep : erreur réseau ou lecture en échec → ne lève jamais", withFetch(
  () => { throw new Error("réseau coupé"); },
  async () => {
    const now = Date.now();
    const r1 = await refreshExpiringInstagramTokens(
      fakeSupabase([{ id: "x", platform: "instagram", access_token: "t", token_expires_at: new Date(now + DAY).toISOString() }]),
      now,
    );
    assertEquals(r1.failed.length, 1);
    const r2 = await refreshExpiringInstagramTokens(fakeSupabase([], { selectError: { message: "boom" } }), now);
    assertEquals(r2, { checked: 0, refreshed: 0, failed: [] });
  },
));

Deno.test("isSweepTick : un seul tick du cron */5 par heure", () => {
  assertEquals(isSweepTick(new Date("2026-09-27T10:00:00Z")), true);
  assertEquals(isSweepTick(new Date("2026-09-27T10:04:59Z")), true);
  assertEquals(isSweepTick(new Date("2026-09-27T10:05:00Z")), false);
  assertEquals(isSweepTick(new Date("2026-09-27T10:55:00Z")), false);
});
