// Garde déterministe « photo d'abord » pour les séquences stories.
//
// Le brief exige que les stories soient des photos, mais une consigne de
// prompt est probabiliste : en pratique le modèle rend des séquences quasi
// entières en fond_couleur (1 seule story photo constatée le 22/07/2026).
// Cette garde s'applique APRÈS le parse : toute story non face-cam passe en
// fond photo, sauf le gabarit "citation" (verbatim sur fond encre, choix
// design assumé). Sans photo trouvée ensuite, le front dégrade proprement
// (fond couleur + rangée de suggestions stock/bibliothèque).

interface StoryVisualLike {
  gabarit?: string | null;
  background?: string | null;
  photo_directive?: string | null;
  photo_query_en?: string | null;
  [k: string]: unknown;
}

interface StoryLike {
  format?: string | null;
  format_label?: string | null;
  face_cam?: boolean | null;
  visual?: StoryVisualLike | null;
  [k: string]: unknown;
}

/**
 * Force le fond photo sur toutes les stories éligibles de `parsed.stories`
 * (mutation en place, comme les post-traitements reels).
 */
export function enforceStoriesPhotoFirst(parsed: { stories?: StoryLike[] | null } | null | undefined): void {
  if (!parsed || !Array.isArray(parsed.stories)) return;
  for (const s of parsed.stories) {
    const v = s?.visual;
    if (!v || typeof v !== "object" || s?.face_cam) continue;
    if (v.gabarit === "citation") continue;
    if (v.background === "photo") continue;
    v.background = "photo";
    // fond_pills n'existe que pour les fonds couleur : son équivalent photo
    // est photo_pills. Les gabarits interaction/liste gardent leur structure
    // (le renderer les pose sur photo sans changement).
    if (!v.gabarit || v.gabarit === "fond_pills") v.gabarit = "photo_pills";
    // Cohérence du badge affiché : une story à fond photo ne doit plus
    // s'annoncer "texte_fond".
    if (s.format === "texte_fond") {
      s.format = "photo";
      s.format_label = "📸 Photo avec texte";
    }
  }
}
