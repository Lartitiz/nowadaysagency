// Snapshot mensuel automatique des stats Instagram.
//
// Problème résolu : « Remplir depuis Instagram » lit une fenêtre GLISSANTE de
// 28 jours — si l'utilisatrice ne clique pas en toute fin de mois, le mois est
// perdu (ou approximé par un clic en milieu de mois). Ce cron tourne le 1er de
// chaque mois tôt le matin : la fenêtre 28 j couvre alors quasi exactement le
// mois qui vient de se terminer → on fige ces chiffres dans la ligne du mois
// ÉCOULÉ, pour tous les comptes Instagram connectés avec la permission insights.
//
// Prudence :
// - on ne REMPLACE JAMAIS une valeur déjà saisie (manuellement ou via le
//   bouton) : seulement les champs vides de la ligne existante ;
// - chaque connexion est isolée (une erreur n'arrête pas les autres) ;
// - déclenché par pg_cron (service-role) ou un admin ; personne d'autre.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { fetchInstagramInsights, countPostsInWindow, newFetchContext } from "../_shared/instagram-insights.ts";
import { refreshTokenIfNeeded } from "../_shared/instagram-graph.ts";
import { decryptConnTokens, encryptToken } from "../_shared/token-crypto.ts";
import { fetchGa4Month, resolveGoogleUserToken, type Ga4Auth } from "../_shared/ga4.ts";

function json(body: unknown, corsHeaders: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Premier jour du mois PRÉCÉDENT (le cron tourne le 1er du mois suivant).
function previousMonthKey(now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // ─── AUTH : service-role (pg_cron) OU admin — même pattern qu'email-trigger ───
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  let authorized = bearer === serviceRoleKey;
  if (!authorized && bearer) {
    try {
      const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
      const { data: userData, error: userErr } = await anonClient.auth.getUser(bearer);
      if (!userErr && userData.user) {
        const { data: roleRow } = await supabase
          .from("user_roles").select("role")
          .eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
        if (roleRow) authorized = true;
      }
    } catch (_) { /* non autorisé */ }
  }
  if (!authorized) return json({ error: "Unauthorized" }, corsHeaders, 401);

  try {
    const monthDate = previousMonthKey(new Date());

    const { data: conns, error: connErr } = await supabase
      .from("social_connections")
      .select("*")
      .eq("platform", "instagram");
    if (connErr) throw connErr;

    const results: { conn: string; status: string }[] = [];
    for (const conn of conns || []) {
      const label = conn.platform_account_name || conn.id;
      try {
        // La lecture des stats exige la permission insights (revue Meta).
        if (conn.scopes && !String(conn.scopes).includes("instagram_business_manage_insights")) {
          results.push({ conn: label, status: "skip_no_insights_scope" });
          continue;
        }
        await decryptConnTokens(conn);
        const m = await fetchInstagramInsights(supabase, conn);
        if (m.authError || (!m.followers && !m.reach30d)) {
          results.push({ conn: label, status: m.authError ? "auth_error" : "no_data" });
          continue;
        }

        // Ligne du mois écoulé, dans le même scope que la connexion.
        let q = supabase.from("monthly_stats").select("*").eq("month_date", monthDate);
        if (conn.workspace_id) q = q.eq("workspace_id", conn.workspace_id);
        else q = q.eq("user_id", conn.user_id).is("workspace_id", null);
        const { data: existing } = await q.limit(1).maybeSingle();

        // Ne remplit QUE les champs vides — jamais d'écrasement d'une saisie.
        const cur = (existing || {}) as Record<string, unknown>;
        const patch: Record<string, unknown> = {};
        const setIfEmpty = (col: string, val: unknown) => {
          if (val != null && (cur[col] == null)) patch[col] = val;
        };
        setIfEmpty("followers", m.followers);
        setIfEmpty("reach", m.reach30d);
        setIfEmpty("views", m.views30d);
        setIfEmpty("interactions", m.totalInteractions30d);
        setIfEmpty("accounts_engaged", m.accountsEngaged30d);
        setIfEmpty("profile_visits", m.profileViews30d);
        if (typeof m.followerGrowth30d === "number" && m.followerGrowth30d >= 0) {
          setIfEmpty("followers_gained", m.followerGrowth30d);
        }
        // Posts du mois ÉCOULÉ (fenêtre calendaire exacte, pas la glissante 28 j).
        if (cur.posts_count == null) {
          const [py, pm] = monthDate.split("-").map(Number);
          const pSince = Math.floor(Date.UTC(py, pm - 1, 1) / 1000);
          const pUntil = Math.floor(Date.UTC(py, pm, 1) / 1000);
          const ctx = newFetchContext();
          const token = await refreshTokenIfNeeded(supabase, conn);
          const count = await countPostsInWindow(conn.platform_account_id, token, ctx, pSince, pUntil);
          if (typeof count === "number") patch.posts_count = count;
        }

        const customData: Record<string, unknown> = { ...((cur.custom_data as Record<string, unknown>) || {}) };
        const aud = m.audience;
        if (aud && !customData.ig_audience) {
          customData.ig_audience = { ...aud, fetchedAt: m.fetchedAt };
        }
        if ((m.topPosts?.length || m.flopPosts?.length) && !customData.ig_top_posts) {
          customData.ig_top_posts = { top: m.topPosts || [], flop: m.flopPosts || [], fetchedAt: m.fetchedAt };
        }
        if (Object.keys(customData).length) patch.custom_data = customData;

        if (!Object.keys(patch).length) {
          results.push({ conn: label, status: "already_filled" });
          continue;
        }

        if (existing?.id) {
          const { error: upErr } = await supabase.from("monthly_stats")
            .update({ ...patch, updated_at: new Date().toISOString() })
            .eq("id", existing.id);
          if (upErr) throw upErr;
          results.push({ conn: label, status: "updated" });
        } else {
          const { error: insErr } = await supabase.from("monthly_stats").insert({
            ...patch,
            user_id: conn.user_id,
            workspace_id: conn.workspace_id ?? null,
            month_date: monthDate,
            updated_at: new Date().toISOString(),
          });
          if (insErr) throw insErr;
          results.push({ conn: label, status: "created" });
        }
      } catch (e) {
        console.error("stats-monthly-snapshot: connexion en échec", label, e);
        results.push({ conn: label, status: "error" });
      }
    }

    console.log("stats-monthly-snapshot:", monthDate, JSON.stringify(results));

    // ─── Google Analytics (Phase 1 compte de service + Phase 2 OAuth per-user) ───
    // On fige les colonnes « site web » du mois écoulé pour les espaces connectés
    // à GA4. Ne remplit QUE les champs vides. Chaque connexion est isolée.
    const ga4Results: { scope: string; status: string }[] = [];
    const ga4EnvProperty = Deno.env.get("GA4_PROPERTY_ID") || "";
    const saConfigured = !!Deno.env.get("GOOGLE_SA_CLIENT_EMAIL")
      && !!Deno.env.get("GOOGLE_SA_PRIVATE_KEY");
    {
      try {
        // Gate par la CONNEXION Google (social_connections platform='google'), pas
        // par uses_ga4 : on ne remplit que les espaces réellement connectés, ce qui
        // empêche la propriété globale Phase 1 de fuiter dans d'autres comptes.
        const { data: ga4Conns } = await supabase
          .from("social_connections")
          .select("user_id, workspace_id, platform_account_id")
          .eq("platform", "google");
        // Cache clé = mode:propertyId (les propertyId GA4 sont globalement uniques,
        // donc mêmes données quel que soit le jeton — mais on sépare service/user
        // par prudence, un jeton user pouvant manquer d'accès à la propriété globale).
        const metricsCache = new Map<string, Awaited<ReturnType<typeof fetchGa4Month>>>();
        for (const conn of ga4Conns || []) {
          const scope = conn.workspace_id || conn.user_id;
          try {
            // Résout le mode d'authentification (service vs user) + le jeton frais.
            const resolved = await resolveGoogleUserToken(
              supabase, conn.user_id, conn.workspace_id, { decryptConnTokens, encryptToken },
            );
            if (!resolved.conn) { ga4Results.push({ scope, status: "no_connection" }); continue; }

            let auth: Ga4Auth;
            let propertyId: string;
            if (resolved.accessToken) {
              auth = { mode: "user", accessToken: resolved.accessToken };
              propertyId = resolved.conn.platform_account_id || "";
            } else {
              if (!saConfigured) { ga4Results.push({ scope, status: "sa_not_configured" }); continue; }
              auth = { mode: "service" };
              propertyId = resolved.conn.platform_account_id || ga4EnvProperty;
            }
            if (!propertyId) { ga4Results.push({ scope, status: "no_property" }); continue; }

            const cacheKey = `${auth.mode}:${propertyId}`;
            let ga4Metrics = metricsCache.get(cacheKey);
            if (!ga4Metrics) {
              ga4Metrics = await fetchGa4Month(propertyId, monthDate, auth);
              metricsCache.set(cacheKey, ga4Metrics);
            }
            let gq = supabase.from("monthly_stats").select("*").eq("month_date", monthDate);
            if (conn.workspace_id) gq = gq.eq("workspace_id", conn.workspace_id);
            else gq = gq.eq("user_id", conn.user_id).is("workspace_id", null);
            const { data: gExisting } = await gq.limit(1).maybeSingle();

            const gcur = (gExisting || {}) as Record<string, unknown>;
            const gpatch: Record<string, unknown> = {};
            const setIfEmpty = (col: string, val: number) => {
              if (typeof val === "number" && val > 0 && gcur[col] == null) gpatch[col] = val;
            };
            setIfEmpty("website_visitors", ga4Metrics.websiteVisitors);
            setIfEmpty("ga4_users", ga4Metrics.ga4Users);
            setIfEmpty("traffic_search", ga4Metrics.trafficSearch);
            setIfEmpty("traffic_social", ga4Metrics.trafficSocial);
            setIfEmpty("traffic_pinterest", ga4Metrics.trafficPinterest);
            setIfEmpty("traffic_instagram", ga4Metrics.trafficInstagram);

            if (!Object.keys(gpatch).length) { ga4Results.push({ scope, status: "already_filled" }); continue; }

            if (gExisting?.id) {
              const { error: upErr } = await supabase.from("monthly_stats")
                .update({ ...gpatch, updated_at: new Date().toISOString() })
                .eq("id", gExisting.id);
              if (upErr) throw upErr;
              ga4Results.push({ scope, status: "updated" });
            } else {
              const { error: insErr } = await supabase.from("monthly_stats").insert({
                ...gpatch,
                user_id: conn.user_id,
                workspace_id: conn.workspace_id ?? null,
                month_date: monthDate,
                updated_at: new Date().toISOString(),
              });
              if (insErr) throw insErr;
              ga4Results.push({ scope, status: "created" });
            }
          } catch (e) {
            console.error("stats-monthly-snapshot: GA4 scope en échec", scope, e);
            ga4Results.push({ scope, status: "error" });
          }
        }
      } catch (e) {
        // Toute erreur GA4 (secrets/API) reste isolée : le snapshot IG a déjà réussi.
        console.error("stats-monthly-snapshot: bloc GA4 en échec", e);
      }
      console.log("stats-monthly-snapshot GA4:", monthDate, JSON.stringify(ga4Results));
    }

    // Les chiffres du mois sont figés → on enchaîne sur le rapport mensuel
    // e-mail (event monthly_stats_report). Non bloquant : un échec d'envoi ne
    // doit pas faire échouer le snapshot.
    let emailReport: unknown = null;
    try {
      const r = await fetch(`${supabaseUrl}/functions/v1/email-trigger`, {
        method: "POST",
        headers: { Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ event: "monthly_stats_report" }),
      });
      emailReport = await r.json().catch(() => ({ status: r.status }));
    } catch (e) {
      console.error("stats-monthly-snapshot: déclenchement du rapport e-mail échoué", e);
    }

    return json({ success: true, month: monthDate, results, ga4Results, emailReport }, corsHeaders);
  } catch (e) {
    console.error("stats-monthly-snapshot error:", e);
    return json({ error: "Erreur interne du serveur" }, corsHeaders, 500);
  }
});
