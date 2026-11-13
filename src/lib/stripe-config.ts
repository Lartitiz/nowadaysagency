// Stripe product & price mapping.
// Montants en euros HT : Stripe ajoute la TVA (20 %) au paiement depuis le 13/11/2026.
// Les anciens prix TTC restent reconnus côté serveur (supabase/functions/_shared/checkout-catalog.ts).
export const STRIPE_PLANS = {
  free: {
    name: "Gratuit",
    price: 0,
    priceId: null,
    mode: null,
    features: [
      "Tout l'outil débloqué",
      "De quoi créer tes premiers contenus",
      "Des audits IA pour te situer",
      "Communauté en lecture",
    ],
  },
  outil: {
    name: "L'Assistant Com'",
    price: 39,
    priceId: "price_1UbFtAIwPeG7GjpyqP6fBplf",
    productId: "prod_U66mTd9s81uGAY",
    mode: "subscription" as const,
    features: [
      "Textes sans compter (contenus + audits)",
      "20 carrousels, 30 images et 3 vidéos par mois",
      "Tous les modules Instagram, LinkedIn, Pinterest",
      "Calendrier éditorial",
      "Atelier de rédaction",
    ],
  },
  binome_monthly: {
    name: "Ton binôme de com'",
    price: 325,
    priceId: "price_1UbFtBIwPeG7GjpypPHyQUO7",
    productId: "prod_VME2WszeRT47AU",
    mode: "subscription" as const,
    engagement: "6 mois",
    features: [
      "Tout le plan Outil",
      "Coaching individuel inclus",
      "Stratégie personnalisée",
      "Accès prioritaire aux nouvelles fonctionnalités",
    ],
  },
  binome_once: {
    name: "Ton binôme de com' (paiement unique)",
    price: 1950,
    priceId: "price_1UbFtCIwPeG7GjpytRH9hTiT",
    productId: "prod_VME2cb2SjUtniU",
    mode: "payment" as const,
    features: [
      "Tout le plan Outil pendant 6 mois",
      "Coaching individuel inclus",
      "Stratégie personnalisée",
    ],
  },
} as const;

export const STRIPE_PRODUCTS = {
  coaching: {
    name: "Coaching Individuel",
    price: 150,
    priceId: "price_1UbFtDIwPeG7GjpyaxvSdWB5",
    productId: "prod_U66ntcEvBRUkXF",
    mode: "payment" as const,
  },
} as const;

// Credit packs (one-time purchases)
export const CREDIT_PACKS = {
  pack_10: { credits: 10, price: 3.90, priceId: "price_1UbFtEIwPeG7GjpyJPOBEHiX", mode: "payment" as const, label: "10 crédits", emoji: "⚡" },
  pack_30: { credits: 30, price: 8.90, priceId: "price_1UbFtFIwPeG7Gjpyjzx2StVH", mode: "payment" as const, label: "30 crédits", emoji: "⚡" },
  pack_60: { credits: 60, price: 14.90, priceId: "price_1UbFtGIwPeG7GjpyVwwMVCsG", mode: "payment" as const, label: "60 crédits", emoji: "🔥" },
} as const;
