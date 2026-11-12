// Lancer : deno test --no-check --allow-env --node-modules-dir=none supabase/functions/_shared/stripe-promotion-code_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { discountLabel, findActiveStripePromotionCode } from "./stripe-promotion-code.ts";

const original = globalThis.fetch;
function mockStripe(data: unknown[], status = 200) {
  const urls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    urls.push(String(input));
    return new Response(JSON.stringify({ data }), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return urls;
}
const COUPON = { valid: true, amount_off: 1000, percent_off: null, duration: "forever" };

Deno.test("libellés de réduction", () => {
  assertEquals(discountLabel(COUPON), "-10 € par mois");
  assertEquals(discountLabel({ percent_off: 20, duration: "repeating", duration_in_months: 3 }), "-20 % par mois pendant 3 mois");
  assertEquals(discountLabel({ amount_off: 450, duration: "once" }), "-4,50 € sur le premier mois");
});

Deno.test("code actif trouvé, sans tenir compte de la casse", async () => {
  const urls = mockStripe([{ id: "promo_1", code: "PARTENAIRE", active: true, coupon: COUPON, times_redeemed: 0 }]);
  try {
    const found = await findActiveStripePromotionCode("partenaire", "sk_test");
    assertEquals(found, { id: "promo_1", code: "PARTENAIRE", label: "-10 € par mois" });
    assertEquals(urls[0].includes("active=true"), true);
  } finally { globalThis.fetch = original; }
});

Deno.test("code expiré, épuisé ou coupon invalide → null", async () => {
  const past = Math.floor(Date.now() / 1000) - 60;
  for (const pc of [
    { id: "p", code: "X", active: true, coupon: COUPON, expires_at: past },
    { id: "p", code: "X", active: true, coupon: COUPON, max_redemptions: 2, times_redeemed: 2 },
    { id: "p", code: "X", active: true, coupon: { ...COUPON, valid: false } },
  ]) {
    mockStripe([pc]);
    try { assertEquals(await findActiveStripePromotionCode("X", "sk_test"), null); } finally { globalThis.fetch = original; }
  }
});

Deno.test("sans clé ou Stripe en erreur → null, sans exception", async () => {
  assertEquals(await findActiveStripePromotionCode("X", undefined), null);
  mockStripe([], 500);
  try { assertEquals(await findActiveStripePromotionCode("X", "sk_test"), null); } finally { globalThis.fetch = original; }
});
