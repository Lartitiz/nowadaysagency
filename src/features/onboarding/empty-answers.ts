// Réponses vides de l'onboarding (une mission : l'état « remis à zéro »).
// Mêmes valeurs que les états initiaux hors démo de src/hooks/use-onboarding.ts.
import type { Answers, BrandingAnswers } from "@/hooks/use-onboarding";

export function emptyOnboardingAnswers(): Answers {
  return {
    prenom: "", activite: "", activity_type: "", activity_detail: "",
    canaux: [], desired_channels: [], blocage: "", objectif: "", temps: "",
    instagram: "", website: "", linkedin: "", linkedin_summary: "",
    change_priority: "", product_or_service: "", uniqueness: "",
    visual_reference_links: [],
  };
}

export function emptyBrandingAnswers(): BrandingAnswers {
  return {
    positioning: "", mission: "", target_description: "",
    tone_keywords: [], offers: [{ name: "", price: "", description: "" }], values: [],
  };
}
