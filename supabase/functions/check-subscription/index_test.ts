// Tests de check-subscription : détermine le plan/l'usage affichés à la
// cliente (gratuit/payant, crédits restants), jamais testé jusqu'ici. Un bug
// ici affiche soit un plan payant à une compte gratuite (fuite), soit
// "Gratuit · 0 restantes" à une abonnée qui a bien payé (le bug T19 documenté
// dans plan-limiter.ts). Couvre le bypass admin, le calcul du plan effectif
// pour une utilisatrice payante, et le traitement d'une lecture inconnue :
// jamais de plan gratuit inventé en cas de panne.
//
// Lancer : deno test --no-check --allow-env --allow-read --node-modules-dir=none supabase/functions/check-subscription/index_test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = "http://localhost:54321";
const USER_ID = "user-1";

Deno.env.set("SUPABASE_URL", SUPABASE_URL);
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test");

const { handleCheckSubscriptionRequest } = await import("./index.ts");

const originalFetch = globalThis.fetch;

interface MockOpts {
  isAdmin?: boolean;
  subscriptionRow?: { plan: string; status: string } | null;
  breakSubscriptionsQuery?: boolean;
}

function installMockFetch(opts: MockOpts) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const path = url.replace(SUPABASE_URL, "").split("?")[0];
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

    if (path === "/auth/v1/user") {
      return json({ id: USER_ID, email: "cliente@example.com" });
    }

    if (path === "/rest/v1/user_roles") {
      return json(opts.isAdmin ? [{ role: "admin" }] : []);
    }

    if (path === "/rest/v1/workspace_members") {
      return json([]); // pas de workspace owner -> périmètre facturation = user
    }

    if (path === "/rest/v1/subscriptions") {
      if (opts.breakSubscriptionsQuery) {
        // Un throw réseau (pas juste un statut d'erreur HTTP) : postgrest-js ne
        // catch PAS ça en {data,error}, ça remonte tel quel — c'est ce qui doit
        // atterrir dans le catch englobant de check-subscription.
        throw new Error("simulated network failure");
      }
      const listQuery = new URL(url).searchParams.get("select") === "*";
      if (!opts.subscriptionRow) return listQuery ? json([]) : json({ code: "PGRST116", details: "The result contains 0 rows", message: "Cannot coerce the result to a single JSON object" }, 406);
      return json(listQuery ? [opts.subscriptionRow] : opts.subscriptionRow);
    }

    if (path === "/rest/v1/coaching_programs") {
      return json([]);
    }

    if (path === "/rest/v1/workspaces") {
      return json({ message: "no rows" }, 406);
    }

    return json([]);
  }) as typeof fetch;
}

function restore() {
  globalThis.fetch = originalFetch;
}

function req(body: Record<string, unknown> = {}): Request {
  return new Request("https://edge.local/check-subscription", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer test-token" },
    body: JSON.stringify(body),
  });
}

Deno.test("check-subscription: compte admin -> plan binôme illimité, source 'admin'", async () => {
  installMockFetch({ isAdmin: true });
  try {
    const res = await handleCheckSubscriptionRequest(req());
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.plan, "binome");
    assertEquals(body.source, "admin");
    assertEquals(body.ai_usage.total.limit, 9999);
  } finally {
    restore();
  }
});

Deno.test("check-subscription: sans abonnement -> plan free, quota du plan gratuit", async () => {
  installMockFetch({ isAdmin: false, subscriptionRow: null });
  try {
    const res = await handleCheckSubscriptionRequest(req());
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.plan, "free");
    assertEquals(body.ai_usage.total.limit, 23); // PLAN_LIMITS.free.total
  } finally {
    restore();
  }
});

Deno.test("check-subscription: abonnement 'outil' actif -> plan effectif = outil (pas free)", async () => {
  installMockFetch({ isAdmin: false, subscriptionRow: { plan: "outil", status: "active" } });
  try {
    const res = await handleCheckSubscriptionRequest(req());
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.plan, "outil");
    assertEquals(body.status, "active");
    assertEquals(body.ai_usage.total.limit, 200); // PLAN_LIMITS.outil.total (garde-fou, grille 01/10/2026)
  } finally {
    restore();
  }
});

Deno.test("check-subscription: panne de lecture -> état indisponible, pas plan gratuit", async () => {
  installMockFetch({ isAdmin: false, breakSubscriptionsQuery: true });
  try {
    const res = await handleCheckSubscriptionRequest(req());
    assertEquals(res.status, 503);
    const body = await res.json();
    assertEquals(body.plan, undefined);
  } finally {
    restore();
  }
});

Deno.test("check-subscription: sans Authorization -> 401 sans plan", async () => {
  installMockFetch({ isAdmin: false });
  try {
    const request = new Request("https://edge.local/check-subscription", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const res = await handleCheckSubscriptionRequest(request);
    assertEquals(res.status, 401);
    const body = await res.json();
    assertEquals(body.plan, undefined);
    assertEquals(typeof body.error, "string");
  } finally {
    restore();
  }
});
