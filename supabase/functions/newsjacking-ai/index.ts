import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkQuota, logUsage, quotaDeniedResponse } from "../_shared/plan-limiter.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
import { isDemoUser } from "../_shared/guard-demo.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS } from "../_shared/user-context.ts";
import { getModelForAction, callAnthropic, callAnthropicToolSimple, forcesDisabledThinking, sanitizeStyleDeep, type AnthropicTool, type UsageSink, HAIKU_MODEL } from "../_shared/anthropic.ts";

// Tool forcé (chantier éradication parse texte, 26/07) : JSON garanti.
const UNIVERSE_TOOL: AnthropicTool = {
  name: "rendre_univers_marque",
  description: "Renvoie l'univers de marque (4 listes).",
  input_schema: {
    type: "object",
    properties: {
      univers_emotionnel: { type: "array", items: { type: "string" } },
      moments_de_vie_cible: { type: "array", items: { type: "string" } },
      valeurs_combat: { type: "array", items: { type: "string" } },
      themes_lifestyle: { type: "array", items: { type: "string" } },
    },
    required: ["univers_emotionnel", "moments_de_vie_cible", "valeurs_combat", "themes_lifestyle"],
  },
};
import { fetchHotNews, evergreenPatternsForMode, type PerplexityActu } from "../_shared/perplexity.ts";
import { actusDeSecours, garderActusFraiches, garderActusSourcees, normaliserActus, pagesTrouvees } from "./sources.ts";
import { tutoyerPertinences } from "./pertinence-tu.ts";
import { axesDuMoment, construireConsigne } from "./consigne.ts";
import { actusCompletes, lireFluxRecherche, texteDesBlocs, type SuiviFlux } from "./flux.ts";
import { clientStillThere, runWithHeartbeatSSE, type StatusEmitter } from "../_shared/anthropic-stream.ts";

// Perplexity insère parfois ses balises de citation (<cite index="40-3">…</cite>)
// dans les champs texte. On les retire à la normalisation pour ne jamais les
// stocker ni les renvoyer au front. Inline (pas dans _shared) pour éviter le piège
// de redéploiement des consommateurs d'un module partagé.
function stripCitations(text: string): string {
  return text
    .replace(/<\/?cite[^>]*>/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

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
    const parsed: any = await callAnthropicToolSimple(getModelForAction("strategy"), system, "Génère le JSON maintenant.", UNIVERSE_TOOL, 0.7);
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

/**
 * Parse le JSON de veille renvoyé par le chemin nominal (fetch brut + web
 * search, hors callAnthropic) à partir du texte assemblé. 3 stratégies de
 * repli en cascade (parse direct, extraction par accolades autour de
 * "actus", premier {…dernier }), puis sanitizeStyleDeep — ce chemin
 * contourne le nettoyage automatique de callAnthropic, donc le filet doit
 * être posé ici explicitement. Audit slop 18/08, Constat 2. Le filet de
 * secours (extraction structurée via callAnthropic, plus bas) est DÉJÀ
 * nettoyé par le helper partagé, réappliquer ici est un no-op inoffensif.
 * Renvoie null si aucune stratégie n'a produit de JSON exploitable.
 */
export function parseNewsjackingJson(fullText: string): Record<string, unknown> | null {
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

    // Strategy 3: find first { and last }
    if (!parsed) {
      const firstBrace = fullText.indexOf("{");
      const lastBrace = fullText.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        try {
          parsed = JSON.parse(fullText.slice(firstBrace, lastBrace + 1));
        } catch (e3) {
          console.error("JSON parse strategy 3 failed:", (e3 as Error).message);
        }
      }
    }
  }

  return parsed ? sanitizeStyleDeep(parsed) : null;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  // Corps lu AVANT d'ouvrir le flux : sinon la passerelle se bloque (21/07).
  const body = await req.json().catch(() => ({}));
  const enFlux = (req.headers.get("accept") || "").includes("text/event-stream");
  return enFlux ? runWithHeartbeatSSE(corsHeaders, (emit) => chercher(req, body, corsHeaders, emit)) : chercher(req, body, corsHeaders);
});

// `emit` (réponse en flux) : pistes, recherches et actus partent à l'écran dès qu'elles existent.
async function chercher(req: Request, body: Record<string, unknown>, corsHeaders: Record<string, string>, emit?: StatusEmitter): Promise<Response> {
  const t0 = Date.now();
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

    const workspace_id = typeof body?.workspace_id === "string" && body.workspace_id ? body.workspace_id : undefined;
    const forceMacroFromClient: boolean = body?.force_macro === true;
    const rawIntent = (body?.intent || {}) as { vibes?: unknown; custom?: unknown };
    const intentVibes: string[] = Array.isArray(rawIntent.vibes)
      ? rawIntent.vibes.filter((v: unknown) => typeof v === "string").slice(0, 3)
      : [];
    const intentCustom: string = typeof rawIntent.custom === "string"
      ? rawIntent.custom.trim().slice(0, 200)
      : "";
    const excludedUrls: string[] = Array.isArray(body?.excluded_urls)
      ? (body.excluded_urls as unknown[]).filter((u): u is string => typeof u === "string").slice(0, 50)
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
    const combatCause = (ctx as any)?.brand_profile?.combat_cause || "";
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
      // Resolve the brand_profile owner via getUserContext (single source of truth)
      const bpUserId = (ctx as any).profileUserId ?? user.id;


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
          const { error: cacheError } = await sbService
            .from("brand_profile")
            .update({
              brand_universe: generated,
              brand_universe_updated_at: new Date().toISOString(),
            })
            .eq("id", bpRow.id);
          if (cacheError) throw cacheError;
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
        // Biais de niche coupé dans tous les modes (28/11/2026) : on cherche ce dont
        // tout le monde parle ; le lien avec la marque est écrit ensuite par Claude.
        const universKeywords = scoopMode ? [] : [...intentVibeHints, customWords].filter(Boolean);

        const ppxController = new AbortController();
        const ppxTimeout = setTimeout(() => ppxController.abort(), scoopMode ? 40000 : 25000);
        try {
          const ppxResult = await fetchHotNews({
            universKeywords,
            recency: scoopMode ? "week" : "week",
            excludedUrls,
            apiKey: PERPLEXITY_API_KEY,
            signal: ppxController.signal,
            mode: scoopMode ? "scoop" : "default",
          });
          hotNews = ppxResult.actus.slice(0, scoopMode ? 6 : 5);
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
    if (hotNews.length > 0) emit?.("pistes", { actus: hotNews.map((a) => ({ titre: stripCitations(a.titre || ""), source: a.source, source_url: a.source_url, date_publication: a.date_publication })) });

    // Claude call with web search
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY non configurée" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const model = getModelForAction("content");

    const AXES = axesDuMoment(monthLabel);

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

    const consigne = construireConsigne({ brandingContext, universe, nicheLabel, cibleRaw, combatCause, activityRaw, monthLabel, hotNews, intentVibeLabels, intentCustom, macroMode, scoopMode, pickedAxes, nicheQueries, excludedUrls });

    const controller = new AbortController();
    const remainingBudget = Math.max(60_000, 170_000 - (Date.now() - t0));
    const timeout = setTimeout(() => controller.abort(), remainingBudget);

    // Sonnet 5 active le thinking ADAPTATIF quand le champ est omis : les blocs de
    // réflexion consomment alors les max_tokens au milieu des recherches web et la
    // réponse arrive sans bloc JSON final (= « Réponse IA invalide » en vagues,
    // constaté 09-10/07 avec AI_MODEL_SONNET=claude-sonnet-5). Ce fetch brut
    // n'utilise pas le helper partagé (web search) → on applique la même garde ici.
    // 8192 (et pas 4096) : la sortie compte les blocs texte intercalés entre les
    // web_search + le JSON final (jusqu'à 6 actus), et le tokenizer Sonnet 5
    // (~+30 %) fait déborder le défaut (même panne que le reel, PR #477).
    // Plafond non consommé = non facturé.
    const requestBody: Record<string, unknown> = {
      model,
      max_tokens: 8192,
      ...(forcesDisabledThinking(model) ? { thinking: { type: "disabled" } } : {}),
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
      messages: [{ role: "user", content: consigne }],
    };

    // Le même tri sert aux actus montrées en cours de route et à la liste finale :
    // champs normalisés, pas d'évènement / webinaire / replay (mêmes motifs que
    // Perplexity, liste scoop en mode scoop), lien = page trouvée par la recherche
    // (sources.ts, 18/10/2026), moins de 3 semaines (5 en mode scoop).
    const evergreenList = evergreenPatternsForMode(scoopMode ? "scoop" : "default");
    const maxJours = scoopMode ? 35 : 21;
    const trier = (brutes: unknown[], contenu: unknown[], journal: boolean) => {
      const normales = normaliserActus(brutes, stripCitations).filter((a) => !evergreenList.some((rx) => rx.test(`${a?.titre || ""} ${a?.resume || ""} ${a?.pertinence || ""}`)));
      const sourcees = garderActusSourcees(normales, pagesTrouvees(contenu, hotNews));
      const fraiches = garderActusFraiches(sourcees.gardees, maxJours);
      if (journal) console.log(`[newsjacking] tri : ${brutes.length} → ${fraiches.gardees.length} ; sans page : ${sourcees.retirees.join(" | ") || "aucune"} ; trop vieilles : ${fraiches.retirees.join(" | ") || "aucune"}`);
      return fraiches.gardees;
    };

    const allContent: unknown[] = [];
    let montrees = 0;
    const suivi: SuiviFlux = emit ? {
      onRequete: (requete) => emit("recherche", { requete }),
      onTexte: (texte, blocs) => {
        const pretes = actusCompletes(`${texteDesBlocs(allContent)}\n${texte}`);
        if (pretes.length <= montrees) return;
        const nouvelles = sanitizeStyleDeep(pretes.slice(montrees));
        montrees = pretes.length;
        for (const actu of trier(nouvelles, [...allContent, ...blocs], false)) emit("actu", { actu });
      },
    } : {};
    const appeler = (stream: boolean) => fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ ...requestBody, stream }),
      signal: controller.signal,
    });
    // L'API peut interrompre un tour long à base d'outils serveur (web search) avec
    // stop_reason="pause_turn" : le contenu s'arrête avant le JSON final. Il faut
    // renvoyer le contenu partiel comme tour assistant et relancer pour obtenir la fin.
    let data: any;
    let tokensUsed = 0;
    for (let turn = 0; turn < 3; turn++) {
      let response = await appeler(true);
      data = undefined;
      if (response.ok && response.body) {
        try {
          data = await lireFluxRecherche(response.body, suivi);
        } catch (e) {
          if ((e as Error).name === "AbortError") throw e;
          // Flux coupé en route : la même demande est relue d'un bloc.
          console.warn(`[newsjacking] flux en échec (${(e as Error).message}), relance sans flux`);
          response = await appeler(false);
        }
      }
      if (!response.ok) {
        clearTimeout(timeout);
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

      data ??= await response.json();
      tokensUsed += (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0);
      allContent.push(...(data.content || []));
      if (data.stop_reason !== "pause_turn") break;
      console.log(`[newsjacking] pause_turn (tour ${turn + 1}) — relance pour terminer la réponse`);
      // On termine par un tour user : Opus 4.8 / Sonnet 5 rejettent un tableau de
      // messages finissant par un tour assistant (400, cf stripTrailingAssistant).
      requestBody.messages = [
        ...(requestBody.messages as any[]),
        { role: "assistant", content: data.content },
        { role: "user", content: "Termine : renvoie maintenant le JSON final demandé (uniquement le JSON, sans markdown)." },
      ];
    }

    clearTimeout(timeout);

    if (data?.stop_reason === "max_tokens") {
      console.warn("[newsjacking] réponse tronquée (stop_reason=max_tokens) — le parse va probablement passer par le filet");
    }

    const fullText = texteDesBlocs(allContent);
    console.log("Full text length:", fullText.length, "stop_reason:", data?.stop_reason);

    // Parse JSON — try multiple strategies (+ sanitizeStyleDeep, ce chemin
    // fetch brut contourne le nettoyage automatique de callAnthropic)
    let parsed: any = parseNewsjackingJson(fullText);

    // Filet final : le modèle a écrit sa veille en prose (ou JSON malformé) au lieu
    // du JSON demandé. Plutôt qu'un 500 sec, on structure ce texte par un appel
    // court à sortie structurée (tool forcé → JSON valide par construction, même
    // patron que #359). Haiku suffit : c'est de la recopie, pas de la génération.
    if (!parsed && fullText.trim().length > 0) {
      console.warn("[newsjacking] pas de JSON parsable — extraction structurée de secours. Preview:", fullText.slice(0, 800));
      const EXTRACT_TOOL: AnthropicTool = {
        name: "rendre_actus",
        description: "Renvoie les actus présentes dans le texte, structurées",
        input_schema: {
          type: "object",
          properties: {
            actus: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  titre: { type: "string" },
                  resume: { type: "string" },
                  source: { type: "string" },
                  source_url: { type: "string" },
                  type: { type: "string", enum: ["globale", "niche"] },
                  axe: { type: "string", enum: ["mot_qui_revient", "obsession_collective", "comportement_emergent", "debat_recurrent", "objet_culturel", "actu_connectable"] },
                  ton: { type: "string", enum: ["confortable", "entre_deux", "decalant"] },
                  force_pont: { type: "string", enum: ["fort", "moyen", "fragile"] },
                  pertinence: { type: "string" },
                },
                required: ["titre", "resume", "pertinence"],
              },
            },
            message: { type: "string" },
          },
          required: ["actus"],
        },
      };
      try {
        const extractUsage: UsageSink = {};
        const rawExtract = await callAnthropic({
          model: HAIKU_MODEL,
          system: "Tu extrais des données structurées d'un texte de veille d'actualités. Ne reformule pas, n'invente RIEN : recopie fidèlement les sujets présents dans le texte (titre, résumé, source, URL, tags). Si le texte ne contient aucun sujet exploitable, renvoie un tableau actus vide.",
          messages: [{ role: "user", content: `Texte de veille à structurer :\n\n${fullText.slice(0, 12000)}` }],
          max_tokens: 3000,
          tool: EXTRACT_TOOL,
          abortTimeoutMs: 30_000,
        }, extractUsage);
        parsed = JSON.parse(rawExtract);
        tokensUsed += extractUsage.total_tokens ?? 0;
        console.log("[newsjacking] extraction structurée de secours OK:", parsed?.actus?.length ?? 0, "actu(s)");
      } catch (eExtract) {
        console.error("[newsjacking] extraction de secours en échec:", (eExtract as Error).message);
      }
    }

    if (!parsed) {
      console.error("No JSON found in response. stop_reason:", data?.stop_reason, "Text preview:", fullText.slice(0, 800));
      const errMsg = data?.stop_reason === "max_tokens"
        ? "La recherche a produit une réponse trop longue et a été coupée. Réessaie."
        : "Réponse IA invalide. Réessaie.";
      return new Response(JSON.stringify({ error: errMsg }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Tolérance : si le modèle renvoie un tableau racine au lieu de {actus:[...]},
    // on le ré-enveloppe. Si "actus" est absent ou n'est pas un tableau, on dégrade
    // PROPREMENT vers un résultat vide (écran "aucun pont solide" + porte de sortie
    // côté front) au lieu d'un 500 — l'utilisatrice n'a pas à voir une erreur brute.
    if (Array.isArray(parsed)) {
      parsed = { actus: parsed };
    }
    if (!parsed.actus || !Array.isArray(parsed.actus)) {
      console.error("[newsjacking] réponse sans tableau actus, dégradation en vide. Aperçu:", JSON.stringify(parsed).slice(0, 300));
      parsed = { actus: [], message: typeof parsed?.message === "string" ? parsed.message : undefined };
    }

    parsed.actus = trier(parsed.actus, allContent, true);

    // Filet anti-vide : si le tri n'a rien gardé mais que Perplexity avait trouvé
    // des actus chaudes, elles reviennent telles quelles, avec une piste de
    // réaction. Vrai dans tous les modes depuis le 28/11/2026 (scoop seul avant).
    if (parsed.actus.length === 0 && hotNews.length > 0) {
      const secours = actusDeSecours(hotNews, (t) => evergreenList.some((rx) => rx.test(t)), excludedUrls, stripCitations);
      if (secours.length > 0) {
        console.log(`[newsjacking] filet anti-vide : ${secours.length} actu(s) pré-sourcée(s) remise(s)`);
        parsed.actus = secours;
        delete parsed.message;
      }
    }

    if (parsed.actus.length === 0) parsed.message = parsed.message || "Pas d'actu avec une source vérifiable cette fois. Réessaie, ou colle le lien d'un article.";
    else await tutoyerPertinences(parsed); // « 💡 » au tu (QA 12/11/2026, pertinence-tu.ts)

    // Mode élargi (macro/scoop) : ici le pont est une PISTE DE RÉACTION, pas une
    // citation littérale du métier (cf. macroBlock/scoopBlock). On tague les actus
    // concernées pour que le générateur d'angles (newsjacking-angles) relâche son
    // pivot au lieu de forcer un retour à l'expertise — sinon l'angle re-fabrique
    // exactement le pont forcé qu'on évite ici. En macro, l'unique actu niche
    // garde le pont strict ; en scoop, tout est en mode réaction.
    if (macroMode || scoopMode) {
      for (const a of parsed.actus) {
        if (a && (scoopMode || a.type === "globale")) a.angle_mode = "reaction";
      }
    }

    // Une recherche sans actu ne coûte rien (18/10/2026) ; une recherche dont
    // l'écran est parti avant la fin non plus (la liste n'est gardée nulle part).
    if (parsed.actus.length > 0 && clientStillThere(emit, "newsjacking")) await logUsage(user.id, "deep_research", "newsjacking", tokensUsed, model, workspace_id);

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
}
