// Edge « cron-health » — santé de l'app AGRÉGÉE, lisible par les crons de surveillance
// (visite-guidee-quotidienne étape 8bis en scope "daily", routine-hebdo-lundi en scope "weekly").
//
// scope "daily"  : santé des publications réelles — posts en échec, posts bloqués,
//                  programmés en retard (= cron pg de publication mort ?), tokens
//                  sociaux expirés/expirants (LinkedIn ne se refresh pas seul, ~60 j),
//                  retours bêta (beta_feedback) des 24 h, les « blocking » d'abord,
//                  et total encore en statut "new" (backstop si un run saute),
//                  crédits Photoroom restants (épuisés = 402 sur toutes les retouches),
//                  budget images Higgsfield du mois (aussi en weekly) — bloc `higgsfield`,
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
import { ontGenere } from "./feedback-new.ts";
import { gardeRediteStats } from "./garde-redite.ts";
import { construireEchantillon } from "./echantillon.ts";
import { filStats } from "./fil-reparations.ts";
import { dureesStats } from "./durees-carrousels.ts";
import { planStats } from "./plan-carrousels.ts";
import { CAROUSEL_PLAN_FORMAT } from "../_shared/carousel-plan-format.ts";
import { isInternalEmail, isTestAccountEmail, maskEmail } from "../_shared/internal-accounts.ts";
import { fetchAllRows, DAY } from "./lecture.ts";
import { higgsfieldBudget } from "./higgsfield-budget.ts";
import { bilanQuotidien } from "./quotidien.ts";
import { inWindow, week } from "./fenetres.ts";
import { addEditorialReview, summarize } from "./couts.ts";

// Comptes internes exclus : liste UNIQUE partagée avec activation-funnel et
// admin-users (_shared/internal-accounts.ts — avant le 05/10/2026 cette edge n'en
// excluait qu'une partie et la recette gonflait le bilan hebdo).
const isExcludedEmail = isInternalEmail;
// Le scope daily surveille les publications RÉELLES : le compte admin de Laetitia y
// reste inclus (c'est notamment SA connexion LinkedIn ~60 j qu'il faut attraper) —
// seuls les comptes de test en sortent. Le scope weekly exclut aussi l'admin (stats).
const isTestEmail = isTestAccountEmail;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

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
    const emailOf = new Map<string, string>(profiles.map((p: any) => [p.user_id, p.email]));

    if (scope === "daily") {
      const bilan = await bilanQuotidien({ supabase, now, isClient, emailOf });
      return json({ generated_at: new Date().toISOString(), scope, ...bilan });
    }

    // ── scope "weekly" ──────────────────────────────────────────────────────
    const since35d = new Date(now - 35 * DAY).toISOString();
    const [aiRows, calRows, higgsfield, ownerRows] = await Promise.all([
      fetchAllRows(
        supabase,
        "ai_usage",
        "user_id, created_at, action_type, model_used, tokens_used",
        (q) => q.gte("created_at", since35d),
      ),
      fetchAllRows(supabase, "calendar_posts", "id, user_id, created_at, published_at, publish_status, status"),
      higgsfieldBudget(supabase, now),
      fetchAllRows(supabase, "workspace_members", "user_id, workspace_id, joined_at", (q) => q.eq("role", "owner")),
    ]);

    // Comptes à PLUSIEURS espaces owner (12/10, #1458) : l'auto-réparation
    // workspace + le trigger d'insert profiles en créaient deux à l'inscription
    // (6 comptes trouvés, dont 2 nés ainsi). Le verrou SQL l'empêche désormais ;
    // `nouveaux_7j` > 0 = il a sauté (régénération de schéma) ou un autre chemin
    // en crée. Tous comptes, internes compris (marqués) : c'est de l'intégrité.
    const ownersByUser = new Map<string, any[]>();
    for (const r of ownerRows) ownersByUser.set(r.user_id, [...(ownersByUser.get(r.user_id) || []), r]);
    const doublonsOwner = [...ownersByUser.entries()]
      .filter(([, rows]) => rows.length > 1)
      .map(([userId, rows]) => {
        const dates = rows.map((r: any) => r.joined_at).sort();
        return {
          email: emailOf.get(userId) || userId,
          interne: !isClient(userId),
          espaces: rows.length,
          dernier_ajout: dates[dates.length - 1],
        };
      })
      .sort((x, y) => String(y.dernier_ajout).localeCompare(String(x.dernier_ajout)));
    const espaces_owner_multiples = {
      comptes: doublonsOwner.length,
      nouveaux_7j: doublonsOwner.filter((d) => new Date(d.dernier_ajout).getTime() >= now - 7 * DAY).length,
      items: doublonsOwner.slice(0, 15),
    };
    const ai = aiRows.filter((a: any) => isClient(a.user_id));
    const cal = calRows.filter((c: any) => isClient(c.user_id));

    const [curFrom, curTo] = week(now, 0);
    const [prevFrom, prevTo] = week(now, 1);

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
      const [from, to] = week(now, w);
      const cohort = clients.filter((p: any) => inWindow(p.created_at, from, to));
      cohorts.push({
        semaine: `S-${w}`,
        du: new Date(from).toISOString().slice(0, 10),
        inscrites: cohort.length,
        actives_cette_semaine: cohort.filter((p: any) => activeThisWeek.has(p.user_id)).length,
        ont_genere_depuis_inscription: ontGenere(cohort, [...ai, ...cal]),
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
    let cqAll: any[] = []; // comptes internes compris (coût de la recette, plus bas)
    // Lignes du plan des carrousels (format carousel_plan, aucun contenu ni
    // score) : mises à part, sinon elles gonfleraient « N notés sur M ».
    let planAll: any[] = [];
    let planClients: any[] | null = null;
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
      planAll = cqRows.filter((e: any) => e.format === CAROUSEL_PLAN_FORMAT);
      planClients = planAll.filter((e: any) => isClient(e.user_id));
      cqRows = cqRows.filter((e: any) => e.format !== CAROUSEL_PLAN_FORMAT);
      cqAll = cqRows;
      cqEvents = cqRows.filter((e: any) => isClient(e.user_id));
    } catch (_) { /* table absente : repli sur les brouillons */ }

    addEditorialReview(aiCur, curFrom, curTo, cqEvents || []);
    addEditorialReview(aiPrev, prevFrom, prevTo, cqEvents || []);

    // Top 5 consommatrices des 7 j : un pic de coût se lit d'un coup d'œil (qui,
    // depuis quand inscrite, combien) au lieu d'être deviné dans l'échantillon —
    // le bilan du 05/10/2026 (43,82 € vs 1,42 €) a dû être attribué à la recette
    // à la lecture des sujets. Email MASQUÉ (la***@domaine), jamais complet.
    const profileById = new Map(profiles.map((p: any) => [p.user_id, p]));
    const aiCurByUser = new Map<string, any[]>();
    for (const a of ai) {
      if (!inWindow(a.created_at, curFrom, curTo)) continue;
      const list = aiCurByUser.get(a.user_id) || [];
      list.push(a);
      aiCurByUser.set(a.user_id, list);
    }
    const top_consommatrices_7j = [...aiCurByUser.entries()]
      .map(([userId, rows]) => {
        const s = summarize(rows);
        addEditorialReview(s, curFrom, curTo, (cqEvents || []).filter((e: any) => e.user_id === userId));
        const p: any = profileById.get(userId);
        return {
          email_masque: maskEmail(p?.email),
          inscrite_le: p?.created_at ? String(p.created_at).slice(0, 10) : null,
          appels: s.appels,
          tokens: s.tokens,
          cout_estime_eur: s.cout_total_estime_eur,
          part_du_cout_pct: aiCur.cout_total_estime_eur
            ? Math.round((s.cout_total_estime_eur / aiCur.cout_total_estime_eur) * 100)
            : null,
          action_principale: s.topActions[0]?.action || null,
        };
      })
      .sort((x, y) => y.cout_estime_eur - x.cout_estime_eur || y.tokens - x.tokens)
      .slice(0, 5);

    // Ce que les comptes INTERNES (admin + recette, _shared/internal-accounts.ts)
    // ont consommé cette semaine, HORS des totaux ci-dessus : la recette coûte de
    // vrais euros, on la voit sans qu'elle fausse l'usage des clientes.
    const internalIds = new Set(
      profiles.filter((p: any) => isExcludedEmail(p.email)).map((p: any) => p.user_id),
    );
    const aiInternes = summarize(
      aiRows.filter((a: any) => internalIds.has(a.user_id) && inWindow(a.created_at, curFrom, curTo)),
    );
    addEditorialReview(aiInternes, curFrom, curTo, cqAll.filter((e: any) => internalIds.has(e.user_id)));
    const comptes_internes_7j = {
      comptes: aiInternes.utilisatrices,
      appels: aiInternes.appels,
      tokens: aiInternes.tokens,
      cout_estime_eur: aiInternes.cout_total_estime_eur,
    };

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

    // Échantillon pour le juge (sources et repli « comptes internes » : echantillon.ts).
    const { echantillon, echantillon_source } = construireEchantillon({
      clientEvents: (cqEvents || []).filter((e: any) => inWindow(e.created_at, curFrom, curTo)),
      internalEvents: cqAll.filter((e: any) => internalIds.has(e.user_id) && inWindow(e.created_at, curFrom, curTo)),
      carrouselsGardes: carCur,
      estRetravaille,
    });

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
      // Garde anti-redite d'accroche (#915) : contenus où l'accroche redisait une
      // accroche précédente AVANT correction (cf. garde-redite.ts). Clientes et
      // comptes internes séparés, comme les coûts.
      garde_anti_redite: cqEvents
        ? {
            cette_semaine: gardeRediteStats(cqEvents, (d) => inWindow(d, curFrom, curTo)),
            semaine_precedente: gardeRediteStats(cqEvents, (d) => inWindow(d, prevFrom, prevTo)),
            comptes_internes_7j: gardeRediteStats(cqAll.filter((e: any) => internalIds.has(e.user_id)), (d) => inWindow(d, curFrom, curTo)),
          }
        : null,
      // Contrôle du fil des carrousels (08/10/2026) : réparations tentées /
      // GARDÉES par le 2e juge / sautées faute de temps (cf. fil-reparations.ts).
      fil_carrousels: cqEvents
        ? {
            cette_semaine: filStats(cqEvents, (d) => inWindow(d, curFrom, curTo)),
            semaine_precedente: filStats(cqEvents, (d) => inWindow(d, prevFrom, prevTo)),
            // Peu de clientes génèrent : les essais internes donnent un 1er chiffre.
            comptes_internes_7j: filStats(cqAll.filter((e: any) => internalIds.has(e.user_id)), (d) => inWindow(d, curFrom, curTo)),
          }
        : null,
      // Durées des carrousels par parcours (09/10/2026) : rédaction, juge,
      // réparation, association des photos (cf. durees-carrousels.ts).
      durees_carrousels: cqEvents
        ? {
            cette_semaine: dureesStats(cqEvents, (d) => inWindow(d, curFrom, curTo)),
            semaine_precedente: dureesStats(cqEvents, (d) => inWindow(d, prevFrom, prevTo)),
            comptes_internes_7j: dureesStats(cqAll.filter((e: any) => internalIds.has(e.user_id)), (d) => inWindow(d, curFrom, curTo)),
          }
        : null,
      // Plan des carrousels (12/10/2026) : durée, second appel, plans vides ou de
      // mauvaise longueur, au-delà des 170 s de l'écran (cf. plan-carrousels.ts).
      plan_carrousels: planClients
        ? {
            cette_semaine: planStats(planClients, (d) => inWindow(d, curFrom, curTo)),
            semaine_precedente: planStats(planClients, (d) => inWindow(d, prevFrom, prevTo)),
            comptes_internes_7j: planStats(planAll.filter((e: any) => internalIds.has(e.user_id)), (d) => inWindow(d, curFrom, curTo)),
          }
        : null,
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
      top_consommatrices_7j,
      comptes_internes_7j,
      publications: { cette_semaine: publishedCur, semaine_precedente: publishedPrev },
      cohortes: cohorts,
      actives_cette_semaine: activeThisWeek.size,
      qualite,
      higgsfield,
      espaces_owner_multiples,
    });
  } catch (e) {
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});