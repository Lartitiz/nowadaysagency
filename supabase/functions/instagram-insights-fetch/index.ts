// Renvoie les statistiques réelles du compte Instagram connecté (abonnés, reach,
// croissance, engagement, top/flop posts) pour pré-remplir l'audit Instagram avec
// des données factuelles au lieu de la saisie manuelle.
// Nécessite la permission instagram_business_manage_insights (revue Meta).
import { getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest, AuthError, getServiceClient } from "../_shared/auth.ts";
import { fetchInstagramInsights, fetchInstagramMonth, analyzeContentPerformance, fetchMonthPosts } from "../_shared/instagram-insights.ts";
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
      .eq("platform", "instagram")
      .eq(filterCol, filterVal);
    if (workspaceId) q = q.eq("user_id", userId);
    else q = q.is("workspace_id", null);
    const { data: conn, error: connErr } = await q.maybeSingle();

    if (connErr || !conn) {
      return jsonError(
        "Aucun compte Instagram connecté. Connecte-le dans Paramètres > Connexions.",
        corsHeaders,
        404,
      );
    }
    await decryptConnTokens(conn);

    // Garde-fou : la lecture des stats exige la permission insights. Si la connexion
    // a été établie avant la revue Meta, on demande une reconnexion plutôt qu'un 500.
    if (conn.scopes && !String(conn.scopes).includes("instagram_business_manage_insights")) {
      return jsonError(
        "Reconnecte ton compte Instagram pour autoriser la lecture de tes statistiques.",
        corsHeaders,
        409,
      );
    }

    // Backfill : body.month = "YYYY-MM-01" → agrégats de ce MOIS CALENDAIRE passé
    // (fenêtre since/until historique, ~24 mois max côté Meta). Utilisé par le
    // bouton « Récupérer mon historique » pour remplir les mois vides.
    const month: string | null = typeof body?.month === "string" ? body.month : null;
    if (month) {
      if (!/^\d{4}-\d{2}-01$/.test(month)) {
        return jsonError("Mois invalide (format attendu : YYYY-MM-01).", corsHeaders, 400);
      }
      const [y, mo] = month.split("-").map(Number);
      const start = Date.UTC(y, mo - 1, 1);
      const nowD = new Date();
      const currentMonthStart = Date.UTC(nowD.getUTCFullYear(), nowD.getUTCMonth(), 1);
      const oldest = Date.UTC(nowD.getUTCFullYear() - 2, nowD.getUTCMonth(), 1);
      // body.posts === true → liste des CONTENUS du mois avec métriques (pour
      // expliquer un mois dans l'analyse). Le mois en cours est autorisé ici.
      const wantPosts = body?.posts === true;
      const upperBound = wantPosts ? currentMonthStart + 1 : currentMonthStart;
      if (start >= upperBound || start < oldest) {
        return jsonError("Mois hors de la fenêtre récupérable (24 derniers mois).", corsHeaders, 400);
      }
      if (wantPosts) {
        const { posts, authError } = await fetchMonthPosts(supabase, conn, month);
        if (authError && !posts.length) {
          return jsonError(
            "Reconnecte ton compte Instagram pour autoriser la lecture de tes statistiques.",
            corsHeaders,
            409,
          );
        }
        return new Response(
          JSON.stringify({ success: true, accountName: conn.platform_account_name, month, monthPosts: posts }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const monthMetrics = await fetchInstagramMonth(supabase, conn, month);
      if (monthMetrics.authError && monthMetrics.reach == null && monthMetrics.views == null) {
        return jsonError(
          "Reconnecte ton compte Instagram pour autoriser la lecture de tes statistiques.",
          corsHeaders,
          409,
        );
      }
      return new Response(
        JSON.stringify({ success: true, accountName: conn.platform_account_name, month, monthMetrics }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Analyse de contenus : body.analysis === true → agrégats « ce qui marche
    // pour toi » (par format / jour / créneau, heure de Paris) sur ~50 posts.
    if (body?.analysis === true) {
      const analysis = await analyzeContentPerformance(supabase, conn, { max: 50 });
      if (analysis.authError && analysis.sampleSize === 0) {
        return jsonError(
          "Reconnecte ton compte Instagram pour autoriser la lecture de tes statistiques.",
          corsHeaders,
          409,
        );
      }
      return new Response(
        JSON.stringify({ success: true, accountName: conn.platform_account_name, analysis }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const metrics = await fetchInstagramInsights(supabase, conn);

    // Token invalide / permission retirée détecté pendant la lecture : demander
    // une reconnexion plutôt que de renvoyer un succès vide (avant, ces erreurs
    // étaient avalées en console.warn et indistinguables d'un trou de données).
    if (metrics.authError && !metrics.followers && !metrics.reach30d) {
      return jsonError(
        "Reconnecte ton compte Instagram pour autoriser la lecture de tes statistiques.",
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
    console.error("instagram-insights-fetch error:", e);
    return new Response(JSON.stringify({ error: "Erreur interne du serveur" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
