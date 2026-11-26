// « Je me filme » / « Je ne me montre pas » : le choix fait sur l'écran des
// accroches d'un reel est retenu d'un reel à l'autre (27/11/2026, étude
// Instagram, reels en voix off). Sans choix enregistré, le reel reste écrit
// pour le face caméra, comme avant. Gardé dans le navigateur : pas de colonne
// en base, rien à migrer.

export type ReelFaceCam = "oui" | "non";

const KEY = "reel_se_filme";

/** Le choix enregistré, ou null si elle n'a jamais choisi. */
export function storedReelFaceCam(): ReelFaceCam | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "oui" || v === "non" ? v : null;
  } catch {
    return null;
  }
}

/** Le choix à envoyer à la rédaction : face caméra tant qu'elle n'a rien choisi. */
export function reelFaceCam(): ReelFaceCam {
  return storedReelFaceCam() ?? "oui";
}

export function saveReelFaceCam(value: ReelFaceCam): void {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // Stockage indisponible (navigation privée) : le choix vaut pour cet écran seulement.
  }
}
