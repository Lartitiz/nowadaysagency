// Helpers d'upload storage extraits de CreerUnifie.tsx (de-monolithisation).
// Fonctions d'I/O (DOM + html2canvas + supabase storage) : la logique est
// identique à l'origine, les dépendances (client supabase, userId, état) sont
// désormais passées en paramètres au lieu d'être capturées par closure.

type UploadedPhoto = { base64?: string };
type VisualSlide = { html: string; slide_number: number | string };

/** Uploade les photos importées vers calendar-visuals, retourne les URLs publiques. */
export async function uploadPhotosToStorage(
  supabase: any,
  userId: string | undefined,
  postId: string,
  uploadedPhotos: UploadedPhoto[],
): Promise<string[]> {
  if (!userId || uploadedPhotos.length === 0) return [];

  const urls: string[] = [];
  for (let i = 0; i < uploadedPhotos.length; i++) {
    const photo = uploadedPhotos[i];
    if (!photo.base64) continue;

    const raw = photo.base64.startsWith("data:")
      ? photo.base64
      : `data:image/jpeg;base64,${photo.base64}`;
    const response = await fetch(raw);
    const blob = await response.blob();

    const mime = blob.type || "image/jpeg";
    const ext = mime === "image/png" ? "png" : "jpg";

    const path = `${userId}/${postId}/photos/photo-${i + 1}.${ext}`;
    const { error } = await supabase.storage
      .from("calendar-visuals")
      .upload(path, blob, { contentType: mime, upsert: true });

    if (error) {
      console.error(`Failed to upload photo ${i + 1}:`, error);
      continue;
    }

    const { data: urlData } = supabase.storage
      .from("calendar-visuals")
      .getPublicUrl(path);

    urls.push(urlData.publicUrl);
  }
  return urls;
}

/** Rasterise les slides (html2canvas) et les uploade vers calendar-visuals. */
export async function uploadVisualsToStorage(
  supabase: any,
  userId: string | undefined,
  postId: string,
  visualSlides: VisualSlide[],
  onProgress?: (done: number, total: number) => void,
): Promise<string[]> {
  if (!userId || visualSlides.length === 0) return [];

  const container = document.createElement("div");
  container.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1080px;height:1350px;overflow:hidden;z-index:-1;";
  document.body.appendChild(container);

  const urls: string[] = [];
  let done = 0;
  try {
    for (const vs of visualSlides) {
      container.innerHTML = vs.html;
      await document.fonts?.ready;
      await new Promise(r => setTimeout(r, 400));

      const canvas = await (await import("html2canvas")).default(container, {
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

      const path = `${userId}/${postId}/slides/slide-${vs.slide_number}.png`;
      const { error } = await supabase.storage
        .from("calendar-visuals")
        .upload(path, blob, { contentType: "image/png", upsert: true });

      if (error) {
        console.error(`Failed to upload slide ${vs.slide_number}:`, error);
      } else {
        const { data: urlData } = supabase.storage
          .from("calendar-visuals")
          .getPublicUrl(path);

        urls.push(urlData.publicUrl);
      }

      done += 1;
      onProgress?.(done, visualSlides.length);
    }
  } finally {
    document.body.removeChild(container);
  }
  return urls;
}

/** Rasterise un visuel Pinterest (pin ou overlay brief) et l'uploade. */
export async function uploadPinterestVisualToStorage(
  supabase: any,
  userId: string | undefined,
  postId: string,
  pinHtml: string,
): Promise<string[]> {
  if (!userId || !pinHtml) return [];

  const container = document.createElement("div");
  container.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1000px;height:1500px;overflow:hidden;z-index:-1;";
  document.body.appendChild(container);

  const urls: string[] = [];
  try {
    container.innerHTML = pinHtml;
    await document.fonts.ready;
    await new Promise(r => setTimeout(r, 400));

    const canvas = await (await import("html2canvas")).default(container, {
      width: 1000,
      height: 1500,
      scale: 1,
      useCORS: true,
      allowTaint: true,
      backgroundColor: null,
      logging: false,
    });

    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b!), "image/png");
    });

    const path = `${userId}/${postId}/pinterest/pin-visual.png`;
    const { error } = await supabase.storage
      .from("calendar-visuals")
      .upload(path, blob, { contentType: "image/png", upsert: true });

    if (error) {
      console.error("Failed to upload pinterest visual:", error);
      return [];
    }

    const { data: urlData } = supabase.storage
      .from("calendar-visuals")
      .getPublicUrl(path);

    urls.push(urlData.publicUrl);
  } finally {
    document.body.removeChild(container);
  }
  return urls;
}
