import type { PhotoItem } from "@/components/creer/PhotoUploadZone";

/** Recover only explicit photo layers, never brand logos or decorative images. */
export function savedCarouselPhotoSources(slides: { html: string }[]): string[] {
  const sources = new Set<string>();
  for (const slide of slides) {
    const doc = new DOMParser().parseFromString(slide.html, "text/html");
    for (const node of doc.querySelectorAll<HTMLElement>("[data-pptx-photo],[data-editor-photo]")) {
      const image = node.matches("img") ? node : node.querySelector("img");
      const source = image?.getAttribute("src") || (node.style.backgroundImage || node.style.background).match(/url\(["']?([^"')]+)["']?\)/i)?.[1];
      if (source && (/^data:image\/(png|jpeg|webp|gif);base64,/i.test(source) || /^https:\/\//i.test(source))) sources.add(source);
    }
  }
  return [...sources];
}

/** All-or-nothing: an unavailable saved photo must not silently disappear. */
export async function restoreCarouselPhotos(slides: { html: string }[]): Promise<PhotoItem[]> {
  const sources = savedCarouselPhotoSources(slides);
  if (!sources.length) return [];
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.all(sources.map(async (source, i) => {
        let base64 = source;
        if (!source.startsWith("data:")) {
          const response = await fetch(source, { signal: controller.signal, credentials: "omit" });
          if (!response.ok) throw new Error("Photo inaccessible");
          const blob = await response.blob();
          if (!/^image\/(png|jpeg|webp|gif)$/i.test(blob.type) || blob.size > 15 * 1024 * 1024) throw new Error("Photo illisible");
          base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new Error("Photo illisible"));
            reader.readAsDataURL(blob);
          });
        }
        return { id: crypto.randomUUID(), name: `Photo enregistrée ${i + 1}`, base64, preview: base64, mimeType: base64.match(/^data:([^;]+);/)?.[1] };
      })),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("Chargement des photos interrompu")); }, 15000); }),
    ]);
  } finally { clearTimeout(timer); controller.abort(); }
}
