import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
import { callAnthropic } from "../_shared/anthropic.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { validateInput, ValidationError } from "../_shared/input-validators.ts";

serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

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

    const quota = await checkQuota(user.id, "content", workspaceId);
    if (!quota.allowed) {
      return new Response(JSON.stringify({ error: quota.message, quota }), {
        status: 429,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const reqBody = await req.json();
    validateInput(reqBody, z.object({
      slides: z.array(z.record(z.unknown())).min(1, "Aucune slide fournie").max(20),
      template_style: z.string().max(100).optional().nullable(),
      charter: z.record(z.unknown()).optional().nullable(),
      custom_overrides: z.record(z.unknown()).optional().nullable(),
    }).passthrough());
    const { slides, template_style, charter: bodyCharter, custom_overrides } = reqBody;

    // Resolve charter: use body or fetch from DB
    let charter = bodyCharter;
    if (!charter) {
      const col = workspaceId ? "workspace_id" : "user_id";
      const val = workspaceId || user.id;
      const { data: dbCharter } = await sbAdmin
        .from("brand_charter")
        .select("color_primary, color_secondary, color_accent, color_background, color_text, font_title, font_body, mood_keywords, border_radius")
        .eq(col, val)
        .maybeSingle();
      charter = dbCharter || {};
    }

    const ch = {
      color_primary: charter.color_primary || "#E91E8C",
      color_secondary: charter.color_secondary || "#1A1A2E",
      color_accent: charter.color_accent || "#FFE561",
      color_background: charter.color_background || "#FFFFFF",
      color_text: charter.color_text || "#1A1A2E",
      font_title: charter.font_title || "Inter",
      font_body: charter.font_body || "Inter",
      mood_keywords: Array.isArray(charter.mood_keywords) ? charter.mood_keywords.join(", ") : (charter.mood_keywords || "professionnel"),
      border_radius: charter.border_radius || "rounded",
    };

    const style = template_style || "clean";

    const systemPrompt = `Tu es une directrice artistique experte en design de carrousels Instagram. Tu génères du HTML/CSS pur pour des slides au format 1080x1350px.

RÈGLES STRICTES :
- Chaque slide est un <div> de exactement 1080px × 1350px
- Utilise UNIQUEMENT du HTML et du CSS inline (pas de classes, pas de fichier CSS externe)
- Les polices Google Fonts sont chargées via @import dans une balise <style> en haut
- Le HTML doit être COMPLET et AUTONOME (rendable tel quel dans un navigateur)
- Pas de JavaScript
- Pas de cercles ni de ronds en fond
- Texte lisible : contraste suffisant entre texte et fond
- Hiérarchie visuelle claire : titre plus gros que body
- Le design doit être PROFESSIONNEL, pas amateur

CHARTE GRAPHIQUE :
- Couleur principale : ${ch.color_primary}
- Couleur secondaire : ${ch.color_secondary}
- Couleur accent : ${ch.color_accent}
- Fond : ${ch.color_background}
- Texte : ${ch.color_text}
- Police titres : ${ch.font_title}
- Police corps : ${ch.font_body}
- Style : ${ch.mood_keywords}
- Coins : ${ch.border_radius}

STYLE DE TEMPLATE : ${style}
- 'clean' : fond uni, texte centré, séparateur fin, beaucoup d'espace blanc
- 'bold' : fond couleur primaire, gros titre blanc, impact visuel fort
- 'gradient' : fond dégradé entre primaire et secondaire, texte blanc
- 'quote' : guillemets décoratifs grands, texte centré, style citation
- 'numbered' : gros numéro de slide en couleur accent, titre à côté, style éducatif
- 'split' : slide divisée en 2 zones (bande colorée + zone texte)
- 'photo' : placeholder pour image de fond avec overlay sombre et texte blanc
- 'story' : fond doux/crème, typo élégante, ambiance intime

Retourne un JSON :
{
  "slides_html": [
    { "slide_number": 1, "html": "<div style=\\"width:1080px;height:1350px;...\\">...</div>" },
    { "slide_number": 2, "html": "..." }
  ]
}

IMPORTANT : le HTML de chaque slide doit inclure la balise <style> avec l'import Google Fonts AU DÉBUT. Chaque slide est autonome.`;

    let overrideNote = "";
    if (custom_overrides) {
      if (custom_overrides.slide_bg_override) overrideNote += `\nCouleur de fond custom : ${custom_overrides.slide_bg_override}`;
      if (custom_overrides.text_size) overrideNote += `\nTaille du texte : ${custom_overrides.text_size}`;
    }

    const userPrompt = `Génère les slides HTML pour ce carrousel :

${JSON.stringify(slides)}

Template : ${style}${overrideNote}

Retourne UNIQUEMENT le JSON, pas de texte avant ou après.`;

    const model = "claude-sonnet-4-5-20250929" as any;

    const rawResponse = await callAnthropic({
      model,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      temperature: 0.5,
      max_tokens: 8192,
    });

    let result: any;
    try {
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found");
      }
    } catch {
      console.error("Failed to parse carousel-visual response:", rawResponse.slice(0, 500));
      throw new Error("L'IA n'a pas retourné un format valide. Réessaie.");
    }

    await logUsage(user.id, "content", "carousel_visual", undefined, model, workspaceId);

    return new Response(JSON.stringify({ result, remaining: quota.remaining }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("carousel-visual error:", err);
    const status = err.message === "Non autorisé" ? 401 : 500;
    return new Response(JSON.stringify({ error: err.message }), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
