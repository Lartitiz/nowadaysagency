import {
  ACTIVITY_SECTIONS as DEFAULT_ACTIVITY_SECTIONS,
  BLOCKERS as DEFAULT_BLOCKERS,
  OBJECTIVES as DEFAULT_OBJECTIVES,
} from "./onboarding-constants";

export const ACTIVITY_SECTIONS_REAL_ESTATE = [
  {
    label: "Immobilier & investissement",
    items: [
      { key: "marchand_biens", emoji: "🏘️", label: "Marchand·e de biens", desc: "achat-revente, découpe d'immeubles, valorisation foncière" },
      { key: "investisseur_locatif", emoji: "🏠", label: "Investisseur·euse locatif", desc: "location meublée, nue, courte durée, gestion patrimoniale" },
      { key: "promoteur", emoji: "🏗️", label: "Promoteur·trice immobilier", desc: "construction, programmes neufs, lotissements" },
      { key: "conseil_patrimonial", emoji: "📊", label: "Conseil patrimonial", desc: "CGP, optimisation fiscale, gestion de patrimoine" },
      { key: "courtier", emoji: "💰", label: "Courtier·ère", desc: "crédit immobilier, financement, montages" },
      { key: "agent_immo", emoji: "🔑", label: "Agent·e immobilier", desc: "transaction, location, gestion d'agence" },
    ],
  },
  {
    label: "Formation & accompagnement",
    items: [
      { key: "formateur_immo", emoji: "🎓", label: "Formateur·trice immobilier", desc: "formations, mentorat, coaching investisseurs" },
      { key: "consultant_immo", emoji: "💼", label: "Consultant·e immobilier", desc: "conseil, audit, accompagnement opérationnel" },
    ],
  },
];

export const BLOCKERS_REAL_ESTATE = [
  { key: "credibility", emoji: "🤝", label: "Construire ma crédibilité auprès des investisseurs" },
  { key: "no_time", emoji: "⏰", label: "Pas le temps entre les opérations et la prospection" },
  { key: "lost", emoji: "😵", label: "Sais pas comment me différencier du marché" },
  { key: "expert_jargon", emoji: "🎓", label: "Difficile de vulgariser sans perdre en expertise" },
  { key: "regularite", emoji: "📅", label: "Pas régulier·e dans ma communication" },
  { key: "reseau", emoji: "🌐", label: "Mon réseau est limité, je dois l'élargir" },
];

export const OBJECTIVES_REAL_ESTATE = [
  { key: "expert", emoji: "🌟", label: "Devenir une référence dans mon secteur" },
  { key: "leads", emoji: "📈", label: "Attirer des opportunités d'investissement" },
  { key: "network", emoji: "🤝", label: "Élargir mon réseau pro & apporteurs d'affaires" },
  { key: "education", emoji: "📚", label: "Éduquer mon audience sur l'immobilier" },
  { key: "system", emoji: "📅", label: "Avoir un système de com' clair et tenable" },
  { key: "credibility", emoji: "✅", label: "Renforcer ma crédibilité auprès des partenaires" },
];

const REAL_ESTATE_DEMO_EMAILS = ["auriana.demo@nowadaysagency.com"];

export function getOnboardingVariant(email: string | null | undefined) {
  if (email && REAL_ESTATE_DEMO_EMAILS.includes(email.toLowerCase().trim())) {
    return {
      activitySections: ACTIVITY_SECTIONS_REAL_ESTATE,
      blockers: BLOCKERS_REAL_ESTATE,
      objectives: OBJECTIVES_REAL_ESTATE,
      variant: "real_estate" as const,
    };
  }
  return {
    activitySections: DEFAULT_ACTIVITY_SECTIONS,
    blockers: DEFAULT_BLOCKERS,
    objectives: DEFAULT_OBJECTIVES,
    variant: "default" as const,
  };
}
