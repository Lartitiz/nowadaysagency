// Pré-remplit l'atelier offre depuis une page de vente : scrape la page (+ pages
// secondaires via scrapeWebsite) puis extrait les champs de l'atelier au tool forcé.
// Règle d'or : ne renvoyer QUE ce qui est réellement présent sur la page — les
// champs absents restent vides, l'utilisatrice complète elle-même.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkQuota, logUsage, quotaDeniedResponse } from "../_shared/plan-limiter.ts";
import { callAnthropicToolSimple, getModelForAction, type AnthropicTool, type UsageSink } from "../_shared/anthropic.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
import { scrapeWebsite, isSafePublicUrl } from "../_shared/scraping.ts";
import { assertWorkspaceMembership, workspaceDeniedResponse } from "../_shared/workspace-guard.ts";
import { isDemoUser } from "../_shared/guard-demo.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const BodySchema = z.object({
  url: z.string().max(2048),
  workspace_id: z.string().uuid().optional().nullable(),
});

// Tool forcé : le schéma EST le contrat (chantier éradication parse texte).
const EXTRACT_OFFER_TOOL: AnthropicTool = {
  name: "rendre_offre_extraite",
  description: "Renvoie les éléments de l'offre réellement présents sur la page de vente.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Nom de l'offre tel qu'affiché" },
      description_short: { type: "string", description: "L'offre en 2-3 phrases, reprises de la page" },
      price_text: { type: "string", description: "Prix tel qu'affiché (ex: 290€/mois × 6 mois)" },
      problem_surface: { type: "string", description: "Le problème que la page dit résoudre" },
      problem_deep: { type: "string", description: "Le problème profond/émotionnel si la page l'évoque" },
      promise: { type: "string", description: "La promesse/le résultat principal mis en avant" },
      features: { type: "array", items: { type: "string" }, description: "Ce qui est inclus, un élément par entrée" },
      target_ideal: { type: "string", description: "Pour qui est l'offre, selon la page" },
      target_not_for: { type: "string", description: "Pour qui ce n'est PAS, si la page le dit" },
      objections: { type: "array", items: { type: "string" }, description: "Objections traitées (FAQ, réassurance), une par entrée" },
      testimonials: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" }, sector: { type: "string" },
            result: { type: "string" }, quote: { type: "string" },
          },
          required: ["quote"],
        },
        description: "Témoignages cités sur la page (citation obligatoire, le reste si présent)",
      },
    },
    required: [],
  },
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentification requise" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Authentification invalide" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (isDemoUser(user.id)) {
      return new Response(JSON.stringify({ error: "Demo mode: this feature is simulated" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const rateCheck = checkRateLimit(user.id);
    if (!rateCheck.allowed) return rateLimitResponse(rateCheck.retryAfterMs!, corsHeaders);

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Données invalides" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { url } = parsed.data;
    const workspace_id = parsed.data.workspace_id ?? undefined;

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const membership = await assertWorkspaceMembership(serviceClient, user.id, workspace_id ?? null);
    if (!membership.ok) return workspaceDeniedResponse(corsHeaders);

    const quotaCheck = await checkQuota(user.id, "content", workspace_id);
    if (!quotaCheck.allowed) return quotaDeniedResponse(quotaCheck, corsHeaders);

    const cleanUrl = url.startsWith("http") ? url : `https://${url}`;
    if (!isSafePublicUrl(cleanUrl)) {
      return new Response(JSON.stringify({ error: "URL non accessible" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    const pageText = await scrapeWebsite(cleanUrl, controller.signal).catch(() => null);
    clearTimeout(timeout);

    if (!pageText || pageText.trim().length < 100) {
      return new Response(
        JSON.stringify({ error: "Page illisible : elle est peut-être protégée ou vide. Vérifie l'adresse, ou remplis l'atelier à la main." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const system = `Tu extrais les éléments d'une OFFRE depuis le texte d'une page de vente, pour pré-remplir un atelier.

RÈGLES STRICTES :
- Tu ne renvoies QUE ce qui est réellement écrit ou clairement paraphrasable depuis la page. Un champ absent de la page = tu ne le renvoies PAS. Tu n'inventes RIEN, tu ne complètes RIEN par des généralités.
- Tu reprends les mots de la page (léger lissage autorisé), jamais ton propre marketing.
- Prix : recopie le format affiché. S'il y a plusieurs offres sur la page, prends l'offre principale.
- Témoignages : uniquement des citations réellement présentes, jamais résumées au point d'être réécrites.`;

    const usage: UsageSink = {};
    const offer = await callAnthropicToolSimple(
      getModelForAction("content"),
      system,
      `TEXTE DE LA PAGE DE VENTE (${cleanUrl}) :\n\n${pageText.slice(0, 30000)}`,
      EXTRACT_OFFER_TOOL,
      0.2,
      2500,
      usage,
    );

    await logUsage(user.id, "content", "extract_offer_from_url", usage.total_tokens, usage.model, workspace_id);

    return new Response(JSON.stringify({ success: true, offer }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-offer-from-url error:", e);
    return new Response(JSON.stringify({ error: "Erreur interne du serveur" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
