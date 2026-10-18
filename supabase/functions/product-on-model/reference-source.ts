/**
 * Photo produit téléchargée déjà réduite (18/10/2026, choix de Laetitia :
 * option B du chantier P1).
 *
 * Décoder une photo 2000×2000 coûtait ~1 s de CPU en ligne pour le seul
 * recadrage : la passe zoomée ne rentrait plus sous la limite (~2 s) et
 * sautait. Le stockage rend la photo à 1280 px au plus (calcul fait chez lui,
 * pas dans la fonction) ; le recadrage et la vision partent de cette copie.
 * Une photo déjà assez petite est téléchargée telle quelle. Tout échec de la
 * version réduite → photo d'origine (l'ancien comportement).
 */
import { imageSize } from "../_shared/product-fidelity.ts";

export const REFERENCE_MAX_SIDE = 1280;

type Download = (options?: { transform: Record<string, unknown> }) => Promise<{ data: Blob | null; error: unknown }>;

export interface ReferenceSource {
  blob: Blob | null;
  reduced: boolean;
  error?: unknown;
}

async function sideOf(blob: Blob) {
  const size = imageSize(new Uint8Array(await blob.slice(0, 256 * 1024).arrayBuffer()));
  return size ? Math.max(size.width, size.height) : null;
}

/** `known` = largest side recorded in user_photos (null when unknown). */
export async function downloadReference(download: Download, known: number | null): Promise<ReferenceSource> {
  const reduced = async (): Promise<Blob | null> => {
    try {
      const { data, error } = await download({
        transform: { width: REFERENCE_MAX_SIDE, height: REFERENCE_MAX_SIDE, resize: "contain", format: "origin", quality: 90 },
      });
      if (error || !data || !/^image\/(jpeg|png)$/.test(data.type)) return null;
      const side = await sideOf(data);
      return side && side <= REFERENCE_MAX_SIDE ? data : null;
    } catch {
      return null;
    }
  };
  if (known && known > REFERENCE_MAX_SIDE) {
    const small = await reduced();
    if (small) return { blob: small, reduced: true };
  }
  const { data, error } = await download();
  if (error || !data) return { blob: null, reduced: false, error };
  if (!known) {
    const side = await sideOf(data);
    if (side && side > REFERENCE_MAX_SIDE) {
      const small = await reduced();
      if (small) return { blob: small, reduced: true };
    }
  }
  return { blob: data, reduced: false };
}
