// supabase/functions/_shared/workspace-guard.ts

export type WorkspaceGuardResult =
  | { ok: true; role: string }
  | { ok: false; status: number };

/**
 * Vérifie que `userId` est membre de `workspaceId`.
 * - workspaceId null/undefined  -> { ok: true, role: "legacy" }  (mode mono-user préservé)
 * - membre trouvé               -> { ok: true, role: <role DB> }
 * - non membre / erreur lecture -> { ok: false, status: 403 }
 *
 * `sb` doit être un client SERVICE_ROLE déjà instancié par l'appelant.
 * Le helper ne crée jamais son propre client et reste pur (pas d'effet de bord).
 */
export async function assertWorkspaceMembership(
  sb: any,
  userId: string,
  workspaceId: string | null | undefined,
): Promise<WorkspaceGuardResult> {
  if (!workspaceId) return { ok: true, role: "legacy" };

  const { data, error } = await sb
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return { ok: false, status: 403 };
  return { ok: true, role: data.role };
}

export function workspaceDeniedResponse(
  corsHeaders: Record<string, string>,
): Response {
  return new Response(
    JSON.stringify({
      error: "workspace_access_denied",
      message: "Tu n'as pas accès à cet espace.",
    }),
    {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}
