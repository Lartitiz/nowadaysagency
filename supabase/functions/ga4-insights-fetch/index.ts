// Renvoie les statistiques réelles du site web via Google Analytics 4 (GA4) pour
// pré-remplir les colonnes « site web » de monthly_stats (visiteurs, utilisateurs,
// trafic par source) au lieu de la saisie manuelle. Miroir de instagram-insights-fetch.
//
// Phase 1 = compte de service Google + une seule propriété GA4. L'id de propriété
// vient de GA4_PROPERTY_ID (prioritaire) OU, à défaut, d'une ligne social_connections
// platform='google' pour l'espace (platform_account_id).
import { getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest, AuthError, getServiceClient } from "../_shared/auth.ts";
import { fetchGa4Month } from "../_shared/ga4.ts";

function jsonError(message: string, corsHeaders: Record<string, string>, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Premier jour du mois courant (format YYYY-MM-01, UTC).
function currentMonthKey(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId } = await authenticateRequest(req);
    const body = await req.json().catch(() => ({}));
    const workspaceId: string | null = body?.workspace_id ?? null;

    // Secrets du compte de service requis pour Phase 1.
    if (!Deno.env.get("GOOGLE_SA_CLIENT_EMAIL") || !Deno.env.get("GOOGLE_SA_PRIVATE_KEY")) {
      return jsonError(
        "Google Analytics n'est pas encore configuré côté serveur (compte de service manquant).",
        corsHeaders,
        503,
      );
    }

    // ─── Gate + résolution de la propriété GA4 ───
    // On EXIGE une connexion Google (ligne social_connections platform='google')
    // pour l'espace appelant : c'est elle qui autorise l'accès ET porte l'id de
    // propriété. Sans cette ligne → 404, même si GA4_PROPERTY_ID est défini. Cela
    // empêche qu'un autre compte tire les données de la propriété globale Phase 1.
    const supabase = getServiceClient();
    const filterCol = workspaceId ? "workspace_id" : "user_id";
    const filterVal = workspaceId || userId;
    let cq = supabase
      .from("social_connections")
      .select("platform_account_id")
      .eq("platform", "google")
      .eq(filterCol, filterVal);
    if (workspaceId) cq = cq.eq("user_id", userId);
    else cq = cq.is("workspace_id", null);
    const { data: conn } = await cq.maybeSingle();
    if (!conn) {
      return jsonError("Google Analytics n'est pas connecté sur ce compte.", corsHeaders, 404);
    }
    // La ligne porte l'id de propriété ; sinon on retombe sur l'env (Phase 1).
    const propertyId = conn.platform_account_id || Deno.env.get("GA4_PROPERTY_ID") || "";
    if (!propertyId) {
      return jsonError(
        "Connexion Google présente mais aucune propriété GA4 (ni platform_account_id ni GA4_PROPERTY_ID).",
        corsHeaders,
        404,
      );
    }

    // Backfill : body.month = "YYYY-MM-01" → agrégats de ce MOIS CALENDAIRE.
    const month: string | null = typeof body?.month === "string" ? body.month : null;
    if (month) {
      if (!/^\d{4}-\d{2}-01$/.test(month)) {
        return jsonError("Mois invalide (format attendu : YYYY-MM-01).", corsHeaders, 400);
      }
      const [y, mo] = month.split("-").map(Number);
      const start = Date.UTC(y, mo - 1, 1);
      const nowD = new Date();
      const currentMonthStart = Date.UTC(nowD.getUTCFullYear(), nowD.getUTCMonth(), 1);
      if (start > currentMonthStart) {
        return jsonError("Mois dans le futur.", corsHeaders, 400);
      }
      const metrics = await fetchGa4Month(propertyId, month);
      return new Response(
        JSON.stringify({ success: true, propertyId, month, metrics }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Défaut : mois EN COURS. GA4 renvoie les données du mois calendaire jusqu'à
    // aujourd'hui (contrairement à la fenêtre glissante 28 j d'Instagram), donc on
    // vise directement le mois courant — le cron figera le mois écoulé.
    const currentMonth = currentMonthKey(new Date());
    const metrics = await fetchGa4Month(propertyId, currentMonth);
    return new Response(
      JSON.stringify({ success: true, propertyId, month: currentMonth, metrics }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    if (e instanceof AuthError) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: e.status,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }
    console.error("ga4-insights-fetch error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Erreur interne du serveur" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
