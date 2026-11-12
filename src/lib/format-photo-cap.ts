/**
 * Nombre de photos qu'un format « une photo » garde quand on le choisit.
 * LinkedIn (série, avant / après), Story (une photo par story) et Reel
 * (avant / après, chantier) gardent tout jusqu'à 10 : avant le 12/11/2026,
 * choisir Reel avec 2 photos gardait la 1re et jetait la 2e sans prévenir.
 * Le serveur (creative-flow, mode photo) regarde jusqu'à 10 photos.
 */
export function photoCapForFormat(format: string | null | undefined): number {
  return format === "linkedin" || format === "story" || format === "reel" ? 10 : 1;
}

