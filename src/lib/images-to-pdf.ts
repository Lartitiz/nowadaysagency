/**
 * Construit un PDF (une page par image) à partir d'URLs d'images publiques.
 * Sert à fabriquer un carrousel « document » LinkedIn quand la source n'est pas
 * déjà un PDF — pour que LinkedIn affiche un vrai carrousel qui se swipe.
 */

async function loadImageData(url: string): Promise<{ dataUrl: string; w: number; h: number }> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Image inaccessible pour le PDF."));
    img.src = url;
  });
  const w = img.naturalWidth || 1080;
  const h = img.naturalHeight || 1350;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.92), w, h };
}

/** Génère un File PDF (1 image = 1 page, dimensions préservées). */
export async function imagesToPdfFile(urls: string[], fileName = "carrousel"): Promise<File> {
  if (!urls || urls.length === 0) throw new Error("Aucune image pour le PDF.");
  const jsPDF = (await import("jspdf")).default;
  let doc: any = null;
  for (const url of urls) {
    const { dataUrl, w, h } = await loadImageData(url);
    const orientation = w >= h ? "landscape" : "portrait";
    if (!doc) doc = new jsPDF({ orientation, unit: "px", format: [w, h] });
    else doc.addPage([w, h], orientation);
    doc.addImage(dataUrl, "JPEG", 0, 0, w, h);
  }
  const blob = doc.output("blob");
  const safe = fileName.replace(/[^a-zA-Z0-9àâéèêëïîôùûüç\-_]/g, "-").slice(0, 60) || "carrousel";
  return new File([blob], `${safe}.pdf`, { type: "application/pdf" });
}
