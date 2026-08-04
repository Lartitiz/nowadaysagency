import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { supabase } from "@/integrations/supabase/client";

const PUBLISH_BUCKET = "instagram-publish";
// Durée de vie de l'URL signée servie à Instagram. Instagram récupère (cURL) chaque
// image en quelques secondes au moment de la création des containers ; 1h est large.
const SIGNED_URL_TTL_SECONDS = 3600;

export interface InstagramPublishResult {
  success: boolean;
  permalink?: string;
  postId?: string;
}

/**
 * Résout le paramètre workspace_id attendu par les edge functions social-*.
 * En mode mono-utilisateur (legacy), useWorkspaceId() renvoie l'user.id : dans ce cas
 * on n'envoie pas de workspace_id (undefined). Sinon on transmet le workspace actif.
 * Les fonctions social-status / social-instagram-publish exigent ce paramètre pour
 * retrouver la connexion (sinon « Aucun compte Instagram connecté »).
 */
export function resolveWorkspaceParam(
  workspaceId: string | null | undefined,
  userId: string | null | undefined,
): string | undefined {
  return workspaceId && userId && workspaceId !== userId ? workspaceId : undefined;
}

/** Vrai si l'URL est une VIDÉO publique exploitable par l'API Instagram (reel monté). */
export function isPublicVideoUrl(url: unknown): url is string {
  return typeof url === "string" && /^https:\/\//i.test(url) && /\.mp4(\?|$)/i.test(url);
}

/** Vrai si l'URL est une image publique exploitable par l'API Instagram (https, pas blob/data). */
export function isPublicImageUrl(url: unknown): url is string {
  return (
    typeof url === "string" &&
    /^https:\/\//i.test(url) &&
    !url.startsWith("blob:") &&
    !url.startsWith("data:") &&
    // Un reel monté vit dans media_urls comme les images : sans ce filtre il
    // partirait en `image_url` et Instagram refuserait le média.
    !isPublicVideoUrl(url)
  );
}

/**
 * Publie un REEL vidéo sur le compte connecté (media_type=REELS côté edge).
 *
 * Le délai par défaut est volontairement long : Instagram TRANSCODE la vidéo
 * avant de la publier, ce qui prend des dizaines de secondes à plusieurs
 * minutes. Le budget des images (2 min) faisait échouer un reel valide.
 */
export async function publishReelToInstagram(opts: {
  caption: string;
  videoUrl: string;
  workspaceId?: string | null;
  userId?: string | null;
  timeoutMs?: number;
}): Promise<InstagramPublishResult> {
  const { caption, videoUrl, workspaceId, userId, timeoutMs = 330000 } = opts;
  const { data, error } = await invokeWithTimeout(
    "social-instagram-publish",
    { body: { caption, videoUrl, workspace_id: resolveWorkspaceParam(workspaceId, userId) } },
    timeoutMs,
  );
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return {
    success: true,
    permalink: (data as any)?.permalink,
    postId: (data as any)?.postId,
  };
}

/**
 * Cœur de publication : envoie 1 à 10 images publiques à l'edge social-instagram-publish
 * (1 image = post simple ; 2 à 10 = carrousel). Lève une erreur lisible en cas d'échec.
 */
export async function publishToInstagram(opts: {
  caption: string;
  imageUrls: string[];
  workspaceId?: string | null;
  userId?: string | null;
  timeoutMs?: number;
}): Promise<InstagramPublishResult> {
  const { caption, imageUrls, workspaceId, userId, timeoutMs = 120000 } = opts;
  const { data, error } = await invokeWithTimeout(
    "social-instagram-publish",
    {
      body: {
        caption,
        imageUrls,
        // Rétro-compatibilité : l'ancienne edge ne lit que `imageUrl`. On envoie aussi la
        // 1re image pour que la publication image simple marche même si la nouvelle edge
        // (qui lit `imageUrls`) n'est pas encore déployée.
        imageUrl: imageUrls[0],
        workspace_id: resolveWorkspaceParam(workspaceId, userId),
      },
    },
    timeoutMs,
  );
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return {
    success: true,
    permalink: (data as any)?.permalink,
    postId: (data as any)?.postId,
  };
}

/**
 * Publie une image simple sur le feed Instagram connecté.
 * Lève une erreur avec un message lisible en cas d'échec (à afficher en toast).
 */
export async function publishImageToInstagram(opts: {
  caption: string;
  imageUrl: string;
  workspaceId?: string | null;
  userId?: string | null;
  timeoutMs?: number;
}): Promise<InstagramPublishResult> {
  const { caption, imageUrl, workspaceId, userId, timeoutMs = 60000 } = opts;
  return publishToInstagram({ caption, imageUrls: [imageUrl], workspaceId, userId, timeoutMs });
}

interface VisualSlideInput {
  slide_number: number;
  html: string;
}

/**
 * Upload les slides dans le bucket (privé) et renvoie une URL SIGNÉE par slide + les
 * chemins. Le bucket est privé (la politique workspace interdit les buckets publics) :
 * on sert donc des URLs signées temporaires plutôt que getPublicUrl — Instagram les
 * récupère sans authentification le temps de la publication.
 */
async function uploadSlideBlobs(
  blobs: { slide_number: number; blob: Blob }[],
  userId: string,
): Promise<{ urls: string[]; paths: string[] }> {
  const urls: string[] = [];
  const paths: string[] = [];
  for (const { slide_number, blob } of blobs) {
    // Les slides sont rasterisées en JPEG pour Instagram (cf. renderCarouselSlidesToBlobs) ;
    // on déduit l'extension et le content-type du blob réel plutôt que de forcer du PNG.
    const isJpeg = blob.type === "image/jpeg";
    const ext = isJpeg ? "jpg" : "png";
    const path = `${userId}/ig-${Date.now()}-${slide_number}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage
      .from(PUBLISH_BUCKET)
      .upload(path, blob, { contentType: blob.type || "image/png", upsert: true });
    if (error) throw new Error(`Upload d'une slide échoué : ${error.message}`);
    const { data, error: signErr } = await supabase.storage
      .from(PUBLISH_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (signErr || !data?.signedUrl) {
      throw new Error(`URL signée introuvable pour une slide : ${signErr?.message ?? "inconnue"}`);
    }
    urls.push(data.signedUrl);
    paths.push(path);
  }
  return { urls, paths };
}

/**
 * Publie un carrousel à partir des visualSlides (HTML) : rend chaque slide en PNG
 * (1080x1350, ratio 4:5 accepté par Instagram), l'héberge dans le bucket public, puis
 * publie le carrousel. Nettoie les fichiers ensuite (Instagram a déjà récupéré les
 * images au moment du publish).
 */
export async function publishRenderedCarouselToInstagram(opts: {
  caption: string;
  visualSlides: VisualSlideInput[];
  logoUrl?: string | null;
  workspaceId?: string | null;
  userId: string;
  timeoutMs?: number;
}): Promise<InstagramPublishResult> {
  const { caption, visualSlides, logoUrl, workspaceId, userId, timeoutMs = 120000 } = opts;
  const { renderCarouselSlidesToBlobs } = await import("@/lib/export-carousel-png");
  const blobs = await renderCarouselSlidesToBlobs(visualSlides, logoUrl);
  if (blobs.length < 2) throw new Error("Le carrousel doit contenir au moins 2 visuels valides.");
  if (blobs.length > 10) {
    throw new Error(`Instagram limite les carrousels à 10 images (celui-ci en a ${blobs.length}).`);
  }
  const { urls, paths } = await uploadSlideBlobs(blobs, userId);
  try {
    return await publishToInstagram({ caption, imageUrls: urls, workspaceId, userId, timeoutMs });
  } finally {
    supabase.storage.from(PUBLISH_BUCKET).remove(paths).then(undefined, () => {});
  }
}

/** Vrai si le message d'erreur correspond à « aucun compte Instagram connecté ». */
export function isNotConnectedError(message: string | undefined): boolean {
  return !!message && message.toLowerCase().includes("aucun compte instagram");
}
