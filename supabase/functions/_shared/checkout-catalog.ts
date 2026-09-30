/** The existing sellable Stripe prices. Never infer a plan from an unknown price. */
export const CHECKOUT_CATALOG: Record<string, { mode: "payment" | "subscription"; plan?: string; credits?: number; product?: string }> = {
  price_1T7uZHIwPeG7GjpycpUQuMqf: { mode: "subscription", plan: "outil" },
  price_1ULVaXIwPeG7GjpydOgyy6d1: { mode: "subscription", plan: "binome" },
  price_1ULVaeIwPeG7GjpydIGgEdV2: { mode: "payment", plan: "binome", product: "studio_once" },
  // Historical prices remain resolvable for Stripe retries and old receipts.
  price_1T7uZbIwPeG7Gjpy3arZSdx8: { mode: "subscription", plan: "binome" },
  price_1T7ubCIwPeG7GjpyJ8I0qPAM: { mode: "payment", credits: 10 },
  price_1T7ubQIwPeG7GjpyqFOfJu9e: { mode: "payment", credits: 30 },
  price_1T7ubbIwPeG7GjpyLTMfYjZw: { mode: "payment", credits: 60 },
  price_1T7uZoIwPeG7GjpysrHPkLgh: { mode: "payment", plan: "binome", product: "studio_once" },
  price_1T7ua6IwPeG7GjpykaYM6Cqr: { mode: "payment", product: "coaching" },
};
export function checkoutOffer(price: string, mode: string) {
  const offer = CHECKOUT_CATALOG[price];
  if (!offer || offer.mode !== mode) throw new Error("unknown_checkout_offer");
  return offer;
}
export function normalizedPaidPlan(plan: string) {
  return ["studio", "now_pilot"].includes(plan) ? "binome" : plan;
}
