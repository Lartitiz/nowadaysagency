import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { subscriptionCheckout, CheckoutConflict } from "./subscription-checkout.ts";

const user = { id: "user-1", email: "test@example.com" };
const params = { mode: "subscription", line_items: [{ price: "price_1", quantity: 1 }] };
function fixture(opts: { status?: string; otherPrice?: boolean; databaseDown?: boolean } = {}) {
  let attempt: any;
  const keys: string[] = [];
  const requests: any[] = [];
  const admin = {
    from: () => {
      const b: any = { select: () => b, eq: () => b, update: () => b,
        maybeSingle: async () => ({ data: { stripe_customer_id: "cus_1" }, error: null }),
        then: (ok: any) => Promise.resolve({ error: null }).then(ok),
      }; return b;
    },
    rpc: async (_: string, args: any) => {
      if (opts.databaseDown) return { data: null, error: new Error("DB down") };
      attempt ??= { attempt_id: "stable", params: args.p_params, expires_at: new Date(Date.now() + 7200000).toISOString() };
      if (opts.otherPrice) attempt.params = { ...attempt.params, line_items: [{ price: "price_other" }] };
      return { data: attempt, error: null };
    },
  };
  const stripe = {
    subscriptions: { list: async function* () { if (opts.status) yield { id: "sub_1", status: opts.status }; } },
    checkout: { sessions: {
      list: async function* () {},
      create: async (p: any, o: any) => { requests.push(p); keys.push(o.idempotencyKey); return { id: "cs_same", url: "https://checkout.stripe.com/same" }; },
    } },
  };
  return { admin, stripe, keys, requests };
}
Deno.test("deux onglets : même réservation, mêmes paramètres et clé d'idempotence Stripe", async () => {
  const f = fixture();
  const [a, b] = await Promise.all([subscriptionCheckout(f.stripe, f.admin, user, params), subscriptionCheckout(f.stripe, f.admin, user, params)]);
  assertEquals(a.url, b.url);
  assertEquals(f.keys, ["subscription-checkout-stable", "subscription-checkout-stable"]);
  assertEquals(f.requests[0], f.requests[1]);
});
for (const status of ["active", "trialing", "past_due", "unpaid", "incomplete", "paused"]) {
  Deno.test(`abonnement ${status} : pas de second checkout même sans webhook local`, async () => {
    const f = fixture({ status });
    await assertRejects(() => subscriptionCheckout(f.stripe, f.admin, user, params), CheckoutConflict);
    assertEquals(f.keys.length, 0);
  });
}
Deno.test("offre différente dans le deuxième onglet : aucun second paiement", async () => {
  const f = fixture({ otherPrice: true });
  await assertRejects(() => subscriptionCheckout(f.stripe, f.admin, user, params), CheckoutConflict);
  assertEquals(f.keys.length, 0);
});
Deno.test("réservation indisponible : aucun appel de création Stripe", async () => {
  const f = fixture({ databaseDown: true });
  await assertRejects(() => subscriptionCheckout(f.stripe, f.admin, user, params));
  assertEquals(f.keys.length, 0);
});
