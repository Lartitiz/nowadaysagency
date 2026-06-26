import { invokeWithTimeout } from "@/lib/invoke-with-timeout";

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

/** Vrai si l'URL est une image publique exploitable par l'API Instagram (https, pas blob/data). */
export function isPublicImageUrl(url: unknown): url is string {
  return typeof url === "string" && /^https:\/\//i.test(url) && !url.startsWith("blob:") && !url.startsWith("data:");
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
  const { data, error } = await invokeWithTimeout(
    "social-instagram-publish",
    { body: { caption, imageUrl, workspace_id: resolveWorkspaceParam(workspaceId, userId) } },
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

/** Vrai si le message d'erreur correspond à « aucun compte Instagram connecté ». */
export function isNotConnectedError(message: string | undefined): boolean {
  return !!message && message.toLowerCase().includes("aucun compte instagram");
}
