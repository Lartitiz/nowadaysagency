// Renvoie les statistiques réelles LinkedIn (abonnés, croissance, impressions/
// réactions/commentaires/reposts des posts sur 30 j) pour la connexion analytics
// dédiée (platform = 'linkedin_analytics', scopes r_member_postAnalytics +
// r_member_profileAnalytics — distincte de la connexion de PUBLICATION).
import { getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest, AuthError, getServiceClient } from "../_shared/auth.ts";
import { fetchLinkedInInsights } from "../_shared/linkedin-insights.ts";
import { decryptConnTokens } from "../_shared/token-crypto.ts";

function jsonError(message: string, corsHeaders: Record<string, string>, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId } = await authenticateRequest(req);
    const body = await req.json().catch(() => ({}));
    const workspaceId: string | null = body?.workspace_id ?? null;

    const supabase = getServiceClient();
    const filterCol = workspaceId ? "workspace_id" : "user_id";
    const filterVal = workspaceId || userId;
    let q = supabase
      .from("social_connections")
      .select("*")
      .eq("platform", "linkedin_analytics")
      .eq(filterCol, filterVal);
    if (workspaceId) q = q.eq("user_id", userId);
    else q = q.is("workspace_id", null);
    const { data: conn, error: connErr } = await q.maybeSingle();

    if (connErr || !conn) {
      return jsonError(
        "Aucune connexion LinkedIn Analytics. Connecte-la dans Paramètres > Connexions.",
        corsHeaders,
        404,
      );
    }
    await decryptConnTokens(conn);

    // Garde-fou : la lecture des stats exige les deux scopes analytics. Si la
    // connexion a été établie avant leur ajout, on demande une reconnexion
    // plutôt qu'un 500 / des chiffres manquants silencieux.
    if (
      conn.scopes &&
      (!String(conn.scopes).includes("r_member_postAnalytics") ||
        !String(conn.scopes).includes("r_member_profileAnalytics"))
    ) {
      return jsonError(
        "Reconnecte ta connexion LinkedIn Analytics pour autoriser la lecture de tes statistiques.",
        corsHeaders,
        409,
      );
    }

    const metrics = await fetchLinkedInInsights(conn);

    if (metrics.authError && metrics.followers == null && !Object.keys(metrics.postAnalytics30d).length) {
      return jsonError(
        "Reconnecte ta connexion LinkedIn Analytics pour autoriser la lecture de tes statistiques.",
        corsHeaders,
        409,
      );
    }

    return new Response(
      JSON.stringify({ success: true, accountName: conn.platform_account_name, metrics }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    if (e instanceof AuthError) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: e.status,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }
    console.error("linkedin-insights-fetch error:", e);
    return new Response(JSON.stringify({ error: "Erreur interne du serveur" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
