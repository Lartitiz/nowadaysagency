// Vérifie que la suppression de compte annule bien l'abonnement Stripe actif
// AVANT de toucher aux données locales (voir index.ts, appelé avant phase1).
//
// Lancer : deno test supabase/functions/delete-account/cancel-subscription_test.ts --allow-all

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { cancelActiveStripeSubscription, type SubscriptionRow } from "./cancel-subscription.ts";

/**
 * Faux client Supabase chainable, conscient de la table. Sert la même ligne
 * pour .single() ET .maybeSingle() (cf. reference_deno_test_fake_supabase) :
 * même si cancel-subscription.ts n'utilise aujourd'hui que .maybeSingle(),
 * un fake qui ne câble qu'une des deux variantes casse silencieusement si le
 * code de prod migre un jour vers l'autre.
 */
function fakeAdmin(row: SubscriptionRow | null, opts: { error?: string } = {}) {
  // deno-lint-ignore no-explicit-any
  const b: any = {};
  b.select = () => b;
  b.eq = () => b;
  const result = opts.error
    ? { data: null, error: { message: opts.error } }
    : { data: row, error: null };
  b.single = () => Promise.resolve(result);
  b.maybeSingle = () => Promise.resolve(result);
  return { from: () => b };
}

function fakeStripe(opts: { throwMessage?: string } = {}) {
  const calls: string[] = [];
  return {
    subscriptions: {
      cancel: (id: string) => {
        calls.push(id);
        if (opts.throwMessage) return Promise.reject(new Error(opts.throwMessage));
        return Promise.resolve({});
      },
    },
    _calls: calls,
  };
}

Deno.test("plan gratuit (pas d'abonnement Stripe) → rien à annuler, Stripe jamais appelé", async () => {
  const admin = fakeAdmin({ stripe_subscription_id: null, status: null });
  const stripe = fakeStripe();
  const r = await cancelActiveStripeSubscription("u1", admin, stripe);
  assertEquals(r, { canceled: false });
  assertEquals(stripe._calls.length, 0);
});

Deno.test("aucune ligne subscriptions du tout → rien à annuler", async () => {
  const admin = fakeAdmin(null);
  const stripe = fakeStripe();
  const r = await cancelActiveStripeSubscription("u1", admin, stripe);
  assertEquals(r, { canceled: false });
  assertEquals(stripe._calls.length, 0);
});

Deno.test("abonnement déjà canceled en DB → pas de nouvel appel Stripe", async () => {
  const admin = fakeAdmin({ stripe_subscription_id: "sub_123", status: "canceled" });
  const stripe = fakeStripe();
  const r = await cancelActiveStripeSubscription("u1", admin, stripe);
  assertEquals(r, { canceled: false });
  assertEquals(stripe._calls.length, 0);
});

Deno.test("abonnement actif → Stripe annulé avec le bon id, canceled:true", async () => {
  const admin = fakeAdmin({ stripe_subscription_id: "sub_active_1", status: "active" });
  const stripe = fakeStripe();
  const r = await cancelActiveStripeSubscription("u1", admin, stripe);
  assertEquals(r, { canceled: true });
  assertEquals(stripe._calls, ["sub_active_1"]);
});

Deno.test("Stripe dit déjà annulé côté leur (No such subscription) → pas d'erreur bloquante", async () => {
  const admin = fakeAdmin({ stripe_subscription_id: "sub_ghost", status: "active" });
  const stripe = fakeStripe({ throwMessage: "No such subscription: 'sub_ghost'" });
  const r = await cancelActiveStripeSubscription("u1", admin, stripe);
  assertEquals(r, { canceled: false });
});

Deno.test("échec Stripe générique (ex: réseau/API down) → error remonté pour bloquer la suppression", async () => {
  const admin = fakeAdmin({ stripe_subscription_id: "sub_active_2", status: "active" });
  const stripe = fakeStripe({ throwMessage: "Stripe API timeout" });
  const r = await cancelActiveStripeSubscription("u1", admin, stripe);
  assertEquals(r.canceled, false);
  assertEquals(r.error, "Stripe API timeout");
});

Deno.test("erreur de lecture de la table subscriptions → error remonté (fail-closed)", async () => {
  const admin = fakeAdmin(null, { error: "db down" });
  const stripe = fakeStripe();
  const r = await cancelActiveStripeSubscription("u1", admin, stripe);
  assertEquals(r.canceled, false);
  assertEquals(r.error, "db down");
  assertEquals(stripe._calls.length, 0);
});
