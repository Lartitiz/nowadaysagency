import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkQuota, logUsage, quotaDeniedResponse } from "../_shared/plan-limiter.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
import { isDemoUser } from "../_shared/guard-demo.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS } from "../_shared/user-context.ts";
import { getModelForAction, callAnthropicSimple } from "../_shared/anthropic.ts";

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
    // (plus de politique/éco pure, plus de "réseaux sociaux" — tout le monde n'est pas créateur)
    const AXES = [
      { id: "mot_qui_revient", query: "expression mot concept qui revient conversations 2026 France" },
      { id: "obsession_collective", query: "phénomène culturel dont tout le monde parle France 2026" },
      { id: "comportement_emergent", query: "nouveau comportement quotidien tendance société France 2026" },
      { id: "debat_recurrent", query: "débat récurrent authenticité productivité éthique vie quotidienne 2026" },
      { id: "objet_culturel", query: "film série livre album sortie récente discussion France 2026" },
      { id: "actu_connectable", query: "actualité société qui touche au quotidien et aux choix de vie France 2026" },
    ];

    // Pick 3 distinct axes for the 3 global items
    const shuffled = [...AXES].sort(() => Math.random() - 0.5);
    const pickedAxes = shuffled.slice(0, 3);

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

    const systemPrompt = `Tu es une assistante de veille culturelle pour créateur·ices de contenu et entrepreneur·es (tous secteurs, pas que les réseaux sociaux).

PROFIL DE L'UTILISATEUR·ICE :
${brandingContext}
${universeBlock}
══════════════════════════════════════════════
PHILOSOPHIE — LIRE EN PREMIER
══════════════════════════════════════════════

On NE cherche PAS l'actu chaude (politique, éco, faits divers). On cherche des MICRO-PHÉNOMÈNES CULTURELS : un mot qui sature les conversations, une obsession collective, un nouveau comportement, un débat qui ressort, un objet culturel (film/livre/série) dont on parle. Une vraie actu est acceptée UNIQUEMENT si elle se connecte naturellement au profil de la personne.

Le critère central : chaque sujet doit avoir un PONT EXPLICITE vers cette personne. Pas un pont forcé du genre "et ça nous rappelle que la communication...". Un vrai pont qui cite quelque chose de précis du profil (sa cible, son activité, son combat, ses piliers, OU un terme de son univers élargi).

══════════════════════════════════════════════
RECHERCHES À EFFECTUER
══════════════════════════════════════════════

▶ RECHERCHES "MICRO-PHÉNOMÈNES" — 3 axes culturels DIFFÉRENTS (obligatoire) :
Pour chaque axe ci-dessous, fais une recherche web et trouve 1 phénomène. Jamais 2 sujets du même axe.

${pickedAxes.map((a, i) => `  ${i + 1}. axe="${a.id}" → cherche : "${a.query}"`).join("\n")}

▶ RECHERCHES NICHE — connectées à l'univers de "${nicheLabel}" (obligatoire) :
Fais ces 3 recherches DIFFÉRENTES (pas une seule, les 3) :
${nicheQueries.map((q, i) => `  ${i + 1}. "${q}"`).join("\n")}

${universeBlock ? `RÈGLE D'ÉLARGISSEMENT (importante) : sur les 3 sujets niche, MAXIMUM 1 doit parler du métier littéral ("${nicheLabel}"). Les 2 autres doivent venir de l'UNIVERS ÉLARGI ci-dessus (émotion / moments de vie / valeurs / lifestyle). Si une recherche niche ne donne rien d'élargi, refais-la avec d'autres termes de l'univers de marque.\n` : ""}

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
INTERDIT
══════════════════════════════════════════════

🚫 Politique partisane, lois, élections, faits divers tragiques (sauf si c'est littéralement le métier de la personne)
🚫 Communiqués de presse d'entreprises tech mainstream (Meta, Google, OpenAI, Apple)
🚫 Marronniers vides ("tendances 2026", "comment bien commencer l'année")
🚫 Sujets qui parlent UNIQUEMENT de réseaux sociaux ou de création de contenu, sauf si c'est le métier de "${nicheLabel}"
🚫 Sujets génériques sur "l'IA" ou "ChatGPT"

══════════════════════════════════════════════
FORMAT DE RÉPONSE — JSON STRICT (pas de markdown, pas de backticks)
══════════════════════════════════════════════

{
  "actus": [
    {
      "titre": "Titre court du phénomène (max 80 caractères)",
      "resume": "Résumé factuel en 2 phrases courtes du phénomène et pourquoi on en parle",
      "source": "Nom du média ou de la source",
      "type": "globale" | "niche",
      "axe": "mot_qui_revient" | "obsession_collective" | "comportement_emergent" | "debat_recurrent" | "objet_culturel" | "actu_connectable",
      "ton": "confortable" | "entre_deux" | "decalant",
      "pertinence": "Pont explicite citant un élément précis du profil (cible/activité/combat/piliers)"
    }
  ]
}

RÉPARTITION SOUPLE — entre 3 et 6 sujets, qualité avant quantité :
- Idéalement 3 globales (1 par axe imposé) + 3 niche
- Si un axe ne donne rien de connectable, renvoie moins. Minimum : 3 sujets au total avec au moins 1 globale ET 1 niche.
- Règle absolue : JAMAIS 2 sujets du même axe.
- Règle absolue : sur N sujets, ⌈N/3⌉ sont "decalant".

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
        messages: [{ role: "user", content: systemPrompt + `\n\nFais les recherches maintenant. Pour chaque sujet candidat, applique les 2 garde-fous : (1) pont explicite concret citant le profil, (2) registre tagué + ⌈N/3⌉ décalants. Si tu ne peux pas écrire un vrai pont concret, jette le sujet. Mieux vaut 3 sujets ultra-connectés que 6 hors-sol.` }],
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
