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
    // GPT Image 2.5 (bascule 28/09) : même tarif au token que gpt-image-2 mais
    // consommation par image différente (doc OpenAI) → 0,15 PROVISOIRE, à
    // recaler sur les tokens_used réels d'ai_usage.
    const IMAGE_COST_EUR: Record<string, number> = {
      "gpt-image-2": 0.15,
      "gpt-image-2.5-flare": 0.15,
      "gpt-image-2.5-sunburst": 0.15,
      "gpt-image-1": 0.22,
      "photoroom-v2": 0.05,
      "recraftv3-vector": 0.04,
      // Higgsfield (05/10/2026, prix lus sur open.higgsfield.ai) : images
      // routées là depuis #1228 tant que le crédit OpenAI direct est épuisé.
      // Comptées 0 € « NON TARIFÉ » au bilan du 05/10 (22 appels).
      // Marketing Studio (GPT Image 2.5) est facturé au TOKEN (image en sortie
      // 30 $/Mtok, image en entrée 8 $, texte 5 $), réconcilié après coup par
      // Higgsfield : aucun coût réel n'est stocké chez nous (higgsfield_image_spend
      // ne garde que la RÉSERVATION, borne haute ~0,33 $). Forfait = tarif
      // standard (hors remise -15 %) de la 4k high, 0,72 $, ÷ 4 pour la 2k high
      // utilisée ici (¼ des pixels) ≈ 0,18 $, + prompt et photos d'entrée ≈ 0,02 $.
      // PROVISOIRE, à recaler sur la facture Higgsfield.
      "marketing-studio/image/flare": 0.2,
      "marketing-studio/image/sunburst": 0.2,
      // Soul 2 : prix fixe à l'image, 0,0057 $ en 1080p (la résolution du Studio).
      "higgsfield-ai/soul/v2/standard": 0.0057,
      "higgsfield-ai/soul/v2/image-to-image": 0.0057,
    };

    // ⚠️ Les chiffres ci-dessous sont les tarifs publics en DOLLARS repris tels
    // quels (1 $ ≈ 1 €, sans conversion) : le « € » surestime donc le coût réel
    // de ~10-15 %. Borne prudente assumée, garder la même convention partout.
    // Coût texte estimé (€/million de tokens, tarifs Anthropic ~août 2026 :
    // Haiku 4.5 = 1$/5$, Sonnet 5 = 2$/10$, Sonnet 4.6 = 3$/15$,
    // Opus 4.8 et Opus 5 = 5$/25$ in/out).
    // `tokens_used` mélange input+output ; on applique un tarif MIXTE avec une
    // hypothèse 75 % input / 25 % output (les prompts contexte+charte dominent).
    // Approximation assumée — l'ordre de grandeur suffit pour la tendance hebdo.
    //
    // ⚠️ TOUT modèle absent de ce map était compté ZÉRO EN SILENCE (le `|| 0`
    // plus bas). C'est exactement ce qui est arrivé à `claude-sonnet-5` : la
    // bascule prod de mi-juillet 2026 (secret `AI_MODEL_SONNET`, le défaut du
    // code étant resté `claude-sonnet-4-6`) a rendu le compteur aveugle au
    // modèle DOMINANT pendant ~1 mois — le rapport du 03/08 affichait 1,92 €
    // là où le réel était ~4,8 €. D'où `modeles_non_tarifes` renvoyé plus bas :
    // un modèle inconnu doit CRIER, pas coûter 0. À chaque nouveau modèle,
    // l'ajouter ici (sinon il ressortira dans l'alerte du rapport hebdo).
    const TEXT_COST_EUR_PER_MTOKEN: Record<string, number> = {
      "claude-haiku-4-5": 2,
      "claude-sonnet-5": 4,
      "claude-sonnet-4-6": 6,
      "claude-opus-5-5": 8, // 4 $ / 20 $ par Mtok → 0,75×4 + 0,25×20
      "claude-opus-5": 10,
      "claude-opus-4-8": 10,
      "claude-opus-4-7": 10,
      // Modèles servis par la passerelle Lovable (`ai.gateway.lovable.dev`,
      // préfixe `google/`) : mini-audit Instagram, audit IA, impact branding,
      // suggestion de format, score de contenu, insight engagement, LinkedIn.
      // Lovable les facture en CRÉDITS d'abonnement, pas à l'appel — on retient
      // donc le tarif public Google comme APPROXIMATION d'ordre de grandeur
      // (Flash 0,30$/2,50$ ; Flash-Lite 0,10$/0,40$ par Mtok), même hypothèse
      // 75 % input / 25 % output que ci-dessus. Sans ces lignes, ces appels
      // étaient comptés ZÉRO et ressortaient chaque lundi dans l'alerte
      // `modeles_non_tarifes` (bilan du 07/09).
      "google/gemini-2.5-flash": 0.85,
      "google/gemini-2.5-flash-lite": 0.18,
      // OpenAI GPT-6 Astra (10$/50$ par Mtok, page de prix vérifiée le 28/09) :
      // rédacteur « qualité max » des carrousels. Astra RAISONNE et ses tokens
      // de réflexion sont facturés en SORTIE : l'hypothèse 75/25 (qui donnerait
      // 20) le sous-estime. Mix MESURÉ le 28/09 sur 2 carrousels réels :
      // 68 % entrée / 32 % sortie → 0,68×10 + 0,32×50 ≈ 23. Absent jusqu'ici :
      // chaque carrousel qualité max était compté ZÉRO (signalé le 14/09).
      "gpt-6-astra": 23,
      // Claude Fable 5.1 (10 $ / 50 $ par Mtok, même grille qu'Astra) : rédacteur
      // du mode Max depuis le 02/10. Il raisonne aussi (réflexion facturée en
      // sortie) → même mix mesuré qu'Astra en attendant une mesure propre : 23.
      "claude-fable-5-1": 23,
    };
    // Relecture éditoriale de CHAQUE carrousel (Astra jusqu’au 02/10, Claude ensuite) : elle n'écrit PAS dans
    // ai_usage (une ligne = un crédit décompté à l'utilisatrice), ses tokens
    // arrivent via content_quality_events.content_preview.editorial_usage, avec
    // entrée et sortie SÉPARÉES → tarif exact, pas de mix supposé.
    const REVIEW_COST_EUR_PER_MTOKEN: Record<string, { input: number; output: number }> = {
      "gpt-6-astra": { input: 10, output: 50 }, // relecture jusqu'au 02/10
      // Relecture sur Claude depuis le 02/10 (4 $ / 20 $ par Mtok). Le cache
      // de prompt est compté au plein tarif d'entrée : borne haute.
      "claude-opus-5-5": { input: 4, output: 20 },
    };

    // Générations RÉELLES mais sans appel modèle : coût API nul, et c'est VOULU.
    // Aujourd'hui le carrousel photo pur, dont le HTML est composé par code
    // (chantier gabarits 13/07) — un crédit est bien débité, aucun modèle n'est
    // appelé. Ces libellés sont donc « tarifés à 0 », pas « inconnus » : sans
    // cette liste, la garde `modeles_non_tarifes` crierait à chaque carrousel
    // photo et on réapprendrait à ignorer l'alerte, ce qui recréerait le bug
    // qu'elle est censée empêcher.
    // ⚠️ `composition-code` est la recopie de COMPOSED_BY_CODE_MODEL
    // (`_shared/plan-limiter.ts`) : cette edge n'importe rien de `_shared/` pour
    // rester déployable seule. Toute modification doit toucher les deux.
    const ZERO_COST_LABELS = new Set<string>(["composition-code"]);

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
      // Garde déterministe contre le sous-comptage silencieux : tout modèle vu
      // dans ai_usage mais absent des DEUX grilles tarifaires a contribué 0 € au
      // total. On le remonte au lieu de le taire — le total reste affiché (il
      // reste utile), mais il est explicitement signalé comme INCOMPLET.
      const modelesNonTarifes = Object.entries(byModel)
        .filter(([m]) => !(m in TEXT_COST_EUR_PER_MTOKEN) && !(m in IMAGE_COST_EUR) && !ZERO_COST_LABELS.has(m))
        .map(([m, v]) => ({ modele: m, appels: v.appels, tokens: v.tokens }))
        .sort((a, b) => b.tokens - a.tokens);
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
        modeles_non_tarifes: modelesNonTarifes,
        cout_incomplet: modelesNonTarifes.length > 0,
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

    // Relecture éditoriale (hors ai_usage, cf. REVIEW_COST_EUR_PER_MTOKEN) :
    // ajoutée au coût de la semaine et remontée par modèle. Un modèle de
    // relecture sans tarif rejoint `modeles_non_tarifes` comme les autres.
    const addEditorialReview = (summary: any, from: number, to: number, events: any[] = cqEvents || []) => {
      const byModel: Record<string, { carrousels: number; input_tokens: number; output_tokens: number }> = {};
      // Issue de la relecture : « rejected » = payée puis jetée par la garde de
      // fidélité (2/2 le 28/09). `garde` compte la règle qui a bloqué.
      const issues: Record<string, number> = {}, garde: Record<string, number> = {};
      for (const e of events) {
        const u = e.content_preview?.editorial_usage;
        if (!u?.model || !inWindow(e.created_at, from, to)) continue;
        if (u.status) issues[u.status] = (issues[u.status] || 0) + 1;
        for (const g of Array.isArray(u.guard) ? u.guard : []) {
          const k = String(g).replace(/^(lost-number|new-unsupported-number):.*/, "$1");
          garde[k] = (garde[k] || 0) + 1;
        }
        const m = (byModel[u.model] ||= { carrousels: 0, input_tokens: 0, output_tokens: 0 });
        m.carrousels++;
        m.input_tokens += Number(u.input_tokens) || 0;
        m.output_tokens += Number(u.output_tokens) || 0;
      }
      let cout = 0;
      const relecture = Object.entries(byModel).map(([modele, v]) => {
        // L'API peut renvoyer un nom daté (claude-opus-5-5-2026xxxx).
        const tarif = REVIEW_COST_EUR_PER_MTOKEN[modele] ?? REVIEW_COST_EUR_PER_MTOKEN[modele.replace(/-20\d{6}$/, "")];
        const c = tarif ? (tarif.input * v.input_tokens + tarif.output * v.output_tokens) / 1_000_000 : 0;
        cout += c;
        if (!tarif) {
          summary.modeles_non_tarifes.push({ modele: `${modele} (relecture)`, appels: v.carrousels, tokens: v.input_tokens + v.output_tokens });
          summary.cout_incomplet = true;
        }
        return { modele, ...v, cout_estime_eur: Math.round(c * 100) / 100 };
      });
      const round2 = (n: number) => Math.round(n * 100) / 100;
      summary.relecture_editoriale = relecture;
      summary.relecture_issues = { ...issues, ...(Object.keys(garde).length ? { garde } : {}) };
      summary.cout_texte_estime_eur = round2(summary.cout_texte_estime_eur + cout);
      summary.cout_total_estime_eur = round2(summary.cout_total_estime_eur + cout);
    };
    addEditorialReview(aiCur, curFrom, curTo);
    addEditorialReview(aiPrev, prevFrom, prevTo);

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