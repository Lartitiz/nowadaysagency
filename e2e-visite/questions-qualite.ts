/**
 * Qualité des questions d'approfondissement (15/11/2026, #1980/#1985/#1990).
 * Lecture sans IA : longueur (mots) et questions fermées « oui/non ».
 * Seuils : 🟠 si une question dépasse 32 mots OU si au moins une se répond par oui/non.
 * Ne voit PAS une question simplement trop générale : ça se lit à l'œil.
 */
export const QUESTION_MAX_MOTS_SONDE = 32;

// Début de proposition fermée : « Tu as… ? », « As-tu… ? », « Est-ce que… ? », « Y a-t-il… ? »
const FERMEE = /^(tu (as|peux|connais|fais|utilises|te souviens|aurais|veux)|as-tu|aurais-tu|peux-tu|connais-tu|est-ce qu|y a-t-il|il y a|existe-t-il)\b/i;

export function texteQuestion(q: unknown): string {
  if (typeof q === "string") return q;
  if (q && typeof q === "object") {
    const o = q as Record<string, unknown>;
    return String(o.question ?? o.text ?? o.label ?? "");
  }
  return "";
}

export function mots(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/** Fermée si la proposition qui porte le « ? » commence comme une question oui/non. */
export function questionFermee(s: string): boolean {
  const avantPoint = s.split("?")[0] ?? s;
  const morceaux = avantPoint.split(/[,:;.]/);
  const derniere = (morceaux[morceaux.length - 1] ?? "").trim();
  return FERMEE.test(derniere);
}

export function lireQualite(questions: unknown[]) {
  const textes = questions.map(texteQuestion).filter(Boolean);
  const longueurs = textes.map(mots);
  const maxMots = longueurs.length ? Math.max(...longueurs) : 0;
  const fermees = textes.filter(questionFermee);
  const orange = maxMots > QUESTION_MAX_MOTS_SONDE || fermees.length > 0;
  const plusLongue = textes[longueurs.indexOf(maxMots)] ?? "";
  return { n: textes.length, longueurs, maxMots, plusLongue, fermees, orange };
}
