// Rapprochement de mots entre un sujet et une matière déjà donnée par la
// personne (26/11/2026, « matière vécue »). Fonctions pures, sans dépendance :
// le tri de _shared/lived-material.ts et les contrôles de testimony.ts
// utilisent la même mesure.

/**
 * Ligne qui sépare, dans la source des témoignages et du vécu, ce que la
 * personne a écrit pour CE contenu (avant) de la matière retrouvée dans ce
 * qu'elle avait écrit à une autre occasion (après). Avant la ligne, la règle
 * d'origine s'applique ; après, un vécu n'est accepté que s'il s'y retrouve.
 */
export const RETRIEVED_MATERIAL_MARK = "\nMATIÈRE VÉCUE RETROUVÉE (écrite par la personne à une autre occasion) :\n";

/** Sépare la source en [écrit pour ce contenu, matière retrouvée]. */
export function splitRetrievedMaterial(sourceText: string): [string, string] {
  const i = sourceText.indexOf(RETRIEVED_MATERIAL_MARK);
  return i < 0 ? [sourceText, ""] : [sourceText.slice(0, i), sourceText.slice(i + RETRIEVED_MATERIAL_MARK.length)];
}

// Mots trop courants pour dire de quoi parle un texte (outils de la langue,
// mots du métier de toutes les clientes de l'outil).
const STOP = new Set(`alors apres assez aucun aucune aussi autre autres avant avec avoir beaucoup bien cela celle celles celui cette ceux chaque chez chose choses comme comment contre dans depuis deja demain donc dont elle elles encore enfin entre etait etaient etant ete etre faire fais fait faire faut fois font hier ici jamais juste leur leurs mais meme memes mieux moins moment notre nous parce parfois pendant personne peut peux plus plusieurs pour pourquoi pouvoir quand quel quelle quelles quels quelque quelques quoi rien sans sera serait sont sous souvent suis sujet sur tant tous tout toute toutes tres trop vais vers veut veux voici voila votre vous vraiment
instagram linkedin contenu contenus post posts carrousel carrousels reel reels story stories publication publications communication client cliente clientes clients annee annees jour jours semaine semaines mois temps gens facon maniere exemple question questions reponse reponses`.split(/\s+/));

/** Mots qui portent le sens, ramenés à une racine courte (« tarifs », « tarification » → « tarif »). */
export function significantStems(text: string): Set<string> {
  const out = new Set<string>();
  const plain = (text || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  for (const w of plain.match(/[a-z]{4,}/g) || []) {
    if (STOP.has(w)) continue;
    // « prix », « choix » : un mot court garde sa dernière lettre.
    const stripped = w.replace(/(?:es|s|x|e)$/, "");
    const base = stripped.length < 4 ? w : stripped;
    if (STOP.has(base)) continue;
    out.add(base.length > 5 ? base.slice(0, 5) : base);
  }
  return out;
}

/** Racines communes à deux ensembles. */
export function sharedStems(a: Set<string>, b: Set<string>): string[] {
  const out: string[] = [];
  for (const s of a) if (b.has(s)) out.push(s);
  return out;
}

/** Un passage du texte produit se retrouve-t-il dans la matière retrouvée ? (au moins 2 racines communes) */
export function supportedByMaterial(passage: string, material: string): boolean {
  if (!material.trim()) return false;
  return sharedStems(significantStems(passage), significantStems(material)).length >= 2;
}
