// Edge « cron-health » — santé de l'app AGRÉGÉE, lisible par les crons de surveillance
// (visite-guidee-quotidienne étape 8bis en scope "daily", routine-hebdo-lundi en scope "weekly").
//
// scope "daily"  : santé des publications réelles — posts en échec, posts bloqués,
//                  programmés en retard (= cron pg de publication mort ?), tokens
//                  sociaux expirés/expirants (LinkedIn ne se refresh pas seul, ~60 j),
//                  retours bêta (beta_feedback) des 24 h, les « blocking » d'abord,
//                  et total encore en statut "new" (backstop si un run saute),
//                  crédits Photoroom restants (épuisés = 402 sur toutes les retouches),
//                  + SANTÉ DE LA FACTURATION (incident Stripe 24-31/07) : événements que
//                  Stripe n'arrive pas à livrer, abonnements payés sans accès en base,
//                  périodes de facturation périmées — voir le bloc `facturation`.
// scope "weekly" : coûts IA (tokens par modèle, 7 j vs 7 j précédents), coûts estimés
//                  en € (texte Anthropic + images gpt-image/Photoroom/Recraft), usage
//                  (action_type), rétention par cohorte hebdo d'inscription,
//                  volume de publications, + QUALITÉ de la génération de contenu
//                  (score de gate agrégé, retravail, funnel par format, échantillon
//                  à juger) — voir le bloc `qualite`.
//
// Sécurité : lecture seule, pas de PII en sortie (compteurs, plateformes, erreurs
// tronquées ; les noms de comptes sociaux sont des handles publics ; le texte des
// feedbacks bêta est du contenu écrit POUR l'admin, tronqué, sans identité de
// l'autrice). Gardé par le même secret partagé que activation-funnel :
// `CRON_STATS_SECRET` (header x-cron-secret).
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

// Crédits Photoroom (plan Basic 1000 img/mois, souscrit le 09/07/2026 → reset le 9
// de chaque mois ; une retouche fond IA ≈ 5 crédits). À épuisement l'API renvoie 402
// et TOUTES les retouches photo de l'app échouent — d'où la surveillance quotidienne.
const PHOTOROOM_RESET_DAY = 9;
const PHOTOROOM_ALERTE_RESTANTS = 300; // seuil bas absolu
const PHOTOROOM_ALERTE_PAR_JOUR = 150; // rythme insoutenable (1000/mois ≈ 33/j)

async function photoroomCredits(now: number) {
  const key = Deno.env.get("PHOTOROOM_API_KEY");
  if (!key) return { erreur: "PHOTOROOM_API_KEY absent" };
  try {
    const r = await fetch("https://image-api.photoroom.com/v1/account", {
      headers: { "x-api-key": key },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return { erreur: `HTTP ${r.status} ${(await r.text()).slice(0, 90)}` };
    const credits = (await r.json())?.credits;
    if (typeof credits?.available !== "number") return { erreur: "réponse sans credits.available" };
    const restants = credits.available;
    const abonnement = typeof credits.subscription === "number" ? credits.subscription : null;
    const consommes = abonnement !== null ? abonnement - restants : null;
    // Jours écoulés depuis le dernier reset (le 9 du mois), pour le rythme moyen.
    const d = new Date(now);
    const reset = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - (d.getUTCDate() < PHOTOROOM_RESET_DAY ? 1 : 0), PHOTOROOM_RESET_DAY));
    const joursDepuisReset = Math.max(1, Math.ceil((now - reset.getTime()) / DAY));
    const moyenneParJour = consommes !== null ? Math.round((consommes / joursDepuisReset) * 10) / 10 : null;
    const alerte =
      restants < PHOTOROOM_ALERTE_RESTANTS
        ? `moins de ${PHOTOROOM_ALERTE_RESTANTS} crédits restants — risque de 402 sur les retouches photo`
        : moyenneParJour !== null && moyenneParJour > PHOTOROOM_ALERTE_PAR_JOUR
          ? `rythme ${moyenneParJour}/j > ${PHOTOROOM_ALERTE_PAR_JOUR}/j — épuisement avant le reset du ${PHOTOROOM_RESET_DAY}`
          : null;
    return { restants, abonnement, consommes_mois: consommes, jours_depuis_reset: joursDepuisReset, moyenne_par_jour: moyenneParJour, alerte };
  } catch (e) {
    return { erreur: String((e as any)?.message || e).slice(0, 90) };
  }
}

// ── Santé de la FACTURATION (incident Stripe 24-31/07/2026) ──────────────────
// Le webhook `stripe-webhook` a renvoyé des 500 en boucle pendant 8 jours sans que
// RIEN dans l'app ne le dise : la visite était verte, les edges répondaient, seul
// Stripe le savait (et menaçait de couper l'endpoint le 02/08). Pire, le second bug
// (invoice.subscription) était SILENCIEUX : webhook 200, mais `studio_months_paid`
// jamais incrémenté et aucune cliente prévenue quand sa carte était refusée.
//
// 🔑 La leçon : une panne de facturation ne se voit pas côté app — elle se voit chez
// Stripe (livraisons en attente) et dans l'ÉCART entre Stripe et la base. D'où trois
// mesures, la première étant la seule qui attrape n'importe quelle panne future,
// quelle qu'en soit la cause :
//   1. événements que Stripe n'arrive PAS à livrer (`pending_webhooks > 0`) ;
//   2. abonnements actifs chez Stripe SANS ligne en base = « elle paie et n'a pas ses accès » ;
//   3. lignes actives dont la période de facturation est vide ou périmée = symptôme
//      muet d'un webhook qui ne met plus rien à jour.
// Lecture seule, sans PII : identifiants Stripe et types d'événements uniquement.
const STRIPE_API = "https://api.stripe.com/v1";
// Délai laissé à Stripe pour ses tentatives normales avant de considérer l'échec réel
// (Stripe réessaie pendant plusieurs jours ; 30 min évite d'alerter sur un événement
// tout juste émis, en cours de première livraison).
const LIVRAISON_GRACE = 30 * 60000;
// Une période de facturation dépassée de plus de 2 jours n'est jamais normale :
// le renouvellement Stripe la repousse d'un mois le jour même.
const PERIODE_RETARD_JOURS = 2;

// Un timestamp Stripe absent ne doit JAMAIS faire tomber la sonde : c'est exactement
// ainsi que le webhook est mort (`new Date(undefined * 1000).toISOString()` → RangeError).
// La garde `e2e-visite/stripe-api-guard.mjs` refuse d'ailleurs toute conversion nue.
function isoFromUnix(unixSeconds: unknown): string | null {
  if (typeof unixSeconds !== "number" || !Number.isFinite(unixSeconds)) return null;
  const d = new Date(unixSeconds * 1000);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function stripeGet(key: string, chemin: string) {
  const r = await fetch(`${STRIPE_API}${chemin}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 90)}`);
  return await r.json();
}

async function facturationHealth(supabase: any, now: number) {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  const out: Record<string, unknown> = {};

  // (3) et le contexte : côté base, toujours lisible même sans clé Stripe.
  let rowsStripe: any[] = [];
  try {
    const rows = await fetchAllRows(
      supabase,
      "subscriptions",
      "stripe_subscription_id, status, plan, current_period_end, studio_months_paid, updated_at",
    );
    rowsStripe = rows.filter((s: any) => s.stripe_subscription_id); // les lignes manuelles n'ont pas de période
    const actives = rowsStripe.filter((s: any) => s.status === "active");
    const perimees = actives
      .filter(
        (s: any) =>
          !s.current_period_end ||
          now - new Date(s.current_period_end).getTime() > PERIODE_RETARD_JOURS * DAY,
      )
      .map((s: any) => ({
        abo: s.stripe_subscription_id,
        plan: s.plan,
        fin_periode: s.current_period_end,
      }));
    out.abonnements_stripe_actifs = actives.length;
    out.periodes_perimees = { count: perimees.length, items: perimees.slice(0, 10) };
  } catch (e) {
    out.periodes_perimees = { erreur: String((e as any)?.message || e).slice(0, 90) };
  }

  // Contexte : le webhook reçoit-il encore quelque chose ?
  try {
    const ev = await fetchAllRows(supabase, "webhook_events", "event_type, processed_at", (q) =>
      q.gte("processed_at", new Date(now - 7 * DAY).toISOString()),
    );
    const dernier = ev.reduce(
      (max: string | null, e: any) => (!max || e.processed_at > max ? e.processed_at : max),
      null,
    );
    out.evenements_recus = {
      h24: ev.filter((e: any) => now - new Date(e.processed_at).getTime() < DAY).length,
      j7: ev.length,
      dernier,
    };
  } catch (e) {
    out.evenements_recus = { erreur: String((e as any)?.message || e).slice(0, 90) };
  }

  if (!key) {
    out.erreur_stripe = "STRIPE_SECRET_KEY absent — vérification côté Stripe impossible";
    return out;
  }

  // (1) LE signal direct : des événements que Stripe n'arrive pas à livrer.
  try {
    const ev = await stripeGet(key, "/events?limit=100");
    const bloques = (ev.data || []).filter(
      (e: any) => (e.pending_webhooks || 0) > 0 && now - e.created * 1000 > LIVRAISON_GRACE,
    );
    const parType: Record<string, number> = {};
    for (const e of bloques) parType[e.type] = (parType[e.type] || 0) + 1;
    out.livraisons_en_echec = {
      count: bloques.length,
      plus_ancien: bloques.length
        ? isoFromUnix(Math.min(...bloques.map((e: any) => e.created)))
        : null,
      types: Object.entries(parType)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([type, n]) => ({ type, n })),
    };
  } catch (e) {
    out.livraisons_en_echec = { erreur: String((e as any)?.message || e).slice(0, 90) };
  }

  // (2) L'écart qui coûte de l'argent : payante chez Stripe, sans accès dans l'app.
  //
  // ⚠️ Le compte Stripe est PARTAGÉ : il porte aussi les abonnements « Ta binôme de
  // com' » vendus par lien de paiement, qui n'ont jamais eu de ligne `subscriptions`
  // et n'en auront jamais (ce ne sont pas des accès à l'app). Les compter ici ferait
  // 11 fausses alertes par jour — et une sonde qui crie au loup finit ignorée.
  // Le discriminant est déterministe : `create-checkout` pose TOUJOURS
  // `subscription_data.metadata.user_id` (index.ts, mode subscription), et un lien de
  // paiement ne le pose jamais. Un abonnement app SANS ligne en base = vraie alerte.
  try {
    const subs = await stripeGet(key, "/subscriptions?status=active&limit=100");
    const connus = new Set(rowsStripe.map((s: any) => s.stripe_subscription_id));
    const toutes = subs.data || [];
    const issuesDeLApp = toutes.filter((s: any) => s.metadata?.user_id);
    const orphelines = issuesDeLApp
      .filter((s: any) => !connus.has(s.id))
      .map((s: any) => ({ abo: s.id, depuis: isoFromUnix(s.created) }));
    out.payantes_sans_acces = { count: orphelines.length, items: orphelines.slice(0, 10) };
    out.abonnements_app_chez_stripe = issuesDeLApp.length;
    out.abonnements_hors_app = toutes.length - issuesDeLApp.length; // info, jamais une alerte
  } catch (e) {
    out.payantes_sans_acces = { erreur: String((e as any)?.message || e).slice(0, 90) };
  }

  return out;
}

// PostgREST plafonne silencieusement chaque select à 1000 lignes (leçon PR #456 :
// ai_usage avait dépassé le seuil et les stats étaient fausses sans aucune erreur).
// Toute lecture de table qui grossit passe donc par cette boucle paginée — même
// pattern que activation-funnel / admin-users. content_quality_events est écrite à
// CHAQUE génération (PR #593) : c'est la première à franchir 1000 lignes sur 35 j.
async function fetchAllRows(
  supabase: any,
  table: string,
  columns: string,
  modify?: (q: any) => any,
): Promise<any[]> {
  const PAGE = 1000;
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select(columns);
    if (modify) q = modify(q);
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

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

    const profiles = await fetchAllRows(supabase, "profiles", "user_id, email, created_at");
    const excludeFn = scope === "daily" ? isTestEmail : isExcludedEmail;
    const excludedIds = new Set(
      profiles.filter((p: any) => excludeFn(p.email)).map((p: any) => p.user_id),
    );
    const isClient = (userId: string) => !excludedIds.has(userId);
    const now = Date.now();

    if (scope === "daily") {
      const [postsRows, connRows, fbRows, fbNewRows, photoroom, facturation] = await Promise.all([
        fetchAllRows(
          supabase,
          "calendar_posts",
          "user_id, canal, publish_status, publish_error, scheduled_publish_at, published_at, updated_at",
          (q) => q.in("publish_status", ["failed", "publishing", "scheduled", "published"]),
        ),
        fetchAllRows(
          supabase,
          "social_connections",
          "user_id, platform, platform_account_name, token_expires_at, updated_at",
        ),
        fetchAllRows(
          supabase,
          "beta_feedback",
          "user_id, type, severity, content, details, page_url, screenshot_url, status, created_at",
          (q) => q.gte("created_at", new Date(now - DAY).toISOString()),
        ),
        // Backstop : tout ce qui est encore en "new" quel que soit l'âge — si un run
        // de la routine saute, rien ne reste invisible (le passage à "seen"/"done"
        // dans l'onglet admin fait redescendre ce compteur).
        fetchAllRows(supabase, "beta_feedback", "user_id", (q) => q.eq("status", "new")),
        photoroomCredits(now),
        facturationHealth(supabase, now),
      ]);
      const posts = postsRows.filter((p: any) => isClient(p.user_id));
      const conns = connRows.filter((c: any) => isClient(c.user_id));

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

      // Retours bêta des 24 h (widget BetaFeedbackWidget → table beta_feedback,
      // sinon visibles seulement dans l'onglet admin) — les « blocking » d'abord.
      const SEVERITY_RANK: Record<string, number> = { blocking: 0, annoying: 1, minor: 2 };
      const sevRank = (s: string | null) => SEVERITY_RANK[s || ""] ?? 3;
      const feedback24h = fbRows
        .filter((f: any) => isClient(f.user_id))
        .sort(
          (a: any, b: any) =>
            sevRank(a.severity) - sevRank(b.severity) ||
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )
        .map((f: any) => ({
          type: f.type,
          severite: f.severity,
          contenu: (f.content || "").slice(0, 200),
          detail: f.details ? f.details.slice(0, 200) : null,
          page: f.page_url,
          capture: !!f.screenshot_url,
          statut: f.status,
          quand: f.created_at,
        }));
      const feedbackNewTotal = fbNewRows.filter((f: any) => isClient(f.user_id)).length;

      return json({
        generated_at: new Date().toISOString(),
        scope,
        failed_48h: { count: failedRecent.length, items: failedRecent.slice(0, 10) },
        stuck_publishing: stuckPublishing,
        overdue_scheduled: overdueScheduled,
        published_24h: published24h,
        connections_total: conns.length,
        connections_at_risk: connectionsAtRisk.slice(0, 20),
        feedback_24h: { count: feedback24h.length, items: feedback24h.slice(0, 15) },
        feedback_new_total: feedbackNewTotal,
        photoroom_credits: photoroom,
        facturation,
      });
    }

    // ── scope "weekly" ──────────────────────────────────────────────────────
    const since35d = new Date(now - 35 * DAY).toISOString();
    const [aiRows, calRows] = await Promise.all([
      fetchAllRows(
        supabase,
        "ai_usage",
        "user_id, created_at, action_type, model_used, tokens_used",
        (q) => q.gte("created_at", since35d),
      ),
      fetchAllRows(supabase, "calendar_posts", "id, user_id, created_at, published_at, publish_status, status"),
    ]);
    const ai = aiRows.filter((a: any) => isClient(a.user_id));
    const cal = calRows.filter((c: any) => isClient(c.user_id));

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
    const clients = profiles.filter((p: any) => !isExcludedEmail(p.email));
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

    // ── Qualité de la génération de contenu (lecture seule) ────────────────────
    // Ce que le quotidien ne voit pas : la QUALITÉ du contenu produit, pas le volume.
    // Trois signaux sur les carrousels réellement générés (hors comptes test) :
    //   1) score de gate (quality_score déjà en base) agrégé + delta S-1 — attrape
    //      une non-régression après un swap de modèle (ex. bascule Sonnet 5) ou un
    //      redéploiement edge ; n < total tant que Brique 1 (persistance serveur du
    //      score de redac-gate) n'est pas livrée — le report l'affiche honnêtement ;
    //   2) retravail = % de carrousels lourdement réédités après génération (proxy
    //      d'un 1er jet raté) + sujets re-générés ;
    //   3) funnel PAR FORMAT (généré → mis au calendrier → publié) : quel format
    //      meurt en route éclaire la falaise « 0 publication ».
    // + un échantillon anonymisé (le contenu à juger, tronqué, SANS identité d'autrice)
    //   pour le juge de la routine (grille : singularité, hook, ancrage métier, tics,
    //   fidélité au brief). Le contenu est du matériel marketing destiné à être publié
    //   publiquement — pas de la PII.
    const carRows = await fetchAllRows(
      supabase,
      "generated_carousels",
      "user_id, carousel_type, subject, hook_text, caption, slides, slide_count, quality_score, calendar_post_id, status, created_at, updated_at",
      (q) => q.gte("created_at", since35d),
    );
    const car = carRows.filter((c: any) => isClient(c.user_id));
    const carCur = car.filter((c: any) => inWindow(c.created_at, curFrom, curTo));
    const carPrev = car.filter((c: any) => inWindow(c.created_at, prevFrom, prevTo));

    const scoreStats = (rows: any[]) => {
      const vals = rows.map((r) => r.quality_score).filter((v: any) => typeof v === "number");
      if (!vals.length) return { n: 0, sur: rows.length, moyenne: null as number | null, sous_60: 0 };
      return {
        n: vals.length,
        sur: rows.length,
        moyenne: Math.round(vals.reduce((s: number, v: number) => s + v, 0) / vals.length),
        sous_60: vals.filter((v: number) => v < 60).length,
      };
    };

    // Source COMPLÈTE du score de gate = content_quality_events (1 ligne par
    // génération, écrite côté serveur par logContentQuality) ; repli sur
    // generated_carousels.quality_score (écrit seulement si un brouillon est sauvé)
    // tant que la table n'existe pas encore (migration Lovable en attente).
    let cqEvents: any[] | null = null;
    try {
      let cqRows: any[];
      try {
        cqRows = await fetchAllRows(
          supabase,
          "content_quality_events",
          "user_id, format, redac_score, redac_repassed, created_at, content_preview",
          (q) => q.gte("created_at", since35d),
        );
      } catch (e) {
        // `content_preview` peut ne pas encore exister (migration Lovable déployée
        // APRÈS l'edge) : on retente sans la colonne pour ne PAS perdre la source
        // du score de gate — l'échantillon retombera alors sur les brouillons.
        if (!/content_preview/.test(String((e as any)?.message || ""))) throw e;
        cqRows = await fetchAllRows(
          supabase,
          "content_quality_events",
          "user_id, format, redac_score, redac_repassed, created_at",
          (q) => q.gte("created_at", since35d),
        );
      }
      cqEvents = cqRows.filter((e: any) => isClient(e.user_id));
    } catch (_) { /* table absente : repli sur les brouillons */ }
    const eventScoreStats = (rows: any[]) => {
      const vals = rows.map((r) => r.redac_score).filter((v: any) => typeof v === "number");
      if (!vals.length) return { n: 0, sur: rows.length, moyenne: null as number | null, sous_60: 0, repasses: 0 };
      return {
        n: vals.length,
        sur: rows.length,
        moyenne: Math.round(vals.reduce((s: number, v: number) => s + v, 0) / vals.length),
        sous_60: vals.filter((v: number) => v < 60).length,
        repasses: rows.filter((r: any) => r.redac_repassed).length,
      };
    };

    const RETRAVAIL_MS = 15 * 60 * 1000; // réédité >15 min après génération = 1er jet retouché en profondeur
    const estRetravaille = (c: any) =>
      !!(c.updated_at && c.created_at && new Date(c.updated_at).getTime() - new Date(c.created_at).getTime() > RETRAVAIL_MS);
    const retravailles = carCur.filter(estRetravaille).length;
    const sujetKey = (c: any) => `${c.user_id}::${String(c.subject || "").trim().toLowerCase().slice(0, 60)}`;
    const sujetCounts: Record<string, number> = {};
    for (const c of carCur) sujetCounts[sujetKey(c)] = (sujetCounts[sujetKey(c)] || 0) + 1;
    const sujets_regeneres = Object.values(sujetCounts).filter((n) => n > 1).length;

    const publishedIds = new Set(cal.filter((c: any) => c.published_at).map((c: any) => c.id));
    const parFormat: Record<string, { generes: number; au_calendrier: number; publies: number }> = {};
    for (const c of carCur) {
      const f = c.carousel_type || "inconnu";
      parFormat[f] = parFormat[f] || { generes: 0, au_calendrier: 0, publies: 0 };
      parFormat[f].generes++;
      if (c.calendar_post_id) {
        parFormat[f].au_calendrier++;
        if (publishedIds.has(c.calendar_post_id)) parFormat[f].publies++;
      }
    }

    const trunc = (s: any, n: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, n) : "");
    const slideApercu = (slides: any): string[] => {
      if (!Array.isArray(slides)) return [];
      return slides.slice(0, 4).map((sl: any) => {
        const t = sl?.title || sl?.heading || sl?.text || sl?.body || sl?.content || "";
        if (typeof t === "string" && t.trim()) return trunc(t, 120);
        return trunc(typeof sl === "string" ? sl : JSON.stringify(sl), 120);
      });
    };
    // Échantillon pour le juge : PRIORITÉ aux content_quality_events (écrits à
    // CHAQUE génération → le juge n'est plus aveugle les semaines « génère-mais-
    // jette »), repli sur les carrousels GARDÉS (generated_carousels) tant que les
    // events n'ont pas de content_preview (rows d'avant la migration).
    const cqCurPreview = (cqEvents || []).filter(
      (e: any) => inWindow(e.created_at, curFrom, curTo) && e.content_preview,
    );
    let echantillon_source: "events" | "brouillons";
    let echantillon: any[];
    if (cqCurPreview.length) {
      echantillon_source = "events";
      echantillon = cqCurPreview.slice(0, 15).map((e: any, i: number) => {
        const p = e.content_preview || {};
        return {
          ref: `c${i + 1}`,
          format: e.format,
          sujet: trunc(p.sujet, 100),
          hook: trunc(p.hook, 140),
          caption: trunc(p.caption, 300),
          apercu_slides: Array.isArray(p.apercu_slides) ? p.apercu_slides.slice(0, 4) : [],
          quality_score: typeof e.redac_score === "number" ? e.redac_score : null,
        };
      });
    } else {
      echantillon_source = "brouillons";
      echantillon = carCur.slice(0, 15).map((c: any, i: number) => ({
        ref: `c${i + 1}`,
        format: c.carousel_type,
        sujet: trunc(c.subject, 100),
        hook: trunc(c.hook_text, 140),
        caption: trunc(c.caption, 300),
        apercu_slides: slideApercu(c.slides),
        quality_score: typeof c.quality_score === "number" ? c.quality_score : null,
        retravaille: estRetravaille(c),
        au_calendrier: !!c.calendar_post_id,
      }));
    }

    const qualite = {
      score_gate: cqEvents && cqEvents.length
        ? {
            source: "events",
            cette_semaine: eventScoreStats(cqEvents.filter((e: any) => inWindow(e.created_at, curFrom, curTo))),
            semaine_precedente: eventScoreStats(cqEvents.filter((e: any) => inWindow(e.created_at, prevFrom, prevTo))),
          }
        : {
            source: "brouillons",
            cette_semaine: scoreStats(carCur),
            semaine_precedente: scoreStats(carPrev),
          },
      retravail: { total_carrousels: carCur.length, retravailles, sujets_regeneres },
      par_format: parFormat,
      echantillon,
      echantillon_source,
    };

    return json({
      generated_at: new Date().toISOString(),
      scope,
      ia_7j: aiCur,
      ia_7j_precedents: aiPrev,
      publications: { cette_semaine: publishedCur, semaine_precedente: publishedPrev },
      cohortes: cohorts,
      actives_cette_semaine: activeThisWeek.size,
      qualite,
    });
  } catch (e) {
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});
