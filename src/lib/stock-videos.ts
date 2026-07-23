/**
 * stock-videos — recherche de vidéos libres de droit (Pexels) pour le montage
 * de reels. Jumelle de `stock-photos.ts` : même forme d'appel, mais renvoie des
 * clips MP4 verticaux au lieu de photos.
 *
 * La suggestion de mots-clés est mutualisée : on réutilise `suggestStockKeywords`
 * de stock-photos.ts (elle est agnostique du format — sujet/angle/slides → mots-
 * clés visuels concrets en anglais).
 */

import { supabase } from "@/integrations/supabase/client";

export interface StockVideo {
  id: string;
  /** Meilleur MP4 vertical (à passer tel quel au moteur de montage). */
  url: string;
  width: number | null;
  height: number | null;
  /** Durée du clip source, en secondes. */
  duration: number | null;
  thumbnail: string;
  author: string;
  author_url: string;
  source_url: string;
}

export interface StockVideoSearchOptions {
  perPage?: number;
  orientation?: "portrait" | "landscape" | "square";
  /** Locale Pexels (ex: "fr-FR", "en-US"). Pour des mots-clés anglais, passer "en-US". */
  locale?: string;
}

export async function searchStockVideos(
  query: string,
  opts: StockVideoSearchOptions = {},
): Promise<StockVideo[]> {
  const q = query.trim();
  if (!q) return [];
  const { data, error } = await supabase.functions.invoke("stock-video-search", {
    body: {
      query: q,
      per_page: opts.perPage ?? 24,
      orientation: opts.orientation ?? "portrait",
      ...(opts.locale ? { locale: opts.locale } : {}),
    },
  });
  if (error) {
    // Message technique en console pour le debug ; message clair en français à l'écran.
    console.error("[searchStockVideos] échec de l'appel à stock-video-search:", error);
    throw new Error(
      "La recherche de vidéos est momentanément indisponible. Réessaie dans un instant, ou ajoute tes propres vidéos.",
    );
  }
  if (data?.error) throw new Error(data.error);
  return (data?.videos ?? []) as StockVideo[];
}

// La suggestion de mots-clés est partagée avec la recherche photo.
export { suggestStockKeywords } from "./stock-photos";
export type { StockKeywordContext, StockKeywords } from "./stock-photos";
