// Tests de redeem-promo : accorde un plan payant (crédits illimités) contre un
// code promo, jamais testé jusqu'ici. Couvre le rejet des codes invalides,
// expirés, déjà utilisés, et — surtout — les DEUX façons dont ce endpoint
// pourrait mentir sur son succès : (1) si le RPC `redeem_promo_and_grant_plan`
// échoue, la réponse ne doit JAMAIS dire success:true ; (2) si le plan est
// accordé mais que la création de l'espace d'accompagnement (binôme) échoue,
// la réponse doit rester success:true (le plan EST accordé) mais signaler
// clairement l'échec via `coachingSetupFailed`/`warning`, sans le passer sous
// silence.
//
// Lancer : deno test --no-check --allow-env --allow-read --node-modules-dir=none supabase/functions/redeem-promo/index_test.ts

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = "http://localhost:54321";
const USER_ID = "user-1";

Deno.env.set("SUPABASE_URL", SUPABASE_URL);
Deno.env.set("SUPABASE_ANON_KEY", "anon-key-test");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test");
Deno.env.set("ALLOWED_ORIGIN", "https://nowadays-assistant.fr");

const { handleRedeemPromoRequest } = await import("./index.ts");

const originalFetch = globalThis.fetch;

interface PromoRow {
  id: string;
  code: string;
  is_active: boolean;
  expires_at: string | null;
  max_uses: number | null;
  current_uses: number;
  plan_granted: string;
  duration_days: number | null;
}

const BASE_PROMO: PromoRow = {
  id: "promo-1",
  code: "BIENVENUE",
  is_active: true,
  expires_at: null,
  max_uses: null,
  current_uses: 0,
  plan_granted: "outil",
  duration_days: 30,
};

interface MockOpts {
  promo?: PromoRow | null;
  alreadyRedeemed?: boolean;
  grantError?: string | null;
  coachingError?: string | null;
}

function installMockFetch(opts: MockOpts) {
  const rpcCalls: { name: string; body: unknown }[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    const path = url.replace(SUPABASE_URL, "").split("?")[0];
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

    if (path === "/auth/v1/user") {
      return json({ id: USER_ID, email: "cliente@example.com" });
    }

    if (path === "/rest/v1/promo_codes") {
      // .single() : Accept demande un objet — 0 ligne DOIT être un statut non-ok
      // pour que le client renvoie data=null (voir postgrest-js PostgrestBuilder.js :
      // le déballage tableau->objet ne joue QUE pour maybeSingle, pas single()).
      if (!opts.promo) return json({ message: "no rows" }, 406);
      return json(opts.promo, 200);
    }

    if (path === "/rest/v1/promo_redemptions") {
      if (opts.alreadyRedeemed) return json({ id: "redemption-1" }, 200);
      return json({ message: "no rows" }, 406);
    }

    if (path === "/rest/v1/profiles") {
      return json([]); // pas de coach trouvé -> fallback sur userId, sans impact sur les assertions
    }

    if (path === "/rest/v1/rpc/redeem_promo_and_grant_plan") {
      rpcCalls.push({ name: "redeem_promo_and_grant_plan", body: init?.body ? JSON.parse(init.body as string) : {} });
      if (opts.grantError) return json({ message: opts.grantError }, 400);
      return json(null, 200);
    }

    if (path === "/rest/v1/rpc/create_coaching_program_full") {
      rpcCalls.push({ name: "create_coaching_program_full", body: init?.body ? JSON.parse(init.body as string) : {} });
      if (opts.coachingError) return json({ message: opts.coachingError }, 500);
      return json(null, 200);
    }

    return json([]);
  }) as typeof fetch;
  return { rpcCalls };
}

function restore() {
  globalThis.fetch = originalFetch;
}

function redeemReq(body: Record<string, unknown>): Request {
  return new Request("https://edge.local/redeem-promo", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer test-token" },
    body: JSON.stringify(body),
  });
}

Deno.test("redeem-promo: code inconnu -> 400 'Code invalide ou expiré.'", async () => {
  installMockFetch({ promo: null });
  try {
    const res = await handleRedeemPromoRequest(redeemReq({ code: "INCONNU" }));
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.error, "Code invalide ou expiré.");
  } finally {
    restore();
  }
});

Deno.test("redeem-promo: code expiré -> 400 'Ce code a expiré.'", async () => {
  installMockFetch({ promo: { ...BASE_PROMO, expires_at: "2020-01-01T00:00:00.000Z" } });
  try {
    const res = await handleRedeemPromoRequest(redeemReq({ code: "bienvenue" }));
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.error, "Ce code a expiré.");
  } finally {
    restore();
  }
});

Deno.test("redeem-promo: nombre max d'utilisations atteint -> 400", async () => {
  installMockFetch({ promo: { ...BASE_PROMO, max_uses: 10, current_uses: 10 } });
  try {
    const res = await handleRedeemPromoRequest(redeemReq({ code: "BIENVENUE" }));
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.error, "Ce code a atteint son nombre maximum d'utilisations.");
  } finally {
    restore();
  }
});

Deno.test("redeem-promo: déjà utilisé par cette utilisatrice -> 400, le plan n'est PAS ré-accordé", async () => {
  const mock = installMockFetch({ promo: BASE_PROMO, alreadyRedeemed: true });
  try {
    const res = await handleRedeemPromoRequest(redeemReq({ code: "BIENVENUE" }));
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.error, "Tu as déjà utilisé ce code.");
    assertEquals(mock.rpcCalls.length, 0);
  } finally {
    restore();
  }
});

Deno.test("redeem-promo: code valide -> 200, plan accordé via le RPC atomique", async () => {
  const mock = installMockFetch({ promo: BASE_PROMO });
  try {
    const res = await handleRedeemPromoRequest(redeemReq({ code: "bienvenue" }));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.success, true);
    assertEquals(body.plan, "outil");
    assertEquals(mock.rpcCalls.length, 1);
    assertEquals(mock.rpcCalls[0].name, "redeem_promo_and_grant_plan");
  } finally {
    restore();
  }
});

Deno.test("redeem-promo: échec du RPC d'octroi -> 500, JAMAIS success:true (pas de faux octroi)", async () => {
  installMockFetch({ promo: BASE_PROMO, grantError: "boom: contrainte violée" });
  try {
    const res = await handleRedeemPromoRequest(redeemReq({ code: "BIENVENUE" }));
    assertEquals(res.status, 500);
    const body = await res.json();
    assert(body.success !== true, "success ne doit jamais être true quand le RPC d'octroi échoue");
    assert(typeof body.error === "string" && body.error.length > 0);
  } finally {
    restore();
  }
});

Deno.test("redeem-promo: RPC d'octroi échoue avec 'promo_max_uses_reached' -> 400 message clair (pas 500 générique)", async () => {
  installMockFetch({ promo: BASE_PROMO, grantError: "promo_max_uses_reached: over limit" });
  try {
    const res = await handleRedeemPromoRequest(redeemReq({ code: "BIENVENUE" }));
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.error, "Ce code a atteint son nombre maximum d'utilisations.");
  } finally {
    restore();
  }
});

Deno.test("redeem-promo: plan binôme accordé mais création de l'espace d'accompagnement échoue -> success:true QUAND MÊME (le plan est réel) + warning visible, jamais silencieux", async () => {
  const mock = installMockFetch({
    promo: { ...BASE_PROMO, plan_granted: "binome" },
    coachingError: "boom: échec création programme",
  });
  try {
    const res = await handleRedeemPromoRequest(redeemReq({ code: "BIENVENUE" }));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.success, true);
    assertEquals(body.coachingSetupFailed, true);
    assert(typeof body.warning === "string" && body.warning.length > 0);
    assertEquals(mock.rpcCalls.map((c) => c.name).sort(), ["create_coaching_program_full", "redeem_promo_and_grant_plan"]);
  } finally {
    restore();
  }
});
