import { exportFileName } from "./export-file-name";
import { inlineCarouselMedia, inlineSlidesMedia } from "./carousel-media";
import PptxGenJS from "pptxgenjs";
import { RENDER_CONCURRENCY } from "@/lib/export-budget";
import { fetchLogoAsBase64 } from "./export-logo";
import {
  type HybridCharter,
  PPTX_W_IN,
  PPTX_H_IN,
  type VisualSlide,
  type SlideData,
  type OriginalPhoto,
} from "./export-carousel-hybrid/types";
import { measureImageNatural } from "./export-carousel-hybrid/photo-crop";
import { MAX_GRADIENT_CAPTURES, RASTER_SCALE } from "./export-carousel-hybrid/capture";
import { renderHybridSlide, type HybridSlideContext } from "./export-carousel-hybrid/render-slide";
export { isMonoFont, desiredTextWidthIn, parentCardOf, verticalBudgetPx, maxFitPt, addBlockToSlide } from "./export-carousel-hybrid/text-layout";

export { findOverlayElement, applyTextTransform } from "./export-carousel-hybrid/text-blocks";

export { type OriginalPhoto, type PhotoZone, type HybridCharter, type BlockRender, type BlockLayoutContext } from "./export-carousel-hybrid/types";
export { type ScrimSpec, parseScrimStyle } from "./export-carousel-hybrid/scrims";
export { stripDataUrlsFromBackground, extractPhotoZones, type ClearedBackdrop, zoneCoversRect, zoneOverlapsRect, clearOpaqueBackdropsBehindZone } from "./export-carousel-hybrid/photo-zones";

// ---------------------------------------------------------------------------
// main export
// ---------------------------------------------------------------------------

export async function exportCarouselHybridPptx(
  visualSlides: VisualSlide[],
  slidesData: SlideData[] | null | undefined,
  charter: HybridCharter | null | undefined,
  fileName = "carrousel-editable",
  originalPhotos?: OriginalPhoto[],
  logoUrl?: string | null,
  opts?: {
    returnBlob?: boolean;
    /** Appelé après chaque slide rastérisée, pour un avancement visible. */
    onProgress?: (faites: number, total: number) => void;
  },
): Promise<Blob | void> {
  // Photos rangées à part (liens) : remises en data URL, dont dépend le
  // repérage des zones photo ; une photo d'origine retrouvée par son seul
  // lien (base64 vide) est rechargée de la même façon.
  visualSlides = await inlineSlidesMedia(visualSlides);
  if (originalPhotos) originalPhotos = await Promise.all(originalPhotos.map(async (photo: OriginalPhoto & { preview?: string }) =>
    photo && !photo.base64 && photo.preview?.includes("/carousel-media/")
      ? { ...photo, base64: await inlineCarouselMedia(photo.preview) }
      : photo));
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "INSTAGRAM", width: PPTX_W_IN, height: PPTX_H_IN });
  pptx.layout = "INSTAGRAM";
  pptx.author = "L'Assistant Com'";

  // Pré-charge le logo une seule fois (sera ajouté en top layer sur chaque slide)
  const logoBase64 = await fetchLogoAsBase64(logoUrl);
  const logoSize = logoBase64 ? await measureImageNatural(logoBase64) : null;

  // Cache des recadrages photo, clé par (photoIndex + ratio cadre arrondi).
  // Une même photo peut servir plusieurs cadres de ratios différents → on cache par ratio.
  const cropCache = new Map<string, string | null>();




  // Pré-création des slides DANS L'ORDRE → l'ordre du carrousel est figé, même si les
  // rendus (parallélisés plus bas) se terminent dans le désordre.
  const slideObjs = visualSlides.map(() => pptx.addSlide());

  const ctx: HybridSlideContext = { visualSlides, slidesData, charter, originalPhotos, slideObjs, cropCache, logoBase64, logoSize };
  const renderSlideAt = (i: number) => renderHybridSlide(ctx, i);

  // Rendu par LOTS CONCURRENTS : la rastérisation html2canvas (scale 3) est le poste le
  // plus lourd ; en traiter quelques-unes en parallèle réduit fortement le temps total.
  // L'ordre du deck est garanti par la pré-création des slides ci-dessus, et chaque slide
  // a son propre iframe (aucun état partagé hormis cropCache, sûr en mono-thread JS).
  const tAll0 = performance.now(); // perf instrumentation
  let slidesFaites = 0;
  for (let start = 0; start < visualSlides.length; start += RENDER_CONCURRENCY) {
    await Promise.all(
      visualSlides
        .slice(start, start + RENDER_CONCURRENCY)
        .map((_, k) =>
          renderSlideAt(start + k).then(() => {
            slidesFaites += 1;
            opts?.onProgress?.(slidesFaites, visualSlides.length);
          }),
        ),
    );
  }
  console.log(`[hybrid][perf] ${visualSlides.length} slides rasterisées en ${Math.round(performance.now() - tAll0)}ms (scale ${RASTER_SCALE}, gradient-captures ${MAX_GRADIENT_CAPTURES})`);

  // Pour le pont Canva : renvoyer le PPTX en Blob (à uploader puis importer) plutôt
  // que de déclencher un téléchargement.
  if (opts?.returnBlob) {
    return (await pptx.write({ outputType: "blob" })) as Blob;
  }
  await pptx.writeFile({ fileName: exportFileName(fileName, "pptx") });
}