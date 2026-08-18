// Tests de admin-users : dashboard admin (liste des utilisatrices + stats
// business/MRR/tunnel d'activation), jamais testé jusqu'ici. Expose des
// données sensibles sur TOUTES les utilisatrices (email, plan, usage) — la
// seule protection est le check d'autorisation en tête de fonction, donc
// c'est ce qu'on verrouille en priorité : sans Authorization -> 401, avec un
// compte qui n'est ni l'admin ni un rôle admin -> 403. On vérifie aussi que le
// mode stats (agrégation la plus grosse et la plus fragile du fichier) ne
// plante pas et renvoie une forme cohérente sur un jeu de données vide.
//
// Lancer : deno test --no-check --allow-env --allow-read --node-modules-dir=none supabase/functions/admin-users/index_test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = "http://localhost:54321";
const ADMIN_EMAIL = "laetitia@nowadaysagency.com";

Deno.env.set("SUPABASE_URL", SUPABASE_URL);
Deno.env.set("SUPABASE_ANON_KEY", "anon-key-test");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test");

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

interface MockOpts {
  callerEmail?: string | null;
  hasAdminRole?: boolean;
}

function installMockFetch(opts: MockOpts) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const path = url.replace(SUPABASE_URL, "").split("?")[0];
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

    if (path === "/auth/v1/user") {
      if (!opts.callerEmail) return json({ error: "invalid token" }, 401);
      return json({ id: "caller-1", email: opts.callerEmail });
    }

    if (path === "/auth/v1/admin/users") {
      return json({ users: [] });
    }

    if (path === "/rest/v1/user_roles") {
      return json(opts.hasAdminRole ? [{ role: "admin" }] : []);
    }

    // Toutes les autres tables (profiles, subscriptions, ai_usage, brand_profile,
    // persona, storytelling, brand_proposition, brand_strategy, content_drafts,
    // calendar_posts, content_scores, social_connections…) : tableau vide.
    return json([]);
  }) as typeof fetch;
}

function restore() {
  globalThis.fetch = originalFetch;
}

function req(opts: { mode?: string; auth?: boolean } = {}): Request {
  const headers: Record<string, string> = {};
  if (opts.auth !== false) headers.authorization = "Bearer test-token";
  const url = new URL("https://edge.local/admin-users");
  if (opts.mode) url.searchParams.set("mode", opts.mode);
  return new Request(url, { method: "GET", headers });
}

Deno.test("admin-users: sans Authorization -> 401", async () => {
  installMockFetch({ callerEmail: null });
  try {
    const res = await call(req({ auth: false }));
    assertEquals(res.status, 401);
  } finally {
    restore();
  }
});

Deno.test("admin-users: utilisatrice normale (ni admin email, ni rôle admin) -> 403, aucune donnée exposée", async () => {
  installMockFetch({ callerEmail: "cliente@example.com", hasAdminRole: false });
  try {
    const res = await call(req());
    assertEquals(res.status, 403);
    const body = await res.json();
    assertEquals(body.users, undefined);
  } finally {
    restore();
  }
});

Deno.test("admin-users: compte admin par email -> 200, mode list par défaut", async () => {
  installMockFetch({ callerEmail: ADMIN_EMAIL });
  try {
    const res = await call(req());
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(Array.isArray(body.users), true);
    assertEquals(body.total, 0);
  } finally {
    restore();
  }
});

Deno.test("admin-users: compte avec rôle admin en base (email différent) -> 200 aussi", async () => {
  installMockFetch({ callerEmail: "autre-admin@example.com", hasAdminRole: true });
  try {
    const res = await call(req());
    assertEquals(res.status, 200);
  } finally {
    restore();
  }
});

Deno.test("admin-users: mode=stats sur un jeu de données vide -> 200, pas de crash, chiffres à zéro cohérents", async () => {
  installMockFetch({ callerEmail: ADMIN_EMAIL });
  try {
    const res = await call(req({ mode: "stats" }));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.total_users, 0);
    assertEquals(body.mrr, 0);
    assertEquals(body.churn_rate, 0);
    assertEquals(Array.isArray(body.activation_funnel), true);
    assertEquals(body.activation_funnel[0].step, "Inscrites");
    assertEquals(body.activation_funnel[0].count, 0);
  } finally {
    restore();
  }
});
