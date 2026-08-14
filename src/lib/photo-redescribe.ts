/**
 * photo-redescribe — re-décrit une photo dont les PIXELS viennent de changer.
 *
 * Audit tags du 14/08 : quatre opérations remplacent le fond ou la scène
 * (changer le décor, packshot, mise en scène, portrait pro) et aucune ne
 * re-décrivait le résultat. Les tags continuaient de décrire l'ANCIENNE image :
 * un packshot fond blanc restait tagué « noel, saisonnier, atelier ».
 *
 * La règle tient en une phrase : si les pixels changent, la description change.
 * L'edge photo-describe conserve les tags de provenance (packshot, portrait-pro…)
 * pour ne pas perdre l'origine de la photo.
 *
 * Appel en arrière-plan, jamais bloquant : un échec laisse simplement la photo
 * avec son ancienne description, régénérable à la main depuis sa fiche.
 */

import { invokeWithTimeout } from "@/lib/invoke-with-timeout";

export function redescribePhoto(photoId: string, workspaceId: string): void {
  invokeWithTimeout(
    "photo-describe",
    { body: { mode: "describe", photo_id: photoId, workspace_id: workspaceId } },
    60_000,
  )
    .then(({ error }) => {
      if (error) console.warn("[photo-redescribe]", error.message);
    })
    .catch((e) => console.warn("[photo-redescribe]", e));
}
