// Edge « cron-health » — santé de l'app AGRÉGÉE, lisible par les crons de surveillance
// (visite-guidee-quotidienne étape 8bis en scope "daily", routine-hebdo-lundi en scope "weekly").
//
// scope "daily"  : santé des publications réelles — posts en échec, posts bloqués,
//                  programmés en retard (= cron pg de publication mort ?), tokens
//                  sociaux expirés/expirants (LinkedIn ne se refresh pas seul, ~60 j).
// scope "weekly" : coûts IA (tokens par modèle, 7 j vs 7 j précédents), coûts estimés
//                  en € (texte Anthropic + images gpt-image/Photoroom/Recraft), usage
//                  (action_type), rétention par cohorte hebdo d'inscription,
//                  volume de publications.
//
// Sécurité : lecture seule, pas de PII en sortie (compteurs, plateformes, erreurs
// tronquées ; les noms de comptes sociaux sont des handles publics). Gardé par le
// même secret partagé que activation-funnel : `CRON_STATS_SECRET` (header x-cron-secret).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ADMIN_EMAIL = "laetitia@nowadaysagency.com";
// Comptes internes exclus (mêmes que activation-funnel / admin-users) + alias +cs/+qaneuf.
const EXCLUDED_EMAILS = [
  ADMIN_EMAIL,
  "laetitiatest@nowadaysagency.com",
  "laetitia+qaneuf0407@nowadaysagency.com",
];
const isExcludedEmail = (e: string | null) =>
  !!e && (EXCLUDED_EMAILS.includes(e) || /^laetitia\+cs/i.test(e));
// Le scope daily surveille les publications RÉELLES : le compte admin de Laetitia y
// reste inclus (c'est notamment SA connexion LinkedIn ~60 j qu'il faut attraper) —
// seuls les comptes de test en sortent. Le scope weekly exclut aussi l'admin (stats).
const isTestEmail = (e: string | null) =>
  !!e && ((e !== ADMIN_EMAIL && EXCLUDED_EMAILS.includes(e)) || /^laetitia\+cs/i.test(e));

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const HOUR = 3600000;
const DAY = 24 * HOUR;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const secret = Deno.env.get("CRON_STATS_SECRET");
    if (!secret || req.headers.get("x-cron-secret") !== secret) {
      return json({ error: "Unauthorized" }, 401);
    }
    const scope = (await req.json().catch(() => ({})))?.scope === "weekly" ? "weekly" : "daily";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const profRes = await supabase.from("profiles").select("user_id, email, created_at");
    if (profRes.error) throw profRes.error;
    const excludeFn = scope === "daily" ? isTestEmail : isExcludedEmail;
    const excludedIds = new Set(
      (profRes.data || []).filter((p: any) => excludeFn(p.email)).map((p: any) => p.user_id),
    );
    const isClient = (userId: string) => !excludedIds.has(userId);
    const now = Date.now();

    if (scope === "daily") {
      const [postsRes, connRes] = await Promise.all([
        supabase
          .from("calendar_posts")
          .select("user_id, canal, publish_status, publish_error, scheduled_publish_at, published_at, updated_at")
          .in("publish_status", ["failed", "publishing", "scheduled", "published"]),
        supabase
          .from("social_connections")
          .select("user_id, platform, platform_account_name, token_expires_at, updated_at"),
      ]);
      if (postsRes.error) throw postsRes.error;
      if (connRes.error) throw connRes.error;
      const posts = (postsRes.data || []).filter((p: any) => isClient(p.user_id));
      const conns = (connRes.data || []).filter((c: any) => isClient(c.user_id));

      // Échecs de publication des dernières 48 h (erreur tronquée, pas de contenu).
      const failedRecent = posts
        .filter((p: any) => p.publish_status === "failed" && p.updated_at && now - new Date(p.updated_at).getTime() < 48 * HOUR)
        .map((p: any) => ({
          canal: p.canal,
          quand: p.updated_at,
          erreur: (p.publish_error || "").slice(0, 140) || null,
        }));

      // Posts coincés en "publishing" depuis > 1 h (zombie — le worker a planté en route).
      const stuckPublishing = posts.filter(
        (p: any) => p.publish_status === "publishing" && p.updated_at && now - new Date(p.updated_at).getTime() > HOUR,
      ).length;

      // Programmés dont l'heure est passée depuis > 45 min sans être partis :
      // signal que le cron pg `social-publish-scheduled` est mort (régé schéma ?).
      const overdueScheduled = posts.filter(
        (p: any) =>
          p.publish_status === "scheduled" &&
          p.scheduled_publish_at &&
          now - new Date(p.scheduled_publish_at).getTime() > 45 * 60000,
      ).length;

      const published24h = posts.filter(
        (p: any) => p.published_at && now - new Date(p.published_at).getTime() < DAY,
      ).length;

      // Connexions sociales : expirées, expirant sous 7 j, et LinkedIn vieillissantes
      // sans date d'expiration connue (refresh manuel ~60 j — alerter à 50 j d'âge).
      // ⚠️ Seulement Instagram + LinkedIn : Canva/Pinterest se rafraîchissent via
      // refresh_token, leur token_expires_at en base est trompeur — même règle que
      // la page Connexions (PR #306), sinon faux positif quotidien.
      const connState = (c: any) => {
        if (c.platform !== "instagram" && c.platform !== "linkedin") return null;
        if (c.token_expires_at) {
          const left = (new Date(c.token_expires_at).getTime() - now) / DAY;
          if (left < 0) return { etat: "expirée", jours: Math.round(left) };
          if (left <= 7) return { etat: "expire bientôt", jours: Math.round(left * 10) / 10 };
          return null;
        }
        if (c.platform === "linkedin" && c.updated_at) {
          const age = (now - new Date(c.updated_at).getTime()) / DAY;
          if (age > 50) return { etat: "linkedin vieillissante (~60 j max)", jours: Math.round(age) };
        }
        return null;
      };
      const connectionsAtRisk = conns
        .map((c: any) => {
          const s = connState(c);
          return s ? { platform: c.platform, compte: c.platform_account_name, ...s } : null;
        })
        .filter(Boolean);

      return json({
        generated_at: new Date().toISOString(),
        scope,
        failed_48h: { count: failedRecent.length, items: failedRecent.slice(0, 10) },
        stuck_publishing: stuckPublishing,
        overdue_scheduled: overdueScheduled,
        published_24h: published24h,
        connections_total: conns.length,
        connections_at_risk: connectionsAtRisk.slice(0, 20),
      });
    }

    // ── scope "weekly" ──────────────────────────────────────────────────────
    const since35d = new Date(now - 35 * DAY).toISOString();
    const [aiRes, calRes] = await Promise.all([
      supabase
        .from("ai_usage")
        .select("user_id, created_at, action_type, model_used, tokens_used")
        .gte("created_at", since35d),
      supabase
        .from("calendar_posts")
        .select("user_id, created_at, published_at, publish_status, status"),
    ]);
    if (aiRes.error) throw aiRes.error;
    if (calRes.error) throw calRes.error;
    const ai = (aiRes.data || []).filter((a: any) => isClient(a.user_id));
    const cal = (calRes.data || []).filter((c: any) => isClient(c.user_id));

    const inWindow = (iso: string | null, from: number, to: number) => {
      if (!iso) return false;
      const t = new Date(iso).getTime();
      return t >= from && t < to;
    };
    const week = (offset: number) => [now - (offset + 1) * 7 * DAY, now - offset * 7 * DAY] as const;
    const [curFrom, curTo] = week(0);
    const [prevFrom, prevTo] = week(1);

    // Coût images estimé (€/image, tarifs ~juillet 2026) : les APIs images sont
    // facturées à l'image, et logUsage écrit 1 ligne ai_usage PAR image — le
    // compte d'appels par modèle suffit donc. gpt-image-2 = high 1024x1536.
    const IMAGE_COST_EUR: Record<string, number> = {
      "gpt-image-2": 0.15,
      "gpt-image-1": 0.22,
      "photoroom-v2": 0.05,
      "recraftv3-vector": 0.04,
    };

    // Coût texte estimé (€/million de tokens, tarifs Anthropic ~juillet 2026 :
    // Haiku 4.5 = 1$/5$, Sonnet 4.6 = 3$/15$, Opus 4.8 = 5$/25$ in/out).
    // `tokens_used` mélange input+output ; on applique un tarif MIXTE avec une
    // hypothèse 75 % input / 25 % output (les prompts contexte+charte dominent).
    // Approximation assumée — l'ordre de grandeur suffit pour la tendance hebdo.
    const TEXT_COST_EUR_PER_MTOKEN: Record<string, number> = {
      "claude-haiku-4-5": 2,
      "claude-sonnet-4-6": 6,
      "claude-opus-4-8": 10,
      "claude-opus-4-7": 10,
    };

    const summarize = (rows: any[]) => {
      const byModel: Record<string, { appels: number; tokens: number }> = {};
      const byAction: Record<string, number> = {};
      let tokens = 0;
      for (const r of rows) {
        tokens += r.tokens_used || 0;
        const m = r.model_used || "inconnu";
        byModel[m] = byModel[m] || { appels: 0, tokens: 0 };
        byModel[m].appels++;
        byModel[m].tokens += r.tokens_used || 0;
        const a = r.action_type || "inconnu";
        byAction[a] = (byAction[a] || 0) + 1;
      }
      const topActions = Object.entries(byAction)
        .sort((x, y) => y[1] - x[1])
        .slice(0, 12)
        .map(([action, count]) => ({ action, count }));
      const coutImagesEur = Object.entries(byModel).reduce(
        (s, [m, v]) => s + (IMAGE_COST_EUR[m] || 0) * v.appels,
        0,
      );
      const coutTexteEur = Object.entries(byModel).reduce(
        (s, [m, v]) => s + ((TEXT_COST_EUR_PER_MTOKEN[m] || 0) * v.tokens) / 1_000_000,
        0,
      );
      const round2 = (n: number) => Math.round(n * 100) / 100;
      return {
        appels: rows.length,
        tokens,
        byModel,
        topActions,
        utilisatrices: new Set(rows.map((r) => r.user_id)).size,
        cout_images_estime_eur: round2(coutImagesEur),
        cout_texte_estime_eur: round2(coutTexteEur),
        cout_total_estime_eur: round2(coutImagesEur + coutTexteEur),
      };
    };
    const aiCur = summarize(ai.filter((a: any) => inWindow(a.created_at, curFrom, curTo)));
    const aiPrev = summarize(ai.filter((a: any) => inWindow(a.created_at, prevFrom, prevTo)));

    // Rétention par cohorte hebdo d'inscription (5 dernières semaines) :
    // active cette semaine = ≥1 génération OU ≥1 post créé dans les 7 derniers jours.
    const activeThisWeek = new Set([
      ...ai.filter((a: any) => inWindow(a.created_at, curFrom, curTo)).map((a: any) => a.user_id),
      ...cal.filter((c: any) => inWindow(c.created_at, curFrom, curTo)).map((c: any) => c.user_id),
    ]);
    const clients = (profRes.data || []).filter((p: any) => !isExcludedEmail(p.email));
    const cohorts = [];
    for (let w = 0; w < 5; w++) {
      const [from, to] = week(w);
      const cohort = clients.filter((p: any) => inWindow(p.created_at, from, to));
      cohorts.push({
        semaine: `S-${w}`,
        du: new Date(from).toISOString().slice(0, 10),
        inscrites: cohort.length,
        actives_cette_semaine: cohort.filter((p: any) => activeThisWeek.has(p.user_id)).length,
      });
    }

    const publishedCur = cal.filter((c: any) => inWindow(c.published_at, curFrom, curTo)).length;
    const publishedPrev = cal.filter((c: any) => inWindow(c.published_at, prevFrom, prevTo)).length;

    return json({
      generated_at: new Date().toISOString(),
      scope,
      ia_7j: aiCur,
      ia_7j_precedents: aiPrev,
      publications: { cette_semaine: publishedCur, semaine_precedente: publishedPrev },
      cohortes: cohorts,
      actives_cette_semaine: activeThisWeek.size,
    });
  } catch (e) {
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});
