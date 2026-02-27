import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { callAnthropicSimple, getModelForAction } from "../_shared/anthropic.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS } from "../_shared/user-context.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
    }
    const userId = claims.claims.sub as string;

    // Check quota
    const quota = await checkQuota(userId, "content");
    if (!quota.allowed) {
      return new Response(JSON.stringify({ error: quota.message, quota }), { status: 429, headers: { ...cors, "Content-Type": "application/json" } });
    }

    // Get user context
    const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const ctx = await getUserContext(serviceClient, userId);
    const contextText = formatContextForAI(ctx, {
      includeProfile: true,
      includeVoice: true,
      includeStory: false,
      includePersona: true,
      includeOffers: false,
      includeEditorial: false,
      includeAudit: false,
    });

    const systemPrompt = `Tu es une directrice de communication experte en personal branding. À partir du profil de marque de cette utilisatrice, génère un GUIDE DE VOIX professionnel et actionnable. Ce guide sera partagé avec des prestataires (graphiste, CM freelance, assistante).

Réponds en JSON strict avec cette structure :

{
  "brand_name": "le nom ou prénom de l'utilisatrice",
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
    const raw = await callAnthropicSimple(model, systemPrompt, contextText, 0.7, 4096);

    // Parse JSON
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const guide = JSON.parse(cleaned);

    // Upsert into voice_guides
    const { data: existing } = await serviceClient
      .from("voice_guides")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      await serviceClient
        .from("voice_guides")
        .update({ guide_data: guide, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await serviceClient
        .from("voice_guides")
        .insert({ user_id: userId, guide_data: guide });
    }

    await logUsage(userId, "content", "voice_guide", undefined, model);

    return new Response(JSON.stringify({ guide, remaining: quota.remaining }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("generate-voice-guide error:", e);
    return new Response(JSON.stringify({ error: e.message || "Erreur interne" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
