// Annonce de vente : pas de fait trouvé sur le web (décision de Laetitia,
// 13/11/2026 : « Pas de faits du web dans une annonce : oui »).
// Vu en QA le 12/11 : l'annonce d'un appartement (68 m², 289 000 € FAI, DPE C)
// citait « selon les Notaires de France (2025), les logements A, B ou C
// bénéficient d'une prime à la vente ». Dans une annonce, c'est un argument de
// vendeur qu'elle n'a pas demandé. Pour tous les métiers (un bien, un objet, un
// produit) : quand l'idée est une annonce ou une mise en vente, la recherche
// « creuser le sujet » ne tourne pas, donc aucun fait du web n'arrive dans le
// texte. Les autres contenus gardent les faits sourcés.

const SALE_PATTERNS: RegExp[] = [
  // « T3 à vendre », « maison a vendre » (pas « j'ai appris à vendre », « du mal à vendre »)
  /(?<!(?:appris|apprendre|apprends|apprenez|apprenons|aide|aider|aidé|aidée|réussir|réussi|arriver|arrive|commencer|commencé|oser|ose|osé|mal|peine|prête?s?|du|de|pour|à)\s+)(?<!\p{L})[àa]\s+vendre(?!\p{L})/iu,
  /(?<!\p{L})(?:mise|mettre|met|mets|mettons|mis|remis|remise)\s+en\s+vente(?!\p{L})/iu,
  // « est en vente », « nouveau bien en vente », « collection … est en vente dès vendredi »
  /(?<!\p{L})(?:est|sont|sera|seront|reste|restent|nouveaux?|nouvelles?|biens?|enfin|désormais|maintenant|bientôt|actuellement|déjà|officiellement)\s+(?:[\p{L}'’-]+\s+){0,2}?en\s+vente(?!\p{L})/iu,
  /(?<!\p{L})disponibles?\s+(?:à|a)\s+la\s+vente(?!\p{L})/iu,
  /(?<!\p{L})(?:je|on)\s+vends?\s+(?:mon|ma|mes|un|une|le|la|les|l['’]|ce|cet|cette|ces|notre|nos)(?!\p{L})|(?<!\p{L})nous\s+vendons\s+(?:notre|nos|un|une|ce|cette)(?!\p{L})/iu,
  /(?<!\p{L})annonces?\s+(?:de\s+vente|immobili[eè]re|de\s+mon\s+bien|du\s+bien)(?!\p{L})/iu,
  // Annonce immobilière : prix « FAI » (frais d'agence inclus)
  /(?<!\p{L})(?:FAI|frais\s+d['’]agence\s+inclus)(?!\p{L})/u,
];

/** L'idée est une annonce ou la mise en vente d'un bien, d'un objet ou d'un produit. */
export function isSaleListing(...texts: Array<string | null | undefined>): boolean {
  const text = texts.filter((t): t is string => typeof t === "string" && !!t.trim()).join("\n");
  if (!text) return false;
  return SALE_PATTERNS.some((re) => re.test(text));
}
