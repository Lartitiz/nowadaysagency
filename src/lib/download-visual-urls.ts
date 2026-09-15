export interface DownloadedVisual {
  name: string;
  blob: Blob;
}

const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function extensionFor(blob: Blob, sourceUrl: string): string {
  const contentType = blob.type.split(";")[0].toLowerCase();
  if (CONTENT_TYPE_EXTENSIONS[contentType]) return CONTENT_TYPE_EXTENSIONS[contentType];
  try {
    const match = new URL(sourceUrl).pathname.match(/\.([a-z0-9]{2,5})$/i);
    if (match) return match[1].toLowerCase();
  } catch {
    // L'URL sera refusée par fetch ensuite ; le nom de secours reste sans danger.
  }
  return "jpg";
}

export async function fetchVisualFiles(urls: string[]): Promise<DownloadedVisual[]> {
  const validUrls = urls.filter((url) => typeof url === "string" && url.trim().length > 0);
  if (validUrls.length !== urls.length || validUrls.length === 0) {
    throw new Error("Aucun visuel téléchargeable n'est disponible.");
  }

  const files: DownloadedVisual[] = [];
  for (let index = 0; index < validUrls.length; index += 1) {
    let response: Response;
    try {
      response = await fetch(validUrls[index]);
    } catch {
      throw new Error(`Le visuel ${index + 1} sur ${validUrls.length} n'a pas pu être téléchargé.`);
    }
    if (!response.ok) {
      throw new Error(`Le visuel ${index + 1} sur ${validUrls.length} n'a pas pu être téléchargé.`);
    }
    const blob = await response.blob();
    files.push({ name: `slide-${index + 1}.${extensionFor(blob, validUrls[index])}`, blob });
  }
  return files;
}

function triggerDownload(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

function safeFileName(value: string): string {
  const sanitized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return sanitized || "carrousel";
}

/** Télécharge un visuel seul, ou une archive ordonnée et complète pour un lot. */
export async function downloadVisualUrls(urls: string[], title: string): Promise<number> {
  const files = await fetchVisualFiles(urls);
  if (files.length === 1) {
    triggerDownload(files[0].blob, files[0].name);
    return 1;
  }

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  for (const file of files) zip.file(file.name, file.blob);
  const archive = await zip.generateAsync({ type: "blob" });
  triggerDownload(archive, `visuels-${safeFileName(title)}.zip`);
  return files.length;
}
