import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkQuota, logUsage, quotaDeniedResponse } from "../_shared/plan-limiter.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
import { isDemoUser } from "../_shared/guard-demo.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS } from "../_shared/user-context.ts";
import { getModelForAction, callAnthropicSimple } from "../_shared/anthropic.ts";
import { fetchHotNews, EVERGREEN_PATTERNS, type PerplexityActu } from "../_shared/perplexity.ts";

// Brand universe cache TTL — regenerate after 30 days or when branding changes
const BRAND_UNIVERSE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface BrandUniverse {
  univers_emotionnel: string[];
  moments_de_vie_cible: string[];
  valeurs_combat: string[];
  themes_lifestyle: string[];
}

const EMPTY_UNIVERSE: BrandUniverse = {
  univers_emotionnel: [],
  moments_de_vie_cible: [],
  valeurs_combat: [],
  themes_lifestyle: [],
};

function isUniverseFresh(updatedAt: string | null): boolean {
  if (!updatedAt) return false;
  const ts = new Date(updatedAt).getTime();
  if (isNaN(ts)) return false;
  return Date.now() - ts < BRAND_UNIVERSE_TTL_MS;
}

function isUniverseUsable(u: any): u is BrandUniverse {
  if (!u || typeof u !== "object") return false;
  const total = (Array.isArray(u.univers_emotionnel) ? u.univers_emotionnel.length : 0)
    + (Array.isArray(u.moments_de_vie_cible) ? u.moments_de_vie_cible.length : 0)
    + (Array.isArray(u.valeurs_combat) ? u.valeurs_combat.length : 0)
    + (Array.isArray(u.themes_lifestyle) ? u.themes_lifestyle.length : 0);
  return total >= 3;
}

async function generateBrandUniverse(brandingContext: string): Promise<BrandUniverse> {
  const system = `Tu aides un·e créateur·ice de contenu à élargir l'univers sémantique de sa marque AU-DELÀ de son métier littéral.

Exemple : pour une marque de LINGERIE, tu ne dois PAS répéter "lingerie, soutien-gorge, dentelle". Tu dois trouver l'UNIVERS ÉMOTIONNEL vendu : plaisir, sensualité, féminité, intimité, self-love, body positive, rituel du soir, confiance en soi…

À partir du profil de marque ci-dessous, renvoie 4 listes courtes (5 termes chacune) qui décrivent l'univers ÉLARGI de cette marque. Chaque terme doit être un mot ou une expression de 1 à 4 mots, évocateur, recherchable sur le web.

PROFIL :
${brandingContext}

Renvoie UNIQUEMENT ce JSON (pas de markdown, pas de backticks, pas de commentaire) :
{
  "univers_emotionnel": ["...", "...", "...", "...", "..."],
  "moments_de_vie_cible": ["...", "...", "...", "...", "..."],
  "valeurs_combat": ["...", "...", "...", "...", "..."],
  "themes_lifestyle": ["...", "...", "...", "...", "..."]
}

Règles :
- "univers_emotionnel" : émotion / transformation / promesse profonde vendue (PAS le produit)
- "moments_de_vie_cible" : situations, étapes, rendez-vous où la cliente vit ce besoin
- "valeurs_combat" : ce que la marque défend ou refuse, les causes adjacentes
- "themes_lifestyle" : esthétiques, rituels, ambiances connexes au mode de vie de la cible
- Évite les termes ultra-génériques ("vie", "bonheur", "amour" seul). Préfère "amour de soi", "rituel matinal".
- Pas de hashtags, pas de #, pas de majuscules sauf noms propres.`;

  try {
    const raw = await callAnthropicSimple(getModelForAction("strategy"), system, "Génère le JSON maintenant.", 0.7);
    let parsed: any;
    try {
      parsed = JSON.parse(raw.trim());
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    }
    if (isUniverseUsable(parsed)) {
      return {
        univers_emotionnel: (parsed.univers_emotionnel || []).slice(0, 8),
        moments_de_vie_cible: (parsed.moments_de_vie_cible || []).slice(0, 8),
        valeurs_combat: (parsed.valeurs_combat || []).slice(0, 8),
        themes_lifestyle: (parsed.themes_lifestyle || []).slice(0, 8),
      };
    }
  } catch (e) {
    console.error("Brand universe generation failed:", (e as Error).message);
  }
  return EMPTY_UNIVERSE;
}


serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (isDemoUser(user.id)) {
      return new Response(JSON.stringify({ error: "Fonctionnalité non disponible en mode démo." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const workspace_id = body?.workspace_id || undefined;
    const forceMacroFromClient: boolean = body?.force_macro === true;
    const rawIntent = body?.intent || {};
    const intentVibes: string[] = Array.isArray(rawIntent.vibes)
      ? rawIntent.vibes.filter((v: unknown) => typeof v === "string").slice(0, 3)
      : [];
    const intentCustom: string = typeof rawIntent.custom === "string"
      ? rawIntent.custom.trim().slice(0, 200)
      : "";
    const excludedUrls: string[] = Array.isArray(body?.excluded_urls)
      ? body.excluded_urls.filter((u: unknown) => typeof u === "string").slice(0, 50)
      : [];

    // Détection "intent macro" : la créatrice cherche explicitement des
    // actus grand public / hors de sa niche.
    const MACRO_REGEX = /\b(globa\w+|grand\s?public|fait\s+parler|tout\s+le\s+monde\s+(en\s+)?parle|hors\s+(de\s+)?(ma\s+|mon\s+)?(secteur|niche|m[ée]tier)|large(ment)?|soci[ée]t[ée]|monde|cette\s+semaine|actu(s|alit[ée]s?)?\s+(de\s+la\s+)?semaine|macro)\b/i;
    const macroFromIntent = !!intentCustom && MACRO_REGEX.test(intentCustom);
    const macroMode = forceMacroFromClient || macroFromIntent;

    // Rate limit
    const rl = checkRateLimit(user.id, 5, 60_000);
    if (!rl.allowed) {
      return rateLimitResponse(rl.retryAfterMs!, corsHeaders);
    }

    // Quota
    const quota = await checkQuota(user.id, "deep_research", workspace_id);
    if (!quota.allowed) {
      return quotaDeniedResponse(quota, corsHeaders);
    }

    // Branding context
    const sbService = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const ctx = await getUserContext(sbService, user.id, workspace_id);
    const brandingContext = formatContextForAI(ctx, CONTEXT_PRESETS.content);

    // Extract activity keywords for targeted niche search
    const activityRaw = ctx?.profile?.activite || ctx?.profile?.type_activite || "";
    const pillarsRaw = Array.isArray(ctx?.profile?.piliers) ? ctx.profile.piliers.join(", ") : "";
    const cibleRaw = ctx?.profile?.cible || "";
    const combatCause = ctx?.brand_profile?.combat_cause || "";
    const nicheLabel = activityRaw || "son secteur";

    // Date context for "récent"
    const now = new Date();
    const months = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
    const monthLabel = `${months[now.getMonth()]} ${now.getFullYear()}`;

    // ─────────────────────────────────────────────────────────────
    // Brand universe — cached on brand_profile, regenerated every 30 days
    // Goal: "lingerie" → ["plaisir", "féminité", "self-love"…] so the web
    // searches go beyond the literal job description.
    // ─────────────────────────────────────────────────────────────
    let universe: BrandUniverse = EMPTY_UNIVERSE;
    try {
      // Resolve the brand_profile owner (workspace owner if shared, else current user)
      let bpUserId = user.id;
      if (workspace_id) {
        const { data: ownerRow } = await sbService
          .from("workspace_members")
          .select("user_id")
          .eq("workspace_id", workspace_id)
          .eq("role", "owner")
          .maybeSingle();
        if (ownerRow?.user_id) bpUserId = ownerRow.user_id;
      }

      const { data: bpRow } = await sbService
        .from("brand_profile")
        .select("id, brand_universe, brand_universe_updated_at")
        .eq("user_id", bpUserId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (bpRow && isUniverseUsable(bpRow.brand_universe) && isUniverseFresh(bpRow.brand_universe_updated_at)) {
        universe = bpRow.brand_universe as BrandUniverse;
        console.log("Brand universe: cache hit");
      } else if (bpRow) {
        console.log("Brand universe: cache miss/stale, regenerating");
        const generated = await generateBrandUniverse(brandingContext);
        if (isUniverseUsable(generated)) {
          universe = generated;
          await sbService
            .from("brand_profile")
            .update({
              brand_universe: generated,
              brand_universe_updated_at: new Date().toISOString(),
            })
            .eq("id", bpRow.id);
        }
      }
    } catch (e) {
      console.error("Brand universe lookup failed (non-blocking):", (e as Error).message);
    }

    // Build niche queries — mix literal job + emotional universe + life moments
    const pickFirst = (arr: string[], n: number) => arr.slice(0, n).join(" ");
    const universeQuery = universe.univers_emotionnel.length
      ? `${pickFirst(universe.univers_emotionnel, 3)} société débat ${now.getFullYear()}`
      : "";
    const momentsQuery = universe.moments_de_vie_cible.length
      ? `${pickFirst(universe.moments_de_vie_cible, 3)} ${cibleRaw || "femmes"} ${now.getFullYear()}`
      : "";

    const nicheQueries = [
      activityRaw ? `${activityRaw} actualité ${monthLabel}` : "",
      universeQuery || (cibleRaw ? `${cibleRaw} préoccupations ${now.getFullYear()}` : (pillarsRaw ? `${pillarsRaw} actualité` : "")),
      momentsQuery || (combatCause ? `${combatCause} débat actualité ${now.getFullYear()}` : (activityRaw ? `${activityRaw} tendance secteur` : "")),
    ].filter(Boolean);


    // ─────────────────────────────────────────────────────────────
    // Perplexity sourcing — récupère 2-3 actus chaudes du moment
    // qui font débat, à injecter comme MATIÈRE PREMIÈRE pour Claude.
    // Optionnel : si Perplexity tombe / pas de clé → on continue
    // sans bloquer (le pipeline web_search Claude reste opérationnel).
    // ─────────────────────────────────────────────────────────────
    // Mapping VIBES → axes + hints (alimenté par l'intention utilisateur)
    // ─────────────────────────────────────────────────────────────
    const VIBES_MAP: Record<string, { axe: string | null; label: string; query_hint: string }> = {
      scoop:     { axe: "actu_connectable",      label: "Actu choc à rebondir",       query_hint: "actualité choc cette semaine France polémique virale révélation qui sort affaire qui éclate chiffre qui choque scandale du moment enquête déclaration publique qui fait réagir" },
      phenomene: { axe: "obsession_collective",  label: "Phénomène culturel",         query_hint: "phénomène culturel viral du moment" },
      debat:     { axe: "debat_recurrent",       label: "Débat clivant",              query_hint: "débat clivant société polémique" },
      stat:      { axe: "comportement_emergent", label: "Stat ou étude étonnante",    query_hint: "étude statistique chiffre étonnant" },
      tendance:  { axe: "mot_qui_revient",       label: "Tendance émergente",         query_hint: "tendance émergente nouvelle pratique" },
      culture:   { axe: "objet_culturel",        label: "Sortie culturelle",          query_hint: "film série livre album sortie récente" },
      combat:    { axe: null,                    label: "Combat / cause de société",  query_hint: combatCause ? `${combatCause} débat actualité` : "engagement combat société" },
    };
    const intentVibesValid = intentVibes.filter((v) => VIBES_MAP[v]);
    const intentVibeHints = intentVibesValid.map((v) => VIBES_MAP[v].query_hint);
    const intentVibeLabels = intentVibesValid.map((v) => VIBES_MAP[v].label);
    const scoopMode = intentVibesValid.includes("scoop");

    let hotNews: PerplexityActu[] = [];
    const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
    if (PERPLEXITY_API_KEY) {
      try {
        const customWords = intentCustom
          ? intentCustom.split(/\s+/).filter((w) => w.length > 2).slice(0, 6).join(" ")
          : "";
        // En mode macro OU scoop, on coupe le biais niche pour récupérer de l'actu
        // vraiment grand public / chaude ; sinon on garde l'orientation univers.
        const wideMode = macroMode || scoopMode;
        const universKeywords = wideMode
          ? [...intentVibeHints, customWords].filter(Boolean)
          : [
              ...intentVibeHints,
              customWords,
              ...universe.valeurs_combat.slice(0, 2),
              ...universe.moments_de_vie_cible.slice(0, 2),
              ...universe.univers_emotionnel.slice(0, 2),
            ].filter(Boolean);

        const ppxController = new AbortController();
        const ppxTimeout = setTimeout(() => ppxController.abort(), scoopMode ? 40000 : 25000);
        try {
          const ppxResult = await fetchHotNews({
            niche: wideMode ? undefined : nicheLabel,
            universKeywords,
            recency: scoopMode ? "week" : "week",
            excludedUrls,
            apiKey: PERPLEXITY_API_KEY,
            signal: ppxController.signal,
            mode: scoopMode ? "scoop" : "default",
          });
          const cap = scoopMode ? 6 : macroMode ? 5 : 3;
          hotNews = ppxResult.actus.slice(0, cap);
          console.log(`Perplexity (${scoopMode ? "scoop" : macroMode ? "macro" : "niche"}): ${hotNews.length} actu(s) chaude(s) récupérée(s)`);
          if (scoopMode && hotNews.length === 0) {
            console.log("[scoop] sourcing vide après 2 tentatives — fallback Claude web search");
          }
        } finally {
          clearTimeout(ppxTimeout);
        }

      } catch (e) {
        console.warn("Perplexity sourcing failed (non-blocking):", (e as Error).message);
      }
    } else {
      console.log("PERPLEXITY_API_KEY absente — sourcing actu chaude désactivé");
    }

    // Claude call with web search
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY non configurée" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const model = getModelForAction("content");

    // 6 axes orientés micro-phénomènes culturels et comportementaux
    const AXES = [
      { id: "mot_qui_revient", query: "expression mot concept qui revient conversations 2026 France" },
      { id: "obsession_collective", query: "phénomène culturel dont tout le monde parle France 2026" },
      { id: "comportement_emergent", query: "nouveau comportement quotidien tendance société France 2026" },
      { id: "debat_recurrent", query: "débat récurrent authenticité productivité éthique vie quotidienne 2026" },
      { id: "objet_culturel", query: "film série livre album sortie récente discussion France 2026" },
      { id: "actu_connectable", query: "actualité société qui touche au quotidien et aux choix de vie France 2026" },
    ];

    // Si l'utilisatrice a précisé des vibes → axes contraints, sinon shuffle.
    let pickedAxes: typeof AXES;
    if (intentVibesValid.length > 0) {
      const wantedIds = new Set(
        intentVibesValid.map((v) => VIBES_MAP[v].axe).filter((a): a is string => !!a)
      );
      const matched = AXES.filter((a) => wantedIds.has(a.id));
      const remaining = AXES.filter((a) => !wantedIds.has(a.id)).sort(() => Math.random() - 0.5);
      pickedAxes = [...matched, ...remaining].slice(0, Math.max(3, matched.length));
    } else {
      pickedAxes = [...AXES].sort(() => Math.random() - 0.5).slice(0, 3);
    }


    const universeBlock = (universe.univers_emotionnel.length || universe.moments_de_vie_cible.length)
      ? `\n══════════════════════════════════════════════
UNIVERS DE MARQUE ÉLARGI — hiérarchisé par FORCE DE PONT
══════════════════════════════════════════════

Cette personne ne vend pas SEULEMENT "${nicheLabel}". Mais TOUS les éléments de son univers ne se valent PAS pour faire un pont solide. Classement obligatoire :

🟢 NIVEAU 1 — PONTS FORTS (à privilégier massivement) :
- Valeurs / combats adjacents : ${universe.valeurs_combat.join(", ") || "—"}
- Moments de vie de la cible : ${universe.moments_de_vie_cible.join(", ") || "—"}
→ Ces éléments concernent DIRECTEMENT la cible dans sa vie quotidienne ou dans ses convictions. Un sujet branché ici est immédiatement légitime.

🟡 NIVEAU 2 — PONTS MOYENS (ok, mais avec un vrai angle) :
- Univers émotionnel : ${universe.univers_emotionnel.join(", ") || "—"}
→ Connectable, mais demande un angle clair pour ne pas tomber dans le "feel-good" générique.

🔴 NIVEAU 3 — PONT FAIBLE (MAX 1 sujet sur l'ensemble) :
- Lifestyle / esthétiques : ${universe.themes_lifestyle.join(", ") || "—"}
→ Ces éléments sont décoratifs. Ils ne créent PAS de pont commercial. Utilise-les avec parcimonie.

RÈGLE : si tu hésites entre un sujet niveau 1 et un sujet niveau 2/3, choisis TOUJOURS le niveau 1.\n`
      : "";

    // Bloc "matière première" : actus chaudes pré-sourcées par Perplexity.
    // Ces actus contournent le filtre anti-actu-chaude habituel CAR elles sont
    // déjà passées au tamis Perplexity (faits divers tragiques exclus, etc.).
    // Claude doit les traiter comme une OPTION supplémentaire, pas une obligation :
    // il les garde uniquement si elles ont un vrai pont vers le profil.
    const hotNewsBlock = hotNews.length > 0
      ? `\n══════════════════════════════════════════════
ACTUS CHAUDES PRÉ-SOURCÉES (cette semaine en France)
══════════════════════════════════════════════

Voici ${hotNews.length} actu(s) chaude(s) qui font débat actuellement, déjà filtrées (pas de fait divers tragique, pas de propagande partisane). Tu peux PUISER 1 ou 2 sujets ici si — et SEULEMENT si — tu peux écrire un pont fort vers le profil. Si aucune ne se connecte vraiment, IGNORE-LES et reste sur les recherches micro-phénomènes ci-dessous.

${hotNews.map((a, i) => `  ${i + 1}. "${a.titre}"
     → ${a.resume}
     → Source : ${a.source}${a.source_url ? ` (${a.source_url})` : ""}${a.date_publication ? ` — ${a.date_publication}` : ""}`).join("\n\n")}

Si tu reprends une de ces actus chaudes, conserve EXACTEMENT son titre, son résumé, sa source ET son source_url dans ta réponse — c'est important pour la traçabilité. Tag-la avec axe="actu_connectable" et type="globale".\n`
      : "";

    // Bloc "intention" — uniquement si l'utilisatrice a précisé des vibes ou un texte libre.
    const intentBlock = (intentVibeLabels.length > 0 || intentCustom)
      ? `\n══════════════════════════════════════════════
DEMANDE EXPLICITE DE LA CRÉATRICE — PRIORITÉ ABSOLUE
══════════════════════════════════════════════

${intentVibeLabels.length > 0 ? `Vibes recherchés : ${intentVibeLabels.join(", ")}` : ""}${intentVibeLabels.length > 0 && intentCustom ? "\n" : ""}${intentCustom ? `Précision libre : "${intentCustom}"` : ""}

→ Les actus que tu proposes DOIVENT correspondre à cette demande, en plus de respecter le pont vers le profil.
→ Si tu ne trouves rien d'aligné après recherche, dis-le franchement (renvoie moins de sujets, ou la sortie vide avec message) plutôt que de forcer des sujets hors-sujet.\n`
      : "";

    // Bloc "mode macro" — la créatrice veut explicitement de l'actu grand public,
    // pas de l'actu connectée à sa niche. On détend le pont, on bumpe le ratio globale,
    // on force l'exclusion des sujets méta réseaux sociaux même si c'est son métier.
    const macroBlock = macroMode
      ? `\n══════════════════════════════════════════════
MODE "ACTU GRAND PUBLIC" — ACTIVÉ (PRIORITÉ MAXIMALE)
══════════════════════════════════════════════

La créatrice cherche EXPLICITEMENT des actus dont parle le grand public cette semaine, PAS des actus liées à son secteur "${nicheLabel}". C'est un acte délibéré de prendre du recul par rapport à sa niche.

Conséquences IMPÉRATIVES pour cette requête :
- VISE ~5 actus de type="globale" + 1 seule actu de type="niche" (au lieu de 3+3).
- Les actus globales sont choisies pour leur RÉSONANCE GRAND PUBLIC (ce dont parlent les gens en discussion, dîners, médias mainstream), PAS pour leur pont avec le profil.
- Pour les actus globales, le champ "pertinence" devient une PISTE DE RÉACTION : "voici un angle que cette personne pourrait prendre", PAS un pont littéral citant son activité ou sa cible. Une phrase, sobre, qui ouvre une porte sans forcer.
- Pour les actus globales : la règle "force_pont fort à 2/3" est REMPLACÉE par "force_pont fort à 1/3 minimum". "fragile" reste interdit. "moyen" est la valeur attendue par défaut.
- EXCLUSION ABSOLUE (même si "${nicheLabel}" est en lien avec la com') : les actus globales qui parlent de réseaux sociaux, publication de contenu, Meta / Instagram / TikTok / LinkedIn / X / YouTube, algorithmes, créateur·ices de contenu, marketing digital, IA générative pour le contenu. Si une actu chaude pré-sourcée tombe dans cette catégorie, IGNORE-LA pour le bucket globale. Tu peux la replacer dans le bucket niche si pertinente.
- L'unique actu niche autorisée peut, elle, parler de ce qu'elle veut dans le métier de la personne.\n`
      : "";


    // Bloc "mode scoop" — la créatrice veut du vrai newsjacking : des actus
    // chocs/virales des derniers jours sur lesquelles elle peut rebondir
    // publiquement, pas des micro-phénomènes culturels lents.
    const scoopBlock = scoopMode
      ? `\n══════════════════════════════════════════════
MODE "ACTU CHOC À REBONDIR" — ACTIVÉ (PRIORITÉ MAXIMALE, ÉCRASE LE RESTE)
══════════════════════════════════════════════

La créatrice veut faire du VRAI NEWSJACKING : rebondir sur des actus CHAUDES, virales, CHOQUANTES, qui font réagir TOUT LE MONDE cette semaine (idéalement ces 1-3 derniers jours). PAS des micro-phénomènes culturels lents, PAS des "tendances émergentes", PAS des sujets evergreen.

▶ OBJECTIF : renvoyer 3 à 5 actus chaudes des derniers jours en France, toutes de type="globale" (sauf 1 niche maximum si une actu du secteur est ELLE AUSSI vraiment choc cette semaine).

▶ SOURCES PRIORITAIRES (utilise web_search avec ces sites) :
lemonde.fr, liberation.fr, lefigaro.fr, nouvelobs.fr, slate.fr, mediapart.fr, huffingtonpost.fr, franceinfo.fr, francetvinfo.fr, bfmtv.com, 20minutes.fr, lesinrocks.com, konbini.com, numerama.com, lesechos.fr.
${hotNews.length > 0 ? `Reprends aussi les ${hotNews.length} actus chaudes pré-sourcées ci-dessus si elles passent le test "oh wow".` : `⚠️ AUCUNE actu pré-sourcée disponible cette fois → tu DOIS faire 4 à 6 recherches web sur les sites ci-dessus pour trouver toi-même les actus chocs des derniers jours. Ne renvoie JAMAIS une réponse vide ou un message d'excuse : si après tes recherches tu n'as rien, élargis à des sujets culturels ou société qui font débat ce mois-ci.`}


▶ TEST "OH WOW" OBLIGATOIRE — pour chaque sujet, à la lecture du titre seul, la cible doit avoir une réaction physique : sourcils qui se lèvent, "attends, quoi ?", envie immédiate de partager ou de réagir. Au moins UN de ces marqueurs DOIT être présent :
  - chiffre contre-intuitif ou choc (révélé cette semaine)
  - info cachée enfin révélée (fuite, enquête, exposé)
  - contradiction frontale d'une croyance dominante
  - dérive systémique nommée publiquement
  - retournement / rebondissement d'une affaire en cours
  - polémique en cours qui clive en ce moment même
  - déclaration publique qui fait réagir (perso publique, marque, institution)

▶ INTERDIT EN MODE SCOOP :
  - "X est en hausse" / "tendance Y observée" / "selon une étude récente…" sans angle révélateur
  - micro-phénomènes culturels mous ("ce mot revient", "cette pratique émerge")
  - sujets evergreen ou de fond
  - sujets sans date récente identifiable
  - les exclusions éthiques restent absolues : pas de faits divers tragiques, pas de politique partisane, pas de récupération de drames personnels

▶ PONT RELÂCHÉ : la règle "force_pont fort à 2/3" est REMPLACÉE par "moyen acceptable à 2/3, fort à 1/3". Le champ "pertinence" devient une PISTE DE RÉACTION : "voici comment cette personne peut rebondir publiquement / quel angle elle peut prendre", PAS un pont littéral citant son métier. Une phrase sobre qui ouvre une porte sans forcer.

▶ La règle "1/3 décalant" reste valable, mais "décalant" ici veut dire angle de réaction inattendu, pas sujet décalé.\n`
      : "";


    const systemPrompt = `Tu es une assistante de veille culturelle pour créateur·ices de contenu et entrepreneur·es (tous secteurs, pas que les réseaux sociaux).

PROFIL DE L'UTILISATEUR·ICE :
${brandingContext}
${universeBlock}
${intentBlock}
${macroBlock}
${scoopBlock}
${hotNewsBlock}══════════════════════════════════════════════
PHILOSOPHIE — LIRE EN PREMIER
══════════════════════════════════════════════

${scoopMode
  ? `MODE NEWSJACKING ACTIF (cf. bloc "ACTU CHOC À REBONDIR" plus haut). Tu IGNORES la philosophie "micro-phénomènes culturels" ci-dessous : ici on veut de l'actu chaude, choc, virale, des derniers jours. Les recherches "micro-phénomènes" ci-dessous sont DÉSACTIVÉES. Tu fais à la place 3 recherches web sur les sources mainstream (Le Monde, Libération, Slate, HuffPost, FranceInfo, etc.) pour trouver les actus qui font débat cette semaine, en respectant le test "oh wow" et les exclusions éthiques.`
  : `On cherche en priorité des MICRO-PHÉNOMÈNES CULTURELS : un mot qui sature les conversations, une obsession collective, un nouveau comportement, un débat qui ressort, un objet culturel (film/livre/série) dont on parle. ${hotNews.length > 0 ? `EXCEPTION : tu as reçu ci-dessus ${hotNews.length} actu(s) chaude(s) déjà filtrée(s). Tu peux en reprendre 1 ou 2 si elles ont un vrai pont, en complément des micro-phénomènes.` : "Une vraie actu chaude n'est acceptée QUE si elle se connecte naturellement au profil de la personne."}`}

Le critère central : chaque sujet doit avoir un PONT EXPLICITE vers cette personne. Pas un pont forcé du genre "et ça nous rappelle que la communication...". Un vrai pont qui cite quelque chose de précis du profil (sa cible, son activité, son combat, ses piliers, OU un terme de son univers élargi)${scoopMode ? " — mais en mode scoop, le pont est une PISTE DE RÉACTION, pas une citation littérale du métier." : ""}.

══════════════════════════════════════════════
RECHERCHES À EFFECTUER
══════════════════════════════════════════════

${scoopMode ? `▶ RECHERCHES "ACTU CHOC" (obligatoire, REMPLACE les autres) :
Fais 3 à 5 recherches web ciblées sur les médias mainstream français pour trouver les actus chocs des derniers jours qui répondent au test "oh wow". Couvre des angles différents (société, économie, culture, justice, environnement, déclarations publiques). Ignore le bloc "micro-phénomènes" et le bloc "niche" ci-dessous.` : `▶ RECHERCHES "MICRO-PHÉNOMÈNES" — 3 axes culturels DIFFÉRENTS (obligatoire) :
Pour chaque axe ci-dessous, fais une recherche web et trouve 1 phénomène. Jamais 2 sujets du même axe.

${pickedAxes.map((a, i) => `  ${i + 1}. axe="${a.id}" → cherche : "${a.query}"`).join("\n")}

▶ RECHERCHES NICHE — connectées à l'univers de "${nicheLabel}" (obligatoire) :
Fais ces 3 recherches DIFFÉRENTES (pas une seule, les 3) :
${nicheQueries.map((q, i) => `  ${i + 1}. "${q}"`).join("\n")}

${universeBlock ? `RÈGLE D'ANCRAGE NICHE (impérative) : sur les 3 sujets niche, MINIMUM 2 doivent rester ANCRÉS dans le métier littéral OU son extension directe (= sujets connectés à un terme de niveau 1 : valeurs/combats ou moments de vie où la cible vit RÉELLEMENT le besoin du produit/service). MAXIMUM 1 sujet niche peut venir d'un terme de niveau 2 (univers émotionnel). Sur l'ensemble des sujets renvoyés (globaux + niche), MAXIMUM 1 SEUL peut venir d'un terme de niveau 3 (lifestyle/esthétiques). Si une recherche niche te donne du lifestyle pur, jette-la et refais-la avec un terme de niveau 1.\n` : ""}`}


══════════════════════════════════════════════
RÈGLE DU PONT EXPLICITE — GARDE-FOU N°1
══════════════════════════════════════════════

Pour CHAQUE sujet, le champ "pertinence" doit citer un élément CONCRET du profil (cible, activité, combat, piliers) et expliquer en 1 phrase pourquoi cette personne en particulier a quelque chose à dire dessus.

✅ EXEMPLES DE BONS PONTS :
- "Ta cible (${cibleRaw || "ton audience"}) vit exactement ce dilemme quand elle hésite entre X et Y."
- "Tu portes le combat ${combatCause || "que tu défends"}, ce phénomène en est une illustration parfaite."
- "Comme tu travailles sur ${activityRaw || "ton sujet"}, tu peux décortiquer ce que ça révèle de [aspect précis]."

❌ EXEMPLES DE PONTS FORCÉS À ÉVITER (rejette le sujet si tu ne sais écrire QUE ça) :
- "ça nous rappelle l'importance de la communication"
- "comme dans ton métier, il faut savoir s'adapter"
- "à l'image de ce phénomène, ta marque peut..."
- "c'est un parallèle intéressant avec ton activité"

Si tu ne peux pas écrire un pont concret citant le profil → NE RENVOIE PAS le sujet. Mieux vaut 3 sujets connectés que 6 hors-sol.

══════════════════════════════════════════════
RÈGLE DU REGISTRE — GARDE-FOU N°2 (1 sur 3 décalant)
══════════════════════════════════════════════

Chaque sujet a un registre :
- "confortable" : sujet que la cible reconnaîtrait immédiatement comme "de son univers"
- "entre_deux" : sujet connu mais pris sous un angle inattendu
- "decalant" : sujet auquel personne dans le secteur de "${nicheLabel}" ne penserait spontanément

Sur N sujets renvoyés (3 à 6), exactement ⌈N/3⌉ doivent être "decalant" (ex : 3 sujets → 1 décalant ; 6 sujets → 2 décalants). Le reste se répartit entre "confortable" et "entre_deux".

ATTENTION : un sujet "decalant" doit QUAND MÊME respecter le pont explicite. Décalant ≠ hors-sol.

══════════════════════════════════════════════
GARDE-FOU N°3 — AUTO-ÉVALUATION DE LA FORCE DU PONT (NOUVEAU, OBLIGATOIRE)
══════════════════════════════════════════════

Pour CHAQUE sujet, attribue toi-même une note "force_pont" :

- "fort" = le pont cite un élément LITTÉRAL du profil (cible exacte, activité exacte, combat exact, pilier exact, OU terme de NIVEAU 1 de l'univers élargi). La connexion est immédiate, sans paraphrase, et la cible la verrait sans qu'on lui explique.
- "moyen" = le pont passe par un terme de NIVEAU 2 (univers émotionnel) et reste évident pour la cible, mais demande un angle clair.
- "fragile" = le pont demande une étape de raisonnement pour être compris, OU repose uniquement sur du lifestyle/esthétique (niveau 3), OU fait appel à une analogie qu'il faut "déballer". → REJETTE le sujet, ne le renvoie pas.

RÈGLE QUOTA : sur N sujets renvoyés, au moins ⌈N×2/3⌉ doivent être "fort". Au plus 1 seul peut être "fragile" (et même là : préfère ne pas le renvoyer).

Avant d'écrire chaque sujet, demande-toi : "Si je montre cette pertinence à la personne sans contexte, est-ce qu'elle dit 'évidemment, c'est pour moi' ou est-ce qu'elle dit 'euh, pourquoi tu me parles de ça ?'". Si c'est la 2e → fragile → jette.

══════════════════════════════════════════════
INTERDIT
══════════════════════════════════════════════

🚫 Politique partisane, lois, élections, faits divers tragiques (sauf si c'est littéralement le métier de la personne)
🚫 Communiqués de presse d'entreprises tech mainstream (Meta, Google, OpenAI, Apple)
🚫 Marronniers vides ("tendances 2026", "comment bien commencer l'année")
🚫 Sujets qui parlent UNIQUEMENT de réseaux sociaux ou de création de contenu, sauf si c'est le métier de "${nicheLabel}"
🚫 Sujets génériques sur "l'IA" ou "ChatGPT"
🚫 INTERDIT ABSOLU — événements datés (passés OU à venir) : webinaires, conférences, masterclass, colloques, séminaires, salons, tables rondes, journées professionnelles, pages d'inscription, replays, "save the date". Même si l'événement est récent ou "fait encore parler", il ne compte pas comme actu chaude. Date du jour : ${monthLabel}. Toute mention d'une date d'événement passé (ex : "le 7 mai", "édition 2025") → JETTE le sujet immédiatement.

══════════════════════════════════════════════
FORMAT DE RÉPONSE — JSON STRICT (pas de markdown, pas de backticks)
══════════════════════════════════════════════

{
  "actus": [
    {
      "titre": "Titre court du phénomène (max 80 caractères)",
      "resume": "Résumé factuel en 2 phrases courtes du phénomène et pourquoi on en parle",
      "source": "Nom du média ou de la source",
      "source_url": "URL de l'article source si disponible (sinon omettre)",
      "type": "globale" | "niche",
      "axe": "mot_qui_revient" | "obsession_collective" | "comportement_emergent" | "debat_recurrent" | "objet_culturel" | "actu_connectable",
      "ton": "confortable" | "entre_deux" | "decalant",
      "force_pont": "fort" | "moyen",
      "pertinence": "Pont explicite citant un élément précis du profil (cible/activité/combat/piliers)"
    }
  ]
}

IMPORTANT : si tu reprends une actu chaude pré-sourcée (bloc plus haut), recopie son source_url tel quel.

RÉPARTITION SOUPLE — entre 3 et 6 sujets, qualité avant quantité :
- Idéalement 3 globales (1 par axe imposé) + 3 niche
- Si un axe ne donne rien de connectable, renvoie moins. Minimum : 3 sujets au total avec au moins 1 globale ET 1 niche.
- Règle absolue : JAMAIS 2 sujets du même axe.
- Règle absolue : sur N sujets, ⌈N/3⌉ sont "decalant".
- Règle absolue : sur N sujets, au moins ⌈N×2/3⌉ sont "fort". Aucun "fragile" ne doit être renvoyé.

Si vraiment rien ne fonctionne (moins de 3 sujets connectés trouvables), retourne :
{ "actus": [], "message": "Pas de phénomène suffisamment connectable trouvé cette semaine. Réessaie dans quelques jours !" }`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 10 }],
        messages: [{ role: "user", content: systemPrompt + `\n\nFais les recherches maintenant. Pour chaque sujet candidat, applique les 3 garde-fous : (1) pont explicite concret citant le profil, (2) registre tagué + ⌈N/3⌉ décalants, (3) auto-évalue "force_pont" — si "fragile", jette. Au moins 2/3 des sujets renvoyés doivent être "fort". Mieux vaut 3 sujets ultra-connectés que 6 hors-sol.` }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic error:", response.status, "model:", model, "body:", errText.slice(0, 500));
      const userMsg = response.status === 529 ? "L'IA est temporairement surchargée. Réessaie dans quelques secondes."
        : response.status === 403 ? "Le web search n'est pas activé sur le compte API. Contacte le support."
        : `Erreur IA (${response.status}). Réessaie.`;
      return new Response(JSON.stringify({ error: userMsg }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();

    // Extract text blocks (web search responses have multiple text blocks interleaved with search results)
    const textBlocks = (data.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text);
    const fullText = textBlocks.join("\n");
    console.log("Raw text blocks count:", textBlocks.length, "Full text length:", fullText.length);

    // Parse JSON — try multiple strategies
    let parsed: any;

    // Strategy 1: direct parse
    try {
      parsed = JSON.parse(fullText.trim());
    } catch {
      // Strategy 2: find the outermost JSON object containing "actus"
      const actusIndex = fullText.indexOf('"actus"');
      if (actusIndex !== -1) {
        const braceStart = fullText.lastIndexOf("{", actusIndex);
        if (braceStart !== -1) {
          let depth = 0;
          let braceEnd = -1;
          for (let i = braceStart; i < fullText.length; i++) {
            if (fullText[i] === "{") depth++;
            else if (fullText[i] === "}") {
              depth--;
              if (depth === 0) { braceEnd = i; break; }
            }
          }
          if (braceEnd !== -1) {
            try {
              parsed = JSON.parse(fullText.slice(braceStart, braceEnd + 1));
            } catch (e2) {
              console.error("JSON parse strategy 2 failed:", (e2 as Error).message);
            }
          }
        }
      }

      // Strategy 3: last resort — find first { and last }
      if (!parsed) {
        const firstBrace = fullText.indexOf("{");
        const lastBrace = fullText.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          try {
            parsed = JSON.parse(fullText.slice(firstBrace, lastBrace + 1));
          } catch (e3) {
            console.error("JSON parse failed all strategies. Text preview:", fullText.slice(0, 800));
            return new Response(JSON.stringify({ error: "Erreur de parsing IA. Réessaie." }), {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        } else {
          console.error("No JSON found in response. Text preview:", fullText.slice(0, 800));
          return new Response(JSON.stringify({ error: "Réponse IA invalide. Réessaie." }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    if (!parsed.actus || !Array.isArray(parsed.actus)) {
      return new Response(JSON.stringify({ error: "Format de réponse invalide." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Post-validation : on retire tout sujet qui ressemble à un événement /
    // webinaire / replay / page evergreen, même si Claude l'a fait passer.
    // Ces patterns sont les mêmes que côté Perplexity pour cohérence.
    const beforeCount = parsed.actus.length;
    parsed.actus = parsed.actus.filter((a: any) => {
      const blob = `${a?.titre || ""} ${a?.resume || ""} ${a?.pertinence || ""}`;
      const isEvergreen = EVERGREEN_PATTERNS.some((rx) => rx.test(blob));
      if (isEvergreen) {
        console.log(`[newsjacking] dropped (evergreen): "${String(a?.titre || "").slice(0, 80)}"`);
        return false;
      }
      return true;
    });
    if (parsed.actus.length < beforeCount) {
      console.log(`[newsjacking] filtered ${beforeCount - parsed.actus.length}/${beforeCount} actus (evergreen)`);
    }
    if (parsed.actus.length === 0) {
      parsed.message = parsed.message || "Pas d'actu vraiment fraîche cette fois. Réessaie dans quelques jours.";
    }

    // Log usage
    await logUsage(user.id, "deep_research", "newsjacking", undefined, model, workspace_id);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("newsjacking-ai error:", e);
    const message = e instanceof Error && e.name === "AbortError"
      ? "Timeout : la recherche a pris trop de temps. Réessaie."
      : e instanceof Error ? e.message : "Erreur interne";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
