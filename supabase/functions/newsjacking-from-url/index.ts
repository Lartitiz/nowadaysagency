import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkQuota, logUsage, quotaDeniedResponse } from "../_shared/plan-limiter.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
import { isDemoUser } from "../_shared/guard-demo.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS } from "../_shared/user-context.ts";
import { callAnthropicSimple, getModelForAction } from "../_shared/anthropic.ts";
import { scrapeWebsite } from "../_shared/scraping.ts";
import { assertWorkspaceMembership, workspaceDeniedResponse } from "../_shared/workspace-guard.ts";

const MAX_ARTICLE_CHARS = 8000;
const GLOBAL_TIMEOUT_MS = 50_000;

// Retire les balises de citation (<cite index="…">…</cite>) que le modèle peut
// recopier depuis le contexte web. Inline (pas dans _shared) pour éviter le piège
// de redéploiement des consommateurs d'un module partagé.
function stripCitations(text: string): string {
  return text
    .replace(/<\/?cite[^>]*>/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function sourceFromUrl(rawUrl: string): string {
  try {
    const host = new URL(rawUrl).hostname.replace(/^www\./, "");
    return host;
  } catch {
    return "Lien";
  }
}

function robustJsonParse(raw: string): Record<string, unknown> {
  try { return JSON.parse(raw); } catch {}
  let cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) cleaned = m[0];
  cleaned = cleaned.replace(/,\s*([\]}])/g, "$1");
  return JSON.parse(cleaned);
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GLOBAL_TIMEOUT_MS);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      clearTimeout(timeout);
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      clearTimeout(timeout);
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (isDemoUser(user.id)) {
      clearTimeout(timeout);
      return new Response(JSON.stringify({ error: "Fonctionnalité non disponible en mode démo." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const url: string = typeof body?.url === "string" ? body.url.trim() : "";
    const workspace_id: string | undefined = body?.workspace_id || undefined;

    if (!url || !isHttpUrl(url)) {
      clearTimeout(timeout);
      return new Response(JSON.stringify({ error: "Lien invalide. Colle une URL commençant par http(s)://" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const membership = await assertWorkspaceMembership(service, user.id, workspace_id);
    if (!membership.ok) {
      console.warn("[workspace-guard] denied", { userId: user.id, workspaceId: workspace_id });
      clearTimeout(timeout);
      return workspaceDeniedResponse(corsHeaders);
    }

    const rl = checkRateLimit(user.id, 5, 60_000);
    if (!rl.allowed) {
      clearTimeout(timeout);
      return rateLimitResponse(rl.retryAfterMs!, corsHeaders);
    }

    const quota = await checkQuota(user.id, "deep_research", workspace_id);
    if (!quota.allowed) {
      clearTimeout(timeout);
      return quotaDeniedResponse(quota, corsHeaders);
    }

    // 1. SCRAPE
    let articleText: string | null = null;
    try {
      articleText = await scrapeWebsite(url, controller.signal);
    } catch (e) {
      console.error("[newsjacking-from-url] scrape error", (e as Error).message);
    }

    if (!articleText || articleText.trim().length < 200) {
      clearTimeout(timeout);
      return new Response(JSON.stringify({
        error: "Impossible de lire ce lien (page protégée, vide ou trop courte). Essaie un autre article.",
      }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const articleSlice = articleText.slice(0, MAX_ARTICLE_CHARS);

    // 2. USER CONTEXT (preset léger newsjacking)
    const ctx = await getUserContext(service, user.id, workspace_id);
    const contextText = formatContextForAI(ctx, CONTEXT_PRESETS.newsjacking);

    // 3. ANTHROPIC — extraire l'actu et la connecter au profil
    const model = getModelForAction("content");
    const systemPrompt = `Tu es une assistante de veille pour créateur·ices de contenu et entrepreneur·es.
On te donne le texte brut d'UN article web + le profil de la créatrice. Tu dois résumer cet article et évaluer s'il se connecte à sa marque pour du newsjacking.

Rends UNIQUEMENT du JSON strict, sans texte autour, avec EXACTEMENT cette structure :
{
  "titre": "titre court et fidèle de l'article (max 110 caractères)",
  "resume": "3-4 phrases neutres qui résument l'article (pas d'analyse, juste les faits)",
  "faits_cles": ["4 à 8 faits bruts tirés de l'article : chiffres, noms d'acteurs, dates, citations courtes, exemples nommés. Une entrée = un fait concret, max 200 caractères. Pas d'analyse, pas de reformulation marketing."],
  "axe": "mot_qui_revient" | "obsession_collective" | "comportement_emergent" | "debat_recurrent" | "objet_culturel" | "actu_connectable",
  "ton": "confortable" | "entre_deux" | "decalant",
  "force_pont": "fort" | "moyen" | "fragile",
  "pertinence": "1-2 phrases qui expliquent CONCRÈTEMENT pourquoi/comment cette actu peut nourrir un contenu pour CETTE créatrice — cite un élément précis de son profil (cible, combat, pilier, offre). Si vraiment hors-sol : dis-le franchement et propose un angle de pont surprenant."
}

Règles :
- "force_pont" = "fragile" si l'actu n'a aucun lien naturel avec son univers ET qu'aucun angle décalé n'est crédible.
- Ne jamais inventer d'infos qui ne sont pas dans l'article.
- "faits_cles" : ne JAMAIS fabriquer un fait absent de l'article. Mieux vaut un tableau court ou vide qu'un fait inventé. Si l'article est une tribune d'opinion sans données concrètes : renvoie [].
- Pas de "synonyme" : titre = vraiment celui de l'article (ou très proche), pas un slogan créateur.
- Français.`;

    const userPrompt = `${contextText}

---
URL : ${url}
Source : ${sourceFromUrl(url)}

Texte brut de l'article (peut contenir un peu de bruit de navigation) :
"""
${articleSlice}
"""

Analyse maintenant.`;

    let raw = "";
    try {
      raw = await callAnthropicSimple(model, systemPrompt, userPrompt, 0.6, 1600);
    } catch (e) {
      console.error("[newsjacking-from-url] anthropic error", (e as Error).message);
      clearTimeout(timeout);
      return new Response(JSON.stringify({ error: "Analyse IA en échec, réessaie." }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: any;
    try {
      parsed = robustJsonParse(raw);
    } catch (e) {
      console.error("[newsjacking-from-url] parse error", (e as Error).message, raw.slice(0, 300));
      clearTimeout(timeout);
      return new Response(JSON.stringify({ error: "Réponse IA invalide, réessaie." }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ALLOWED_AXES = new Set(["mot_qui_revient","obsession_collective","comportement_emergent","debat_recurrent","objet_culturel","actu_connectable"]);
    const ALLOWED_TONS = new Set(["confortable","entre_deux","decalant"]);
    const ALLOWED_PONTS = new Set(["fort","moyen","fragile"]);

    const actu = {
      titre: typeof parsed.titre === "string" ? stripCitations(parsed.titre).slice(0, 140) : "Article",
      resume: typeof parsed.resume === "string" ? stripCitations(parsed.resume) : "",
      source: sourceFromUrl(url),
      source_url: url,
      type: "globale" as const,
      axe: ALLOWED_AXES.has(parsed.axe) ? parsed.axe : "actu_connectable",
      ton: ALLOWED_TONS.has(parsed.ton) ? parsed.ton : "entre_deux",
      force_pont: ALLOWED_PONTS.has(parsed.force_pont) ? parsed.force_pont : "moyen",
      pertinence: typeof parsed.pertinence === "string" ? stripCitations(parsed.pertinence) : "",
      faits_cles: Array.isArray(parsed.faits_cles)
        ? parsed.faits_cles
            .filter((f: unknown): f is string => typeof f === "string")
            .map((f: string) => stripCitations(f).slice(0, 200))
            .filter((f: string) => f.length > 0)
            .slice(0, 8)
        : [],
      from_url: true,
      // Pont pas "fort" (= pas de citation littérale du métier) → angle en mode
      // réaction : on ne force pas un pivot métier sur un article que
      // l'utilisatrice a choisi elle-même. Pont "fort" garde le pivot classique.
      ...(ALLOWED_PONTS.has(parsed.force_pont) && parsed.force_pont === "fort"
        ? {}
        : { angle_mode: "reaction" as const }),
    };

    // 4. Log usage (1 crédit, même catégorie que la recherche)
    try {
      await logUsage(user.id, "deep_research", "newsjacking_from_url", undefined, model, workspace_id);
    } catch (e) {
      console.warn("[newsjacking-from-url] logUsage failed", (e as Error).message);
    }

    clearTimeout(timeout);
    return new Response(JSON.stringify({ actus: [actu] }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    clearTimeout(timeout);
    console.error("[newsjacking-from-url] unhandled", (e as Error).message);
    return new Response(JSON.stringify({ error: "Erreur interne" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
