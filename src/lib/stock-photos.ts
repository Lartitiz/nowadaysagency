/**
 * stock-photos — recherche de photos libres de droit (Pexels) et conversion en
 * PhotoItem, pour les injecter dans PhotoUploadZone comme si elles avaient été
 * uploadées. Une fois converties en base64, elles traversent tout le pipeline
 * existant (vision IA qui les place au bon endroit, aperçu, rendu visuel, export)
 * sans aucun traitement particulier.
 */

import { supabase } from "@/integrations/supabase/client";
import type { PhotoItem } from "@/components/creer/PhotoUploadZone";

export interface StockPhoto {
  id: string;
  url: string;
  thumbnail: string;
  width: number | null;
  height: number | null;
  alt: string;
  photographer: string;
  photographer_url: string;
  source_url: string;
  avg_color: string;
}

export interface StockSearchOptions {
  perPage?: number;
  orientation?: "portrait" | "landscape" | "square";
  /** Locale Pexels (ex: "fr-FR", "en-US"). Pour des mots-clés anglais, passer "en-US". */
  locale?: string;
}

export async function searchStockPhotos(
  query: string,
  opts: StockSearchOptions = {},
): Promise<StockPhoto[]> {
  const q = query.trim();
  if (!q) return [];
  const { data, error } = await supabase.functions.invoke("stock-photo-search", {
    body: {
      query: q,
      per_page: opts.perPage ?? 24,
      orientation: opts.orientation ?? "portrait",
      ...(opts.locale ? { locale: opts.locale } : {}),
    },
  });
  if (error) {
    // Le client Supabase renvoie un message technique en anglais (ex.
    // « Failed to send a request to the Edge Function » quand la fonction n'est
    // pas déployée). On le garde en console pour le debug, mais on n'expose à
    // l'utilisatrice qu'un message clair en français.
    console.error("[searchStockPhotos] échec de l'appel à stock-photo-search:", error);
    throw new Error(
      "La recherche de photos est momentanément indisponible. Réessaie dans un instant, ou ajoute tes propres photos.",
    );
  }
  if (data?.error) throw new Error(data.error);
  return (data?.photos ?? []) as StockPhoto[];
}

/** Contexte du contenu à venir, pour des mots-clés photo pertinents. */
export interface StockKeywordContext {
  subject: string;
  format?: string;
  angle?: string;
  objective?: string;
  /** Texte des slides déjà générées, si disponible. */
  slides?: string[];
}

export interface StockKeywords {
  /** Requête la plus sûre, à lancer en premier. */
  primary: string;
  /** Toutes les suggestions (inclut primary en tête). */
  keywords: string[];
}

/**
 * Demande à l'IA des mots-clés visuels (anglais, concrets) à partir du sujet /
 * angle / format du contenu — pour que la recherche Pexels colle à ce que le
 * carrousel raconte plutôt qu'au sujet brut souvent abstrait. Best-effort : en
 * cas d'échec, l'appelant retombe sur le sujet brut.
 */
export async function suggestStockKeywords(
  ctx: StockKeywordContext,
  opts: { count?: number } = {},
): Promise<StockKeywords> {
  const subject = ctx.subject.trim();
  if (!subject) return { primary: "", keywords: [] };
  const { data, error } = await supabase.functions.invoke("stock-photo-keywords", {
    body: {
      subject,
      ...(ctx.format ? { format: ctx.format } : {}),
      ...(ctx.angle ? { angle: ctx.angle } : {}),
      ...(ctx.objective ? { objective: ctx.objective } : {}),
      ...(ctx.slides && ctx.slides.length ? { slides: ctx.slides.slice(0, 15) } : {}),
      ...(opts.count ? { count: opts.count } : {}),
    },
  });
  if (error) {
    // Même logique que searchStockPhotos : message technique en console, pas à l'écran.
    console.error("[suggestStockKeywords] échec de l'appel à stock-photo-keywords:", error);
    throw new Error("Suggestion de mots-clés indisponible.");
  }
  if (data?.error) throw new Error(data.error);
  const keywords = Array.isArray(data?.keywords) ? (data.keywords as string[]) : [];
  return { primary: (data?.primary as string) || keywords[0] || "", keywords };
}

/**
 * « L'IA choisit les photos pour moi » : à partir du plan visuel du contenu
 * (un thème par slide, via suggestStockKeywords), va chercher sur Pexels et
 * sélectionne automatiquement UNE photo pertinente par thème, prête à injecter
 * dans le carrousel. Best-effort : ignore les thèmes sans résultat ; lève une
 * erreur seulement si rien n'a pu être récupéré.
 */
export async function autoSelectStockPhotos(
  ctx: StockKeywordContext,
  opts: { count: number },
): Promise<PhotoItem[]> {
  const count = Math.max(1, Math.min(opts.count, 10));
  const { keywords } = await suggestStockKeywords(ctx, { count });
  const themes = (keywords.length ? keywords : [ctx.subject.trim()]).slice(0, count);

  // Une recherche par thème (en parallèle), on garde le 1er résultat de chacune.
  const results = await Promise.all(
    themes.map(async (term) => {
      try {
        const photos = await searchStockPhotos(term, {
          perPage: 6,
          orientation: "portrait",
          locale: "en-US",
        });
        return photos[0] ?? null;
      } catch (e) {
        console.warn("[autoSelectStockPhotos] recherche échouée pour", term, e);
        return null;
      }
    }),
  );

  // Déduplication par id (deux thèmes peuvent retomber sur la même photo).
  const seen = new Set<string>();
  const picked: StockPhoto[] = [];
  for (const p of results) {
    if (p && !seen.has(p.id)) {
      seen.add(p.id);
      picked.push(p);
    }
  }
  if (picked.length === 0) {
    throw new Error(
      "L'IA n'a pas trouvé de photos pertinentes. Réessaie ou ajoute tes propres photos.",
    );
  }

  // Téléchargement + conversion en PhotoItem (comme une photo uploadée).
  const settled = await Promise.allSettled(
    picked.slice(0, count).map((p) => stockPhotoToPhotoItem(p)),
  );
  const items: PhotoItem[] = [];
  settled.forEach((s) => {
    if (s.status === "fulfilled") items.push(s.value);
    else console.warn("[autoSelectStockPhotos] import échoué", s.reason);
  });
  if (items.length === 0) {
    throw new Error("L'import des photos a échoué. Réessaie.");
  }
  return items;
}

const MAX_DIM = 1600;

/**
 * Télécharge une photo stock et la convertit en PhotoItem (base64 redimensionné),
 * exactement à la forme produite par PhotoUploadZone pour une photo uploadée.
 */
export async function stockPhotoToPhotoItem(stock: StockPhoto): Promise<PhotoItem> {
  const res = await fetch(stock.url, { mode: "cors" });
  if (!res.ok) throw new Error("Téléchargement de la photo impossible.");
  const blob = await res.blob();
  const { base64, mimeType } = await blobToResizedBase64(blob);
  const name = stock.alt
    ? `${slugify(stock.alt).slice(0, 40) || "pexels"}.jpg`
    : `pexels-${stock.id}.jpg`;
  return {
    id: crypto.randomUUID(),
    base64,
    preview: base64,
    name,
    mimeType,
    context: "",
    // Traçabilité de la source libre de droit (crédit photographe Pexels).
    stockSource: "pexels",
    stockPhotographer: stock.photographer,
    stockSourceUrl: stock.source_url,
  };
}

async function blobToResizedBase64(
  blob: Blob,
): Promise<{ base64: string; mimeType: string }> {
  try {
    const bitmap = await createImageBitmap(blob);
    let { width, height } = bitmap;
    if (width > MAX_DIM || height > MAX_DIM) {
      const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }
    const canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(width, height)
        : (() => {
            const c = document.createElement("canvas");
            c.width = width;
            c.height = height;
            return c as unknown as OffscreenCanvas;
          })();
    const ctx = canvas.getContext("2d") as
      | OffscreenCanvasRenderingContext2D
      | CanvasRenderingContext2D
      | null;
    if (!ctx) throw new Error("Canvas indisponible");
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    if ("convertToBlob" in canvas) {
      const outBlob = await (canvas as OffscreenCanvas).convertToBlob({
        type: "image/jpeg",
        quality: 0.82,
      });
      return { base64: await blobToDataUrl(outBlob), mimeType: "image/jpeg" };
    }
    const dataUrl = (canvas as unknown as HTMLCanvasElement).toDataURL(
      "image/jpeg",
      0.82,
    );
    return { base64: dataUrl, mimeType: "image/jpeg" };
  } catch (e) {
    console.warn("[stockPhotoToPhotoItem] resize failed, falling back to raw blob", e);
    return { base64: await blobToDataUrl(blob), mimeType: blob.type || "image/jpeg" };
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
    reader.readAsDataURL(blob);
  });
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
