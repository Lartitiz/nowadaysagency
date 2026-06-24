/**
 * Normalise le "role" d'une slide / story en libellé français court.
 *
 * Le LLM renvoie ce champ de façon incohérente : tantôt en anglais
 * (hook, development, analysis…), tantôt en français (constat, pourquoi…).
 * On harmonise l'affichage des badges pour éviter le mélange FR/EN.
 *
 * Inconnu → on capitalise proprement la valeur reçue (jamais de badge vide
 * ni de "snake_case" brut).
 */
const SLIDE_ROLE_LABELS: Record<string, string> = {
  hook: "Accroche",
  intro: "Intro",
  introduction: "Intro",
  contexte: "Contexte",
  context: "Contexte",
  constat: "Constat",
  probleme: "Problème",
  problem: "Problème",
  pourquoi: "Pourquoi",
  why: "Pourquoi",
  development: "Développement",
  developpement: "Développement",
  dev: "Développement",
  analysis: "Analyse",
  analyse: "Analyse",
  comparison: "Comparaison",
  comparaison: "Comparaison",
  exemple: "Exemple",
  example: "Exemple",
  preuve: "Preuve",
  proof: "Preuve",
  solution: "Solution",
  astuce: "Astuce",
  tip: "Astuce",
  conseil: "Conseil",
  advice: "Conseil",
  resultat: "Résultat",
  result: "Résultat",
  synthese: "Synthèse",
  manifeste: "Manifeste",
  alternative: "Alternative",
  transition: "Transition",
  conclusion: "Conclusion",
  cta: "Appel à l'action",
};

export function formatSlideRole(role?: string | null): string {
  if (!role) return "";
  const key = role
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // retire les accents pour la clé
  if (SLIDE_ROLE_LABELS[key]) return SLIDE_ROLE_LABELS[key];
  // Repli : on capitalise proprement la valeur reçue (ex. "point_cle_1" → "Point cle 1")
  const cleaned = role.trim().replace(/[_-]+/g, " ");
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}
