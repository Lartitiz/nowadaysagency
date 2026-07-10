/**
 * news-photos — photos d'actualité LIBRES DE DROITS via Openverse (edge
 * news-photo-search), pour illustrer un carrousel newsjacking quand l'actu
 * mentionne une personnalité, une marque ou un événement précis.
 *
 * ⚖️ Licences déjà filtrées côté edge : CC0 / domaine public / CC BY uniquement
 * (jamais de NC ni de ND). Le crédit CC BY est OBLIGATOIRE → `newsPhotoCredit()`
 * fabrique la ligne à injecter dans la légende du post.
 *
 * Licence ≠ droit à l'image : ces photos servent à COMMENTER une actualité,
 * jamais à suggérer qu'une personnalité cautionne la marque.
 */

import { supabase } from "@/integrations/supabase/client";
import type { PhotoItem } from "@/components/creer/PhotoUploadZone";
import { blobToResizedBase64 } from "@/lib/stock-photos";

export interface NewsPhoto {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  width: number | null;
  height: number | null;
  creator: string;
  creator_url: string;
  license: string;
  license_version: string;
  license_url: string;
  source_url: string;
  provider: string;
  attribution: string;
}

export async function searchNewsPhotos(query: string, perPage = 24): Promise<NewsPhoto[]> {
  const q = query.trim();
  if (!q) return [];
  const { data, error } = await supabase.functions.invoke("news-photo-search", {
    body: { mode: "search", query: q, per_page: perPage },
  });
  if (error) {
    console.error("[searchNewsPhotos] échec de l'appel à news-photo-search:", error);
    throw new Error(
      "La recherche de photos d'actu est momentanément indisponible. Réessaie dans un instant.",
    );
  }
  if (data?.error) throw new Error(data.error);
  return (data?.photos ?? []) as NewsPhoto[];
}

/** Libellé court de licence pour les badges (ex : "CC BY 2.0", "CC0"). */
export function newsPhotoLicenseLabel(p: NewsPhoto): string {
  const lic = (p.license || "").toLowerCase();
  if (lic === "cc0") return "CC0";
  if (lic === "pdm") return "Domaine public";
  return `CC ${lic.toUpperCase()}${p.license_version ? ` ${p.license_version}` : ""}`;
}

/**
 * Ligne de crédit à injecter dans la légende du post (obligatoire en CC BY,
 * bonne pratique pour le reste).
 */
export function newsPhotoCredit(p: NewsPhoto): string {
  const licence = newsPhotoLicenseLabel(p);
  const creator = p.creator?.trim() || "auteur inconnu";
  const provider = p.provider?.trim() ? ` via ${p.provider}` : "";
  return `📷 Photo : ${creator} — ${licence}${provider}`;
}

/**
 * Télécharge la photo choisie et la convertit en PhotoItem (base64
 * redimensionné), à la forme produite par PhotoUploadZone. Essaie d'abord le
 * fetch direct (Wikimedia/Flickr envoient les en-têtes CORS), sinon passe par
 * le proxy de l'edge (certains providers indexés n'en envoient pas).
 */
export async function newsPhotoToPhotoItem(p: NewsPhoto): Promise<PhotoItem> {
  let blob: Blob | null = null;
  try {
    const res = await fetch(p.url, { mode: "cors" });
    if (res.ok) blob = await res.blob();
  } catch {
    // CORS refusé → proxy edge ci-dessous
  }
  if (!blob) {
    const { data, error } = await supabase.functions.invoke("news-photo-search", {
      body: { mode: "download", url: p.url },
    });
    if (error || !data?.image || data?.error) {
      throw new Error(data?.error || "Téléchargement de la photo impossible.");
    }
    const resp = await fetch(data.image as string);
    blob = await resp.blob();
  }
  const { base64, mimeType } = await blobToResizedBase64(blob);
  return {
    id: crypto.randomUUID(),
    base64,
    preview: base64,
    name: `actu-${(p.title || p.id).toString().slice(0, 40).replace(/[^a-zA-Z0-9à-ÿÀ-Ÿ -]/g, "").trim() || "photo"}.jpg`,
    mimeType,
    context: "",
    stockSource: p.provider || "openverse",
    stockPhotographer: p.creator,
    stockSourceUrl: p.source_url,
  };
}
