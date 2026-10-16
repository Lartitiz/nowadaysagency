// Canal d'un post du calendrier → générateur ouvert par /creer (16/10/2026).
// Le format du calendrier ne dit pas le réseau : un « Carrousel PDF » LinkedIn
// arrive en `post_carrousel` (→ carrousel Instagram) et un « Post texte »
// LinkedIn en `post_texte` (→ post Instagram). Le canal du post (state `canal`
// de Calendar.tsx › handleQuickGenerate, ou `?canal=` de la fenêtre d'un post)
// remet le bon générateur. Hors LinkedIn, rien ne change.

export function calendarEntryFormat(fmt: string | null, canal: unknown): { fmt: string | null; linkedinCarousel: boolean } {
  if (canal !== "linkedin" || !fmt) return { fmt, linkedinCarousel: false };
  if (fmt === "post") return { fmt: "linkedin", linkedinCarousel: false };
  return { fmt, linkedinCarousel: fmt === "carousel" };
}
