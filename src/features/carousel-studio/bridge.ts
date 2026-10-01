import { formatSlideRole } from "@/lib/slide-roles";
import type { PhotoItem } from "@/components/creer/PhotoUploadZone";
import { getEditorElements, replacePhoto, type EditorSlide } from "@/lib/carousel-editor";
import { CarouselAutosaver, cleanCarouselSnapshot, type DraftStore } from "@/lib/carousel-autosave";

export interface CarouselStudioTicket {
  id: string;
  userId: string;
  workspaceId: string;
  isOwnSpace?: boolean;
  ideaId: string;
  documentId: string;
  slideId: string;
  slideNumber: number;
  photoCount: number;
  fingerprint: string;
  sessionId: string;
  createdAt: number;
}
const key = (id: string) => `carousel-studio:${id}`;
export function saveTicket(ticket: CarouselStudioTicket) {
  // A failed write must prevent navigation: this is the reload recovery link.
  localStorage.setItem(key(ticket.id), JSON.stringify(ticket));
}
export function readTicket(id: string | null, userId: string, workspaceId: string): CarouselStudioTicket | null {
  if (!id) return null;
  try {
    const t = JSON.parse(localStorage.getItem(key(id)) || "null");
    return t?.id === id && t.userId === userId && t.workspaceId === workspaceId &&
      typeof t.ideaId === "string" && typeof t.slideId === "string" && typeof t.sessionId === "string" &&
      Date.now() - t.createdAt < 30 * 24 * 60 * 60 * 1000 ? t : null;
  } catch { return null; }
}
export async function slideFingerprint(slide: EditorSlide): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify([slide.data, slide.html, !!slide.locked]));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2, "0")).join("");
}
export function buildSlideBrief(slide: EditorSlide, slides: EditorSlide[]): string {
  const text = (s: EditorSlide) => s.html ? getEditorElements(s.html).filter(e => e.kind === "text").map(e => e.text).filter(Boolean).join("\n") : [s.data.overlay_text, s.data.title, s.data.body].filter(Boolean).join("\n");
  const pos = slides.findIndex(s => s.id === slide.id);
  const elements = getEditorElements(slide.html);
  const positions = [...new Set(elements.filter(e => e.kind === "text" && e.style.top).map(e => {
    const top = parseFloat(e.style.top);
    return top < 450 ? "en haut" : top > 850 ? "en bas" : "au milieu";
  }))].join(" et ");
  const layout = slide.data.slide_type === "photo_integrated" ? "photo intégrée avec une zone de texte séparée" : "photo en fond de slide";
  const role = formatSlideRole(slide.data.role) || (pos === 0 ? "ouverture" : pos === slides.length - 1 ? "conclusion" : "développement");
  const narrative = slides.map((s, i) => `${i + 1}. ${text(s)}`).join("\n");
  const context = narrative.length <= 3200 ? `Récit final du carrousel :\n${narrative}`
    : `Passages voisins dans le récit final :\n${[pos - 1, pos + 1].filter(i => slides[i]).map(i => `${i + 1}. ${text(slides[i])}`).join("\n")}`;
  return [
    `Créer une image pour la slide ${pos + 1} sur ${slides.length} de mon carrousel.`,
    `TEXTE FINAL de cette slide (guide le sens de l’image, ne pas le dessiner) :\n${text(slide)}`,
    `Rôle dans le récit : ${role}.`,
    context,
    "L’image doit servir ce passage du récit, sans inventer de caractéristiques du produit ou de la personne. Les photos jointes sont des références réelles ; préciser leur rôle avec moi si nécessaire.",
    `Format portrait 4:5. Cadrage adapté à la place de l’image dans la slide (${layout}). Préserver un espace calme pour le texte, ${positions || (String(slide.data.overlay_position || "").startsWith("top") ? "en haut" : String(slide.data.overlay_position || "").startsWith("bottom") ? "en bas" : "selon la composition existante")}.`,
    "Respecter l’ambiance et la direction artistique de mon espace. Le texte sera superposé dans le carrousel : ne pas ajouter de texte, lettres ou slogan à l’image.",
  ].join("\n\n");
}

/** Patch only the chosen slide in the latest saved snapshot. Other slides and
 * metadata remain byte-for-byte untouched; CAS below protects intervening edits. */
export async function applyStudioPhoto(raw: any, ticket: CarouselStudioTicket, source: string, photoId: string, versionId: string) {
  if (raw?._carousel_document_id !== ticket.documentId) throw new Error("Ce carrousel a changé. Reprends-le avant de choisir une image.");
  const index = raw.slides?.findIndex((s: any) => s.editor_id === ticket.slideId) ?? -1;
  if (index < 0) throw new Error("Cette slide n’existe plus dans le carrousel.");
  const data = raw.slides[index];
  if (data.studio_image_receipt?.ticket_id === ticket.id && data.studio_image_receipt?.version_id === versionId) return raw;
  const slide: EditorSlide = { id: data.editor_id, data, html: raw.visual_html?.[index]?.html || "", locked: !!data.editor_locked };
  if (slide.locked || await slideFingerprint(slide) !== ticket.fingerprint) throw new Error("Cette slide a été modifiée pendant ton passage au Studio. Ton image reste disponible ; rouvre la slide pour la choisir sans écraser tes retouches.");
  const photoIndex = Math.max(ticket.photoCount || 0, ...raw.slides.map((s: any) => Number(s.photo_index) || 0)) + 1;
  const next = slide.html ? replacePhoto(slide, null, source, photoIndex) : { ...slide, data: { ...slide.data, photo_index: photoIndex, slide_type: slide.data.slide_type === "text_only" ? "photo_integrated" : slide.data.slide_type } };
  if (slide.html && next.html === slide.html) throw new Error("L’image n’a pas pu être placée dans cette slide.");
  const receipt = { ticket_id: ticket.id, version_id: versionId, photo_id: photoId };
  return { ...raw,
    slides: raw.slides.map((s: any, i: number) => i === index ? { ...next.data, studio_image_receipt: receipt, image_source: "generated", photo_library_id: photoId, ...(!slide.html ? { studio_image_source: source } : {}) } : s),
    visual_html: raw.visual_html?.map((s: any, i: number) => i === index ? { ...s, html: next.html } : s),
  };
}
export async function persistStudioPhoto(store: DraftStore, ticket: CarouselStudioTicket, source: string, photoId: string, versionId: string) {
  const row = await store.read(ticket.ideaId);
  if (!row) throw new Error("Ce carrousel n’est plus accessible dans cet espace.");
  const raw = await applyStudioPhoto(row.content_data, ticket, source, photoId, versionId);
  if (raw === row.content_data) return raw;
  let savedMeta = raw._carousel_cloud;
  const writer = new CarouselAutosaver(ticket.ideaId, true, { ...row.content_data, _carousel_base_updated_at: row.updated_at }, store, meta => { savedMeta = meta; });
  writer.checkpoint();
  writer.queue(raw);
  try { await writer.flush(); return { ...cleanCarouselSnapshot(raw), _carousel_cloud: savedMeta }; }
  finally { writer.dispose(); }
}

/** Recover original photo slots from the saved design, including Studio results.
 * Never point a replaced slide at a shared slot used by another slide. */
export function recoverStudioPhotos(raw: any, existing: PhotoItem[]): PhotoItem[] {
  const next = [...existing];
  for (const [i, slide] of (raw?.slides || []).entries()) {
    const n = Number(slide.photo_index) - 1;
    if (!Number.isInteger(n) || n < 0 || (!slide.studio_image_receipt && next[n])) continue;
    const html = raw.visual_html?.[i]?.html;
    if (!html && !slide.studio_image_source) continue;
    const doc = new DOMParser().parseFromString(html || "", "text/html");
    const el = doc.querySelector<HTMLElement>(`[data-pptx-photo="${n + 1}"]`) || doc.querySelector<HTMLElement>("img,[data-editor-photo]");
    const source = slide.studio_image_source || el?.getAttribute("src") || el?.style.backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1];
    if (!source || !/^(data:image\/|https:\/\/)/.test(source)) continue;
    if (next[n]?.userPhotoId === slide.photo_library_id && next[n]?.base64 === source) continue;
    next[n] = { id: slide.photo_library_id || `carousel-${slide.editor_id}`, userPhotoId: slide.photo_library_id,
      name: `Photo de la slide ${i + 1}`, preview: source, base64: source.startsWith("data:") ? source : "", context: "" };
  }
  for (let i = 0; i < next.length; i++) {
    if (!next[i]) next[i] = { id: `unavailable-${i}`, name: `Photo ${i + 1} indisponible`, base64: "", preview: "", missingLocalPhoto: true } as PhotoItem;
  }
  return next;
}
