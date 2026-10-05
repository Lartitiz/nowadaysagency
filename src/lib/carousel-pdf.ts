/**
 * Carrousel LinkedIn en document PDF (décision de Laetitia, 05/10/2026 : même
 * rythme qu'Instagram, publié comme « document » LinkedIn, qui se lit en
 * glissant page à page). Une slide rendue = une page de 1080×1350 points,
 * l'image occupe toute la page. Les slides sont rendues par
 * `renderCarouselSlidesToBlobs` (export-carousel-png.ts), comme l'export PNG.
 */

/** Taille d'une page : celle d'une slide (portrait 4:5). */
export const LINKEDIN_PDF_PAGE = { w: 1080, h: 1350 } as const;

/** Assemble des slides JPEG (dans l'ordre) en un PDF, une page par slide. */
export async function slidesToPdfBlob(slides: (Blob | Uint8Array)[]): Promise<Blob> {
  if (!slides.length) throw new Error("Aucune slide pour le PDF.");
  const jsPDF = (await import("jspdf")).default;
  const { w, h } = LINKEDIN_PDF_PAGE;
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: [w, h], compress: true });
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const bytes = slide instanceof Uint8Array ? slide : new Uint8Array(await slide.arrayBuffer());
    if (i > 0) doc.addPage([w, h], "portrait");
    doc.addImage(bytes, "JPEG", 0, 0, w, h);
  }
  return doc.output("blob");
}
