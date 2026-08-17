// Tests de bout en bout du webhook Stripe : on simule un event réel par type important,
// et on vérifie que la table `subscriptions` (et ses tables satellites) est mise à jour
// comme attendu, avec des faux clients Stripe/Supabase injectés via handleStripeWebhookRequest
// (aucun réseau, aucune vraie DB).
//
// Contexte de l'incident (24-31/07/2026) que ces tests couvrent : un changement de version
// d'API Stripe "Basil" a déplacé current_period_start/end sur les items de la subscription
// et invoice.subscription vers invoice.parent.subscription_details.subscription. Le webhook a
// renvoyé des 500 pendant 8 jours et des paiements ont été encaissés sans jamais activer
// l'accès. src/test/stripe-api-guard.test.ts scanne déjà le code source pour ces champs
// périmés (garde statique) ; ce fichier teste le COMPORTEMENT réel du handler avec des
// payloads Basil réalistes, ce que le scan statique ne peut pas voir.
//
// Lancer : deno test --no-check --allow-all --node-modules-dir=none --no-lock \
//   supabase/functions/stripe-webhook/index.test.ts
// --node-modules-dir=none : ce fichier importe npm:@supabase/supabase-js (via index.ts) et
//   Deno résout mal les specifiers npm: dans ce repo dès qu'un node_modules/ voisin existe
//   (celui de l'app React, sans rapport) → sans le flag, "Could not find a matching package".
// --no-lock : sans lui, `deno test` réécrit deno.lock et en fait tomber des entrées npm de
//   l'app React (react-router-dom, mammoth, xlsx, plusieurs @radix-ui/*) qui ne sont pas
//   dans le graphe de dépendances Deno-side — un effet de bord vécu et à ne pas recommitter.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// index.ts construit son client Stripe ET son client Supabase au chargement du module
// (pas d'init paresseuse) : `new Stripe("")` lève immédiatement ("Neither apiKey nor
// config.authenticator provided"). Un `import` statique serait hissé et évalué AVANT ces
// Deno.env.set (l'ordre d'évaluation ESM exécute tous les imports statiques avant le corps
// du module qui les déclare) → il faut poser les env vars puis importer dynamiquement.
Deno.env.set("STRIPE_SECRET_KEY", "sk_test_fake");
Deno.env.set("STRIPE_WEBHOOK_SECRET", "whsec_fake");
Deno.env.set("SUPABASE_URL", "http://localhost");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test");

const { handleStripeWebhookRequest } = await import("./index.ts");

const STUDIO_PRICE_ID = "price_1T7uZbIwPeG7Gjpy3arZSdx8";

// ---------- faux client Supabase (chainable, en mémoire) ----------
//
// Contrairement au fake de plan-limiter_test.ts (branché table par table), celui-ci filtre
// génériquement sur les colonnes passées à .eq() : .single() et .maybeSingle() servent donc
// TOUJOURS la même ligne pour une table donnée (cf. reference_deno_test_fake_supabase :
// un fake qui ne câble que .single() fait échouer à tort tout code migré vers .maybeSingle()).

type Row = Record<string, unknown>;
type Call = { table: string; op: string; payload?: unknown };

function createFakeSupabase(
  seed: Record<string, Row[]> = {},
  opts: { failOn?: { table: string; op: "insert" | "update" | "upsert" | "delete" } } = {},
) {
  const tables: Record<string, Row[]> = {};
  for (const [t, rows] of Object.entries(seed)) tables[t] = rows.map((r) => ({ ...r }));
  const calls: Call[] = [];

  const shouldFail = (table: string, op: string) =>
    opts.failOn?.table === table && opts.failOn?.op === op;

  function from(table: string) {
    if (!tables[table]) tables[table] = [];
    const filters: [string, unknown][] = [];
    const find = () => tables[table].find((r) => filters.every(([c, v]) => r[c] === v));

    // deno-lint-ignore no-explicit-any
    const builder: any = {};
    builder.select = () => builder;
    builder.eq = (col: string, val: unknown) => {
      filters.push([col, val]);
      return builder;
    };
    builder.order = () => builder;
    builder.limit = () => builder;
    builder.maybeSingle = async () => ({ data: find() ?? null, error: null });
    builder.single = async () => ({ data: find() ?? null, error: null });

    builder.insert = async (row: Row) => {
      calls.push({ table, op: "insert", payload: row });
      if (shouldFail(table, "insert")) {
        return { data: null, error: { message: "fake insert failure", code: "TEST" } };
      }
      tables[table].push({ ...row });
      return { data: null, error: null };
    };

    builder.upsert = async (row: Row, upsertOpts?: { onConflict?: string }) => {
      calls.push({ table, op: "upsert", payload: row });
      if (shouldFail(table, "upsert")) {
        return { data: null, error: { message: "fake upsert failure", code: "TEST" } };
      }
      const conflictCol = upsertOpts?.onConflict ?? "id";
      const idx = tables[table].findIndex((r) => r[conflictCol] === row[conflictCol]);
      if (idx >= 0) tables[table][idx] = { ...tables[table][idx], ...row };
      else tables[table].push({ ...row });
      return { data: null, error: null };
    };

    builder.update = (patch: Row) => ({
      eq: async (col: string, val: unknown) => {
        calls.push({ table, op: "update", payload: { ...patch, _eq: [col, val] } });
        if (shouldFail(table, "update")) {
          return { data: null, error: { message: "fake update failure", code: "TEST" } };
        }
        tables[table].forEach((r) => {
          if (r[col] === val) Object.assign(r, patch);
        });
        return { data: null, error: null };
      },
    });

    builder.delete = () => ({
      eq: async (col: string, val: unknown) => {
        calls.push({ table, op: "delete", payload: { col, val } });
        if (shouldFail(table, "delete")) {
          return { data: null, error: { message: "fake delete failure", code: "TEST" } };
        }
        tables[table] = tables[table].filter((r) => r[col] !== val);
        return { data: null, error: null };
      },
    });

    return builder;
  }

  return {
    from,
    rpc: async (name: string, args?: unknown) => {
      calls.push({ table: "_rpc", op: name, payload: args });
      return { data: null, error: null };
    },
    tables,
    calls,
    // deno-lint-ignore no-explicit-any
  } as any;
}

// ---------- faux client Stripe ----------

function createFakeStripe(cfg: {
  event?: Row;
  constructEventError?: boolean;
  subscriptionRetrieve?: Row;
  lineItems?: Row;
  product?: Row;
} = {}) {
  const calls: Call[] = [];
  return {
    webhooks: {
      constructEventAsync: async () => {
        calls.push({ table: "stripe", op: "constructEventAsync" });
        if (cfg.constructEventError) throw new Error("simulated invalid signature");
        return cfg.event;
      },
    },
    subscriptions: {
      retrieve: async (id: string) => {
        calls.push({ table: "stripe", op: "subscriptions.retrieve", payload: id });
        return cfg.subscriptionRetrieve;
      },
      update: async (id: string, patch: Row) => {
        calls.push({ table: "stripe", op: "subscriptions.update", payload: { id, patch } });
        return { ...cfg.subscriptionRetrieve, ...patch };
      },
    },
    checkout: {
      sessions: {
        listLineItems: async () => cfg.lineItems ?? { data: [] },
      },
    },
    products: {
      retrieve: async () => cfg.product ?? {},
    },
    _calls: calls,
    // deno-lint-ignore no-explicit-any
  } as any;
}

// deno-lint-ignore no-explicit-any
function fakeEmailSender(): { send: any; calls: { event: string; userId: unknown }[] } {
  const calls: { event: string; userId: unknown }[] = [];
  return {
    calls,
    send: async (event: string, userId: unknown) => {
      calls.push({ event, userId });
    },
  };
}

function stripeEvent(id: string, type: string, object: Row): Row {
  return { id, type, data: { object } };
}

function webhookRequest(body: Row, signature: string | null = "t=1,v1=fake") {
  const headers = new Headers();
  if (signature) headers.set("stripe-signature", signature);
  return new Request("http://localhost/stripe-webhook", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

// ---------- checkout.session.completed ----------

Deno.test("checkout.session.completed (subscription, plan outil) : active l'accès et envoie l'email", async () => {
  const stripe = createFakeStripe({
    event: stripeEvent("evt_outil", "checkout.session.completed", {
      id: "cs_1",
      mode: "subscription",
      customer: "cus_1",
      subscription: "sub_1",
      metadata: { user_id: "user-1" },
    }),
    subscriptionRetrieve: {
      id: "sub_1",
      cancel_at: null,
      items: { data: [{ price: { id: "price_outil" }, current_period_start: 1735689600, current_period_end: 1738368000 }] },
    },
  });
  const supabase = createFakeSupabase({ profiles: [{ user_id: "user-1", current_plan: "free" }] });
  const email = fakeEmailSender();

  const res = await handleStripeWebhookRequest(webhookRequest({}), { stripe, supabase, sendEmailEvent: email.send });
  assertEquals(res.status, 200);

  assertEquals(supabase.tables.subscriptions.length, 1);
  const sub = supabase.tables.subscriptions[0];
  assertEquals(sub.user_id, "user-1");
  assertEquals(sub.plan, "outil");
  assertEquals(sub.status, "active");
  assertEquals(sub.stripe_subscription_id, "sub_1");
  assertEquals(sub.stripe_price_id, "price_outil");
  assertEquals(sub.current_period_start, new Date(1735689600 * 1000).toISOString());
  assertEquals(sub.current_period_end, new Date(1738368000 * 1000).toISOString());
  assertEquals(sub.studio_start_date, null);

  assertEquals(supabase.tables.profiles[0].current_plan, "outil");
  assertEquals(email.calls, [{ event: "subscription_activated", userId: "user-1" }]);
});

Deno.test("checkout.session.completed (subscription, plan studio) : fixe cancel_at à 6 mois et bascule profile en binome", async () => {
  const stripe = createFakeStripe({
    event: stripeEvent("evt_studio", "checkout.session.completed", {
      id: "cs_2",
      mode: "subscription",
      customer: "cus_2",
      subscription: "sub_2",
      metadata: { user_id: "user-2" },
    }),
    subscriptionRetrieve: {
      id: "sub_2",
      cancel_at: null,
      items: { data: [{ price: { id: STUDIO_PRICE_ID }, current_period_start: 1735689600, current_period_end: 1738368000 }] },
    },
  });
  const supabase = createFakeSupabase({ profiles: [{ user_id: "user-2", current_plan: "free" }] });
  const email = fakeEmailSender();

  const res = await handleStripeWebhookRequest(webhookRequest({}), { stripe, supabase, sendEmailEvent: email.send });
  assertEquals(res.status, 200);

  const updateCall = stripe._calls.find((c: Call) => c.op === "subscriptions.update");
  assertEquals(updateCall !== undefined, true);

  const sub = supabase.tables.subscriptions[0];
  assertEquals(sub.plan, "studio");
  assertEquals(sub.cancel_at !== null, true);
  assertEquals(sub.studio_start_date !== null, true);
  assertEquals(sub.studio_end_date !== null, true);
  assertEquals(supabase.tables.profiles[0].current_plan, "binome");
  assertEquals(email.calls, [{ event: "subscription_activated", userId: "user-2" }]);
});

Deno.test("checkout.session.completed sans user_id en metadata : aucune écriture (mais réponse 200)", async () => {
  const stripe = createFakeStripe({
    event: stripeEvent("evt_no_user", "checkout.session.completed", {
      id: "cs_3",
      mode: "subscription",
      customer: "cus_3",
      subscription: "sub_3",
      metadata: {},
    }),
  });
  const supabase = createFakeSupabase({ subscriptions: [] });
  const email = fakeEmailSender();

  const res = await handleStripeWebhookRequest(webhookRequest({}), { stripe, supabase, sendEmailEvent: email.send });
  assertEquals(res.status, 200);
  assertEquals(supabase.tables.subscriptions.length, 0);
  assertEquals(email.calls.length, 0);
});

// ---------- customer.subscription.updated ----------

Deno.test("customer.subscription.updated : met à jour statut et périodes (pas d'email)", async () => {
  const stripe = createFakeStripe({
    event: stripeEvent("evt_update", "customer.subscription.updated", {
      id: "sub_4",
      status: "active",
      cancel_at: null,
      canceled_at: null,
      items: { data: [{ current_period_start: 1735689600, current_period_end: 1738368000 }] },
    }),
  });
  const supabase = createFakeSupabase({
    subscriptions: [{ stripe_subscription_id: "sub_4", user_id: "user-4", plan: "outil", status: "past_due" }],
  });
  const email = fakeEmailSender();

  const res = await handleStripeWebhookRequest(webhookRequest({}), { stripe, supabase, sendEmailEvent: email.send });
  assertEquals(res.status, 200);

  const sub = supabase.tables.subscriptions[0];
  assertEquals(sub.status, "active");
  assertEquals(sub.current_period_start, new Date(1735689600 * 1000).toISOString());
  assertEquals(sub.current_period_end, new Date(1738368000 * 1000).toISOString());
  assertEquals(email.calls.length, 0);
});

// ---------- customer.subscription.deleted ----------

Deno.test("customer.subscription.deleted : annule l'abonnement, repasse le profil en free, notifie", async () => {
  const stripe = createFakeStripe({
    event: stripeEvent("evt_deleted", "customer.subscription.deleted", { id: "sub_5" }),
  });
  const supabase = createFakeSupabase({
    subscriptions: [{ stripe_subscription_id: "sub_5", user_id: "user-5", status: "active" }],
    profiles: [{ user_id: "user-5", current_plan: "outil" }],
  });
  const email = fakeEmailSender();

  const res = await handleStripeWebhookRequest(webhookRequest({}), { stripe, supabase, sendEmailEvent: email.send });
  assertEquals(res.status, 200);

  const sub = supabase.tables.subscriptions[0];
  assertEquals(sub.status, "canceled");
  assertEquals(sub.canceled_at !== null, true);
  assertEquals(supabase.tables.profiles[0].current_plan, "free");
  assertEquals(email.calls, [{ event: "subscription_cancelled", userId: "user-5" }]);
});

// ---------- invoice.payment_failed ----------

Deno.test("invoice.payment_failed : passe l'abonnement en past_due, notifie, envoie l'email", async () => {
  const stripe = createFakeStripe({
    event: stripeEvent("evt_failed", "invoice.payment_failed", {
      id: "in_1",
      parent: { subscription_details: { subscription: "sub_6" } },
    }),
  });
  const supabase = createFakeSupabase({
    subscriptions: [{ stripe_subscription_id: "sub_6", user_id: "user-6", status: "active" }],
  });
  const email = fakeEmailSender();

  const res = await handleStripeWebhookRequest(webhookRequest({}), { stripe, supabase, sendEmailEvent: email.send });
  assertEquals(res.status, 200);

  assertEquals(supabase.tables.subscriptions[0].status, "past_due");
  assertEquals(supabase.tables.notifications.length, 1);
  assertEquals(supabase.tables.notifications[0].user_id, "user-6");
  assertEquals(email.calls, [{ event: "payment_failed", userId: "user-6" }]);
});

Deno.test("invoice.payment_failed sans subscription id (ni ancien ni Basil) : no-op, pas de 500", async () => {
  const stripe = createFakeStripe({
    event: stripeEvent("evt_failed_no_sub", "invoice.payment_failed", { id: "in_2" }),
  });
  const supabase = createFakeSupabase();
  const email = fakeEmailSender();

  const res = await handleStripeWebhookRequest(webhookRequest({}), { stripe, supabase, sendEmailEvent: email.send });
  assertEquals(res.status, 200);
  assertEquals(supabase.tables.subscriptions?.length ?? 0, 0);
  assertEquals(email.calls.length, 0);
});

// ---------- invoice.paid ----------

Deno.test("invoice.paid (plan studio) : incrémente studio_months_paid et repasse actif", async () => {
  const stripe = createFakeStripe({
    event: stripeEvent("evt_paid_studio", "invoice.paid", {
      id: "in_3",
      parent: { subscription_details: { subscription: "sub_7" } },
    }),
  });
  const supabase = createFakeSupabase({
    subscriptions: [{ stripe_subscription_id: "sub_7", plan: "studio", studio_months_paid: 2, status: "past_due" }],
  });

  const res = await handleStripeWebhookRequest(webhookRequest({}), { stripe, supabase });
  assertEquals(res.status, 200);

  const sub = supabase.tables.subscriptions[0];
  assertEquals(sub.studio_months_paid, 3);
  assertEquals(sub.status, "active");
});

Deno.test("invoice.paid (plan non-studio) : ne touche pas studio_months_paid", async () => {
  const stripe = createFakeStripe({
    event: stripeEvent("evt_paid_outil", "invoice.paid", {
      id: "in_4",
      parent: { subscription_details: { subscription: "sub_8" } },
    }),
  });
  const supabase = createFakeSupabase({
    subscriptions: [{ stripe_subscription_id: "sub_8", plan: "outil", studio_months_paid: 0, status: "active" }],
  });

  const res = await handleStripeWebhookRequest(webhookRequest({}), { stripe, supabase });
  assertEquals(res.status, 200);
  assertEquals(supabase.tables.subscriptions[0].studio_months_paid, 0);
});

// ---------- vérification de signature ----------

Deno.test("signature absente : rejette proprement en 400, ne touche jamais Stripe ni Supabase", async () => {
  const stripe = createFakeStripe({ event: stripeEvent("evt_x", "invoice.paid", { id: "in_x" }) });
  const supabase = createFakeSupabase();

  const res = await handleStripeWebhookRequest(webhookRequest({}, null), { stripe, supabase });
  assertEquals(res.status, 400);
  assertEquals(stripe._calls.length, 0);
  assertEquals(supabase.calls.length, 0);
});

Deno.test("signature invalide (constructEventAsync rejette) : 400, aucun traitement", async () => {
  const stripe = createFakeStripe({ constructEventError: true });
  const supabase = createFakeSupabase();

  const res = await handleStripeWebhookRequest(webhookRequest({}), { stripe, supabase });
  assertEquals(res.status, 400);
  assertEquals(supabase.calls.length, 0);
});

// ---------- idempotence ----------

Deno.test("event.id dupliqué : le deuxième appel ne réécrit rien et ne renvoie pas d'email", async () => {
  const stripe = createFakeStripe({
    event: stripeEvent("evt_dup", "checkout.session.completed", {
      id: "cs_dup",
      mode: "subscription",
      customer: "cus_dup",
      subscription: "sub_dup",
      metadata: { user_id: "user-dup" },
    }),
    subscriptionRetrieve: {
      id: "sub_dup",
      cancel_at: null,
      items: { data: [{ price: { id: "price_outil" }, current_period_start: 1735689600, current_period_end: 1738368000 }] },
    },
  });
  const supabase = createFakeSupabase({ profiles: [{ user_id: "user-dup", current_plan: "free" }] });
  const email = fakeEmailSender();

  const first = await handleStripeWebhookRequest(webhookRequest({}), { stripe, supabase, sendEmailEvent: email.send });
  assertEquals(first.status, 200);
  assertEquals(supabase.tables.subscriptions.length, 1);
  assertEquals(email.calls.length, 1);
  assertEquals(stripe._calls.filter((c: Call) => c.op === "subscriptions.retrieve").length, 1);
  assertEquals(supabase.tables.webhook_events.length, 1);

  const second = await handleStripeWebhookRequest(webhookRequest({}), { stripe, supabase, sendEmailEvent: email.send });
  assertEquals(second.status, 200);
  const secondBody = await second.json();
  assertEquals(secondBody.duplicate, true);

  // Le traitement métier n'a jamais été rejoué : aucune nouvelle ligne, aucun nouvel email,
  // et Stripe n'a pas été rappelé (la vérification d'idempotence court-circuite AVANT le switch).
  assertEquals(supabase.tables.subscriptions.length, 1);
  assertEquals(email.calls.length, 1);
  assertEquals(stripe._calls.filter((c: Call) => c.op === "subscriptions.retrieve").length, 1);
  assertEquals(supabase.tables.webhook_events.length, 1);
});

// ---------- échec d'écriture pendant le traitement (le vrai visage de l'incident) ----------

Deno.test("échec DB pendant l'activation : 500 (pas un 200 menteur) + rollback de l'enregistrement d'idempotence pour permettre le retry Stripe", async () => {
  const stripe = createFakeStripe({
    event: stripeEvent("evt_fail_write", "checkout.session.completed", {
      id: "cs_fail",
      mode: "subscription",
      customer: "cus_fail",
      subscription: "sub_fail",
      metadata: { user_id: "user-fail" },
    }),
    subscriptionRetrieve: {
      id: "sub_fail",
      cancel_at: null,
      items: { data: [{ price: { id: "price_outil" }, current_period_start: 1735689600, current_period_end: 1738368000 }] },
    },
  });
  // Simule exactement le scénario de l'incident : le paiement est encaissé côté Stripe,
  // mais l'écriture qui active l'accès échoue (DB down, contrainte, etc.).
  const supabase = createFakeSupabase({}, { failOn: { table: "subscriptions", op: "upsert" } });
  const email = fakeEmailSender();

  const res = await handleStripeWebhookRequest(webhookRequest({}), { stripe, supabase, sendEmailEvent: email.send });
  assertEquals(res.status, 500);

  // L'entrée webhook_events posée avant le switch doit être retirée : sans ce rollback,
  // le check d'idempotence traiterait à tort les retries Stripe comme des doublons déjà gérés.
  assertEquals(supabase.tables.webhook_events.length, 0);
  assertEquals(supabase.tables.subscriptions.length, 0);
  assertEquals(email.calls.length, 0);
});
