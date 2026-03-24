import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkQuota, logUsage, quotaDeniedResponse } from "../_shared/plan-limiter.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
import { isDemoUser } from "../_shared/guard-demo.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS } from "../_shared/user-context.ts";
import { getModelForAction } from "../_shared/anthropic.ts";


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

    // Claude call with web search
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY non configurée" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const model = getModelForAction("content");

    const systemPrompt = `Tu es une assistante de veille stratégique pour créateur·ices de contenu.

PROFIL DE L'UTILISATEUR·ICE :
${brandingContext}

TU DOIS EFFECTUER 2 RECHERCHES WEB SÉPARÉES (dans cet ordre) :

RECHERCHE 1 — ACTU GLOBALE (obligatoire) :
Cherche "actualité France mars 2026" ou "tendance société 2026" ou "fait marquant cette semaine France".
Tu cherches ce dont TOUT LE MONDE parle en ce moment : politique, société, culture, économie, technologie grand public, phénomène viral, nouvelle loi, événement médiatique.
Exemples d'actus globales : une réforme gouvernementale, un scandale médiatique, une tendance TikTok virale, les résultats d'une élection, un événement culturel majeur, une polémique publique, un fait divers marquant, une avancée scientifique grand public.
⚠️ Une actu est GLOBALE si quelqu'un qui n'est PAS dans le secteur de cette personne en a entendu parler.

RECHERCHE 2 — ACTU NICHE :
Cherche des actualités spécifiques au secteur et au métier de cette personne.

POTENTIEL DE CONTENU (pour les deux types) :
- Est-ce que l'audience de cette personne s'en soucie ?
- Est-ce qu'elle peut apporter un regard unique dessus ?
- Est-ce que ça touche à ses piliers de contenu, ses combats, ou ses valeurs ?

ANGLES PROPOSÉS — RÈGLES :
Chaque angle DOIT utiliser un de ces 4 véhicules :
1. RÉCIT D'EXPÉRIENCE (recit_experience) : "Quand j'ai vu cette actu, ça m'a rappelé…"
2. DÉCLENCHEUR EXTERNE (declencheur_externe) : "Cette actu m'a fait réaliser un truc sur mon métier…"
3. CONSTAT DÉCALÉ (constat_decale) : "Ce que cette actu révèle sur [secteur], c'est que…"
4. MONTRER PLUTÔT QU'EXPLIQUER (montrer_plutot_quexpliquer) : avant/après, process visible, transformation
L'actu est le DÉCLENCHEUR, pas le sujet. JAMAIS "voici ce qui se passe + mon avis". TOUJOURS relier à l'expertise et au vécu.
Les angles doivent être SPÉCIFIQUES au branding de cette personne.
JAMAIS de format "X conseils" ou "X erreurs".

FORMAT DE RÉPONSE — UNIQUEMENT en JSON (pas de markdown, pas de backticks) :
{
  "actus": [
    {
      "titre": "Titre court de l'actu (max 80 caractères)",
      "resume": "Résumé factuel en 2-3 phrases de ce qui se passe",
      "source": "Nom du média ou de la source",
      "type": "globale" ou "niche",
      "pertinence": "En 1 phrase, pourquoi c'est pertinent pour CETTE personne",
      "angles": [
        {
          "vehicule": "recit_experience" | "declencheur_externe" | "constat_decale" | "montrer_plutot_quexpliquer",
          "hook": "La première phrase du contenu (max 20 mots, percutante)",
          "description": "En 2-3 phrases, comment relier l'actu à l'expertise de la personne",
          "format_suggere": "post" | "carousel" | "reel" | "story" | "linkedin"
        }
      ]
    }
  ]
}

RÉPARTITION STRICTE : Retourne exactement 4 actus :
- Les 2 PREMIÈRES doivent avoir "type": "globale" (issues de ta recherche 1)
- Les 2 SUIVANTES doivent avoir "type": "niche" (issues de ta recherche 2)
Si tu ne trouves qu'1 actu globale pertinente, retourne 1 globale + 3 niches (minimum 1 globale).
⚠️ Si toutes tes actus sont niche, tu as ÉCHOUÉ. Recommence ta recherche globale.

Si aucune actu pertinente n'est trouvée, retourne :
{ "actus": [], "message": "Pas d'actu suffisamment pertinente trouvée pour ton secteur cette semaine. Réessaie dans quelques jours !" }`;

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
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
        messages: [{ role: "user", content: systemPrompt + "\n\nTrouve les actualités les plus pertinentes pour moi en ce moment." }],
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
        let braceStart = fullText.lastIndexOf("{", actusIndex);
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
