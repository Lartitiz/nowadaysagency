// Les slides visuelles (carousel-visual) sont du HTML généré par l'IA, rendu dans
// des iframes `srcDoc`. Le prompt demande au modèle de charger les Google Fonts via
// `@import`. Or `@import` ne fonctionne pas de façon fiable dans une iframe srcDoc,
// et SURTOUT : quand le modèle émet le `@import` sans wrapper `<style>` (ou mélangé
// à d'autres CSS), il s'affiche en TEXTE VISIBLE en haut de la slide (« @import
// url('https://fonts.googleapis.com/...') »). Les polices sont de toute façon
// fournies par un `<link rel="stylesheet">` ajouté en amont, donc on retire tout
// `@import` Google Fonts résiduel — défense déterministe, indépendante du modèle.
//
// Le fix racine est aussi côté edge (carousel-visual). Cette passe front protège
// l'aperçu ET les exports (PPTX/PNG/Canva) y compris pour des carrousels déjà
// générés avant le déploiement du fix edge.

export function stripFontImportLeak(html: string | null | undefined): string {
  if (!html) return "";
  return String(html)
    // Retire le @import Google Fonts où qu'il soit (nu ou dans un <style> plus large).
    .replace(/@import\s+url\(\s*['"]?[^)]*fonts\.googleapis\.com[^)]*['"]?\s*\)\s*;?/gi, "")
    // Nettoie les <style></style> devenus vides.
    .replace(/<style>\s*<\/style>/gi, "");
}

/** Applique stripFontImportLeak à un tableau de slides visuelles. */
export function stripFontImportLeakFromSlides<T extends { html?: string }>(
  slides: T[] | null | undefined
): T[] {
  if (!Array.isArray(slides)) return [];
  return slides.map((s) => (s && typeof s.html === "string" ? { ...s, html: stripFontImportLeak(s.html) } : s));
}
