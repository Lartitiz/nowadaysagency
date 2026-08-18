// Tests du handler complet de delete-account (le fichier voisin
// cancel-subscription_test.ts ne couvre QUE le helper d'annulation Stripe,
// jamais la cascade de suppression elle-même). C'est ici qu'a vécu l'incident
// prod corrigé par la PR #738 : la fonction répondait "succès" alors que le
// compte auth et son workspace survivaient à leur propre suppression (FK
// violation avalée en silence). Les tests ci-dessous verrouillent :
// - l'autorisation admin (un compte normal ne peut pas cibler un autre user_id)
// - le fail-safe Stripe : un abonnement actif dont l'annulation échoue DOIT
//   bloquer toute la suppression, AVANT de toucher la moindre table
// - la régression directe de l'incident : si UNE SEULE étape échoue (table ou
//   suppression du compte auth lui-même), la réponse ne doit JAMAIS dire
//   success:true.
//
// Lancer : deno test --no-check --allow-env --allow-read --node-modules-dir=none supabase/functions/delete-account/index_test.ts

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = "http://localhost:54321";
const ADMIN_EMAIL = "laetitia@nowadaysagency.com";
// auth.admin.deleteUser() valide que l'id est un UUID avant même de faire
// l'appel réseau -> il faut de vrais UUID, pas des slugs comme "user-1".
const SELF_USER_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_USER_ID = "22222222-2222-4222-8222-222222222222";
const ADMIN_USER_ID = "33333333-3333-4333-8333-333333333333";

Deno.env.set("SUPABASE_URL", SUPABASE_URL);
Deno.env.set("SUPABASE_ANON_KEY", "anon-key-test");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test");
Deno.env.set("STRIPE_SECRET_KEY", "sk_test_fake");

const { handleDeleteAccountRequest } = await import("./index.ts");

const originalFetch = globalThis.fetch;

interface MockOpts {
  callerId: string;
  callerEmail: string;
  hasAdminRole?: boolean;
  activeSubscription?: { stripe_subscription_id: string; status: string } | null;
  stripeCancelError?: string | null;
  failingTable?: string | null;
  authDeleteUserError?: string | null;
}

function installMockFetch(opts: MockOpts) {
  const deletedTables: string[] = [];
  const stripeCalls: string[] = [];
  let authUserDeleted = false;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

    if (url.startsWith("https://api.stripe.com/")) {
      stripeCalls.push(url);
      if (opts.stripeCancelError) {
        return json({ error: { message: opts.stripeCancelError, type: "invalid_request_error" } }, 402);
      }
      return json({ id: opts.activeSubscription?.stripe_subscription_id, object: "subscription", status: "canceled" });
    }

    if (!url.startsWith(SUPABASE_URL)) {
      return json([]);
    }
    const path = url.slice(SUPABASE_URL.length).split("?")[0];

    if (path === "/auth/v1/user") {
      return json({ id: opts.callerId, email: opts.callerEmail });
    }

    if (path === "/rest/v1/user_roles") {
      return json(opts.hasAdminRole ? [{ role: "admin" }] : []);
    }

    if (path === "/rest/v1/subscriptions") {
      return json(opts.activeSubscription ? [opts.activeSubscription] : []);
    }

    if (path.startsWith("/storage/v1/object/list/")) {
      return json([]); // aucun fichier -> remove() jamais appelé
    }

    if (path.startsWith("/auth/v1/admin/users/")) {
      if (opts.authDeleteUserError) {
        return json({ msg: opts.authDeleteUserError }, 500);
      }
      authUserDeleted = true;
      return json({ id: TARGET_USER_ID });
    }

    if (path.startsWith("/rest/v1/") && method === "DELETE") {
      const table = path.replace("/rest/v1/", "");
      if (opts.failingTable && table === opts.failingTable) {
        return json({ message: `constraint violation on ${table}`, code: "23503" }, 409);
      }
      deletedTables.push(table);
      return json([]);
    }

    return json([]);
  }) as typeof fetch;

  return { deletedTables, stripeCalls, get authUserDeleted() { return authUserDeleted; } };
}

function restore() {
  globalThis.fetch = originalFetch;
}

function req(body: Record<string, unknown> = {}, opts: { auth?: boolean } = {}): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.auth !== false) headers.authorization = "Bearer test-token";
  return new Request("https://edge.local/delete-account", { method: "POST", headers, body: JSON.stringify(body) });
}

Deno.test("delete-account: suppression d'un AUTRE compte par une utilisatrice normale -> 403, rien n'est supprimé", async () => {
  const mock = installMockFetch({ callerId: SELF_USER_ID, callerEmail: "cliente@example.com", hasAdminRole: false });
  try {
    const res = await call(req({ targetUserId: TARGET_USER_ID }));
    assertEquals(res.status, 403);
    assertEquals(mock.deletedTables.length, 0);
    assertEquals(mock.authUserDeleted, false);
  } finally {
    restore();
  }
});

Deno.test("delete-account: auto-suppression sur un plan gratuit (pas d'abonnement Stripe) -> 200 success:true, Stripe jamais appelé", async () => {
  const mock = installMockFetch({ callerId: SELF_USER_ID, callerEmail: "cliente@example.com", activeSubscription: null });
  try {
    const res = await call(req({}));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.success, true);
    assertEquals(mock.stripeCalls.length, 0);
    assertEquals(mock.authUserDeleted, true);
    assert(mock.deletedTables.length > 50, "toutes les tables de la cascade doivent être tentées");
  } finally {
    restore();
  }
});

Deno.test("delete-account: admin supprime le compte d'une autre utilisatrice -> 200, autorisé", async () => {
  const mock = installMockFetch({ callerId: ADMIN_USER_ID, callerEmail: ADMIN_EMAIL, activeSubscription: null });
  try {
    const res = await call(req({ targetUserId: TARGET_USER_ID }));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.success, true);
    assertEquals(mock.authUserDeleted, true);
  } finally {
    restore();
  }
});

Deno.test("delete-account: annulation Stripe échoue pour un abonnement RÉELLEMENT actif -> bloque TOUT avant la moindre suppression (fail-safe)", async () => {
  const mock = installMockFetch({
    callerId: SELF_USER_ID,
    callerEmail: "cliente@example.com",
    activeSubscription: { stripe_subscription_id: "sub_123", status: "active" },
    stripeCancelError: "Your card was declined during cancellation processing.",
  });
  try {
    const res = await call(req({}));
    assertEquals(res.status, 500);
    const body = await res.json();
    assertEquals(body.error, "Impossible d'annuler l'abonnement Stripe. Réessaie dans un instant.");
    assertEquals(mock.deletedTables.length, 0);
    assertEquals(mock.authUserDeleted, false);
  } finally {
    restore();
  }
});

Deno.test("delete-account: RÉGRESSION incident prod — une table échoue (contrainte FK) -> success N'EST JAMAIS true", async () => {
  const mock = installMockFetch({
    callerId: SELF_USER_ID,
    callerEmail: "cliente@example.com",
    activeSubscription: null,
    failingTable: "brand_profile",
  });
  try {
    const res = await call(req({}));
    assertEquals(res.status, 500);
    const body = await res.json();
    assert(body.success !== true, "success ne doit jamais être true quand une table échoue à se vider");
    assert(Array.isArray(body.errors) && body.errors.some((e: string) => e.startsWith("brand_profile:")));
  } finally {
    restore();
  }
});

Deno.test("delete-account: RÉGRESSION incident prod — la suppression du compte auth échoue -> success N'EST JAMAIS true (le compte 'supprimé' resterait connectable)", async () => {
  const mock = installMockFetch({
    callerId: SELF_USER_ID,
    callerEmail: "cliente@example.com",
    activeSubscription: null,
    authDeleteUserError: "Database error deleting user",
  });
  try {
    const res = await call(req({}));
    assertEquals(res.status, 500);
    const body = await res.json();
    assert(body.success !== true, "success ne doit jamais être true si l'auth user survit à sa propre suppression");
    assert(Array.isArray(body.errors) && body.errors.some((e: string) => e.startsWith("auth.user:")));
    assertEquals(mock.authUserDeleted, false);
  } finally {
    restore();
  }
});

function call(request: Request): Promise<Response> {
  return handleDeleteAccountRequest(request);
}
