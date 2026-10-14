import { toast } from "sonner";
import { useOpenInCanva } from "@/hooks/use-open-in-canva";
import { pickNonEmpty } from "@/features/creer/photo-source";
import { pinterestCurrentText } from "@/lib/pinterest-current-text";

interface UseCreerExportsParams {
  result: any;
  visualSlides: { slide_number: number; html: string }[];
  uploadedPhotos: any[];
  generatedWithPhotos: any[];
  charterData: any;
  ideaText: string;
  carouselSubMode: "text" | "photo" | "mix" | "pure_photo" | "user_slides" | null;
  carouselVisualsStale: boolean;
  isCarouselPublish: boolean;
  pinterestPinHtml: string | null;
  photoBriefOverlayHtml: string | null;
}

/**
 * Exports de l'atelier /creer (lot D du découpage de CreerUnifie, fiche 1 de
 * docs/robustesse/gros-fichiers.md) : carrousel (PPTX texte, PNG, PDF LinkedIn,
 * PowerPoint éditable, Canva) et Pinterest (PNG, PNG du brief photo, PPTX
 * éditable). Code déplacé à l'identique ; les enveloppes démo (`demoToast`,
 * `effectiveHandle…`) restent dans la page. Les `import()` restent dynamiques
 * (poids de l'app au chargement).
 */
export function useCreerExports({
  result,
  visualSlides,
  uploadedPhotos,
  generatedWithPhotos,
  charterData,
  ideaText,
  carouselSubMode,
  carouselVisualsStale,
  isCarouselPublish,
  pinterestPinHtml,
  photoBriefOverlayHtml,
}: UseCreerExportsParams) {
  const handleExportPptx = async () => {
    if (!result?.raw?.slides) return;
    try {
      const { exportCarouselPptx } = await import("@/lib/export-carousel-pptx");
      const { resolvePhotoIndexes } = await import("@/lib/resolve-photo-index");
      const photosForExport = uploadedPhotos.length > 0 ? uploadedPhotos : undefined;
      // Filet déterministe : évite "une seule photo sur tous les slides" si l'IA a mal
      // (ou pas) renseigné photo_index. Couvre aussi les carrousels déjà sauvegardés.
      // « Mes slides » : association photo↔slide choisie par l'utilisatrice → pas de filet.
      const normalizedSlides = carouselSubMode === "user_slides"
        ? result.raw.slides
        : resolvePhotoIndexes(result.raw.slides, photosForExport?.length ?? 0);
      await exportCarouselPptx(
        normalizedSlides as any,
        ideaText || "carrousel",
        visualSlides.length > 0 ? visualSlides : undefined,
        charterData,
        photosForExport,
      );
      toast.success("PPTX éditable téléchargé !");
    } catch (e: any) {
      toast.error(e?.message || "Erreur lors de l'export");
    }
  };

  const handleExportVisualPng = async () => {
    if (visualSlides.length === 0) return;
    if (isCarouselPublish && carouselVisualsStale) {
      toast.warning("Les visuels ne reflètent pas tes dernières éditions. Mets-les à jour pour un export fidèle.");
      return;
    }
    try {
      toast.info("Export PNG en cours…");
      const { exportCarouselPng } = await import("@/lib/export-carousel-png");
      const { getIncludeLogoPref } = await import("@/lib/export-logo");
      const logoUrl = getIncludeLogoPref() ? (charterData as any)?.logo_url : null;
      const res = await exportCarouselPng(visualSlides, ideaText || "carrousel", logoUrl);
      if (res.failed.length > 0) {
        // Avant : slides ratées supprimées du ZIP en silence. On le dit.
        toast.warning(
          `${res.exported}/${res.total} slides exportées. La slide ${res.failed.join(", ")} n'a pas pu être rendue — régénère les visuels puis réessaie.`,
        );
      } else {
        toast.success(visualSlides.length > 1 ? "ZIP des images téléchargé !" : "PNG téléchargé !");
      }
    } catch (e: any) {
      toast.error(e?.message || "Erreur lors de l'export");
    }
  };

  // Carrousel LinkedIn : un PDF se publie comme « document » LinkedIn (même rythme qu'Instagram, décision du 05/10/2026).
  const handleExportVisualPdf = async () => {
    if (visualSlides.length === 0) return;
    if (isCarouselPublish && carouselVisualsStale) {
      toast.warning("Les visuels ne reflètent pas tes dernières éditions. Mets-les à jour pour un export fidèle.");
      return;
    }
    try {
      toast.info("Export PDF en cours…");
      const { exportCarouselPdf } = await import("@/lib/export-carousel-png");
      const { getIncludeLogoPref } = await import("@/lib/export-logo");
      const logoUrl = getIncludeLogoPref() ? (charterData as any)?.logo_url : null;
      await exportCarouselPdf(visualSlides, ideaText || "carrousel", logoUrl);
      toast.success("PDF téléchargé : publie-le comme document sur LinkedIn.");
    } catch (e: any) {
      toast.error(e?.message || "Erreur lors de l'export");
    }
  };

  const handleExportHybridPptx = async () => {
    if (visualSlides.length === 0) return;
    if (isCarouselPublish && carouselVisualsStale) {
      toast.warning("Les visuels ne reflètent pas tes dernières éditions. Mets-les à jour pour un export fidèle.");
      return;
    }
    try {
      toast.info("Export PowerPoint éditable en cours…");
      const { exportCarouselHybridPptx } = await import("@/lib/export-carousel-hybrid-pptx");
      const { getIncludeLogoPref } = await import("@/lib/export-logo");
      const logoUrl = getIncludeLogoPref() ? (charterData as any)?.logo_url : null;
      await exportCarouselHybridPptx(
        visualSlides,
        result?.raw?.slides || null,
        charterData || null,
        ideaText || "carrousel-editable",
        pickNonEmpty(generatedWithPhotos, uploadedPhotos),
        logoUrl,
      );
      toast.success("PowerPoint éditable téléchargé !");
    } catch (e: any) {
      toast.error(e?.message || "Erreur lors de l'export");
    }
  };

  // Pont Canva : exporte le carrousel en PPTX hybride, le dépose côté serveur
  // (edge `social-canva-import`), l'importe dans le Canva connecté et ouvre
  // l'URL d'édition. Logique partagée avec le calendrier via `useOpenInCanva`.
  const { openInCanva, openingCanva } = useOpenInCanva();
  const handleOpenInCanva = () => {
    if (visualSlides.length === 0) return;
    if (carouselVisualsStale) { toast.warning("Mets à jour les visuels avant de les ouvrir dans Canva."); return; }
    return openInCanva(
      async (onProgress) => {
        const { exportCarouselHybridPptx } = await import("@/lib/export-carousel-hybrid-pptx");
        const { getIncludeLogoPref } = await import("@/lib/export-logo");
        const logoUrl = getIncludeLogoPref() ? (charterData as any)?.logo_url : null;
        return (await exportCarouselHybridPptx(
          visualSlides,
          result?.raw?.slides || null,
          charterData || null,
          ideaText || "carrousel",
          pickNonEmpty(generatedWithPhotos, uploadedPhotos),
          logoUrl,
          { returnBlob: true, onProgress },
        )) as Blob;
      },
      ideaText || "Carrousel Nowadays",
      { etapes: visualSlides.length },
    );
  };

  const handleExportPinterestPng = async () => {
    if (!pinterestPinHtml) return;
    try {
      toast.info("Export PNG en cours...");
      const { exportPinterestVisualPng } = await import("@/lib/export-pinterest-visual-pptx");
      const { getIncludeLogoPref } = await import("@/lib/export-logo");
      const logoUrl = getIncludeLogoPref() ? (charterData as any)?.logo_url : null;
      await exportPinterestVisualPng(pinterestPinHtml, ideaText || "epingle-pinterest", logoUrl);
      toast.success("PNG téléchargé !");
    } catch (e: any) {
      toast.error(e?.message || "Erreur lors de l'export");
    }
  };

  const handleExportPhotoBriefPng = async () => {
    if (!photoBriefOverlayHtml) return;
    try {
      toast.info("Export PNG en cours...");
      const { exportPinterestVisualPng } = await import("@/lib/export-pinterest-visual-pptx");
      const { getIncludeLogoPref } = await import("@/lib/export-logo");
      const logoUrl = getIncludeLogoPref() ? (charterData as any)?.logo_url : null;
      await exportPinterestVisualPng(photoBriefOverlayHtml, ideaText || "overlay-pinterest", logoUrl);
      toast.success("PNG téléchargé !");
    } catch (e: any) {
      toast.error(e?.message || "Erreur lors de l'export");
    }
  };

  const handleExportPinterestEditablePptx = async () => {
    const pinData = result?.raw?.pin_data;
    if (!pinData) {
      toast.error("Données structurées non disponibles. Utilise l'export PNG ou PPTX image.");
      return;
    }
    try {
      toast.info("Export PPTX éditable en cours...");
      const { exportPinterestEditablePptx } = await import("@/lib/export-pinterest-editable-pptx");
      const currentSeo = pinterestCurrentText(result?.raw);
      await exportPinterestEditablePptx(
        pinData,
        currentSeo.title,
        currentSeo.description,
        ideaText || "epingle-pinterest",
        charterData
      );
      toast.success("PPTX éditable téléchargé !");
    } catch (e: any) {
      toast.error(e?.message || "Erreur lors de l'export");
    }
  };

  return {
    handleExportPptx,
    handleExportVisualPng,
    handleExportVisualPdf,
    handleExportHybridPptx,
    handleOpenInCanva,
    openingCanva,
    handleExportPinterestPng,
    handleExportPhotoBriefPng,
    handleExportPinterestEditablePptx,
  };
}
