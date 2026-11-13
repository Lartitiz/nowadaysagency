/** The existing sellable Stripe prices. Never infer a plan from an unknown price. */
export const CHECKOUT_CATALOG: Record<string, { mode: "payment" | "subscription"; plan?: string; credits?: number; product?: string; historical?: boolean }> = {
  // Prix HT, TVA ajoutée en plus par Stripe (depuis le 13/11/2026).
  price_1UbFtAIwPeG7GjpyqP6fBplf: { mode: "subscription", plan: "outil" },
  price_1UbFtBIwPeG7GjpypPHyQUO7: { mode: "subscription", plan: "binome" },
  price_1UbFtCIwPeG7GjpytRH9hTiT: { mode: "payment", plan: "binome", product: "studio_once" },
  price_1UbFtEIwPeG7GjpyJPOBEHiX: { mode: "payment", credits: 10 },
  price_1UbFtFIwPeG7Gjpyjzx2StVH: { mode: "payment", credits: 30 },
  price_1UbFtGIwPeG7GjpyVwwMVCsG: { mode: "payment", credits: 60 },
  price_1UbFtDIwPeG7GjpyaxvSdWB5: { mode: "payment", product: "coaching" },
  // Historical prices remain resolvable for Stripe retries, old receipts and
  // the subscriptions still billed on them (TTC, sans TVA ajoutée) : on ne les migre pas.
  price_1T7uZHIwPeG7GjpycpUQuMqf: { mode: "subscription", plan: "outil", historical: true },
  price_1ULVaXIwPeG7GjpydOgyy6d1: { mode: "subscription", plan: "binome", historical: true },
  price_1ULVaeIwPeG7GjpydIGgEdV2: { mode: "payment", plan: "binome", product: "studio_once", historical: true },
  price_1T7uZbIwPeG7Gjpy3arZSdx8: { mode: "subscription", plan: "binome", historical: true },
  price_1T7ubCIwPeG7GjpyJ8I0qPAM: { mode: "payment", credits: 10, historical: true },
  price_1T7ubQIwPeG7GjpyqFOfJu9e: { mode: "payment", credits: 30, historical: true },
  price_1T7ubbIwPeG7GjpyLTMfYjZw: { mode: "payment", credits: 60, historical: true },
  price_1T7uZoIwPeG7GjpysrHPkLgh: { mode: "payment", plan: "binome", product: "studio_once", historical: true },
  price_1T7ua6IwPeG7GjpykaYM6Cqr: { mode: "payment", product: "coaching", historical: true },
};
export function checkoutOffer(price: string, mode: string, allowHistorical = true) {
  const offer = CHECKOUT_CATALOG[price];
  if (!offer || offer.mode !== mode || (!allowHistorical && offer.historical)) throw new Error("unknown_checkout_offer");
  return offer;
}
export function normalizedPaidPlan(plan: string) {
  return ["studio", "now_pilot"].includes(plan) ? "binome" : plan;
}
