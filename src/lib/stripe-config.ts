// Stripe product & price mapping
export const STRIPE_PLANS = {
  free: {
    name: "Gratuit",
    price: 0,
    priceId: null,
    mode: null,
    features: [
      "Tout l'outil débloqué",
      "60 crédits IA / mois",
      "3 audits IA / mois",
      "Communauté en lecture",
    ],
  },
  outil: {
    name: "L'Assistant Com'",
    price: 39,
    priceId: "price_1T7uZHIwPeG7GjpycpUQuMqf",
    productId: "prod_U66mTd9s81uGAY",
    mode: "subscription" as const,
    features: [
      "Générations IA illimitées",
      "Audits illimités",
      "Tous les modules Instagram, LinkedIn, Pinterest",
      "Calendrier éditorial",
      "Atelier de rédaction",
    ],
  },
  binome_monthly: {
    name: "Ton binôme de com'",
    price: 250,
    priceId: "price_1T7uZbIwPeG7Gjpy3arZSdx8",
    productId: "prod_U66n9TkhjJae5r",
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
    price: 1500,
    priceId: "price_1T7uZoIwPeG7GjpysrHPkLgh",
    productId: "prod_U66nHw9q4JTxHL",
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
    priceId: "price_1T7ua6IwPeG7GjpykaYM6Cqr",
    productId: "prod_U66ntcEvBRUkXF",
    mode: "payment" as const,
  },
} as const;

// Credit packs (one-time purchases)
export const CREDIT_PACKS = {
  pack_10: { credits: 10, price: 3.90, priceId: "price_1T7ubCIwPeG7GjpyJ8I0qPAM", mode: "payment" as const, label: "10 crédits", emoji: "⚡" },
  pack_30: { credits: 30, price: 8.90, priceId: "price_1T7ubQIwPeG7GjpyqFOfJu9e", mode: "payment" as const, label: "30 crédits", emoji: "⚡" },
  pack_60: { credits: 60, price: 14.90, priceId: "price_1T7ubbIwPeG7GjpyLTMfYjZw", mode: "payment" as const, label: "60 crédits", emoji: "🔥" },
} as const;
