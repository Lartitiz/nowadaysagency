// Stripe product & price mapping
export const STRIPE_PLANS = {
  free: {
    name: "Gratuit",
    price: 0,
    priceId: null,
    mode: null,
    features: [
      "3 générations IA / mois",
      "1 audit / mois",
      "Accès au branding de base",
    ],
  },
  outil: {
    name: "Outil",
    price: 39,
    priceId: "price_1T3ionI0YZbTj9ITVDBDYXMr",
    productId: "prod_U1mNtVtFHNrlNy",
    mode: "subscription" as const,
    features: [
      "Générations IA illimitées",
      "Audits illimités",
      "Tous les modules Instagram, LinkedIn, Pinterest",
      "Calendrier éditorial",
      "Atelier de rédaction",
    ],
  },
  studio_monthly: {
    name: "Now Studio",
    price: 250,
    priceId: "price_1T3ipcI0YZbTj9ITlKOQN5Tm",
    productId: "prod_U1mOM9l58BhlY3",
    mode: "subscription" as const,
    engagement: "6 mois",
    features: [
      "Tout le plan Outil",
      "Coaching individuel inclus",
      "Stratégie personnalisée",
      "Accès prioritaire aux nouvelles fonctionnalités",
    ],
  },
  studio_once: {
    name: "Now Studio (paiement unique)",
    price: 1500,
    priceId: "price_1T3iq5I0YZbTj9ITnDSpkNWN",
    productId: "prod_U1mO5DAp2VmRoR",
    mode: "payment" as const,
    features: [
      "Tout le plan Outil pendant 6 mois",
      "Coaching individuel inclus",
      "Stratégie personnalisée",
    ],
  },
  pro: {
    name: "Pro",
    price: 79,
    priceId: null,
    mode: "subscription" as const,
    features: [
      "Tout le plan Outil",
      "Workspaces client·es illimités",
      "Dashboard coach multi-clients",
      "Invitations client·es",
      "Quotas IA par workspace",
    ],
  },
} as const;

export const STRIPE_PRODUCTS = {
  coaching: {
    name: "Coaching Individuel",
    price: 150,
    priceId: "price_1T3irCI0YZbTj9ITc6u9ocSE",
    productId: "prod_U1mQHY2k0DJTA7",
    mode: "payment" as const,
  },
  audit_perso: {
    name: "Audit Personnalisé",
    price: 200,
    priceId: "price_1T3irpI0YZbTj9IT8EtRTNW0",
    productId: "prod_U1mQpx8mgn8Wk1",
    mode: "payment" as const,
  },
  weekend: {
    name: "Weekend Bourgogne",
    price: 450,
    priceId: "price_1T3is2I0YZbTj9ITseeo04eS",
    productId: "prod_U1mQ2KwUHQeUFn",
    mode: "payment" as const,
  },
} as const;

// AI usage limits per plan
export const AI_LIMITS = {
  free: { generations: 3, audits: 1 },
  outil: { generations: Infinity, audits: Infinity },
  pro: { generations: Infinity, audits: Infinity },
  studio: { generations: Infinity, audits: Infinity },
  now_pilot: { generations: Infinity, audits: Infinity },
} as const;
