/**
 * Photos d'ambiance libres de droit d'un carrousel « Tes photos en fond »
 * (12/10/2026). Le serveur (carousel-ai/stock-ambient.ts) propose, sur les
 * slides où aucune photo de l'utilisatrice ne montrait le passage, une photo
 * Pexels vérifiée sans personne ni produit (`stock_ambient`). Ici on la
 * télécharge, on l'ajoute APRÈS les photos de l'utilisatrice et on la pose sur
 * sa slide. Un téléchargement raté laisse la photo d'origine (déjà posée en
 * ambiance par le serveur) : jamais de slide vide.
 */
import type { PhotoItem } from "@/components/creer/PhotoUploadZone";
import { stockPhotoToPhotoItem, type StockPhoto } from "@/lib/stock-photos";
import { rebindReceiptsAfterPhotoCast } from "../../supabase/functions/_shared/carousel-editorial-snapshot";

/** Même plafond que l'association et l'envoi des photos (10). */
const MAX_PHOTOS = 10;

export const STOCK_AMBIENT_REASON = (photographer?: string) =>
  `Photo libre de droit (Pexels${photographer ? `, ${photographer}` : ""}) posée en ambiance : remplace-la par la tienne si tu veux.`;

/**
 * Photos choisies par l'utilisatrice : les photos d'ambiance posées par l'app
 * à une génération précédente ne repartent pas comme « ses » photos (elles
 * seraient revérifiées comme telles et pourraient finir en couverture).
 */
export function ownPhotos<T extends { stockAmbient?: boolean }>(photos: T[]): T[] {
  return (photos || []).filter((p) => !p?.stockAmbient);
}

function withoutProposals(raw: any) {
  if (!Array.isArray(raw?.slides) || !raw.slides.some((s: any) => s?.stock_ambient)) return raw;
  return { ...raw, slides: raw.slides.map(({ stock_ambient: _s, ...s }: any) => s) };
}

/**
 * Retourne le carrousel à afficher et les photos libres de droit posées, à
 * ajouter APRÈS les `baseCount` photos envoyées (l'ordre fait foi pour les
 * `photo_index`).
 */
export async function applyStockAmbientPhotos(
  raw: any,
  baseCount: number,
  convert: (p: StockPhoto) => Promise<PhotoItem> = stockPhotoToPhotoItem,
): Promise<{ raw: any; added: PhotoItem[] }> {
  const slides: any[] = Array.isArray(raw?.slides) ? raw.slides : [];
  const room = Math.max(0, MAX_PHOTOS - baseCount);
  const wanted = slides
    .map((s, i) => ({ i, stock: s?.stock_ambient }))
    .filter(({ stock }) => stock && typeof stock.url === "string" && /^https:\/\/images\.pexels\.com\//.test(stock.url))
    .slice(0, room);
  if (!wanted.length) return { raw: withoutProposals(raw), added: [] };
  const settled = await Promise.allSettled(wanted.map(({ stock }) => convert({
    id: String(stock.id), url: stock.url, thumbnail: stock.thumbnail || stock.url, width: null, height: null,
    alt: stock.alt || "", photographer: stock.photographer || "", photographer_url: stock.photographer_url || "",
    source_url: stock.source_url || "", avg_color: "#cccccc",
  })));
  const added: PhotoItem[] = [];
  const indexBySlide = new Map<number, number>();
  settled.forEach((r, k) => {
    if (r.status !== "fulfilled") {
      console.warn("[stock-ambient] photo libre de droit non téléchargée, photo d'origine gardée", r.reason);
      return;
    }
    added.push({ ...r.value, stockAmbient: true });
    indexBySlide.set(wanted[k].i, baseCount + added.length);
  });
  if (!added.length) return { raw: withoutProposals(raw), added: [] };
  const nextSlides = slides.map((s, i) => {
    const { stock_ambient: stock, ...rest } = s || {};
    if (!indexBySlide.has(i)) return stock ? rest : s;
    return {
      ...rest,
      photo_index: indexBySlide.get(i),
      // Pastille « Photo libre de droit » sur l'écran résultat (s'efface quand la photo change).
      cast_source: "stock_ambient",
      photo_match: { status: "stock_ambient", relation: "ambient", reason: STOCK_AMBIENT_REASON(stock.photographer) },
      stock_credit: { source: "pexels", photographer: stock.photographer || "", source_url: stock.source_url || "" },
    };
  });
  const placed = { ...raw, slides: nextSlides };
  if (Array.isArray(raw?.photo_review?.assignments)) {
    placed.photo_review = { ...raw.photo_review,
      assignments: raw.photo_review.assignments.map((a: any) => indexBySlide.has(a.slide - 1)
        ? { ...a, photo: indexBySlide.get(a.slide - 1), status: "stock_ambient", relation: "ambient" } : a),
    };
  }
  // Le texte relu n'a pas changé : les reçus à jour sont ré-empreints (comme le casting automatique).
  return { raw: rebindReceiptsAfterPhotoCast(raw, placed), added };
}
