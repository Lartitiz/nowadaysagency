import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
import { callAnthropicSimple, getModelForAction } from "../_shared/anthropic.ts";
import { ANTI_SLOP } from "../_shared/copywriting-prompts.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req); const cors = corsHeaders;
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentification requise" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Authentification invalide" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Check quota (audit category)
    const quota = await checkQuota(user.id, "audit");
    if (!quota.allowed) {
      return new Response(JSON.stringify({ error: "limit_reached", message: quota.message }), {
        status: 403, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Fetch brand_profile + last instagram audit + last generated contents in parallel
    const [brandRes, auditRes, contentsRes] = await Promise.all([
      supabase.from("brand_profile").select("voice_description, tone_register, tone_level, tone_style, tone_humor, tone_engagement, key_expressions, things_to_avoid, combat_cause, combat_fights, combat_refusals, combat_alternative, tone_keywords").eq("user_id", user.id).maybeSingle(),
      supabase.from("branding_audits").select("score_global, synthese, points_forts, points_faibles").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("calendar_posts").select("content_draft, theme, format").eq("user_id", user.id).not("content_draft", "is", null).order("created_at", { ascending: false }).limit(5),
    ]);

    const brand = brandRes.data;
    const audit = auditRes.data;

    if (!brand) {
      return new Response(JSON.stringify({ error: "Profil de marque non trouvé. Complète d'abord ta section Ton & Style." }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Build declared tone block
    const declaredLines: string[] = [];
    if (brand.voice_description) declaredLines.push(`- Description de la voix : ${brand.voice_description}`);
    if (brand.tone_register) declaredLines.push(`- Registre : ${brand.tone_register}`);
    if (brand.tone_level) declaredLines.push(`- Niveau de langage : ${brand.tone_level}`);
    if (brand.tone_style) declaredLines.push(`- Style : ${brand.tone_style}`);
    if (brand.tone_humor) declaredLines.push(`- Humour : ${brand.tone_humor}`);
    if (brand.tone_engagement) declaredLines.push(`- Engagement : ${brand.tone_engagement}`);
    if (brand.key_expressions) declaredLines.push(`- Expressions clés : ${brand.key_expressions}`);
    if (brand.things_to_avoid) declaredLines.push(`- À éviter : ${brand.things_to_avoid}`);
    if (brand.combat_cause) declaredLines.push(`- Cause défendue : ${brand.combat_cause}`);
    if (brand.combat_fights) declaredLines.push(`- Combats : ${brand.combat_fights}`);
    if (brand.combat_refusals) declaredLines.push(`- Ce qu'elle refuse : ${brand.combat_refusals}`);
    if (brand.combat_alternative) declaredLines.push(`- Alternative proposée : ${brand.combat_alternative}`);
    const toneKeywords = brand.tone_keywords;
    if (toneKeywords && Array.isArray(toneKeywords) && toneKeywords.length) {
      declaredLines.push(`- Mots-clés de ton : ${toneKeywords.join(", ")}`);
    }

    // Build actual data block
    const actualLines: string[] = [];
    if (audit) {
      if (audit.score_global != null) actualLines.push(`- Score global audit : ${audit.score_global}/100`);
      if (audit.synthese) actualLines.push(`- Synthèse audit : ${audit.synthese}`);
      if (audit.points_forts) {
        const pf = Array.isArray(audit.points_forts) ? audit.points_forts : [];
        if (pf.length) actualLines.push(`- Points forts : ${pf.map((p: any) => typeof p === "string" ? p : p.label || p.text || JSON.stringify(p)).join(", ")}`);
      }
      if (audit.points_faibles) {
        const pfb = Array.isArray(audit.points_faibles) ? audit.points_faibles : [];
        if (pfb.length) actualLines.push(`- Points faibles : ${pfb.map((p: any) => typeof p === "string" ? p : p.label || p.text || JSON.stringify(p)).join(", ")}`);
      }
    }

    const contents = contentsRes.data || [];
    if (contents.length > 0) {
      actualLines.push(`\nDerniers contenus produits :`);
      for (const c of contents) {
        const draft = (c.content_draft || "").slice(0, 300);
        actualLines.push(`- [${c.format || "post"}] ${c.theme || ""}: "${draft}"`);
      }
    }

    if (actualLines.length === 0) {
      actualLines.push("Aucune donnée d'audit ou de contenu disponible.");
    }

    const systemPrompt = `Tu es une experte en cohérence de marque. Compare le TON DÉCLARÉ de cette utilisatrice (son branding) avec ce qu'elle fait RÉELLEMENT (ses posts et son audit Instagram).

Réponds en JSON strict :
{
  "coherence_score": 0-100,
  "summary": "2-3 phrases résumant la cohérence globale",
  "alignments": [{"aspect": "...", "detail": "ce qui est cohérent"}],
  "gaps": [{"aspect": "...", "declared": "ce qu'elle dit", "actual": "ce qu'elle fait", "suggestion": "comment aligner"}],
  "quick_wins": ["3 actions rapides pour améliorer la cohérence"]
}

Sois bienveillante et constructive. L'objectif n'est pas de culpabiliser mais de créer un moment de prise de conscience positive. Donne au minimum 2 alignments et 2 gaps. Les quick_wins doivent être concrets et actionnables.`;

    const userPrompt = `TON DÉCLARÉ :\n${declaredLines.join("\n")}\n\nCE QU'ELLE FAIT :\n${actualLines.join("\n")}`;

    const model = getModelForAction("content"); // Sonnet
    const raw = await callAnthropicSimple(model, systemPrompt + "\n\n" + ANTI_SLOP, userPrompt, 0.7, 4096);

    // Parse JSON
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Invalid AI response format");
    const result = JSON.parse(jsonMatch[0]);

    // Log usage
    await logUsage(user.id, "audit", "branding_mirror");

    return new Response(JSON.stringify(result), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("branding-mirror error:", error);
    const status = error.status || 500;
    return new Response(JSON.stringify({ error: error.message || "Erreur interne" }), {
      status, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
