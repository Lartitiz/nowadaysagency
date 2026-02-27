import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
import { callAnthropic, getModelForAction } from "../_shared/anthropic.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { validateInput, ValidationError } from "../_shared/input-validators.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req); const cors = corsHeaders;
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) throw new Error("Non autorisé");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Non autorisé");

    // Check workspace
    const sbAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: wsMember } = await sbAdmin
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .eq("role", "owner")
      .limit(1)
      .maybeSingle();

    const workspaceId = wsMember?.workspace_id;

    // Check quota
    const quota = await checkQuota(user.id, "audit", workspaceId);
    if (!quota.allowed) {
      return new Response(JSON.stringify({ error: quota.message, quota }), {
        status: 429,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const reqBody = await req.json();
    const { template_urls } = validateInput(reqBody, z.object({
      template_urls: z.array(z.string().url().max(2048)).min(1, "Au moins 1 URL requise").max(10),
    }));
    if (false) {
      throw new Error("Aucun template fourni");
    }

    const urls = template_urls.slice(0, 5);

    // Fetch brand_charter
    const col = workspaceId ? "workspace_id" : "user_id";
    const val = workspaceId || user.id;

    const { data: charter } = await sbAdmin
      .from("brand_charter")
      .select("color_primary, color_secondary, color_accent, color_background, color_text, font_title, font_body, font_accent, photo_style, mood_keywords, visual_donts, ai_generated_brief")
      .eq(col, val)
      .maybeSingle();

    // Build charter context for the prompt
    let charterContext = "Aucune charte graphique déclarée pour le moment.";
    if (charter) {
      const lines: string[] = [];
      if (charter.color_primary) lines.push(`- Couleur principale : ${charter.color_primary}`);
      if (charter.color_secondary) lines.push(`- Couleur secondaire : ${charter.color_secondary}`);
      if (charter.color_accent) lines.push(`- Couleur accent : ${charter.color_accent}`);
      if (charter.color_background) lines.push(`- Fond : ${charter.color_background}`);
      if (charter.color_text) lines.push(`- Texte : ${charter.color_text}`);
      if (charter.font_title) lines.push(`- Police titres : ${charter.font_title}`);
      if (charter.font_body) lines.push(`- Police corps : ${charter.font_body}`);
      if (charter.mood_keywords?.length) lines.push(`- Style visuel : ${charter.mood_keywords.join(", ")}`);
      if (charter.photo_style) lines.push(`- Style photo : ${charter.photo_style}`);
      if (charter.visual_donts) lines.push(`- Interdits visuels : ${charter.visual_donts}`);
      if (lines.length) charterContext = lines.join("\n");
    }

    // Download images and convert to base64
    const imageContents: any[] = [];
    for (const url of urls) {
      try {
        const resp = await fetch(url);
        if (!resp.ok) {
          console.error(`Failed to fetch image: ${url} — ${resp.status}`);
          continue;
        }
        const arrayBuffer = await resp.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        // Convert to base64
        let binary = "";
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);

        // Detect media type
        const contentType = resp.headers.get("content-type") || "image/png";
        const mediaType = contentType.startsWith("image/") ? contentType.split(";")[0] : "image/png";

        imageContents.push({
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType,
            data: base64,
          },
        });
      } catch (err) {
        console.error(`Error downloading image ${url}:`, err);
      }
    }

    if (imageContents.length === 0) {
      throw new Error("Aucune image n'a pu être téléchargée");
    }

    const systemPrompt = `Tu es une directrice artistique experte en identité visuelle. Analyse ces visuels/templates et extrais-en l'identité graphique.

CHARTE GRAPHIQUE DÉCLARÉE PAR L'UTILISATRICE :
${charterContext}

Pour chaque image analysée, identifie :
- Les couleurs dominantes (codes HEX approximatifs)
- Les typographies utilisées (ou leur style : serif, sans-serif, script)
- Le style général (minimaliste, chargé, coloré, épuré, etc.)
- La mise en page (centré, asymétrique, grille, etc.)

Puis fais une SYNTHÈSE GLOBALE en JSON (et UNIQUEMENT du JSON, sans texte avant ni après) :
{
  "detected_colors": ["#xxx", "#yyy", "#zzz"],
  "detected_font_style": "description du style typographique détecté",
  "detected_mood": ["3 mots d'ambiance"],
  "detected_layout": "description de la mise en page récurrente",
  "coherence_score": 0-100,
  "coherence_notes": "ce qui est cohérent entre les templates",
  "gaps": ["les incohérences détectées entre les templates eux-mêmes ET avec la charte déclarée"],
  "recommendations": ["3-5 recommandations pour harmoniser"],
  "extracted_charter": {
    "color_primary": "#xxx",
    "color_secondary": "#xxx",
    "color_accent": "#xxx",
    "font_style_title": "serif / sans-serif / script",
    "font_style_body": "serif / sans-serif / script",
    "mood_keywords": ["3 mots"]
  }
}

Sois précise sur les HEX. Sois bienveillante dans les recommandations.`;

    const userContent: any[] = [
      { type: "text", text: `Analyse ces ${imageContents.length} template(s) visuel(s) et extrais-en l'identité graphique. Réponds uniquement en JSON.` },
      ...imageContents,
    ];

    const model = "claude-sonnet-4-5-20250929" as any;

    const rawResponse = await callAnthropic({
      model,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
      temperature: 0.3,
      max_tokens: 4096,
    });

    // Parse JSON from response
    let result: any;
    try {
      // Try to extract JSON from the response
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseErr) {
      console.error("Failed to parse AI response:", rawResponse.slice(0, 500));
      throw new Error("L'IA n'a pas retourné un format valide. Réessaie.");
    }

    // Log usage
    await logUsage(user.id, "audit", "audit_visual_templates", undefined, model, workspaceId);

    return new Response(JSON.stringify({ result, remaining: quota.remaining }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("audit-visual-templates error:", err);
    const status = err.message === "Non autorisé" ? 401 : 500;
    return new Response(JSON.stringify({ error: err.message }), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
