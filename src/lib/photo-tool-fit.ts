// Quels outils de retouche conviennent à une photo, d'après son classement.
// Partagé par la fiche photo (Mes photos) et les raccourcis du Studio, pour
// que les deux proposent les mêmes outils au même type de photo.
import type { UserPhotoRow } from "@/lib/photo-storage";

type FitInput = Pick<UserPhotoRow, "kind" | "tags" | "background_preset_key"> | null | undefined;

export function photoToolFit(photo: FitInput) {
  // P4 (18/10/2026) : une image faite par un outil produit (fond blanc, mise
  // en scène) reste un produit même si l'IA la classe ensuite « autre » ; et
  // « autre » (classement incertain) ne cache plus les outils produit. Seuls
  // portrait, ambiance et coulisses les rangent sous le repli.
  const madeByProductTool =
    photo?.background_preset_key === "packshot" ||
    photo?.background_preset_key === "mise_en_scene" ||
    !!photo?.tags?.some((t) => t === "packshot" || t === "mise-en-scene");
  const isProduct =
    !photo?.kind ||
    photo.kind === "produit" ||
    photo.kind === "produit_porte" ||
    photo.kind === "autre" ||
    madeByProductTool;
  const isPortrait = photo?.kind === "portrait";
  // Photo d'un lieu (pièce, façade, paysage…) : la photo EST le décor.
  // « Changer le décor » y réinvente murs et sol (QA du 12/11/2026).
  const isPlace = photo?.kind === "ambiance" && !isProduct;
  const isUncertain = photo?.kind === "autre" && !madeByProductTool;
  return { madeByProductTool, isProduct, isPortrait, isPlace, isUncertain };
}
