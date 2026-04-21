import html2canvas from "html2canvas";

interface VisualSlide {
  slide_number: number;
  html: string;
}

/**
 * Capture les visualSlides HTML en PNG (1080x1350) et les télécharge :
 * - 1 slide → PNG seul
 * - >1 slides → ZIP via JSZip (fallback : téléchargements séparés)
 *
 * Réutilisé par le calendrier (CalendarPostPreview) ET l'atelier (CreerUnifie).
 */
export async function exportCarouselPng(
  visualSlides: VisualSlide[],
  fileName = "carrousel",
): Promise<void> {
  if (!visualSlides || visualSlides.length === 0) return;

  const sanitize = (s: string) =>
    s.replace(/[^a-zA-Z0-9àâéèêëïîôùûüç\-_.]/g, "-");

  const container = document.createElement("div");
  container.style.cssText =
    "position:fixed;top:-9999px;left:-9999px;width:1080px;height:1350px;overflow:hidden;z-index:-1;";
  document.body.appendChild(container);

  try {
    const images: { name: string; blob: Blob }[] = [];

    for (const vs of visualSlides) {
      container.innerHTML = vs.html;
      await document.fonts.ready;
      await new Promise((r) => setTimeout(r, 400));

      const canvas = await html2canvas(container, {
        width: 1080,
        height: 1350,
        scale: 1,
        useCORS: true,
        allowTaint: true,
        backgroundColor: null,
        logging: false,
      });

      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b!), "image/png");
      });

      images.push({ name: `slide-${vs.slide_number}.png`, blob });
    }

    if (images.length === 1) {
      const url = URL.createObjectURL(images[0].blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = images[0].name;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      for (const img of images) zip.file(img.name, img.blob);
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = sanitize(`visuels-${fileName}.zip`);
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Fallback : téléchargements séparés
      for (const img of images) {
        const url = URL.createObjectURL(img.blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = img.name;
        a.click();
        URL.revokeObjectURL(url);
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  } finally {
    document.body.removeChild(container);
  }
}
