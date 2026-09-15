// Helpers d'upload storage extraits de CreerUnifie.tsx (de-monolithisation).
// Un média requis absent ou un upload refusé bloque la sauvegarde. Les chemins
// versionnés préservent les fichiers de la dernière version enregistrée.


type UploadedPhoto = { base64?: string };
type VisualSlide = { html: string; slide_number: number | string };

/** Uploade les photos importées vers calendar-visuals, retourne les URLs publiques. */
export async function uploadPhotosToStorage(
  supabase: any,
  userId: string | undefined,
  postId: string,
  uploadedPhotos: UploadedPhoto[],
  onUploaded?: (path: string) => void,
): Promise<string[]> {
  if (!userId || uploadedPhotos.length === 0) return [];

  const urls: string[] = [];
  const version = crypto.randomUUID();
  for (let i = 0; i < uploadedPhotos.length; i++) {
    const photo = uploadedPhotos[i];
    if (!photo.base64) throw new Error(`La photo ${i + 1} est indisponible. Réimporte-la avant d’enregistrer.`);

    const raw = photo.base64.startsWith("data:")
      ? photo.base64
      : `data:image/jpeg;base64,${photo.base64}`;
    const response = await fetch(raw);
    const blob = await response.blob();

    const mime = blob.type || "image/jpeg";
    const ext = mime === "image/png" ? "png" : "jpg";

    const path = `${userId}/${postId}/photos/${version}/photo-${i + 1}.${ext}`;
    const { error } = await supabase.storage
      .from("calendar-visuals")
      .upload(path, blob, { contentType: mime, upsert: false });

    if (error) {
      throw new Error(`La photo ${i + 1} n’a pas pu être sauvegardée. Ton contenu reste dans l’éditeur.`);
    }

    onUploaded?.(path);
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
  onUploaded?: (path: string) => void,
): Promise<string[]> {
  if (!userId || visualSlides.length === 0) return [];

  // Same renderer and dimensions as direct publication. It fails before upload
  // when any slide cannot be captured, instead of returning an amputated carousel.
  const { renderCarouselSlidesToBlobs } = await import("@/lib/export-carousel-png");
  const rendered = await renderCarouselSlidesToBlobs(visualSlides.map(v => ({ ...v, slide_number: Number(v.slide_number) })));
  const urls: string[] = [];
  // Versioned paths prevent a failed upload replacing half of an older post.
  const version = crypto.randomUUID();
  for (const vs of rendered) {
    const path = `${userId}/${postId}/slides/${version}/slide-${vs.slide_number}.jpg`;
    const { error } = await supabase.storage
      .from("calendar-visuals")
      .upload(path, vs.blob, { contentType: "image/jpeg", upsert: false });
    if (error) throw new Error(`La slide ${vs.slide_number} n’a pas pu être sauvegardée. Réessaie avant de programmer le carrousel.`);
    onUploaded?.(path);
    const { data: urlData } = supabase.storage.from("calendar-visuals").getPublicUrl(path);
    urls.push(urlData.publicUrl);
    onProgress?.(urls.length, visualSlides.length);
  }
  return urls;
}

/** Rasterise un visuel Pinterest (pin ou overlay brief) et l'uploade. */
export async function uploadPinterestVisualToStorage(
  supabase: any,
  userId: string | undefined,
  postId: string,
  pinHtml: string,
  onUploaded?: (path: string) => void,
): Promise<string[]> {
  if (!userId || !pinHtml) return [];

  const { renderPinterestVisualToBlob } = await import("@/lib/export-carousel-png");
  const blob = await renderPinterestVisualToBlob(pinHtml);

  const path = `${userId}/${postId}/pinterest/${crypto.randomUUID()}/pin-visual.png`;
  const { error } = await supabase.storage
    .from("calendar-visuals")
    .upload(path, blob, { contentType: "image/png", upsert: false });

  if (error) {
    throw new Error("Le visuel Pinterest n’a pas pu être sauvegardé. Ton contenu reste dans l’éditeur.");
  }

  onUploaded?.(path);
  const { data: urlData } = supabase.storage
    .from("calendar-visuals")
    .getPublicUrl(path);

  return [urlData.publicUrl];
}
