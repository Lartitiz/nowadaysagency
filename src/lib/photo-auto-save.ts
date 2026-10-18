/**
 * Rangement automatique d'une image payée dans « Mes photos » (P4, 18/10/2026).
 *
 * Règle 6 du plan photos : une image qui a coûté une génération ne se perd
 * jamais. La mise en scène et le fond blanc gardaient leur résultat dans la
 * fenêtre seulement (Échap ou la croix le jetaient) : chaque image reçue est
 * désormais rangée dans la bibliothèque dès qu'elle arrive. La personne peut
 * retirer un essai qui ne lui plaît pas (« Retirer cet essai »).
 */

import { supabase } from "@/integrations/supabase/client";
import { derivedPhotoDescription, derivedPhotoName, rootPhotoName } from "@/lib/photo-naming";
import { redescribePhoto } from "@/lib/photo-redescribe";
import { uploadPhotoOriginal, type UserPhotoRow } from "@/lib/photo-storage";

export function slugifyPhotoName(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "photo"
  );
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const m = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!m) throw new Error("Image invalide");
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1] });
}

/** Ce qui distingue un outil de l'autre au rangement. */
export interface GeneratedPhotoKind {
  /** Suffixe du fichier et du nom : « mise en scène », « packshot ». */
  label: string;
  /** Étiquette de provenance posée sur la photo (« mise-en-scene », « packshot »). */
  tag: string;
  /** background_preset_key : sert aussi à reconnaître un produit dans la fiche. */
  presetKey: string;
  /** Début de la description d'attente (avant que photo-describe repasse). */
  descriptionPrefix: string;
  /** Description d'attente quand la source n'en a pas. */
  descriptionFallback: string;
}

export const MISE_EN_SCENE_KIND: GeneratedPhotoKind = {
  label: "mise en scène",
  tag: "mise-en-scene",
  presetKey: "mise_en_scene",
  descriptionPrefix: "Mise en scène IA",
  descriptionFallback: "Produit mis en scène par IA",
};

export const PACKSHOT_KIND: GeneratedPhotoKind = {
  label: "packshot",
  tag: "packshot",
  presetKey: "packshot",
  descriptionPrefix: "Packshot fond blanc",
  descriptionFallback: "Packshot e-commerce sur fond blanc",
};

/**
 * Range l'image (data URL) comme NOUVELLE photo de la bibliothèque, l'originale
 * reste intacte. Renvoie l'id de la photo créée.
 */
export async function saveGeneratedPhoto(params: {
  dataUrl: string;
  source: UserPhotoRow;
  userId: string;
  kind: GeneratedPhotoKind;
}): Promise<string> {
  const { dataUrl, source, userId, kind } = params;
  const blob = dataUrlToBlob(dataUrl);
  const file = new File(
    [blob],
    `${slugifyPhotoName(rootPhotoName(source.name, "photo"))}-${slugifyPhotoName(kind.label)}.jpg`,
    { type: blob.type || "image/jpeg" },
  );
  const { photoId } = await uploadPhotoOriginal({
    file,
    userId,
    workspaceId: source.workspace_id,
    name: derivedPhotoName(source.name, kind.label),
    purpose: "library",
  });

  // Pas d'héritage des tags de la source (audit 14/08) : le décor a changé,
  // tout tag de décor de la source serait faux. photo-describe décrira la
  // vraie image ensuite.
  const { error } = await supabase
    .from("user_photos")
    .update({
      tags: [kind.tag],
      description: derivedPhotoDescription(kind.descriptionPrefix, source.description, kind.descriptionFallback),
      source_type: "generated",
      background_preset_key: kind.presetKey,
    })
    .eq("id", photoId);
  if (error) console.warn(`[photo-auto-save:${kind.tag}] metadata update failed:`, error.message);
  redescribePhoto(photoId, source.workspace_id);
  return photoId;
}
