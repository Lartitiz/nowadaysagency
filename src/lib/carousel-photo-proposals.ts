/**
 * Images proposées d'office sur un carrousel écrit sans photo (26/11/2026,
 * demande de Laetitia). Une fois le texte affiché, l'écran demande au serveur
 * (edge carousel-photo-proposals) une image par slide « Image à choisir » :
 * d'abord la bibliothèque, sinon une photo libre de droit vérifiée. Ici : quelles
 * slides sont concernées, l'appel, et la pose des photos sur les bonnes slides
 * (une slide déplacée, réécrite ou déjà remplie entre-temps n'est jamais écrasée).
 */
import type { PhotoItem } from "@/components/creer/PhotoUploadZone";
import type { StockPhoto } from "@/lib/stock-photos";
import type { UserPhotoRow } from "@/lib/photo-storage";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { STOCK_AMBIENT_REASON } from "@/lib/stock-ambient-photos";
import { rebindReceiptsAfterPhotoCast } from "../../supabase/functions/_shared/carousel-editorial-snapshot";

export const PHOTO_PROPOSALS_VERSION = "photo-proposals-v1";
/** Même plafond que l'association et l'envoi des photos (10). */
const MAX_PHOTOS = 10;
const CALL_TIMEOUT_MS = 90_000;

export interface ServerStockPhoto {
  id: string; url: string; thumbnail: string; alt: string;
  photographer: string; photographer_url: string; source_url: string;
}
export interface PhotoProposal {
  slide: number;
  ideal: string | null;
  library_index: number | null;
  stock: ServerStockPhoto | null;
  alternates: ServerStockPhoto[];
}

const isPhotoType = (s: any) => s?.slide_type === "photo_full" || s?.slide_type === "photo_integrated";

/** Texte d'une slide, tel qu'envoyé au serveur ; sert aussi à la retrouver au retour. */
export function slidePassage(s: any): string {
  return [s?.overlay_text, s?.title, s?.body].filter((v) => typeof v === "string" && v.trim()).join("\n").slice(0, 600);
}

/** Une slide attend son image : slide photo avec une directive, sans photo posée. */
export function awaitsImage(s: any): boolean {
  return isPhotoType(s) && !!s?.photo_directive && !Number.isInteger(s?.photo_index);
}

/**
 * Slides (numéros 1-based) à qui proposer une image. Pas celles que la
 * bibliothèque est déjà en train de remplir (library_photo_index, régime texte
 * d'abord), ni celles qui visent une personnalité ou une marque d'actu (photo
 * d'actu créditée, jamais une photo d'ambiance), ni un carrousel déjà traité.
 */
export function proposalTargets(raw: any, photoCount: number): number[] {
  if (!Array.isArray(raw?.slides) || raw?.photo_proposals) return [];
  const room = Math.max(0, MAX_PHOTOS - photoCount);
  return raw.slides
    .map((s: any, i: number) => (awaitsImage(s) && !Number.isInteger(s?.library_photo_index) && !s?.news_entity && slidePassage(s) ? i + 1 : 0))
    .filter(Boolean)
    .slice(0, room);
}

export function toStockPhoto(p: ServerStockPhoto): StockPhoto {
  return { ...p, thumbnail: p.thumbnail || p.url, width: null, height: null, avg_color: "#cccccc" };
}

export const isPexelsPhoto = (p: any): p is ServerStockPhoto =>
  !!p && typeof p.id === "string" && typeof p.url === "string" && /^https:\/\/images\.pexels\.com\//.test(p.url);

export async function fetchPhotoProposals(input: {
  raw: any; targets: number[]; subject?: string; libraryRows: UserPhotoRow[]; workspaceId?: string | null;
}): Promise<PhotoProposal[]> {
  const slides = (input.raw.slides as any[]).map((s, i) => ({ slide: i + 1, text: slidePassage(s) }));
  const library = input.libraryRows.slice(0, 40).map((p, i) => ({
    index: i + 1, description: (p.description || "").slice(0, 400), ...(p.kind ? { kind: p.kind } : {}),
  }));
  const { data, error } = await invokeWithTimeout("carousel-photo-proposals", {
    body: {
      ...(input.subject?.trim() ? { subject: input.subject.trim().slice(0, 2000) } : {}),
      ...(input.workspaceId ? { workspace_id: input.workspaceId } : {}),
      slides, targets: input.targets,
      ...(library.length ? { library } : {}),
    },
  }, CALL_TIMEOUT_MS);
  if (error) throw error;
  if (data?.error) throw new Error(String(data.error));
  return (Array.isArray(data?.proposals) ? data.proposals : []).filter((p: any) => Number.isInteger(p?.slide));
}

export interface ResolvedProposal {
  /** Texte de la slide au moment de la demande : la slide est retrouvée par lui. */
  passage: string;
  ideal: string | null;
  source: "library" | "stock" | null;
  /** Numéro 1-based de la photo dans le set du carrousel, quand une photo est posée. */
  photoIndex: number | null;
  libraryId?: string;
  stock?: ServerStockPhoto;
  alternates: ServerStockPhoto[];
}

/**
 * Pose les photos proposées sur le carrousel affiché MAINTENANT. Une slide
 * n'est touchée que si son texte est encore celui de la demande et qu'elle
 * attend toujours son image. Le carrousel est marqué traité (une seule demande
 * par carrousel, même après un rechargement).
 */
export function applyPhotoProposals(raw: any, resolved: ResolvedProposal[]): any {
  if (!Array.isArray(raw?.slides)) return raw;
  const left = [...resolved];
  let placed = 0;
  const slides = raw.slides.map((s: any) => {
    if (!awaitsImage(s)) return s;
    const k = left.findIndex((r) => r.passage === slidePassage(s));
    if (k < 0) return s;
    const [r] = left.splice(k, 1);
    if (!r.photoIndex || !r.source) {
      // Rien de correct trouvé : la slide reste à choisir, avec une vraie description de l'image idéale.
      return r.ideal ? { ...s, photo_directive: r.ideal } : s;
    }
    placed++;
    const base = { ...s, photo_index: r.photoIndex, ...(r.ideal ? { photo_directive: r.ideal } : {}) };
    if (r.source === "library") return { ...base, cast_source: "library_auto", photo_library_id: r.libraryId };
    return {
      ...base,
      cast_source: "stock_ambient",
      photo_match: { status: "stock_ambient", relation: "ambient", reason: STOCK_AMBIENT_REASON(r.stock?.photographer) },
      stock_credit: { source: "pexels", photographer: r.stock?.photographer || "", source_url: r.stock?.source_url || "" },
      ...(r.alternates.length ? { stock_alternates: r.alternates } : {}),
    };
  });
  const next = { ...raw, slides, photo_proposals: { version: PHOTO_PROPOSALS_VERSION, status: "done", placed } };
  // Le texte relu n'a pas changé : les reçus à jour sont ré-empreints (comme le casting automatique).
  return rebindReceiptsAfterPhotoCast(raw, next);
}

/**
 * Des images ont été posées par l'app : les visuels ne se créent plus tout seuls,
 * ils attendent le clic sur « Créer les visuels » pour que l'utilisatrice puisse
 * d'abord changer une image proposée (choix de Laetitia du 26/11/2026).
 */
export function visualsWaitForClick(raw: any): boolean {
  return Number(raw?.photo_proposals?.placed) > 0;
}

/** Bandeau de l'écran quand toutes les slides photo ont leur image. */
export function allImagesReadyMessage(raw: any): string {
  return visualsWaitForClick(raw)
    ? "Chaque slide a une image proposée : change celles que tu veux, puis crée les visuels."
    : "Toutes les slides photo ont leur image : tu peux créer les visuels.";
}

/** Le carrousel affiché est-il encore celui de la demande ? (sinon : nouvelle génération entre-temps) */
export function sameCarousel(raw: any, passages: string[]): boolean {
  if (!Array.isArray(raw?.slides)) return false;
  const now = new Set(raw.slides.map(slidePassage));
  return passages.some((p) => now.has(p));
}

export type { PhotoItem };
