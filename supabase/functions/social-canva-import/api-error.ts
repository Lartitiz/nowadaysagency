export class CanvaApiError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}
export function checkCanvaResponse(response: Pick<Response, "ok" | "status">, body: any): void {
  if (response.ok) return;
  if (response.status === 401 || body?.code === "invalid_access_token") {
    throw new CanvaApiError("not_connected", "Ta connexion Canva a expiré. Reconnecte ton compte Canva pour continuer.", 400);
  }
  if (response.status === 403) throw new CanvaApiError("canva_forbidden", "Canva refuse cet accès. Vérifie les autorisations de ton compte Canva.", 403);
  if (response.status === 429) throw new CanvaApiError("canva_rate_limit", "Canva reçoit trop de demandes. Attends un instant avant de reprendre l’import.", 429);
  throw new CanvaApiError("canva_unavailable", "Canva est momentanément indisponible. Vérifie tes designs avant de relancer l’import.", 502);
}
