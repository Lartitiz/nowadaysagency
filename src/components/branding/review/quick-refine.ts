// Questions fixes d'« On affine ensemble » en une passe (onboarding, choix de
// Laetitia du 23/10/2026) : 2 ou 3 par carte, sur un seul écran, puis un seul
// appel à l'IA (branding-quick-refine) qui réécrit la carte. Toutes facultatives
// sauf une : on peut ne répondre qu'à celle qui compte.
import type { AnalysisResult, SectionKey } from "./types";

export const QUICK_REFINE_QUESTIONS: Record<SectionKey, string[]> = {
  story: [
    "Qu'est-ce qui t'a donné envie de te lancer ?",
    "Un moment difficile ou un déclic dont tu te souviens ?",
    "Où tu veux emmener ton activité ?",
  ],
  persona: [
    "Qui est la personne que tu aides le mieux ?",
    "Qu'est-ce qui la bloque ou l'agace aujourd'hui ?",
    "Qu'est-ce qu'elle veut vraiment obtenir ?",
  ],
  value_proposition: [
    "Quel problème tu règles pour elle ?",
    "Comment tu t'y prends, concrètement ?",
    "Qu'est-ce que tu fais que les autres ne font pas ?",
  ],
  tone_style: [
    "Comment tu parles à ton public : tu ou vous, sérieux ou léger ?",
    "Qu'est-ce que tu ne dirais jamais dans tes contenus ?",
    "Une conviction que tu défends ?",
  ],
  content_strategy: [
    "De quoi tu veux parler le plus souvent ?",
    "Quels formats tu aimes faire : posts, carrousels, vidéos… ?",
    "Combien de temps tu peux y consacrer par semaine ?",
  ],
  offers: [
    "Qu'est-ce que tu vends, et à quel prix ?",
    "À qui s'adresse cette offre ?",
    "Qu'est-ce que la personne a en sortant ?",
  ],
  charter: [
    "Trois mots pour l'ambiance de ta marque ?",
    "Des couleurs que tu aimes ou que tu utilises déjà ?",
    "Ce que tu ne veux surtout pas visuellement ?",
  ],
};

/** Le reste de la fiche, en bref, pour que la carte réécrite reste cohérente. */
export function refineContext(analysis: AnalysisResult, key: SectionKey): Record<string, unknown> {
  const others: Record<string, unknown> = {};
  for (const k of Object.keys(QUICK_REFINE_QUESTIONS) as SectionKey[]) {
    if (k !== key && analysis[k]) {
      const { confidence, ...rest } = analysis[k] as Record<string, unknown>;
      others[k] = rest;
    }
  }
  return others;
}
