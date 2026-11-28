// Carrousel prêt mais pas encore ouvert (Loom de Laetitia, 28/11/2026).
//
// Depuis le sas « Ton carrousel est prêt » (26/11), l'éditeur ne s'affiche
// qu'au clic sur « Ouvrir mon carrousel ». Or c'est lui qui donnait au
// carrousel sa forme « éditeur » (`carousel_editor_version`), et c'est cette
// forme qui met en route la sauvegarde continue dans Mes idées. Pendant le
// sas, rien n'était donc rangé : la copie de l'onglet débordait (photos dans
// le HTML) et le message « Tes visuels sont trop lourds… » s'affichait, à
// raison (un rechargement à ce moment perdait les visuels).
//
// Ici : la même conversion que l'éditeur fait à son ouverture, faite dès
// l'arrivée des visuels. La sauvegarde continue part tout de suite.
import { documentOutput, readCarouselDocument } from "@/lib/carousel-editor";
import { withRetouched } from "@/lib/carousel-retouched";

type Visuals = { slide_number: number; html: string }[];

/** Le carrousel a-t-il encore besoin de passer par l'éditeur pour être sauvegardé ? */
export function needsEditorImport(raw: any, visuals: Visuals | undefined): boolean {
  const data = raw?.raw || raw;
  return !!visuals?.length && !!data && !data.carousel_editor_version && !data.carousel_studio_version;
}

/** Ce que l'éditeur rendrait à son ouverture, sans aucune retouche. */
export function importForEditor(raw: any, visuals: Visuals) {
  const data = raw?.raw || raw;
  return withRetouched(documentOutput(readCarouselDocument(data, visuals), data), false);
}
