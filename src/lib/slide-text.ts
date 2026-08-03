// Texte porté par UNE slide de carrousel.
//
// 🔑 les 3 formats ne rangent PAS leur texte au même endroit : le carrousel
// TEXTE utilise `title`, le MIXTE et le PHOTO utilisent `overlay_text` (cf.
// `supabase/functions/_shared/photo-slide-structure.ts`). Lire `slide.title` en
// dur renvoie donc "" sur 2 formats sur 3 — c'est le bug qui vidait
// `generated_carousels.hook_text` pour le mixte et le photo (03/08/2026), et
// avec lui l'historique des accroches déjà utilisées que l'edge
// `content-coaching` sert au modèle pour éviter de se répéter.
//
// Même chaîne de repli que `slideText` côté edge (`_shared/content-quality.ts`).
export function slideText(slide: any): string {
  const t = slide?.title || slide?.heading || slide?.overlay_text || slide?.text || slide?.body || slide?.content || "";
  return typeof t === "string" ? t.trim() : "";
}
