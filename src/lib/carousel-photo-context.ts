import type { UserPhotoRow } from "./photo-storage";

/**
 * Une image rangée par le Studio portait la RÉPONSE du Studio comme description (« Je crée
 * une nouvelle photo d'ambiance… », « Je modifie le mur du fond… », rejeu du 26/11/2026). Ce
 * n'est pas ce que montre la photo : on ne la passe ni à l'écran ni à l'IA. Depuis ce jour
 * le Studio fait décrire l'image après son rangement ; ce filtre couvre les images d'avant.
 */
export function isAssistantReply(description: string | null | undefined): boolean {
  return /^(je\s|j['’]|voilà(?![\p{L}])|voici(?![\p{L}]))/iu.test((description || "").trim());
}

/** Library descriptions may be inferred. Never turn them into user testimony. */
export function carouselLibraryContext(photo: Pick<UserPhotoRow, "name" | "description" | "tags" | "kind">): string {
  const description = isAssistantReply(photo.description) ? "" : photo.description;
  return [photo.name && `Nom : ${photo.name}`, description && `Description : ${description}`,
    photo.kind && `Classement : ${photo.kind}`, photo.tags?.length && `Mots-clés : ${photo.tags.join(", ")}`]
    .filter(Boolean).join("\n").slice(0, 800);
}
