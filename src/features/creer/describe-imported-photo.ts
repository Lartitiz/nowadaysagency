// Légende automatique d'une photo importée dans l'écran de création (26/11/2026,
// demande de Laetitia : « c'est un peu pénible de devoir mettre les descriptions
// à chaque fois »). Les photos de « Mes photos » sont décrites à leur ajout ;
// celles qu'on importe depuis l'ordinateur ne passent pas par la bibliothèque et
// arrivaient sans rien dans « Que montre chaque photo ? ».
//
// Un petit appel par photo (photo-describe, mode describe_image), sans crédit,
// sur une version allégée de l'image. Tout échec rend "" : la ligne reste vide,
// comme avant, et rien ne bloque la création.
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { downscaleBase64ForVision } from "@/lib/image-vision";
import { PHOTO_CONTEXT_TEXT_MAX } from "@/features/creer/photo-context-step";

export const DESCRIBE_IMPORTED_TIMEOUT_MS = 30_000;

export async function describeImportedPhoto(
  photo: { base64?: string; mimeType?: string },
  workspaceId?: string,
): Promise<string> {
  if (!photo?.base64) return "";
  try {
    const light = await downscaleBase64ForVision(photo.base64);
    if (!light) return "";
    const { data, error } = await invokeWithTimeout(
      "photo-describe",
      { body: { mode: "describe_image", workspace_id: workspaceId, image: { base64: light, mimeType: photo.mimeType || "image/jpeg" } } },
      DESCRIBE_IMPORTED_TIMEOUT_MS,
    );
    if (error) return "";
    const text = typeof data?.description === "string" ? data.description.trim() : "";
    return text.slice(0, PHOTO_CONTEXT_TEXT_MAX);
  } catch {
    return "";
  }
}
