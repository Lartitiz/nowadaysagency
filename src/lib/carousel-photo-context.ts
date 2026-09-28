import type { UserPhotoRow } from "./photo-storage";

/** Library descriptions may be inferred. Never turn them into user testimony. */
export function carouselLibraryContext(photo: Pick<UserPhotoRow, "name" | "description" | "tags" | "kind">): string {
  return [photo.name && `Nom : ${photo.name}`, photo.description && `Description : ${photo.description}`,
    photo.kind && `Classement : ${photo.kind}`, photo.tags?.length && `Mots-clés : ${photo.tags.join(", ")}`]
    .filter(Boolean).join("\n").slice(0, 800);
}
