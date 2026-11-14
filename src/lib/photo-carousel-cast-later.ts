/**
 * Carrousel « Tes photos en fond » écrit sans aucune photo (choix de Laetitia du
 * 14/11/2026 : « l'app écrit d'abord, tu poses une photo sur chaque slide ensuite »).
 *
 * Le serveur numérote quand même une photo par slide (photo_index 1, 2, 3…) alors
 * qu'il n'y en a aucune : la première photo ajoutée se serait affichée sur la
 * slide 1 ET sur celle où on l'avait posée. Chaque slide devient donc « Image à
 * choisir » (même écran que le mixte « J'écris d'abord ») : plus de numéro, et
 * l'image idéale décrite par le serveur comme repère.
 */
const GENERIC_DESCRIPTION = /photo fournie par l['’]utilisatrice/i;

function idealImage(slide: any): string {
  const desc = typeof slide?.photo_description === "string" ? slide.photo_description.trim() : "";
  if (desc && !GENERIC_DESCRIPTION.test(desc)) return desc;
  const text = String(slide?.overlay_text || slide?.title || "").replace(/\s+/g, " ").trim();
  if (!text) return "Une photo de ton univers.";
  return `Une photo qui accompagne « ${text.length > 90 ? `${text.slice(0, 89).trimEnd()}…` : text} »`;
}

export function castPhotosLater<T>(raw: T): T {
  const r = raw as any;
  if (!r || !Array.isArray(r.slides)) return raw;
  return {
    ...r,
    slides: r.slides.map((s: any) => {
      if (!s || typeof s !== "object" || s.slide_type === "text_only") return s;
      return {
        ...s,
        // L'ancien chemin sans photo renvoie « cover » / « text_on_photo », que l'écran n'affiche pas.
        slide_type: s.slide_type === "photo_integrated" ? "photo_integrated" : "photo_full",
        photo_index: null,
        photo_directive: s.photo_directive || idealImage(s),
      };
    }),
  } as T;
}
