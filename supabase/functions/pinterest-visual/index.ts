import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
import { callAnthropic, AnthropicError, type AnthropicTool, type UsageSink } from "../_shared/anthropic.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { validateInput, ValidationError } from "../_shared/input-validators.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS } from "../_shared/user-context.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
import { buildPptxInvariants, formatInvariantsForPrompt, NEUTRAL_DEFAULT_PALETTE } from "../_shared/pptx-invariants.ts";
import { assertWorkspaceMembership, workspaceDeniedResponse } from "../_shared/workspace-guard.ts";
import { enforceTextContrast } from "../_shared/contrast-guard.ts";
import { enforceGlobalMinFontSize } from "../_shared/font-size-guard.ts";

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

    const rateCheck = checkRateLimit(user.id);
    if (!rateCheck.allowed) return rateLimitResponse(rateCheck.retryAfterMs!, corsHeaders);

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

    const reqBody = await req.json();
    validateInput(reqBody, z.object({
      subject: z.string().min(1).max(15000),
      pin_type: z.enum(["infographie", "checklist", "mini_tuto", "avant_apres", "schema_visuel"]),
      pinterest_link: z.string().max(500).optional().nullable(),
      pinterest_board: z.string().max(200).optional().nullable(),
      workspace_id: z.string().uuid().optional().nullable(),
      reference_image_base64: z.string().max(10000000).optional().nullable(),
    }).passthrough());

    const membership = await assertWorkspaceMembership(sbAdmin, user.id, reqBody.workspace_id);
    if (!membership.ok) {
      console.warn("[workspace-guard] denied", { userId: user.id, workspaceId: reqBody.workspace_id });
      return workspaceDeniedResponse(corsHeaders);
    }

    const { subject, pin_type, pinterest_link, pinterest_board } = reqBody;
    const filterWs = reqBody.workspace_id || workspaceId;

    const quota = await checkQuota(user.id, "content", filterWs);
    if (!quota.allowed) {
      return new Response(JSON.stringify({ error: quota.message, quota }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch context and charter in parallel
    const col = filterWs ? "workspace_id" : "user_id";
    const val = filterWs || user.id;

    const [ctx, charterRes, brandProfileRes] = await Promise.all([
      getUserContext(sbAdmin, user.id, filterWs),
      sbAdmin
        .from("brand_charter")
        .select("color_primary, color_secondary, color_accent, color_background, color_text, font_title, font_body, mood_keywords, border_radius, photo_style, visual_donts, ai_generated_brief, moodboard_description, icon_style, template_layout_description")
        .eq(col, val)
        .maybeSingle(),
      sbAdmin
        .from("brand_profile")
        .select("tone_register")
        .eq(col, val)
        .maybeSingle(),
    ]);

    const contextText = formatContextForAI(ctx, CONTEXT_PRESETS.pinterest);
    const charter = charterRes.data || {};
    const brandProfile = brandProfileRes.data || null;

    const ch = {
      // Défauts alignés sur NEUTRAL_DEFAULT_PALETTE (source unique avec les
      // invariants PPTX) — sinon charte vide = deux palettes dans le même prompt.
      color_primary: charter.color_primary || NEUTRAL_DEFAULT_PALETTE.primary,
      color_secondary: charter.color_secondary || NEUTRAL_DEFAULT_PALETTE.secondary,
      color_accent: charter.color_accent || NEUTRAL_DEFAULT_PALETTE.accent,
      color_background: charter.color_background || NEUTRAL_DEFAULT_PALETTE.background,
      color_text: charter.color_text || NEUTRAL_DEFAULT_PALETTE.text,
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

    // Invariants PPTX (charte + identité). Pinterest n'a qu'une slide,
    // donc on annonce juste le motif/palette/typo pour aligner HTML preview et export.
    const invariants = buildPptxInvariants({ charter, brandProfile });
    const invariantsBlock = formatInvariantsForPrompt(invariants);

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
- Taille : 56-68px pour le titre principal, 32-40px pour les sous-titres
- Couleur : ${ch.color_secondary} ou ${ch.color_text}

CORPS DE TEXTE :
- Font : ${ch.font_body}, font-weight: 400
- Taille : 30-36px
- Couleur : ${ch.color_text}
- Line-height : 1.6

BADGES "PILULES" (élément signature) :
- Display: inline-block
- Background : ${ch.color_primary}
- Color: white, font-family: ${ch.font_body}, font-weight: 600
- Font-size: 20-24px, text-transform: uppercase, letter-spacing: 2px
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


═══ IMAGE DE RÉFÉRENCE ═══
${reqBody.reference_image_base64 ? `Une image d'épingle Pinterest est fournie comme inspiration.
ANALYSE sa structure (disposition des éléments, hiérarchie, nombre de blocs, densité).
REPRODUIS cette structure et ce layout, mais avec :
- Le nouveau contenu (sujet fourni)
- La charte graphique de l'utilisatrice (couleurs, polices)
- Le design system Nowadays (badges pilules, cartes blanches, etc.)
Tu ne copies PAS le contenu ni les couleurs de la référence. Tu copies sa STRUCTURE et son LAYOUT.
` : ""}
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
- Titre principal : min 48px
- Sous-titres : min 32px
- Corps : min 28px
- Badges : min 20px
- Marges latérales : min 40px
- Une épingle se lit dans un feed mobile à ~200px de large : tout texte sous ces minima est ILLISIBLE. En cas de doute, plus grand.

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

${invariantsBlock}

Tu réponds via l'outil save_pinterest_pin (le schéma de l'outil est le contrat de sortie).

RÈGLES pour pin_data.elements :
- Pour "infographie" et "mini_tuto" : chaque élément a number, label, description, emoji optionnel
- Pour "checklist" : chaque élément a label (le texte de l'item), number pour l'ordre
- Pour "avant_apres" : chaque élément a label, side ("before" ou "after"), emoji optionnel (❌ pour before, ✅ pour after)
- Pour "schema_visuel" : le premier élément (number=0) est l'élément central, les suivants sont périphériques

Le pin_data DOIT être cohérent avec le pin_html (mêmes textes, même structure). C'est une version structurée du même contenu.`;

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

Réponds en appelant l'outil save_pinterest_pin.`;

    // Sortie structurée par tool forcé (leçon audit formats : le schéma DEVIENT le
    // contrat). Élimine le JSON tronqué/illisible qui faisait perdre le visuel
    // (1 crédit facturé pour un résultat partiel) : troncature → erreur 422 propre
    // AVANT logUsage, et l'input du tool est du JSON valide par construction.
    const PIN_TOOL: AnthropicTool = {
      name: "save_pinterest_pin",
      description: "Enregistre l'épingle Pinterest générée (visuel HTML + SEO + version structurée)",
      input_schema: {
        type: "object",
        properties: {
          pin_html: {
            type: "string",
            description:
              "HTML complet et autonome du visuel 1000×1500px, CSS 100% inline, commençant par <style>@import Google Fonts</style>",
          },
          title: { type: "string", description: "Titre SEO Pinterest, max 100 caractères" },
          description: { type: "string", description: "Description SEO 100-200 mots, 2-3 paragraphes" },
          pin_data: {
            type: "object",
            description:
              "Version structurée du MÊME contenu que pin_html (mêmes textes, même structure) — sert à l'export PPTX éditable",
            properties: {
              pin_type: {
                type: "string",
                enum: ["infographie", "checklist", "mini_tuto", "avant_apres", "schema_visuel"],
              },
              main_title: { type: "string", description: "Le titre affiché sur le visuel" },
              badge_label: { type: "string", description: "TUTO, CHECKLIST, INFOGRAPHIE, AVANT / APRÈS…" },
              elements: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    number: { type: "number" },
                    label: { type: "string", description: "Titre court de l'élément" },
                    description: { type: "string", description: "Description en 1-2 lignes" },
                    emoji: { type: "string" },
                    side: { type: "string", enum: ["before", "after"] },
                  },
                  required: ["label"],
                },
              },
              cta_text: { type: "string", description: "Texte du CTA en bas si applicable" },
              watermark: { type: "string", description: "Watermark en bas (nom du projet)" },
            },
            required: ["pin_type", "main_title", "elements"],
          },
        },
        required: ["pin_html", "title", "description", "pin_data"],
      },
    };

    const model = "claude-opus-4-8" as any;
    const hasReference = !!reqBody.reference_image_base64;

    let messages: any[];
    if (hasReference) {
      const rawBase64 = reqBody.reference_image_base64.replace(/^data:image\/[a-z]+;base64,/, "");
      messages = [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/jpeg", data: rawBase64 }
          },
          {
            type: "text",
            text: `Voici l'épingle Pinterest de référence. Inspire-toi de sa structure.\n\n${userPrompt}`
          }
        ]
      }];
    } else {
      messages = [{ role: "user", content: userPrompt }];
    }

    const usage: UsageSink = {};
    // max_tokens 8192 → 16384 : un pin_html dense + pin_data dépassait le plafond
    // (JSON amputé). 16K reste sûr sans streaming ; au-delà, callAnthropic lève
    // désormais une 422 « génération coupée » au lieu de renvoyer un JSON tronqué.
    const rawResponse = await callAnthropic({
      model,
      system: systemPrompt,
      messages,
      temperature: 0.5,
      max_tokens: 16384,
      abortTimeoutMs: 120_000,
      tool: PIN_TOOL,
    }, usage);

    // Tool forcé : rawResponse = JSON.stringify(input) → valide par construction.
    let result: any;
    try {
      result = JSON.parse(rawResponse);
    } catch {
      console.error("Failed to parse pinterest-visual tool input:", rawResponse.slice(0, 500));
      throw new AnthropicError("L'IA n'a pas retourné un format valide. Réessaie.", 502);
    }

    // Post-processing: replace @import Google Fonts with <link> for iframe compatibility
    if (result?.pin_html) {
      const fontsLink = `<link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(ch.font_title)}:ital,wght@0,400;0,700;1,400&family=${encodeURIComponent(ch.font_body)}:wght@400;500;600;700&display=swap" rel="stylesheet">`;
      let html = result.pin_html;
      // Retirer le @import Google Fonts OÙ QU'IL SOIT (nu ou dans un <style> plus
      // large) — sinon il fuite en TEXTE VISIBLE quand le modèle oublie le wrapper
      // <style>. La police reste fournie par le <link> ci-dessous.
      html = html
        .replace(/@import\s+url\(\s*['"]?[^)]*fonts\.googleapis\.com[^)]*['"]?\s*\)\s*;?/gi, "")
        .replace(/<style>\s*<\/style>/gi, "");
      // Gardes DÉTERMINISTES (mêmes parades que carousel-visual) : contraste
      // texte/fond, puis plancher GLOBAL de taille — le HTML d'épingle n'a pas
      // de rôles data-pptx-editable, on borne donc tout texte inline (les
      // décoratifs aria-hidden / opacity < 0.7 comme le watermark sont exemptés).
      const contrast = enforceTextContrast(html);
      const fontFloor = enforceGlobalMinFontSize(contrast.html, 20);
      if (contrast.fixes > 0 || fontFloor.fixes > 0) {
        console.warn(`pinterest-visual: gardes déterministes — ${contrast.fixes} contraste, ${fontFloor.fixes} font-size sous plancher`);
      }
      result.pin_html = fontsLink + fontFloor.html;
    }

    // Invariants : toujours les valeurs SERVEUR (déterministe). On ne les demande
    // plus au modèle — personne ne lisait sa version côté front, et ça allégeait
    // d'autant la sortie (moins de risque de troncature).
    if (result) {
      result.pin_invariants = {
        palette_used: {
          primary: invariants.palette.primary_hex,
          secondary: invariants.palette.secondary_hex,
          accent: invariants.palette.accent_hex,
          bg: invariants.palette.bg_hex,
          text: invariants.palette.text_hex,
        },
        typography_used: {
          title_pptx_safe: invariants.typography.title_pptx_safe,
          body_pptx_safe: invariants.typography.body_pptx_safe,
          title_pt: invariants.typography.title_pt,
          body_pt: invariants.typography.body_pt,
        },
        motif: invariants.motif,
      };
    }

    await logUsage(user.id, "content", "pinterest_visual", usage.total_tokens, usage.model, filterWs);

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
    // Erreurs IA typées (troncature 422, surcharge, réponse vide…) : message clair
    // pour l'utilisatrice au lieu du 500 générique — et logUsage n'a PAS tourné,
    // donc l'échec n'est pas facturé.
    if (err instanceof AnthropicError) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: err.status >= 500 ? 502 : err.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "Erreur interne du serveur" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
