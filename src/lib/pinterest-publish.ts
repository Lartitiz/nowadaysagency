import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { resolveWorkspaceParam } from "@/lib/instagram-publish";

export interface PinterestPublishResult {
  success: boolean;
  permalink?: string;
  postId?: string;
}

export interface PinterestBoard {
  id: string;
  name: string;
}

/**
 * Liste les tableaux du compte Pinterest connecté (pour choisir la destination de l'épingle).
 * Lève une erreur avec un message lisible (à afficher en toast) en cas d'échec.
 */
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
  return ((data as any)?.boards || []) as PinterestBoard[];
}

/**
 * Publie une épingle (1 image, ou plusieurs = carrousel) sur un tableau Pinterest
 * via l'edge social-pinterest-publish. Lève une erreur lisible en cas d'échec.
 */
export async function publishPinToPinterest(opts: {
  boardId: string;
  imageUrls: string[];
  title?: string;
  description?: string;
  link?: string;
  altText?: string;
  workspaceId?: string | null;
  userId?: string | null;
  timeoutMs?: number;
}): Promise<PinterestPublishResult> {
  const {
    boardId,
    imageUrls,
    title,
    description,
    link,
    altText,
    workspaceId,
    userId,
    timeoutMs = 60000,
  } = opts;
  const { data, error } = await invokeWithTimeout(
    "social-pinterest-publish",
    {
      body: {
        board_id: boardId,
        image_urls: imageUrls,
        title,
        description,
        link,
        alt_text: altText,
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

/** Vrai si le message d'erreur correspond à « aucun compte Pinterest connecté ». */
export function isPinterestNotConnectedError(message: string | undefined): boolean {
  return !!message && message.toLowerCase().includes("aucun compte pinterest");
}
