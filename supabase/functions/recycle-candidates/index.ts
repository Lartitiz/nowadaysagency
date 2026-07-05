// RECYCLAGE INTELLIGENT — liste les posts passés qui méritent une seconde vie.
//
// Croise deux sources :
// - calendar_posts PUBLIÉS par l'app (texte complet conservé dans content_draft) ;
// - métriques réelles par post du compte Instagram connecté (fetchRecentPostMetrics,
//   ~25 derniers posts) pour mesurer « ça a marché » (taux d'engagement).
// Le classement (fonction pure, testée) : top engagement d'abord, puis les posts
// anciens « à faire revivre ». Sans connexion Instagram, la feature marche quand
// même en mode « revive » (ancienneté seule).
//
// Lecture seule : AUCUN appel IA, AUCUN crédit consommé, pas de logUsage.
import { getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest, AuthError, getServiceClient } from "../_shared/auth.ts";
import { fetchRecentPostMetrics, type IgPostMetrics } from "../_shared/instagram-insights.ts";
import { decryptConnTokens } from "../_shared/token-crypto.ts";
import { rankRecycleCandidates, type AppPublishedPost } from "../_shared/recycle-ranking.ts";

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

    // 1. Posts publiés par l'app (le texte complet vit dans content_draft).
    const { data: posts, error: postsErr } = await supabase
      .from("calendar_posts")
      .select("id, theme, content_draft, canal, format, published_at, date, published_post_id, status, publish_status")
      .eq(filterCol, filterVal)
      .or("publish_status.eq.published,status.eq.published")
      .not("content_draft", "is", null)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(40);
    if (postsErr) {
      console.error("recycle-candidates: lecture calendar_posts échouée:", postsErr.message);
      return new Response(
        JSON.stringify({ error: "Impossible de lire tes posts publiés. Réessaie dans un instant." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Métriques Instagram réelles — best effort : sans connexion (ou sans la
    // permission insights), le recyclage fonctionne en mode « revive ».
    let igPosts: IgPostMetrics[] = [];
    let igConnected = false;
    let igPartial = false;
    try {
      let q = supabase
        .from("social_connections")
        .select("*")
        .eq("platform", "instagram")
        .eq(filterCol, filterVal);
      if (workspaceId) q = q.eq("user_id", userId);
      else q = q.is("workspace_id", null);
      const { data: conn } = await q.maybeSingle();
      if (conn) {
        igConnected = true;
        await decryptConnTokens(conn);
        const hasInsights = !conn.scopes ||
          String(conn.scopes).includes("instagram_business_manage_insights");
        if (hasInsights) {
          const res = await fetchRecentPostMetrics(supabase, conn);
          igPosts = res.posts;
          igPartial = res.partial;
        }
      }
    } catch (e) {
      console.warn("recycle-candidates: métriques IG indisponibles (mode revive):", e);
      igPartial = true;
    }

    const candidates = rankRecycleCandidates((posts || []) as AppPublishedPost[], igPosts);

    return new Response(
      JSON.stringify({ candidates, igConnected, partial: igPartial }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    if (e instanceof AuthError) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: e.status,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }
    console.error("recycle-candidates error:", e);
    return new Response(JSON.stringify({ error: "Erreur interne du serveur" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
