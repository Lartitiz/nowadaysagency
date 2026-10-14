// Déplacé à l'identique depuis _shared/format-briefs.ts (lot 1 du découpage, 14/10/2026,
// docs/robustesse/gros-fichiers.md fiche 10). format-briefs.ts le réexporte.
// Seul fichier que les briefs ont le droit d'importer entre eux (boundaries_test.ts).

import { carouselLength } from "../carousel-length.ts";

/** Nombre d'éléments annoncé par le sujet (« 5 erreurs… »), pour la numérotation (socle). */
export function annoncedItems(subject: string | null | undefined): number | undefined {
  return carouselLength({ subject: subject || "" }).items;
}
