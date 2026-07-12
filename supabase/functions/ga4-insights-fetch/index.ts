// Renvoie les statistiques réelles du site web via Google Analytics 4 (GA4) pour
// pré-remplir les colonnes « site web » de monthly_stats (visiteurs, utilisateurs,
// trafic par source) au lieu de la saisie manuelle. Miroir de instagram-insights-fetch.
//
// Phase 1 = compte de service Google + une seule propriété GA4. L'id de propriété
// vient de GA4_PROPERTY_ID (prioritaire) OU, à défaut, d'une ligne social_connections
// platform='google' pour l'espace (platform_account_id).
import { getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest, AuthError, getServiceClient } from "../_shared/auth.ts";
import { fetchGa4Month, resolveGoogleUserToken, type Ga4Auth } from "../_shared/ga4.ts";
import { decryptConnTokens, encryptToken } from "../_shared/token-crypto.ts";

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

    // ─── Gate + résolution de la propriété GA4 ───
    // On EXIGE une connexion Google (ligne social_connections platform='google')
    // pour l'espace appelant : c'est elle qui autorise l'accès ET porte l'id de
    // propriété. Sans cette ligne → 404, même si GA4_PROPERTY_ID est défini. Cela
    // empêche qu'un autre compte tire les données de la propriété globale Phase 1.
    //
    // Deux chemins d'authentification :
    //   - Phase 1 : access_token = 'service_account' → compte de service (secrets d'env).
    //   - Phase 2 : jeton OAuth utilisateur (déchiffré, rafraîchi si besoin).
    const supabase = getServiceClient();
    const resolved = await resolveGoogleUserToken(supabase, userId, workspaceId, {
      decryptConnTokens,
      encryptToken,
    });
    if (!resolved.conn) {
      return jsonError("Google Analytics n'est pas connecté sur ce compte.", corsHeaders, 404);
    }

    let auth: Ga4Auth;
    let propertyId: string;
    if (resolved.accessToken) {
      // Phase 2 : jeton utilisateur. La propriété DOIT venir de la connexion (pas
      // d'env fallback ici : chaque utilisatrice pointe sa propre propriété).
      auth = { mode: "user", accessToken: resolved.accessToken };
      propertyId = resolved.conn.platform_account_id || "";
      if (!propertyId) {
        return jsonError(
          "Aucune propriété Google Analytics sélectionnée. Choisis-en une pour continuer.",
          corsHeaders,
          409,
        );
      }
    } else {
      // Phase 1 : compte de service. Secrets requis, sinon 503.
      if (!Deno.env.get("GOOGLE_SA_CLIENT_EMAIL") || !Deno.env.get("GOOGLE_SA_PRIVATE_KEY")) {
        return jsonError(
          "Google Analytics n'est pas encore configuré côté serveur (compte de service manquant).",
          corsHeaders,
          503,
        );
      }
      auth = { mode: "service" };
      propertyId = resolved.conn.platform_account_id || Deno.env.get("GA4_PROPERTY_ID") || "";
      if (!propertyId) {
        return jsonError(
          "Connexion Google présente mais aucune propriété GA4 (ni platform_account_id ni GA4_PROPERTY_ID).",
          corsHeaders,
          404,
        );
      }
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
      const metrics = await fetchGa4Month(propertyId, month, auth);
      return new Response(
        JSON.stringify({ success: true, propertyId, month, metrics }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Défaut : mois EN COURS. GA4 renvoie les données du mois calendaire jusqu'à
    // aujourd'hui (contrairement à la fenêtre glissante 28 j d'Instagram), donc on
    // vise directement le mois courant — le cron figera le mois écoulé.
    const currentMonth = currentMonthKey(new Date());
    const metrics = await fetchGa4Month(propertyId, currentMonth, auth);
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
