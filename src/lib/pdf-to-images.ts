/**
 * Rendu CÔTÉ NAVIGATEUR de chaque page d'un PDF en image JPEG (via pdfjs-dist).
 * Sert à importer un PDF déjà conçu (carrousel, slides) et le transformer en
 * visuels publiables. Aucun traitement serveur.
 */

export interface PdfToImagesResult {
  /** Une image JPEG par page rendue (dans l'ordre du PDF). */
  files: File[];
  /** Nombre total de pages du PDF (peut dépasser le nombre d'images si capé). */
  totalPages: number;
}

/**
 * Rend les pages d'un PDF en fichiers image JPEG.
 * @param file Le PDF source.
 * @param opts.maxPages Nombre max de pages rendues (défaut 10 = limite carrousel Instagram).
 * @param opts.targetWidth Largeur de rendu en px (défaut 1080, format Instagram).
 */
export async function pdfToImageFiles(
  file: File,
  opts?: { maxPages?: number; targetWidth?: number },
): Promise<PdfToImagesResult> {
  const maxPages = opts?.maxPages ?? 10;
  const targetWidth = opts?.targetWidth ?? 1080;

  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdf.numPages;
  const count = Math.min(totalPages, maxPages);

  const baseName = file.name.replace(/\.pdf$/i, "").trim() || "page";
  const files: File[] = [];

  for (let i = 1; i <= count; i++) {
    const page = await pdf.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const scale = targetWidth / base.width;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;

    // Fond blanc : un PDF peut avoir un fond transparent qui sortirait noir en JPEG.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport }).promise;

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92),
    );
    if (blob) files.push(new File([blob], `${baseName}-${i}.jpg`, { type: "image/jpeg" }));
  }

  return { files, totalPages };
}

export function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}
