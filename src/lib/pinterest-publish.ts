// Publication d'épingles depuis /creer : lecture des tableaux du compte connecté
// et création d'une épingle (edges social-pinterest-boards / social-pinterest-publish).
// Recréé le 09/11/2026 (supprimé le 17/08/2026 faute d'appelant : aucun écran ne
// s'en servait encore). Appelé par src/hooks/use-creer-pinterest-publish.ts.
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { resolveWorkspaceParam } from "@/lib/instagram-publish";
import { supabase } from "@/integrations/supabase/client";

export interface PinterestPublishResult {
  success: boolean;
  permalink?: string;
  postId?: string;
}

export interface PinterestBoard {
  id: string;
  name: string;
}

// Même bucket que la publication Instagram : dossier de l'utilisatrice, lien signé.
const PUBLISH_BUCKET = "instagram-publish";
// Pinterest télécharge l'image après la création de l'épingle : on laisse une heure.
const SIGNED_URL_TTL_SECONDS = 3600;
// Effacement du visuel après la publication : Pinterest le récupère à la création de
// l'épingle, on attend quand même 2 minutes par prudence (onglet fermé avant : il reste).
export const PIN_IMAGE_CLEANUP_DELAY_MS = 120_000;

/** Liste les tableaux du compte Pinterest connecté. Lève une erreur lisible sinon. */
export async function listPinterestBoards(opts: {
  workspaceId?: string | null;
  userId?: string | null;
  timeoutMs?: number;
}): Promise<PinterestBoard[]> {
  const { workspaceId, userId, timeoutMs = 30000 } = opts;
  const { data, error } = await invokeWithTimeout(
    "social-pinterest-boards",
    { body: { workspace_id: resolveWorkspaceParam(workspaceId, userId) } },
    timeoutMs,
  );
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  const boards = (data as any)?.boards;
  return Array.isArray(boards)
    ? boards.filter((b: any) => b && typeof b.id === "string" && b.id).map((b: any) => ({ id: b.id, name: String(b.name || "Tableau") }))
    : [];
}

/** Publie une épingle (1 image) sur un tableau. Lève une erreur lisible sinon. */
export async function publishPinToPinterest(opts: {
  boardId: string;
  imageUrl: string;
  title?: string;
  description?: string;
  link?: string;
  workspaceId?: string | null;
  userId?: string | null;
  timeoutMs?: number;
}): Promise<PinterestPublishResult> {
  const { boardId, imageUrl, title, description, link, workspaceId, userId, timeoutMs = 60000 } = opts;
  const { data, error } = await invokeWithTimeout(
    "social-pinterest-publish",
    {
      body: {
        board_id: boardId,
        image_urls: [imageUrl],
        title,
        description,
        link,
        alt_text: title,
        workspace_id: resolveWorkspaceParam(workspaceId, userId),
      },
    },
    timeoutMs,
  );
  if (error) {
    if (["NETWORK", "TIMEOUT", "UNKNOWN"].includes(error.code)) {
      throw new Error("La réponse de Pinterest n’a pas pu être confirmée. Regarde ton tableau avant de réessayer, pour éviter un doublon.");
    }
    throw error;
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  if (typeof (data as any)?.postId !== "string" || !(data as any).postId.trim()) {
    throw new Error("La confirmation Pinterest est incomplète. Regarde ton tableau avant de réessayer.");
  }
  return { success: true, permalink: (data as any)?.permalink, postId: (data as any).postId };
}

/** Héberge le visuel rendu (PNG) le temps que Pinterest le récupère ; renvoie le lien signé et le chemin. */
export async function uploadPinImage(blob: Blob, userId: string): Promise<{ url: string; path: string }> {
  const path = `${userId}/pin-${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
  const { error } = await supabase.storage
    .from(PUBLISH_BUCKET)
    .upload(path, blob, { contentType: blob.type || "image/png", upsert: true });
  if (error) throw new Error(`Import du visuel échoué : ${error.message}`);
  const { data, error: signErr } = await supabase.storage.from(PUBLISH_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (signErr || !data?.signedUrl) {
    supabase.storage.from(PUBLISH_BUCKET).remove([path]).then(undefined, () => {});
    throw new Error("Lien du visuel introuvable. Réessaie dans un instant.");
  }
  return { url: data.signedUrl, path };
}

/** Efface le visuel hébergé, après un délai, sans jamais bloquer ni lever d'erreur. */
export function schedulePinImageCleanup(path: string, delayMs = PIN_IMAGE_CLEANUP_DELAY_MS): void {
  setTimeout(() => {
    supabase.storage.from(PUBLISH_BUCKET).remove([path]).then(undefined, () => {});
  }, delayMs);
}

/** Vrai si le message d'erreur correspond à « aucun compte Pinterest connecté ». */
export function isPinterestNotConnectedError(message: string | undefined): boolean {
  return !!message && message.toLowerCase().includes("aucun compte pinterest");
}
