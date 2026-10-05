/**
 * Slide telle qu'envoyée à l'edge `carousel-visual` (champs recopiés un par
 * un). Fonction pure, sans alias d'import : partagée avec les tests Deno qui
 * rejouent le vrai chemin continuous-narrative → front → carousel-visual.
 */
export function visualSlidePayload(s: any, slideType: string, photoIndex: number | undefined) {
  return {
    slide_number: s.slide_number,
    role: s.role,
    slide_type: slideType,
    // Couverture photo ou mixte : mot clé de l'accroche (récit continu), revérifié
    // au rendu par carousel-visual sur le texte final ; ignoré s'il ne s'y trouve plus.
    ...(typeof s.cover_accent === "string" && s.cover_accent.trim() ? { cover_accent: s.cover_accent } : {}),
    ...(slideType === "photo_full" ? {
      overlay_text: s.overlay_text,
      overlay_position: s.overlay_position || "bottom_center",
      overlay_style: s.overlay_style || "sensoriel",
      note: s.note,
      photo_index: photoIndex,
      // Gabarits composés par code (13/07) : le choix du gabarit et ses
      // champs viennent de la structure — les tronquer ici casserait la
      // composition côté carousel-visual.
      ...(s.template ? { template: s.template } : {}),
      ...(s.kicker ? { kicker: s.kicker } : {}),
      ...(s.detail ? { detail: s.detail } : {}),
      ...(Array.isArray(s.points) && s.points.length > 0 ? { points: s.points } : {}),
      ...(s.big_number ? { big_number: s.big_number } : {}),
      ...(typeof s.step_number === "number" ? { step_number: s.step_number } : {}),
      ...(s.attribution ? { attribution: s.attribution } : {}),
      ...(s.cta_label ? { cta_label: s.cta_label } : {}),
      // Le prompt de carousel-visual s'appuie sur visual_anchor (cadrage du
      // texte hors du détail + zoom narratif sur photo répétée) : le tronquer
      // ici rendait ces règles inertes.
      ...(s.visual_anchor ? { visual_anchor: s.visual_anchor } : {}),
      // Disposition du rendu précédent (mixte) : reprise à l'identique.
      ...(s.mix_layout_memo ? { mix_layout_memo: s.mix_layout_memo } : {}),
    } : {}),
    ...(slideType === "photo_integrated" ? {
      photo_index: photoIndex,
      // Disposition : seulement une valeur réellement présente (structure
      // confirmée, ancien carrousel). Aucun défaut inventé ici : sans valeur,
      // l'edge choisit (étage de disposition, repli « photo en haut »).
      ...(s.photo_layout ? { photo_layout: s.photo_layout } : {}),
      title: s.title || "",
      body: s.body || "",
      note: s.note,
      ...(s.visual_anchor ? { visual_anchor: s.visual_anchor } : {}),
      ...(s.mix_layout_memo ? { mix_layout_memo: s.mix_layout_memo } : {}),
    } : {}),
    ...(slideType === "text_only" ? {
      title: s.title || s.overlay_text || "",
      body: s.body || s.note || "",
      visual_suggestion: s.visual_suggestion,
      ...(s.visual_schema ? { visual_schema: s.visual_schema } : {}),
    } : {}),
  };
}
