/** Retire d'un texte lu par la personne les remarques de l'IA sur sa propre
 *  certitude (« Confiance faible : profil déduit, aucune source en ligne
 *  analysée. »), vues dans la fiche cliente le 13/11/2026. */
const META_RE = /\s*(?:\(?\s*)?(?:Niveau de )?confiance\s+(?:faible|moyenne|basse|élevée|haute|forte)\s*[:.,—-][^.!?\n]*[.!?]?\s*\)?/gi;

export function sansMeta(text: unknown): string | null {
  if (typeof text !== "string") return (text as null) ?? null;
  const clean = text.replace(META_RE, " ").replace(/\s{2,}/g, " ").trim();
  return clean || null;
}
