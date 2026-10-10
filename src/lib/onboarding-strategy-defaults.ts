// Valeurs que l'onboarding écrit dans `brand_strategy` à partir de deux
// questions à choix (objectif, blocage). Ce ne sont PAS des textes saisis par
// la personne : ce sont des étiquettes génériques, faites pour être remplacées
// par la vraie analyse (diagnostic-enrichment écrase déjà `pillar_major`).
// Source unique : l'onboarding les écrit, la relecture de marque les reconnaît
// pour ne pas dire « tu avais déjà commencé » ni bloquer le vrai pilier.

export const ONBOARDING_GOAL_TO_PILLAR: Record<string, string> = {
  system: "Organisation & régularité",
  visibility: "Visibilité & notoriété",
  sell: "Conversion & ventes",
  zen: "Communication sereine",
  expert: "Autorité & expertise",
};

export const ONBOARDING_BLOCKER_TO_INSIGHT: Record<string, string> = {
  invisible: "Priorité : augmenter la découvrabilité et le reach",
  lost: "Priorité : structurer un plan de com' simple et actionnable",
  no_time: "Priorité : automatiser et batcher pour gagner du temps",
  fear: "Priorité : trouver un ton authentique sans se surexposer",
  no_structure: "Priorité : canaliser les idées dans un cadre éditorial",
  boring: "Priorité : développer une voix distinctive et engageante",
};

const GENERIC_PILLARS = new Set(Object.values(ONBOARDING_GOAL_TO_PILLAR));
const GENERIC_FACETS = new Set(Object.values(ONBOARDING_BLOCKER_TO_INSIGHT));

const norm = (v: unknown) => (typeof v === "string" ? v.trim() : v);

export function isOnboardingPillar(value: unknown): boolean {
  return GENERIC_PILLARS.has(norm(value) as string);
}

export function isOnboardingFacet(value: unknown): boolean {
  return GENERIC_FACETS.has(norm(value) as string);
}

/** Copie de la stratégie sans les étiquettes posées par l'onboarding. */
export function withoutOnboardingDefaults<T extends Record<string, any> | null | undefined>(strategy: T): T {
  if (!strategy) return strategy;
  const clean: Record<string, any> = { ...strategy };
  if (isOnboardingPillar(clean.pillar_major)) clean.pillar_major = null;
  if (isOnboardingFacet(clean.step_1_hidden_facets)) clean.step_1_hidden_facets = null;
  return clean as T;
}
