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
// « Photo fournie par l'utilisatrice (description non fournie) », « Photo choisie par Camille (description non fournie) : … »
const NO_PHOTO_PREFIX = /^photo (?:fournie|choisie)[^:(]*(?:\(description non fournie\))?\s*:?\s*/i;

function cleanDescription(desc: unknown): string {
  const raw = typeof desc === "string" ? desc.trim() : "";
  const cleaned = raw.replace(NO_PHOTO_PREFIX, "").replace(/\s*idéalement\.?$/i, "").trim();
  return cleaned ? `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}${/[.!?]$/.test(cleaned) ? "" : "."}` : "";
}

function idealImage(slide: any): string {
  const desc = cleanDescription(slide?.photo_description);
  if (desc) return desc;
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
        // Déjà dite dans « L'image idéale ici » : pas de seconde ligne 📷 identique sous la slide.
        photo_description: undefined,
      };
    }),
  } as T;
}
