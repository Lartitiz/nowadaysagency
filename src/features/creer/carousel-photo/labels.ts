// Libellés de l'écran « carrousel photo » (CarouselPhotoResult).

const POSITION_WORDS: Record<string, string> = {
  top: "en haut", bottom: "en bas", center: "au centre", middle: "au centre", left: "à gauche", right: "à droite",
};

/**
 * Position du texte sur la photo, en français : « bottom_left » s'affichait tel
 * quel sous le texte de la slide (vu par Laetitia le 26/11/2026).
 */
export function overlayPositionLabel(position: unknown): string {
  const words = String(position || "").toLowerCase().split(/[\s_-]+/).filter(Boolean);
  const known = [...new Set(words.map((w) => POSITION_WORDS[w]).filter(Boolean))];
  if (!known.length || known.length !== new Set(words).size) return "Texte posé sur la photo";
  return `Texte ${known.join(" ")}`;
}

/**
 * Quand aucune image idéale n'a été décrite, le serveur recopie le texte de la
 * slide (« Une image qui accompagne ce passage : … ») : cette ligne répète ce
 * qu'on lit juste en dessous, on ne l'affiche pas.
 */
export function usefulDirective(directive: unknown): string {
  const text = typeof directive === "string" ? directive.trim() : "";
  return /^une (?:image|photo) qui accompagne (?:ce passage\s*:|«)/i.test(text) ? "" : text;
}
