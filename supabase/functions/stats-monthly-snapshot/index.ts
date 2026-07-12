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
import { fetchInstagramInsights } from "../_shared/instagram-insights.ts";
import { decryptConnTokens } from "../_shared/token-crypto.ts";

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
    return json({ success: true, month: monthDate, results }, corsHeaders);
  } catch (e) {
    console.error("stats-monthly-snapshot error:", e);
    return json({ error: "Erreur interne du serveur" }, corsHeaders, 500);
  }
});
