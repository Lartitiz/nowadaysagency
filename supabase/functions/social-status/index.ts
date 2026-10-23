import { assertWorkspaceMembership, workspaceDeniedResponse } from "../_shared/workspace-guard.ts";
// Returns the list of social connections for the current user/workspace WITHOUT exposing tokens.
import { getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest, AuthError, getServiceClient } from "../_shared/auth.ts";
import { checkConnectionHealth, SELF_RENEWING_PLATFORMS } from "../_shared/connection-health.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId } = await authenticateRequest(req);
    const body = await req.json().catch(() => ({}));
    const workspaceId: string | null = body?.workspace_id ?? null;
    // La page Connexions demande verify: true → on essaie de renouveler les jetons
    // Pinterest / Canva / Google expirés pour dire si la connexion marche encore.
    // Les autres écrans restent sur la lecture simple (rapide).
    const verify = body?.verify === true;

    const supabase = getServiceClient();
    const membership = await assertWorkspaceMembership(supabase, userId, workspaceId);
    if (!membership.ok) return workspaceDeniedResponse(corsHeaders);
    const filterCol = workspaceId ? "workspace_id" : "user_id";
    const filterVal = workspaceId || userId;
    let q = supabase
      .from("social_connections")
      .select(verify
        ? "id, platform, platform_account_name, platform_account_id, token_expires_at, access_token, refresh_token"
        : "platform, platform_account_name, platform_account_id, token_expires_at")
      .eq(filterCol, filterVal);
    if (workspaceId) q = q.eq("user_id", userId);
    else q = q.is("workspace_id", null);
    const { data, error } = await q;
    if (error) throw error;

    const health = verify
      ? await Promise.all((data || []).map((r: any) =>
        SELF_RENEWING_PLATFORMS.has(r.platform) ? checkConnectionHealth(supabase, r) : null
      ))
      : [];

    // Jamais de jeton dans la réponse : seulement les champs ci-dessous.
    const connections = (data || []).map((r: any, i: number) => ({
      platform: r.platform,
      connected: true,
      accountName: r.platform_account_name,
      expiresAt: health[i]?.expiresAt ?? r.token_expires_at,
      // Renouvellement refusé par la plateforme : la connexion existe en base
      // mais ne marche plus → la page affiche « Connexion expirée ».
      needsReconnect: health[i]?.health === "dead",
      // Google Analytics : la connexion peut exister sans propriété choisie (compte
      // à plusieurs propriétés) → l'app affiche un sélecteur. On n'expose pas l'id
      // lui-même, juste s'il en manque un.
      needsProperty: r.platform === "google" && !r.platform_account_id,
    }));

    return new Response(JSON.stringify({ connections }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    if (e instanceof AuthError) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: e.status, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }
    console.error("social-status error:", e);
    return new Response(JSON.stringify({ error: "Erreur interne du serveur" }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
