import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
import { callAnthropic } from "../_shared/anthropic.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { validateInput, ValidationError } from "../_shared/input-validators.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS } from "../_shared/user-context.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const reqBody = await req.json();
    validateInput(reqBody, z.object({
      subject: z.string().min(1).max(15000),
      reference_image_base64: z.string().min(1).max(10000000),
      pin_type: z.enum(["photo_product", "photo_lifestyle", "photo_flat_lay"]),
      brief_hint: z.string().max(5000).optional().nullable(),
      pinterest_link: z.string().max(500).optional().nullable(),
      pinterest_board: z.string().max(200).optional().nullable(),
      workspace_id: z.string().uuid().optional().nullable(),
    }).passthrough());

    const { subject, pin_type, brief_hint, pinterest_link, pinterest_board } = reqBody;
    const filterWs = reqBody.workspace_id || workspaceId;

    const col = filterWs ? "workspace_id" : "user_id";
    const val = filterWs || user.id;

    const [ctx, charterRes] = await Promise.all([
      getUserContext(sbAdmin, user.id, filterWs),
      sbAdmin
        .from("brand_charter")
        .select("color_primary, color_secondary, color_accent, color_background, color_text, font_title, font_body, mood_keywords, border_radius, photo_style, visual_donts, ai_generated_brief, moodboard_description, icon_style, template_layout_description")
        .eq(col, val)
        .maybeSingle(),
    ]);

    const contextText = formatContextForAI(ctx, CONTEXT_PRESETS.pinterest);
    const charter = charterRes.data || {};

    const ch = {
      color_primary: charter.color_primary || "#FB3D80",
      color_secondary: charter.color_secondary || "#91014b",
      color_accent: charter.color_accent || "#FFE561",
      color_background: charter.color_background || "#FFF4F8",
      color_text: charter.color_text || "#1A1A2E",
      font_title: charter.font_title || "Libre Baskerville",
      font_body: charter.font_body || "IBM Plex Mono",
      mood_keywords: Array.isArray(charter.mood_keywords) ? charter.mood_keywords.join(", ") : (charter.mood_keywords || "pop, joyeux, audacieux"),
      border_radius: charter.border_radius || "12px",
      photo_style: charter.photo_style || "",
      visual_donts: charter.visual_donts || "",
      ai_generated_brief: charter.ai_generated_brief || "",
      moodboard_description: charter.moodboard_description || "",
      icon_style: charter.icon_style || "",
      template_layout_description: charter.template_layout_description || "",
    };

    const systemPrompt = `Tu es une directrice artistique spécialisée en photographie pour Pinterest ET experte SEO Pinterest. Tu reçois une image d'épingle Pinterest comme inspiration. Tu dois :
1) Générer un brief photo détaillé pour l'utilisatrice
2) Générer un visuel overlay HTML (1000×1500px) avec fond dégradé + texte positionné
3) Générer le titre et la description SEO

═══ BRIEF PHOTO ═══
Le brief doit être concret et actionnable :
- what : quoi photographier exactement (décris la scène)
- framing : cadrage (flat lay, portrait, plan large, détail, etc.)
- lighting : éclairage (lumière naturelle, studio, golden hour, etc.)
- props : liste de 3-6 accessoires/éléments à inclure
- colors : palette de couleurs dominantes à viser
- mood : ambiance en 2-3 mots (ex: "chaleureux et professionnel")

═══ VISUEL OVERLAY ═══
Génère un <div> HTML/CSS inline de 1000×1500px avec :
- Fond : DÉGRADÉ DOUX utilisant les couleurs de la charte (du plus clair en haut au plus soutenu en bas, ou un angle diagonal)
  Exemple : background: linear-gradient(160deg, ${ch.color_background} 0%, ${ch.color_primary}20 50%, ${ch.color_secondary}30 100%);
- Le texte overlay positionné comme il apparaîtrait sur la photo finale
- Le texte utilise les polices de la charte (${ch.font_title} pour les titres, ${ch.font_body} pour le corps)
- Un badge pilule ou un élément signature Nowadays si pertinent
- L'ensemble doit être joli même SANS photo derrière (le dégradé sert d'attente)
- Indication discrète en bas : "📷 Ajoute ta photo dans Canva ou PowerPoint" en petit texte muted

RÈGLES HTML/CSS :
- Le div principal = EXACTEMENT 1000px × 1500px
- Le div principal DOIT TOUJOURS avoir ces styles :
  width:1000px; height:1500px; position:relative; overflow:hidden; box-sizing:border-box;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 60px 50px; font-family: ${ch.font_body};
- CSS 100% inline (pas de classes CSS)
- Commencer par un @import Google Fonts pour ${ch.font_title} et ${ch.font_body}
- HTML complet et autonome (rendable seul dans un navigateur)
- Pas de JavaScript
- JAMAIS de cercle, rond, ou border-radius: 50% en élément décoratif de fond
- Uniquement des rectangles arrondis (border-radius: ${ch.border_radius})
- Lisibilité mobile : titre min 36px, corps min 18px
${ch.visual_donts ? `\n⛔ INTERDITS VISUELS :\n${ch.visual_donts}` : ""}${ch.ai_generated_brief ? `\nBRIEF CRÉATIF :\n${ch.ai_generated_brief}` : ""}${ch.moodboard_description ? `\nAMBIANCE MOODBOARD :\n${ch.moodboard_description}` : ""}${ch.icon_style ? `\nStyle d'icônes : ${ch.icon_style}` : ""}${ch.template_layout_description ? `\n\n═══ LAYOUT DE RÉFÉRENCE ═══\n${ch.template_layout_description}\nInspire-toi de ce layout pour l'ambiance générale.` : ""}

═══ TITRE SEO PINTEREST ═══
- Max 100 caractères
- Mot-clé principal dans les 3 premiers mots
- Descriptif et utile, PAS clickbait
- Penser : qu'est-ce que la cible taperait dans Pinterest ?

═══ DESCRIPTION SEO ═══
- 100-200 mots, 2-3 paragraphes
- Intégrer mots-clés naturellement
- Décrire ce que la personne va trouver
- CTA doux en fin ("Enregistre pour plus tard", "Découvre le guide complet")
- PAS de hashtags
- Écriture inclusive point médian

FORMAT DE RÉPONSE (JSON strict, rien d'autre) :
{
  "photo_brief": {
    "what": "...",
    "framing": "...",
    "lighting": "...",
    "props": ["...", "..."],
    "colors": "...",
    "mood": "..."
  },
  "overlay_html": "<style>@import url(...);</style><div style=\\"width:1000px;height:1500px;...\\">...</div>",
  "title": "Titre SEO max 100 caractères",
  "description": "Description SEO 100-200 mots"
}`;

    const rawBase64 = reqBody.reference_image_base64.replace(/^data:image\/[a-z]+;base64,/, "");

    const userPrompt = `Voici l'épingle Pinterest d'inspiration. Crée un brief photo + overlay pour l'adapter au projet de cette utilisatrice.

SUJET : ${subject}
TYPE : ${pin_type}
${brief_hint ? `BRIEF INITIAL : ${brief_hint}` : ""}
${pinterest_link ? `LIEN : ${pinterest_link}` : ""}

CONTEXTE BRANDING :
${contextText}

CHARTE : primary ${ch.color_primary}, secondary ${ch.color_secondary}, accent ${ch.color_accent}, bg ${ch.color_background}, text ${ch.color_text}, font_title ${ch.font_title}, font_body ${ch.font_body}`;

    const messages = [{
      role: "user",
      content: [
        {
          type: "image",
          source: { type: "base64", media_type: "image/jpeg", data: rawBase64 },
        },
        {
          type: "text",
          text: userPrompt,
        },
      ],
    }];

    const model = "claude-opus-4-6" as any;

    const rawResponse = await callAnthropic({
      model,
      system: systemPrompt,
      messages,
      temperature: 0.5,
      max_tokens: 6144,
    });

    let result: any;
    try {
      let cleaned = rawResponse.replace(/```(?:json)?\s*/gi, "").replace(/```\s*$/gi, "");
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found");
      }
    } catch (parseErr) {
      console.error("Failed to parse pinterest-photo-brief response:", rawResponse.slice(0, 500));
      try {
        let start = rawResponse.indexOf("{");
        if (start === -1) throw parseErr;
        let depth = 0;
        let end = start;
        for (let i = start; i < rawResponse.length; i++) {
          if (rawResponse[i] === "{") depth++;
          else if (rawResponse[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
        }
        result = JSON.parse(rawResponse.slice(start, end + 1));
      } catch {
        throw new Error("L'IA n'a pas retourné un format valide. Réessaie.");
      }
    }

    // Post-processing: replace @import Google Fonts with <link> for iframe compatibility
    if (result?.overlay_html) {
      const fontsLink = `<link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(ch.font_title)}:ital,wght@0,400;0,700;1,400&family=${encodeURIComponent(ch.font_body)}:wght@400;500;600;700&display=swap" rel="stylesheet">`;
      let html = result.overlay_html;
      html = html.replace(/<style>\s*@import\s+url\([^)]*fonts\.googleapis\.com[^)]*\)\s*;?\s*<\/style>/gi, "");
      result.overlay_html = fontsLink + html;
    }

    await logUsage(user.id, "content", "pinterest_photo_brief", undefined, model, workspaceId);

    return new Response(JSON.stringify({ result, remaining: quota.remaining }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("pinterest-photo-brief error:", err);
    if (err.message === "Non autorisé") {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (err instanceof ValidationError) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "Erreur interne du serveur" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
