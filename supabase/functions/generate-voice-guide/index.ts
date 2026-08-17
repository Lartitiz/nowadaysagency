import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { callAnthropicToolSimple, getModelForAction, type AnthropicTool, type UsageSink } from "../_shared/anthropic.ts";

// Tool forcé : transport JSON garanti (chantier éradication parse texte, 26/07).
const GUIDE_TOOL: AnthropicTool = {
  name: "rendre_guide_voix",
  description: "Renvoie le guide de voix de marque complet.",
  input_schema: {
    type: "object",
    properties: {
      brand_name: { type: "string" },
      voice_summary: { type: "string" },
      tone_keywords: { type: "array", items: { type: "string" } },
      do_say: { type: "array", items: { type: "string" } },
      dont_say: { type: "array", items: { type: "string" } },
      words_to_use: { type: "array", items: { type: "string" } },
      words_to_avoid: { type: "array", items: { type: "string" } },
      rhythm: { type: "string" },
      emotions_to_create: { type: "array", items: { type: "string" } },
      post_template: { type: "string" },
      bio_example: { type: "string" },
    },
    required: ["voice_summary", "tone_keywords", "do_say", "dont_say", "words_to_use", "words_to_avoid"],
  },
};
import { getUserContext, formatContextForAI, CONTEXT_PRESETS } from "../_shared/user-context.ts";
import { checkQuota, logUsage, quotaDeniedResponse } from "../_shared/plan-limiter.ts";
import { BASE_SYSTEM_RULES } from "../_shared/base-prompts.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
import { assertWorkspaceMembership, workspaceDeniedResponse } from "../_shared/workspace-guard.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = user.id;

    const rateCheck = checkRateLimit(userId);
    if (!rateCheck.allowed) return rateLimitResponse(rateCheck.retryAfterMs!, corsHeaders);

    // Read optional workspace_id from body
    let workspace_id: string | undefined;
    try {
      const body = await req.json();
      workspace_id = body.workspace_id || undefined;
    } catch {
      // No body or invalid JSON — ignore
    }

    // Check quota
    const quota = await checkQuota(userId, "content");
    if (!quota.allowed) {
      return quotaDeniedResponse(quota, corsHeaders);
    }

    // Get user context
    const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const membership = await assertWorkspaceMembership(serviceClient, userId, workspace_id);
    if (!membership.ok) {
      console.warn("[workspace-guard] denied", { userId, workspaceId: workspace_id });
      return workspaceDeniedResponse(corsHeaders);
    }

    const ctx = await getUserContext(serviceClient, userId, workspace_id);
    const contextText = formatContextForAI(ctx, {
      includeProfile: true,
      includeVoice: true,
      includeStory: false,
      includePersona: true,
      includeOffers: false,
      includeEditorial: false,
      includeAudit: false,
    });

    const systemPrompt = `${BASE_SYSTEM_RULES}

Tu es un·e expert·e en communication et personal branding. À partir du profil de marque de cette personne, génère un GUIDE DE VOIX professionnel et actionnable. Ce guide sera partagé avec des prestataires (graphiste, CM freelance, assistant·e).

Réponds en JSON strict avec cette structure :

{
  "brand_name": "le nom ou prénom de la personne",
  "voice_summary": "3-4 phrases résumant sa voix de marque",
  "tone_keywords": ["3-5 mots-clés de ton"],
  "do_say": ["5-7 exemples de phrases DANS le ton de la marque"],
  "dont_say": ["5-7 exemples de phrases HORS ton (à éviter)"],
  "words_to_use": ["10-15 mots et expressions à privilégier"],
  "words_to_avoid": ["10-15 mots et expressions interdits"],
  "rhythm": "description du rythme d'écriture (phrases courtes/longues, style oral/écrit, etc.)",
  "emotions_to_create": ["3-5 émotions à susciter chez le lecteur"],
  "post_template": "un template de post type dans le ton de la marque (avec placeholders)",
  "bio_example": "un exemple de bio Instagram dans le ton"
}

Réponds UNIQUEMENT avec le JSON, sans commentaire ni balise markdown.`;

    const model = getModelForAction("voice");
    const usage: UsageSink = {};
    const guide = await callAnthropicToolSimple(model, systemPrompt, contextText, GUIDE_TOOL, 0.7, 4096, usage, 60_000);

    // Upsert into voice_guides
    const { data: existing } = await serviceClient
      .from("voice_guides")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    // Écriture vérifiée : un échec ici = guide perdu au rechargement, donc
    // erreur franche et PAS de logUsage (on ne facture pas un échec).
    let writeError;
    if (existing) {
      ({ error: writeError } = await serviceClient
        .from("voice_guides")
        .update({ guide_data: guide, updated_at: new Date().toISOString() })
        .eq("id", existing.id));
    } else {
      ({ error: writeError } = await serviceClient
        .from("voice_guides")
        .insert({ user_id: userId, guide_data: guide }));
    }

    if (writeError) {
      console.error("generate-voice-guide: échec écriture voice_guides:", writeError);
      return new Response(
        JSON.stringify({ error: "Le guide n'a pas pu être enregistré. Ton crédit n'a pas été décompté, réessaie dans un instant." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await logUsage(userId, "content", "voice_guide", usage.total_tokens, usage.model);

    return new Response(JSON.stringify({ guide, remaining: quota.remaining }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("generate-voice-guide error:", e);
    return new Response(JSON.stringify({ error: "Erreur interne du serveur" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
