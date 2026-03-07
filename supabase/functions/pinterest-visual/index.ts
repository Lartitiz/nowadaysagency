import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
import { callAnthropic } from "../_shared/anthropic.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { validateInput, ValidationError } from "../_shared/input-validators.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS } from "../_shared/user-context.ts";

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
      pin_type: z.enum(["infographie", "checklist", "mini_tuto", "avant_apres", "schema_visuel"]),
      pinterest_link: z.string().max(500).optional().nullable(),
      pinterest_board: z.string().max(200).optional().nullable(),
      workspace_id: z.string().uuid().optional().nullable(),
    }).passthrough());

    const { subject, pin_type, pinterest_link, pinterest_board } = reqBody;
    const filterWs = reqBody.workspace_id || workspaceId;

    // Fetch context and charter in parallel
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

    const systemPrompt = `Tu es une directrice artistique ET experte SEO Pinterest. Tu génères un visuel HTML/CSS inline pour une épingle Pinterest au format 1000×1500px, PLUS le titre et la description SEO.

Tu dois produire un visuel qui ressemble à du design professionnel fait sur Figma ou Canva Pro, PAS à du texte centré sur un fond de couleur. Inspire-toi du design system des carrousels Instagram de l'app.

═══ RÈGLES HTML/CSS STRICTES ═══
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

═══ DESIGN SYSTEM (identique aux carrousels) ═══

TITRES :
- Font : ${ch.font_title}, font-weight: 400 (JAMAIS bold)
- Taille : 48-60px pour le titre principal, 28-36px pour les sous-titres
- Couleur : ${ch.color_secondary} ou ${ch.color_text}

CORPS DE TEXTE :
- Font : ${ch.font_body}, font-weight: 400
- Taille : 22-28px
- Couleur : ${ch.color_text}
- Line-height : 1.6

BADGES "PILULES" (élément signature) :
- Display: inline-block
- Background : ${ch.color_primary}
- Color: white, font-family: ${ch.font_body}, font-weight: 600
- Font-size: 16-20px, text-transform: uppercase, letter-spacing: 2px
- Padding: 8px 24px
- Border-radius: 100px (pilule)

CARTES BLANCHES :
- Background: #FFFFFF
- Border-radius: ${ch.border_radius}
- Box-shadow: 0 4px 24px rgba(0,0,0,0.06)
- Padding: 30px
- Optionnel : border-left: 4px solid [couleur accent]

BORDURES POINTILLÉES :
- Border: 2px dashed ${ch.color_primary} avec 40% opacité
- Border-radius: ${ch.border_radius}
- Padding: 24px

ÉLÉMENTS DÉCORATIFS AUTORISÉS :
- Rectangles arrondis, lignes, traits
- Flèches → en ${ch.color_primary}
- Soulignements colorés type highlighter (background linear-gradient)
- Emojis comme éléments visuels (taille 36-48px)
- JAMAIS de cercles/ronds comme décoration de fond
${ch.visual_donts ? `\n⛔ INTERDITS VISUELS :\n${ch.visual_donts}` : ""}${ch.ai_generated_brief ? `\nBRIEF CRÉATIF :\n${ch.ai_generated_brief}` : ""}${ch.moodboard_description ? `\nAMBIANCE MOODBOARD :\n${ch.moodboard_description}` : ""}${ch.icon_style ? `\nStyle d'icônes : ${ch.icon_style}` : ""}${ch.template_layout_description ? `\n\n═══ LAYOUT DE RÉFÉRENCE ═══\n${ch.template_layout_description}\nInspire-toi de ce layout pour l'ambiance générale.` : ""}

═══ TYPES D'ÉPINGLES ═══

Si pin_type = "infographie" :
- Titre en haut dans un badge pilule ou une carte blanche
- Flux vertical avec 3-6 étapes connectées par des flèches ou lignes en ${ch.color_primary}
- Chaque étape = numéro dans pastille colorée + titre court + 1 ligne de description
- Alterner les couleurs d'accent entre les étapes
- Beaucoup d'air entre les éléments
- Watermark discret en bas

Si pin_type = "checklist" :
- Badge pilule "CHECKLIST" en haut
- Titre principal sous le badge
- Liste de 5-8 items avec des cases à cocher stylisées (carrés arrondis en ${ch.color_primary} avec un check blanc)
- Chaque item = checkbox + texte court (max 8 mots)
- Fond des items alternés : blanc / ${ch.color_background}
- CTA discret en bas ("Enregistre pour ne rien oublier")

Si pin_type = "mini_tuto" :
- Badge pilule "TUTO" en haut
- Titre principal
- 3 à 5 étapes numérotées (gros chiffres dans pastilles colorées ${ch.color_primary})
- Chaque étape = numéro + titre court + 1-2 lignes d'explication dans une carte blanche
- Flèches entre les étapes
- Layout vertical aéré

Si pin_type = "avant_apres" :
- Division en deux zones : AVANT (haut) et APRÈS (bas)
- Tags "AVANT" et "APRÈS" comme badges pilules
- Séparation visuelle : flèche descendante en ${ch.color_primary} ou ligne pointillée
- 3-5 points de comparaison de chaque côté
- AVANT = fond neutre (#F0F0F0), texte atténué
- APRÈS = fond ${ch.color_background}, couleurs vives de la charte
- Icônes ❌ pour AVANT, ✅ pour APRÈS

Si pin_type = "schema_visuel" :
- Titre en haut
- Élément central dans une carte blanche plus grande, relié à 3-6 éléments périphériques
- Connexions : lignes ou flèches en ${ch.color_primary}
- Chaque élément = carte ou badge avec texte court et emoji
- Layout organique mais lisible (pas un simple empilement vertical)
- Peut être : mind map, diagramme en étoile, flow chart, équation visuelle

═══ LISIBILITÉ MOBILE (Pinterest = mobile first) ═══
- Titre principal : min 36px
- Sous-titres : min 24px
- Corps : min 18px
- Badges : min 14px
- Marges latérales : min 40px

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
  "pin_html": "<style>@import url(...);\\n</style><div style=\\"width:1000px;height:1500px;...\\">...</div>",
  "title": "Titre SEO optimisé max 100 caractères",
  "description": "Description SEO 100-200 mots..."
}`;

    const userPrompt = `Génère une épingle Pinterest visuelle pour le sujet suivant.

SUJET : ${subject}
TYPE D'ÉPINGLE : ${pin_type}
${pinterest_link ? `LIEN DE DESTINATION : ${pinterest_link}` : ""}
${pinterest_board ? `TABLEAU : ${pinterest_board}` : ""}

CONTEXTE BRANDING DE L'UTILISATRICE :
${contextText}

CHARTE GRAPHIQUE :
- Couleur principale : ${ch.color_primary}
- Couleur secondaire : ${ch.color_secondary}
- Couleur accent : ${ch.color_accent}
- Fond : ${ch.color_background}
- Texte : ${ch.color_text}
- Police titres : ${ch.font_title}
- Police corps : ${ch.font_body}
- Ambiance : ${ch.mood_keywords}

Retourne UNIQUEMENT le JSON, pas de texte avant ou après.`;

    const model = "claude-opus-4-6" as any;

    const rawResponse = await callAnthropic({
      model,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      temperature: 0.5,
      max_tokens: 8192,
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
      console.error("Failed to parse pinterest-visual response:", rawResponse.slice(0, 500));
      // Fallback: depth-tracking brace matching
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
    if (result?.pin_html) {
      const fontsLink = `<link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(ch.font_title)}:ital,wght@0,400;0,700;1,400&family=${encodeURIComponent(ch.font_body)}:wght@400;500;600;700&display=swap" rel="stylesheet">`;
      let html = result.pin_html;
      html = html.replace(/<style>\s*@import\s+url\([^)]*fonts\.googleapis\.com[^)]*\)\s*;?\s*<\/style>/gi, "");
      result.pin_html = fontsLink + html;
    }

    await logUsage(user.id, "content", "pinterest_visual", undefined, model, workspaceId);

    return new Response(JSON.stringify({ result, remaining: quota.remaining }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("pinterest-visual error:", err);
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
