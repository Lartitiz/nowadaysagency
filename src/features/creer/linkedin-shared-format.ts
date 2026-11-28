// Formats partagés entre Instagram et LinkedIn (28/11/2026).
// Le carrousel et la vidéo (parcours du reel) se choisissent dans les deux
// canaux avec le même `selectedFormat` ("carousel", "reel"). Le canal LinkedIn
// est alors porté par le drapeau historique `isLinkedInCarousel` de /creer :
// malgré son nom, il veut dire « ce format partagé part sur LinkedIn ».

/** Vrai si ce couple canal + format est un format partagé joué sur LinkedIn. */
export function isLinkedInSharedFormat(channel: unknown, format: unknown): boolean {
  return channel === "linkedin" && (format === "carousel" || format === "reel");
}

/** Vrai pour la vidéo LinkedIn : le parcours du reel, avec le drapeau LinkedIn. */
export function isLinkedInVideo(selectedFormat: unknown, isLinkedInFlag: boolean | null | undefined): boolean {
  return selectedFormat === "reel" && !!isLinkedInFlag;
}
