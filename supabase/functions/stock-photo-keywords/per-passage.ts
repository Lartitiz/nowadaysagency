// Mots-clés d'un REEL : une requête par passage, dans l'ordre (26/11/2026).
// Avant, le reel passait par la consigne du carrousel (« pense plan du carrousel :
// accroche, problème, coulisses… ») et la liste rendue commençait par la requête
// « primary » ajoutée en tête : quand elle différait de la première, tout glissait
// d'un cran. Essai filmé : la phrase sur un conduit de cheminée recevait le plan
// d'un homme qui ponce un plafond.

/** Consigne pour N passages : chaque requête montre ce que DIT son passage. */
export function perPassageBlock(passages: string[]): string {
  const n = passages.length;
  return `

Ce contenu est un REEL vidéo découpé en ${n} passages, lus l'un après l'autre. Chaque passage sera illustré par UN clip vidéo vertical (banque Pexels) pendant qu'on l'entend.

Passages, dans l'ordre :
${passages.map((s, i) => `${i + 1}. ${s}`).join("\n")}

Règles pour ces passages (elles priment sur la consigne générale) :
- EXACTEMENT ${n} requêtes dans "passages", dans le même ordre : la requête n°i illustre le passage n°i, et lui seul.
- Montre ce que le passage NOMME quand c'est filmable : l'objet, le lieu, le geste (« un conduit de cheminée condamné derrière la cloison » → "old brick chimney behind wall"). Pas une ambiance générale du métier.
- Si le passage est abstrait (un chiffre, un sentiment, une conclusion), prends la scène concrète la plus proche de la phrase, en restant dans le décor du sujet.
- "passages_fr" : la même scène en français simple, même ordre.`;
}

/** Les requêtes par passage, seulement si l'IA en a rendu exactement une par passage. */
export function alignedPassages(raw: unknown, rawFr: unknown, n: number): { passages: string[]; labels: Record<string, string> } | null {
  const clean = (s: unknown) => (typeof s === "string" ? s.trim() : "");
  if (!Array.isArray(raw) || raw.length !== n) return null;
  const passages = raw.map(clean);
  if (passages.some((p) => !p)) return null;
  const fr = Array.isArray(rawFr) ? rawFr.map(clean) : [];
  const labels: Record<string, string> = {};
  passages.forEach((kw, i) => { if (fr[i] && !labels[kw]) labels[kw] = fr[i]; });
  return { passages, labels };
}
