import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { resolveWorkspaceParam } from "@/lib/instagram-publish";

export interface LinkedInPublishResult {
  success: boolean;
  permalink?: string;
  postId?: string;
}

/**
 * Publie un post TEXTE sur le profil LinkedIn connecté via l'edge social-linkedin-publish.
 * Lève une erreur avec un message lisible (à afficher en toast) en cas d'échec.
 */
export async function publishTextToLinkedIn(opts: {
  text: string;
  workspaceId?: string | null;
  userId?: string | null;
  timeoutMs?: number;
}): Promise<LinkedInPublishResult> {
  const { text, workspaceId, userId, timeoutMs = 60000 } = opts;
  const { data, error } = await invokeWithTimeout(
    "social-linkedin-publish",
    {
      body: {
        text,
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

/** Vrai si le message d'erreur correspond à « aucun compte LinkedIn connecté ». */
export function isLinkedInNotConnectedError(message: string | undefined): boolean {
  return !!message && message.toLowerCase().includes("aucun compte linkedin");
}
