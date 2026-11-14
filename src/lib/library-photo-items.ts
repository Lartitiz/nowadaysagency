import { toast } from "sonner";
import { userPhotoToBase64, type UserPhotoRow } from "@/lib/photo-storage";
import { carouselLibraryContext } from "@/lib/carousel-photo-context";
import type { PhotoItem } from "@/components/creer/PhotoUploadZone";

/** Photos de « Mes photos » prêtes pour un carrousel (une photo illisible est signalée et sautée). */
export async function libraryRowsToItems(rows: UserPhotoRow[], quiet = false): Promise<PhotoItem[]> {
  const results = await Promise.allSettled(rows.map((p) => userPhotoToBase64(p)));
  const items: PhotoItem[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      items.push({
        id: crypto.randomUUID(),
        base64: r.value.base64,
        preview: r.value.base64,
        name: r.value.name,
        mimeType: r.value.mimeType,
        context: "",
        libraryContext: carouselLibraryContext(rows[i]),
        userPhotoId: rows[i].id,
      });
    } else {
      const name = rows[i].name || "photo";
      console.warn("[photo-library-import] failed", name, r.reason);
      if (!quiet) toast.error(`Impossible d'importer "${name}". Réessaie dans un instant.`);
    }
  });
  return items;
}

/**
 * « L'app choisit » (14/11/2026) : avec des photos dans « Mes photos », on y pioche
 * d'abord (les plus proches du sujet), et on complète par des photos libres de droit
 * seulement s'il en manque. Renvoie les photos ajoutées et le message à afficher.
 */
export async function autoPickPhotos(opts: {
  want: number;
  takenIds: Set<string>;
  pickFromLibrary?: (count: number) => Promise<UserPhotoRow[]>;
  pickStock?: (count: number) => Promise<PhotoItem[]>;
}): Promise<{ added: PhotoItem[]; message: string }> {
  const { want, takenIds, pickFromLibrary, pickStock } = opts;
  let mine: PhotoItem[] = [];
  if (pickFromLibrary) {
    try {
      const rows = (await pickFromLibrary(want + takenIds.size)).filter((r) => !takenIds.has(r.id)).slice(0, want);
      mine = await libraryRowsToItems(rows, true);
    } catch (e) {
      console.warn("[photo-auto-pick] bibliothèque", e);
    }
  }
  let stock: PhotoItem[] = [];
  if (mine.length < want && pickStock) {
    try {
      stock = await pickStock(want - mine.length);
    } catch (e) {
      if (mine.length === 0) throw e;
      console.warn("[photo-auto-pick] libres de droit", e);
    }
  }
  const added = [...mine, ...stock];
  const parts = [
    mine.length > 0 ? `${mine.length} de tes photos` : "",
    stock.length > 0 ? `${stock.length} photo${stock.length > 1 ? "s" : ""} libre${stock.length > 1 ? "s" : ""} de droit` : "",
  ].filter(Boolean).join(" et ");
  const message = added.length === 0
    ? "Aucune photo trouvée. Choisis-les toi-même ou continue sans photo."
    : `${parts.charAt(0).toUpperCase()}${parts.slice(1)} choisie${added.length > 1 ? "s" : ""}. Tu peux en retirer ou en ajouter.`;
  return { added, message };
}
