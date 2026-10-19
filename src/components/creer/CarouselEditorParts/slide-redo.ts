// « Refaire cette slide » (chantier AA, 18/10/2026 ; choix C6 à C8 de Laetitia) :
// fonctions pures de l'éditeur. Le serveur (carousel-ai, type slide_redo) réécrit
// la slide choisie puis la fait redessiner par carousel-visual ; ici on prépare
// la demande à partir du carrousel tel qu'il est dans l'éditeur, et on construit
// la slide refaite. Les autres slides ne sont jamais touchées.
import { prepareSlideHtml, slidePhotoSource, type CarouselDocument, type EditorSlide } from "@/lib/carousel-editor";
import { visualSlidePayload } from "@/lib/visual-slide-payload";

/** Exemples qui tournent dans le champ vide (pas de boutons tout faits, choix C6). */
export const SLIDE_REDO_EXAMPLES = ["plus court", "fais-en une frise en 3 étapes", "une autre disposition", "ajoute l'exemple du café"];

export interface SlideRedoResponse {
  slide: Record<string, any>;
  slide_html: { slide_number: number; html: string };
  change?: string;
  design_note?: string | null;
  notices?: string[];
  mix_layout_memo?: unknown;
}

/** Ce que l'éditeur reçoit de l'appli pour refaire une slide (absent : pas de bouton). */
export interface SlideRedoApi {
  /** « Il te reste N crédits ce mois-ci. », ou null (illimité, inconnu). */
  remainingLabel: string | null;
  /** Appelle le serveur ; rend la réponse, ou un message d'erreur à montrer. */
  request: (body: Record<string, unknown>) => Promise<{ data: SlideRedoResponse | null; error: string | null }>;
  /** Lit une photo de la slide (adresse de stockage ou data URL) en base64 réduit pour l'IA. */
  loadPhoto: (src: string) => Promise<{ base64: string; mimeType?: string } | null>;
}

/** Slide photo seule, sans aucun texte (« Photos brutes ») : rien à refaire, le bouton
 * est grisé (essai réel du 19/10/2026 : nouvelle version identique, crédit payé pour rien). */
export const PHOTO_ONLY_REASON = "Cette slide est une photo seule, sans texte : rien à refaire ici. Pour la remplacer, utilise « Changer la photo ».";
export function isPhotoOnlySlide(slide: EditorSlide): boolean {
  const d = slide.data || {};
  const text = ["title", "body", "overlay_text", "kicker", "detail", "cta_label"].some((k) => typeof d[k] === "string" && d[k].trim());
  return !text && !d.visual_schema && !!slidePhotoSource(slide.html);
}

/** Photos du carrousel lues dans les slides (une par adresse, 10 au plus) et leur numéro par slide. */
export function collectSlidePhotos(document: CarouselDocument): { sources: string[]; indexBySlide: (number | undefined)[] } {
  const sources: string[] = [];
  const indexBySlide = document.slides.map((s) => {
    const src = slidePhotoSource(s.html);
    if (!src || !/^(data:image\/|https?:\/\/)/.test(src)) return undefined;
    let i = sources.indexOf(src);
    if (i < 0 && sources.length < 10) { sources.push(src); i = sources.length - 1; }
    return i >= 0 ? i + 1 : undefined;
  });
  return { sources, indexBySlide };
}

// Champs trop lourds (anciennes photos collées) : jamais renvoyés au serveur.
const light = (data: Record<string, any>) => Object.fromEntries(Object.entries(data).filter(([, v]) => !(typeof v === "string" && v.length > 4000)));

/** Corps de la demande à carousel-ai (sans l'espace de travail, ajouté par l'appli). */
export function buildSlideRedoBody({ raw, document, index, instruction, photos, indexBySlide }: {
  raw: any;
  document: CarouselDocument;
  index: number;
  instruction: string;
  photos: { base64: string; mimeType?: string }[];
  indexBySlide: (number | undefined)[];
}): Record<string, unknown> {
  const carouselType = raw?.carousel_type || "text";
  const withPhotos = (carouselType === "photo" || carouselType === "mix") && photos.length > 0;
  const slides: Record<string, any>[] = document.slides.map((s, i) => ({ ...light(s.data), slide_number: i + 1, editor_locked: !!s.locked }));
  const visualSlides = slides.map((s, i) => visualSlidePayload(s, withPhotos ? (s.slide_type || (carouselType === "photo" ? "photo_full" : "text_only")) : "text_only", withPhotos ? indexBySlide[i] : undefined));
  return {
    type: "slide_redo",
    redo_slide_number: index + 1,
    instruction: instruction.trim().slice(0, 500),
    slides,
    carousel_type: carouselType,
    ...(raw?.channel ? { channel: raw.channel } : {}),
    visual_request: {
      slides: visualSlides,
      ...(withPhotos ? { photos, carousel_type: carouselType } : { template_style: null }),
      ...(withPhotos && carouselType === "mix" && raw?.mix_formatting_memo ? { mix_formatting_memo: raw.mix_formatting_memo } : {}),
    },
  };
}

const asDataUrl = (p: { base64: string; mimeType?: string }) => p.base64.startsWith("data:") ? p.base64 : `data:${p.mimeType || "image/jpeg"};base64,${p.base64}`;

/** La slide refaite : même identifiant et même place, nouveau texte et nouveau HTML.
 * La photo envoyée réduite au serveur est remise telle qu'elle était dans la slide. */
export function slideFromRedo(before: EditorSlide, res: SlideRedoResponse, photo?: { sent: { base64: string; mimeType?: string }; original: string }): EditorSlide {
  let html = String(res.slide_html?.html || "");
  if (photo) {
    const from = asDataUrl(photo.sent);
    if (from !== photo.original && html.includes(from)) html = html.split(from).join(photo.original);
  }
  const { editor_locked: _l, editor_id: _i, ...data } = res.slide || {};
  return {
    id: before.id,
    locked: before.locked,
    data: { ...data, slide_number: before.data.slide_number ?? data.slide_number, ...(res.mix_layout_memo ? { mix_layout_memo: res.mix_layout_memo } : {}) },
    html: prepareSlideHtml(html),
  };
}

/** Remplace UNE slide (par son identifiant) ; les autres gardent leur objet tel quel. */
export function replaceSlide(document: CarouselDocument, next: EditorSlide): CarouselDocument {
  return { ...document, slides: document.slides.map((s) => (s.id === next.id ? next : s)) };
}
