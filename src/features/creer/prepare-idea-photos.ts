import { uploadPhotosToStorage } from "./upload-helpers";

/** Upload current local photos before committing an idea, preserving their order. */
export async function prepareIdeaPhotos(
  client: any,
  userId: string | undefined,
  ideaId: string | null | undefined,
  photos: { base64?: string; preview?: string }[],
  contentData: any,
) {
  if (!userId) throw new Error("Reconnecte-toi avant d’enregistrer les photos.");
  if (!photos.length) return { contentData };
  const uploaded: string[] = [];
  const rollback = async () => {
    if (!uploaded.length) return;
    const { error } = await client.storage.from("calendar-visuals").remove(uploaded);
    if (error) console.warn("Temporary idea photos cleanup failed:", error);
  };
  try {
    const local = photos.filter(photo => !!photo.base64);
    const urls = await uploadPhotosToStorage(client, userId, ideaId || crypto.randomUUID(), local, path => uploaded.push(path));
    let localIndex = 0;
    const ordered = photos.map(photo => photo.base64 ? urls[localIndex++] : photo.preview);
    if (ordered.length !== photos.length || ordered.some(url => typeof url !== "string" || !url.startsWith("https://"))) {
      throw new Error("Une photo est indisponible. Garde ce contenu ouvert et réessaie l’enregistrement.");
    }
    return {
      contentData: { ...contentData, image_url: ordered[0], photo_urls: ordered },
      rollback,
    };
  } catch (error) {
    await rollback().catch(cleanupError => console.warn("Temporary idea photos cleanup failed:", cleanupError));
    throw error;
  }
}
