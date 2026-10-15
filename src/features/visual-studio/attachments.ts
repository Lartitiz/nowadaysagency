// Photos jointes à la demande du Studio : rôle proposé pour une photo de la
// bibliothèque et liste gardée dans le navigateur. Fiche 4 de
// docs/robustesse/gros-fichiers.md, lot 1 : déplacé à l'identique depuis
// src/pages/VisualStudioPage.tsx.
import type { StudioReference } from "@/features/visual-studio/api";
import type { UserPhotoRow } from "@/lib/photo-storage";

export function referenceRoleForPhoto(photo: UserPhotoRow): StudioReference["role"] {
  if (photo.kind === "produit" || photo.kind === "produit_porte") return "product";
  if (photo.kind === "portrait") return "person";
  if (photo.kind === "ambiance") return "style";
  return "auto";
}
export function readAttachedIds(key: string): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch { return []; }
}
export function writeAttachedIds(key: string, ids: string[]) {
  try { localStorage.setItem(key, JSON.stringify(ids)); } catch { /* The session still contains the references. */ }
}
