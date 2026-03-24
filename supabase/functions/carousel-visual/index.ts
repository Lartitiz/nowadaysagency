import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
import { callAnthropic, type AnthropicModel } from "../_shared/anthropic.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { validateInput, ValidationError } from "../_shared/input-validators.ts";

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
    const ownerWorkspaceId = wsMember?.workspace_id;

    const quota = await checkQuota(user.id, "content", ownerWorkspaceId);
    if (!quota.allowed) {
      return new Response(JSON.stringify({ error: quota.message, quota }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const reqBody = await req.json();
    validateInput(reqBody, z.object({
      slides: z.array(z.record(z.unknown())).min(1, "Aucune slide fournie").max(20),
      template_style: z.string().max(100).optional().nullable(),
      charter: z.record(z.unknown()).optional().nullable(),
      custom_overrides: z.record(z.unknown()).optional().nullable(),
      template_reference_urls: z.array(z.string().url()).max(5).optional().nullable(),
      photos: z.array(z.object({ base64: z.string() })).max(10).optional(),
      carousel_type: z.string().max(50).optional().nullable(),
      workspace_id: z.string().uuid().optional().nullable(),
    }).passthrough());
    const { slides, template_style, charter: bodyCharter, custom_overrides, template_reference_urls } = reqBody;

    // Priority: body workspace_id > owner lookup
    const workspaceId = reqBody.workspace_id || ownerWorkspaceId;

    // Resolve charter: use body or fetch from DB
    let charter = bodyCharter;
    if (!charter) {
      const col = workspaceId ? "workspace_id" : "user_id";
      const val = workspaceId || user.id;
      const { data: dbCharter } = await sbAdmin
        .from("brand_charter")
        .select("color_primary, color_secondary, color_accent, color_background, color_text, font_title, font_body, mood_keywords, border_radius, uploaded_templates, photo_style, visual_donts, ai_generated_brief, moodboard_description, icon_style, template_layout_description")
        .eq(col, val)
        .maybeSingle();
      charter = dbCharter || {};
    }

    const ch = {
      color_primary: charter.color_primary || "#FB3D80",
      color_secondary: charter.color_secondary || "#91014b",
      color_accent: charter.color_accent || "#FFE561",
      color_background: charter.color_background || "#FFF4F8",
      color_text: charter.color_text || "#1A1A2E",
      font_title: charter.font_title || "Libre Baskerville",
      font_body: charter.font_body || "IBM Plex Mono",
      mood_keywords: Array.isArray(charter.mood_keywords) ? charter.mood_keywords.join(", ") : (charter.mood_keywords || "pop, joyeux, audacieux, art contemporain"),
      border_radius: charter.border_radius || "12px",
      photo_style: charter.photo_style || "",
      visual_donts: charter.visual_donts || "",
      ai_generated_brief: charter.ai_generated_brief || "",
      moodboard_description: charter.moodboard_description || "",
      icon_style: charter.icon_style || "",
      template_layout_description: charter.template_layout_description || "",
    };

    // Sanitize font names — certains caractères peuvent casser l'URL Google Fonts ou le HTML
    const safeFontTitle = ch.font_title.replace(/[<>"'&]/g, "");
    const safeFontBody = ch.font_body.replace(/[<>"'&]/g, "");

    // Tronquer les champs textuels longs pour éviter un system prompt trop gros
    const MAX_BRIEF = 2000;
    const MAX_LAYOUT_DESC = 1500;
    const MAX_MOODBOARD = 1000;
    if (ch.ai_generated_brief.length > MAX_BRIEF) {
      ch.ai_generated_brief = ch.ai_generated_brief.slice(0, MAX_BRIEF) + "…";
      console.warn("carousel-visual: ai_generated_brief tronqué");
    }
    if (ch.template_layout_description.length > MAX_LAYOUT_DESC) {
      ch.template_layout_description = ch.template_layout_description.slice(0, MAX_LAYOUT_DESC) + "…";
      console.warn("carousel-visual: template_layout_description tronqué");
    }
    if (ch.moodboard_description.length > MAX_MOODBOARD) {
      ch.moodboard_description = ch.moodboard_description.slice(0, MAX_MOODBOARD) + "…";
      console.warn("carousel-visual: moodboard_description tronqué");
    }

    // Diagnostic log — contexte utilisateur pour débug
    console.log(JSON.stringify({
      type: "carousel_visual_context",
      user_id: user.id,
      has_charter: !!bodyCharter || !!charter,
      font_title: ch.font_title,
      font_body: ch.font_body,
      has_uploaded_templates: Array.isArray(charter.uploaded_templates) && charter.uploaded_templates.length > 0,
      uploaded_templates_count: Array.isArray(charter.uploaded_templates) ? charter.uploaded_templates.length : 0,
      has_ai_brief: !!ch.ai_generated_brief,
      ai_brief_length: ch.ai_generated_brief?.length || 0,
      has_template_layout: !!ch.template_layout_description,
      template_layout_length: ch.template_layout_description?.length || 0,
      has_moodboard: !!ch.moodboard_description,
      moodboard_length: ch.moodboard_description?.length || 0,
      timestamp: new Date().toISOString(),
    }));

    // Extract uploaded template URLs for charter_reference mode
    const uploadedTemplates: { url: string; name: string }[] = Array.isArray(charter.uploaded_templates) ? charter.uploaded_templates : [];

    // Auto-detect: if user has uploaded templates in their charter, use charter_reference mode
    const hasUploadedTemplates = uploadedTemplates.length > 0;
    const templateUrls = template_reference_urls?.length
      ? template_reference_urls
      : hasUploadedTemplates
        ? uploadedTemplates.map((t: any) => typeof t === "string" ? t : t.url).filter(Boolean)
        : [];

    const style = (templateUrls.length > 0) ? "charter_reference" : (template_style || "clean");
    const isCharterRef = style === "charter_reference" && templateUrls.length > 0;

    // Build the template style instructions
    let styleInstructions = "";
    if (isCharterRef) {
      styleInstructions = `STYLE : 'charter_reference'
L'utilisatrice a fourni un ou plusieurs de ses propres templates comme référence visuelle.
Tu dois ANALYSER L'IMAGE du template fourni et REPRODUIRE FIDÈLEMENT :
- La mise en page (disposition des éléments, marges, alignements)
- Le style typographique (tailles relatives, graisses, casses)
- Les éléments décoratifs (formes, lignes, icônes stylisés)
- L'ambiance générale (couleurs, contrastes, espaces)
- Le ratio texte/espace vide

IMPORTANT : Tu ne copies PAS le contenu du template, tu copies SON DESIGN. Applique ce design aux nouvelles slides avec le contenu fourni.
Utilise les couleurs de la charte graphique ci-dessous mais en respectant les proportions et contrastes du template de référence.`;
    } else {
      styleInstructions = `STYLE DE TEMPLATE DEMANDÉ : ${style}
Adapte le design system ci-dessus au style "${style}". Le style influence l'ambiance mais les règles de design (padding, fonts, badges, barres latérales) restent les mêmes.`;
    }

    const systemPrompt = `Tu es une directrice artistique experte en design de carrousels Instagram. Tu génères du HTML/CSS inline pour des slides au format 1080×1350px.

Tu dois produire des slides qui ressemblent à du design professionnel fait sur Figma ou Canva Pro, PAS à du texte centré sur un fond de couleur.

═══ RÈGLES HTML/CSS STRICTES ═══
- Chaque slide = un <div> EXACTEMENT 1080px × 1350px
- CSS 100% inline (pas de classes CSS)
- CHAQUE slide commence par une balise @import Google Fonts :
  <style>@import url('https://fonts.googleapis.com/css2?family=${encodeURIComponent(safeFontTitle)}:ital,wght@0,400;0,700;1,400&family=${encodeURIComponent(safeFontBody)}:wght@400;500;600;700&display=swap');</style>
- HTML complet et autonome (chaque slide rendable seule dans un navigateur)
- Pas de JavaScript
- JAMAIS de cercle, rond, ou border-radius: 50% en élément décoratif de fond

═══ CHARTE GRAPHIQUE ═══
Couleur principale : ${ch.color_primary}
Couleur secondaire (titres foncés) : ${ch.color_secondary}
Couleur accent (highlights) : ${ch.color_accent}
Fond par défaut : ${ch.color_background}
Texte : ${ch.color_text}
Police titres : ${ch.font_title} (JAMAIS en font-weight bold, toujours normal/400)
Police corps : ${ch.font_body}
Ambiance : ${ch.mood_keywords}
Border-radius : ${ch.border_radius}${ch.photo_style ? `\nStyle photo / ambiance visuelle : ${ch.photo_style}` : ""}${ch.visual_donts ? `\n\n⛔ INTERDITS VISUELS (l'utilisatrice a EXPLICITEMENT interdit ces éléments) :\n${ch.visual_donts}` : ""}${ch.ai_generated_brief ? `\n\nBRIEF CRÉATIF DE LA MARQUE :\n${ch.ai_generated_brief}` : ""}${ch.moodboard_description ? `\n\nAMBIANCE MOODBOARD :\n${ch.moodboard_description}` : ""}${ch.icon_style ? `\nStyle d'icônes : ${ch.icon_style}` : ""}${ch.template_layout_description ? `\n\n═══ LAYOUT DE RÉFÉRENCE (des templates uploadés par l'utilisatrice) ═══\n${ch.template_layout_description}\n\nIMPORTANT : Inspire-toi de ce layout pour le placement des éléments, le style des blocs, l'alternance des mises en page. Adapte-le au contenu de chaque slide.` : ""}

═══ DESIGN SYSTEM — VALEURS CSS CONCRÈTES ═══

PADDING : 80px sur les côtés, 60px en haut et en bas. JAMAIS de texte collé aux bords.

TITRES (headlines) :
- Font : ${ch.font_title}, font-weight: normal (JAMAIS bold), font-style: normal
- Taille : 52-64px pour le hook (slide 1), 42-52px pour les autres slides
- Couleur : ${ch.color_secondary} ou ${ch.color_text}
- Line-height : 1.25
- Certains MOTS-CLÉS en couleur accent ${ch.color_primary} et font-style: italic pour créer du contraste

CORPS DE TEXTE :
- Font : ${ch.font_body}, font-weight: 400
- Taille : 28-32px
- Couleur : ${ch.color_text}
- Line-height : 1.6
- Opacity: 0.85 pour le texte secondaire

BADGES "PILULES" (élément signature) :
- Display: inline-block
- Background : ${ch.color_primary}
- Color: white, font-family: ${ch.font_body}, font-weight: 600
- Font-size: 18-22px, text-transform: uppercase, letter-spacing: 2px
- Padding: 8px 24px
- Border-radius: 100px (pilule)
- Utilise-les pour : numéro de slide, catégorie, label de section

CARTES BLANCHES (pour les blocs de contenu) :
- Background: #FFFFFF
- Border-radius: ${ch.border_radius}
- Box-shadow: 0 4px 24px rgba(0,0,0,0.06)
- Padding: 40px
- Optionnel : border-left: 4px solid [couleur accent] pour une barre latérale colorée

BORDURES POINTILLÉES (pour les encadrés, citations, analogies) :
- Border: 2px dashed ${ch.color_primary}40 (avec transparence)
- Border-radius: ${ch.border_radius}
- Padding: 30px

ÉLÉMENTS DÉCORATIFS AUTORISÉS :
- Rectangles arrondis (border-radius: ${ch.border_radius}), lignes, traits
- Petites vagues/zigzags en SVG inline
- Flèches → en ${ch.color_primary}
- Soulignements colorés sous les mots-clés (border-bottom ou background linear-gradient)
- Emojis comme éléments visuels (taille 48-64px)
- JAMAIS de cercles/ronds comme décoration de fond

ESPACEMENT VERTICAL :
- Titre → corps : 32px de gap
- Entre les blocs : 40px

CENTRAGE VERTICAL (OBLIGATOIRE sur CHAQUE slide) :
Le <div> principal de 1080×1350px DOIT TOUJOURS avoir ces styles :
display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 80px;
Le contenu doit être visuellement CENTRÉ au milieu de la slide.
JAMAIS de contenu collé en bas ou en haut. Si tu vois du vide en haut ou en bas, c'est que le centrage manque.
C'est la règle la plus importante du design system.

═══ DESIGN PAR RÔLE DE SLIDE ═══

HOOK (slide 1) — Design le plus fort, stoppe le scroll :
- Fond : ${ch.color_background} ou blanc
- Grande carte blanche centrée avec ombre douce, coins arrondis
- Titre très grand (60-68px) à l'intérieur de la carte
- 1-2 mots-clés en ${ch.color_primary} italic pour créer le contraste
- Petit badge pilule en haut de la carte avec le thème ou le numéro
- Beaucoup d'espace vide autour de la carte (la carte ne prend que ~70% de la slide)
- Optionnel : motif décoratif subtil en fond (lignes, zigzag, pas de ronds)

CONTEXTE / STORYTELLING (slide 2) — Personnel, immersif :
- Fond : blanc ou ${ch.color_background}
- Titre en ${ch.font_title} (42-48px)
- Corps en ${ch.font_body} avec un ton intime
- Optionnel : bordure pointillée autour du bloc de texte
- Optionnel : petit emoji en grand (48px) comme élément visuel

TIPS / CONTENU PÉDAGOGIQUE (slides du milieu) — Clair, structuré :
- Fond : blanc
- Badge pilule en haut à gauche avec le numéro ou label ("Astuce 1", "Le piège", etc.)
- Titre headline en ${ch.font_title} (42-48px), couleur ${ch.color_secondary}
- Corps du tip en ${ch.font_body} (28-30px)
- Barre accent latérale colorée (4px solid) à gauche du bloc de texte
- Un mot-clé souligné en ${ch.color_accent} (soulignement jaune type highlighter)
- Alterner les couleurs d'accent entre les slides pour la variété : ${ch.color_primary}, bleu #3498db, vert #27AE60, orange #E67E22, violet #9B59B6

SLIDE SÉPARATEUR (optionnelle, entre les blocs) — Rupture visuelle :
- Fond : ${ch.color_primary} (rose vif, plein)
- Titre en BLANC, ${ch.font_title}, 56px, centré
- Pas de body, juste le titre
- Optionnel : numéro de bloc en très grand (200px) coupé en bas de slide, opacity 0.15

DARK BOX (pour les punchlines fortes) :
- Fond : #1A1A1A
- Texte blanc en ${ch.font_title} (48px)
- Un mot en ${ch.color_accent} (jaune) pour le contraste
- Padding généreux (80px)

CTA (dernière slide) — Douce, invitante :
- Fond : ${ch.color_background}
- Carte blanche centrée
- Texte du CTA en ${ch.font_title} (38-44px), couleur ${ch.color_primary}
- Badge pilule dessous avec "lien en bio" ou le CTA court
- Ambiance chaleureuse, pas commerciale
- Optionnel : petits badges de compétences/thèmes dispersés autour de la carte principale

═══ COHÉRENCE ENTRE LES SLIDES ═══
- TOUTES les slides utilisent les MÊMES fonts (${ch.font_title} pour les titres, ${ch.font_body} pour le corps)
- Le padding latéral est IDENTIQUE sur toutes les slides (80px)
- Les badges pilules ont le MÊME style partout
- Le fond ALTERNE entre : blanc, ${ch.color_background}, et ponctuellement ${ch.color_primary} (max 1-2 slides en fond coloré plein)
- La hiérarchie titre/corps est CONSTANTE : le titre est toujours plus grand, toujours en ${ch.font_title}
- Les éléments décoratifs (barres, soulignements) utilisent une palette cohérente

═══ ANTI-PATTERNS — CE QUE TU NE FAIS JAMAIS ═══
- ❌ Texte centré nu sur un fond de couleur uni (c'est un PowerPoint 2003, pas du design)
- ❌ Toutes les slides avec le même layout (il faut de la variété visuelle)
- ❌ Texte trop petit (<26px) ou trop gros (>72px sauf numéros décoratifs)
- ❌ Pas de padding (texte qui touche les bords)
- ❌ Cercles ou ronds comme éléments décoratifs
- ❌ Font-weight bold sur ${ch.font_title} (toujours normal)
- ❌ Couleurs qui ne sont pas dans la charte
- ❌ Plus de 3 couleurs de fond différentes dans tout le carrousel

═══ SCHÉMAS VISUELS — TEMPLATES HTML/CSS ═══

Certaines slides contiennent un champ "visual_schema" avec des données structurées. Tu DOIS les rendre comme des schémas visuels en HTML/CSS, PAS comme du texte simple.

Voici le design pour chaque type :

█ BEFORE_AFTER — Deux colonnes côte à côte
<div style="display:flex;gap:24px;width:100%">
  <div style="flex:1;background:#FFF;border-radius:12px;padding:32px;border-left:4px solid #E74C3C">
    <p style="font-size:22px;font-weight:600;color:#E74C3C;margin-bottom:16px">❌ AVANT_LABEL</p>
    <!-- items en <p> avec une puce rouge -->
  </div>
  <div style="flex:1;background:#FFF;border-radius:12px;padding:32px;border-left:4px solid #27AE60">
    <p style="font-size:22px;font-weight:600;color:#27AE60;margin-bottom:16px">✅ APRÈS_LABEL</p>
    <!-- items en <p> avec une puce verte -->
  </div>
</div>

█ COMPARISON — Similaire mais avec les couleurs/labels du schema
Même structure que before_after mais avec les labels et couleurs du champ left/right.

█ TIMELINE — Ligne verticale avec des étapes
<div style="position:relative;padding-left:60px">
  <div style="position:absolute;left:24px;top:0;bottom:0;width:3px;background:linear-gradient(to bottom, ${ch.color_primary}, ${ch.color_accent})"></div>
  <!-- Pour chaque step : cercle numéroté + label + desc -->
</div>

█ CHECKLIST — Liste avec des badges ✅/❌
Pour chaque item :
<div style="display:flex;align-items:center;gap:16px;padding:16px 24px;background:#FFF;border-radius:12px;margin-bottom:12px;box-shadow:0 2px 8px rgba(0,0,0,0.04)">
  <span style="font-size:28px">✅ ou ❌</span>
  <p style="font-size:24px;color:${ch.color_text}">TEXTE</p>
</div>

█ STATS — Gros chiffres avec labels
Pour chaque stat :
<div style="text-align:center;padding:24px">
  <p style="font-size:80px;font-weight:700;color:${ch.color_primary};line-height:1">73%</p>
  <p style="font-size:22px;color:${ch.color_text};margin-top:8px;opacity:0.8">description</p>
</div>
Dispose 2-3 stats en flex row avec des séparateurs visuels.

█ MATRIX_2X2 — Grille 2×2 avec axes
<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
  <div style="background:${ch.color_primary}15;border-radius:12px;padding:24px;text-align:center">
    <span style="font-size:40px">EMOJI</span>
    <p style="font-size:22px;font-weight:600;margin-top:8px">LABEL</p>
  </div>
</div>
Ajoute les labels d'axes autour de la grille.

█ PYRAMID — Niveaux empilés (le plus large en bas)
Le sommet = 50% de largeur, la base = 100%. Couleurs du plus foncé (sommet) au plus clair (base).

█ EQUATION — A + B = C
<div style="display:flex;align-items:center;justify-content:center;gap:24px">
  <div style="background:#FFF;border-radius:12px;padding:24px 32px;box-shadow:0 2px 12px rgba(0,0,0,0.06);text-align:center">
    <p style="font-size:28px;font-weight:600;color:${ch.color_secondary}">A</p>
  </div>
  <span style="font-size:48px;color:${ch.color_primary}">+</span>
  <!-- ... -->
  <span style="font-size:48px;color:${ch.color_primary}">=</span>
  <div style="background:${ch.color_primary};border-radius:12px;padding:24px 32px;text-align:center">
    <p style="font-size:28px;font-weight:600;color:white">C</p>
  </div>
</div>

█ FLOWCHART — Arbre de décision
Question en pilule ${ch.color_primary}, branches avec lignes verticales, résultats en cartes colorées.

█ SCALE — Barre de gradient avec marqueur
<div style="position:relative;height:60px;background:linear-gradient(to right, #E74C3C, #F39C12, #27AE60);border-radius:30px;margin:40px 0">
  <div style="position:absolute;left:POSITION%;top:-20px;transform:translateX(-50%)">👆 LABEL</div>
</div>

█ ICON_GRID — Grille d'emojis avec labels
<div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:24px">
  <div style="text-align:center;background:#FFF;border-radius:12px;padding:24px;box-shadow:0 2px 8px rgba(0,0,0,0.04)">
    <span style="font-size:48px;display:block;margin-bottom:8px">EMOJI</span>
    <p style="font-size:20px;font-weight:600;color:${ch.color_secondary}">LABEL</p>
  </div>
</div>

IMPORTANT pour les schémas :
- Utilise les vraies couleurs de la charte (${ch.color_primary}, ${ch.color_secondary}, ${ch.color_accent}, ${ch.color_text})
- Les schémas doivent être CENTRÉS verticalement dans la slide
- Le titre de la slide (s'il existe) reste AU-DESSUS du schéma
- Les schémas doivent respirer : pas de texte trop petit, pas de schéma qui remplit 100% de la slide
- Si une slide a un visual_schema, le design du schéma est PRIORITAIRE sur le design par rôle

${styleInstructions}

Retourne un JSON :
{
  "slides_html": [
    { "slide_number": 1, "html": "<style>@import url(...);</style><div style=\\"width:1080px;height:1350px;...\\">...</div>" },
    { "slide_number": 2, "html": "..." }
  ]
}

IMPORTANT : le HTML de chaque slide doit inclure la balise @import au début
- Varie le design selon le RÔLE de chaque slide (hook, context, tip, separator, cta, etc.)
- Crée une continuité visuelle : mêmes fonts, même padding, palette cohérente
- Intègre les éléments décoratifs : badges pilules, barres latérales, soulignements, emojis
- Le résultat doit ressembler à du design Canva Pro, PAS à du HTML basique

Retourne UNIQUEMENT le JSON, pas de texte avant ou après.`;

    let overrideNote = "";
    if (custom_overrides) {
      if (custom_overrides.slide_bg_override) overrideNote += `\nCouleur de fond custom : ${custom_overrides.slide_bg_override}`;
      if (custom_overrides.text_size) overrideNote += `\nTaille du texte : ${custom_overrides.text_size}`;
    }

    // Build visual hints from visual_suggestion fields
    const visualHints = slides
      .filter((s: any) => s.visual_suggestion)
      .map((s: any) => `- Slide ${s.slide_number}: ${s.visual_suggestion}`)
      .join("\n");

    // Build schema instructions from visual_schema fields
    const schemaSlides = slides.filter((s: any) => s.visual_schema);
    const schemaInstructions = schemaSlides
      .map((s: any) => `- Slide ${s.slide_number} (SCHÉMA type "${s.visual_schema.type}") : ${JSON.stringify(s.visual_schema)}`)
      .join("\n");

    let visualBlock = "";
    if (schemaInstructions) {
      visualBlock += `\n\n🎨 SLIDES AVEC SCHÉMA VISUEL — OBLIGATOIRE, utilise les templates de schéma du design system :\n${schemaInstructions}`;
    }
    if (visualHints) {
      visualBlock += `\n\nINDICATIONS VISUELLES TEXTUELLES (pour les slides SANS schéma) :\n${visualHints}`;
    }

    const userPrompt = `Génère les slides HTML pour ce carrousel.

CONTENU DES SLIDES :
${JSON.stringify(slides, null, 2)}

Template demandé : ${style}${overrideNote}${visualBlock}

RAPPEL : Chaque slide doit avoir un design DIFFÉRENT adapté à son rôle (hook, context, tip, separator, cta). Utilise les éléments du design system : badges pilules, cartes blanches, barres latérales, soulignements colorés, emojis décoratifs. Pour les slides avec visual_schema, rends le schéma en HTML/CSS fidèle aux templates.

Retourne UNIQUEMENT le JSON, pas de texte avant ou après.`;

    // ═══ Determine if photo carousel mode ═══
    const isPhotoCarousel = reqBody.carousel_type === "photo" && reqBody.photos?.length > 0;
    const isMixCarousel = reqBody.carousel_type === "mix" && reqBody.photos?.length > 0;

    let finalSystemPrompt = systemPrompt;
    let finalUserPrompt = userPrompt;

    if (isPhotoCarousel) {
      finalSystemPrompt = `Tu es une directrice artistique experte en design de carrousels Instagram photo. Tu génères du HTML/CSS inline pour des slides au format 1080×1350px.

Chaque slide utilise la PHOTO de l'utilisatrice comme image de fond, et tu poses le texte OVERLAY par-dessus avec sa charte graphique.

═══ RÈGLES HTML/CSS POUR LES PHOTOS ═══
- Chaque slide = un <div> EXACTEMENT 1080px × 1350px
- La photo est en background-image: url() en base64, avec background-size: cover; background-position: center
- CSS 100% inline (pas de classes CSS)
- CHAQUE slide commence par la balise @import Google Fonts :
  <style>@import url('https://fonts.googleapis.com/css2?family=${encodeURIComponent(safeFontTitle)}:ital,wght@0,400;0,700;1,400&family=${encodeURIComponent(safeFontBody)}:wght@400;500;600;700&display=swap');</style>

═══ CHARTE GRAPHIQUE ═══
Couleur principale : ${ch.color_primary}
Couleur secondaire : ${ch.color_secondary}
Couleur accent : ${ch.color_accent}
Fond par défaut : ${ch.color_background}
Texte : ${ch.color_text}
Police titres : ${ch.font_title} (JAMAIS en font-weight bold, toujours normal/400)
Police corps : ${ch.font_body}
Ambiance : ${ch.mood_keywords}
Border-radius : ${ch.border_radius}${ch.visual_donts ? `\n\n⛔ INTERDITS VISUELS :\n${ch.visual_donts}` : ""}${ch.ai_generated_brief ? `\n\nBRIEF CRÉATIF :\n${ch.ai_generated_brief}` : ""}${ch.template_layout_description ? `\n\n═══ LAYOUT DE RÉFÉRENCE (des templates uploadés par l'utilisatrice) ═══\n${ch.template_layout_description}\n\nIMPORTANT : Inspire-toi de ce layout pour le placement des éléments, le ratio photo/texte, le style des blocs. Mais adapte-le au format carrousel photo (1080×1350).` : ""}

═══ DESIGN DES OVERLAYS TEXTE SUR PHOTO ═══

L'overlay_text doit être LISIBLE sur la photo. Utilise UN des styles suivants selon overlay_style :

STYLE "sensoriel" (phrases évocatrices) :
- Position : en bas de la slide (bottom: 0)
- Bandeau gradient : fond linear-gradient(transparent, rgba(0,0,0,0.7)) sur les 40% inférieurs
- Texte : font-family: ${ch.font_title}; font-size: 42-48px; color: white; font-weight: normal; font-style: italic
- Padding : 80px côtés, 60px bas
- Ombre texte subtile : text-shadow: 0 2px 20px rgba(0,0,0,0.5)

STYLE "narratif" (phrases d'histoire) :
- Position : en bas ou au centre selon overlay_position
- Bandeau : background rgba(255,255,255,0.92); border-radius: ${ch.border_radius}; backdrop-filter: blur(8px)
- Texte : font-family: ${ch.font_body}; font-size: 32-36px; color: ${ch.color_text}
- Padding : 28px 40px
- Le bandeau ne fait PAS toute la largeur : max-width: 85%, centré ou aligné

STYLE "minimal" (phrases courtes percutantes) :
- Position : selon overlay_position
- Badge pilule : background ${ch.color_primary}; color white; font-family: ${ch.font_body}; font-size: 24-28px; text-transform: uppercase; letter-spacing: 2px; padding: 12px 32px; border-radius: 100px
- Ou texte nu en blanc très grand (60-72px) avec ombre forte : text-shadow: 0 4px 30px rgba(0,0,0,0.8)

STYLE "technique" (détails produit) :
- Position : coin ou bord selon overlay_position
- Étiquette : background rgba(0,0,0,0.8); color white; font-family: ${ch.font_body}; font-size: 22-26px; padding: 12px 24px; border-radius: 8px
- Look "tag produit" discret mais lisible

QUAND overlay_text est null :
- La photo occupe toute la slide SANS texte
- Background-size: cover, c'est tout

═══ POSITIONS ═══
"bottom_left" : contenu en bas à gauche (align-items: flex-start; justify-content: flex-end)
"bottom_center" : contenu en bas centré (align-items: center; justify-content: flex-end)
"top_left" : contenu en haut à gauche (align-items: flex-start; justify-content: flex-start)
"top_center" : contenu en haut centré (align-items: center; justify-content: flex-start)
"center" : contenu centré (align-items: center; justify-content: center)

═══ ANTI-PATTERNS ═══
- ❌ Texte illisible sur photo claire (TOUJOURS un fond/gradient/ombre)
- ❌ Bandeau qui cache plus de 40% de la photo
- ❌ Texte trop petit (< 22px)
- ❌ Toutes les slides avec le même traitement (varier les styles)
- ❌ Cercles ou ronds décoratifs
- ❌ Font-weight bold sur ${ch.font_title}

Retourne un JSON :
{
  "slides_html": [
    { "slide_number": 1, "html": "<style>@import url(...);</style><div style=\\"width:1080px;height:1350px;...\\">...</div>" }
  ]
}

IMPORTANT : Pour chaque slide, utilise le placeholder {{PHOTO_N}} (où N est le numéro de la slide) dans le background-image.
Exemple pour la slide 1 : background-image: url({{PHOTO_1}})
Exemple pour la slide 3 : background-image: url({{PHOTO_3}})
N'essaie PAS d'écrire le base64 toi-même. Utilise UNIQUEMENT le placeholder {{PHOTO_N}}.
Retourne UNIQUEMENT le JSON, pas de texte avant ou après.`;

      finalUserPrompt = `Génère les slides HTML pour ce carrousel PHOTO.

SLIDES (textes overlay à poser sur les photos) :
${JSON.stringify(slides, null, 2)}

Les photos sont fournies dans l'ordre des slides (photo 1 → slide 1, etc.).
Pour chaque slide, utilise le placeholder {{PHOTO_N}} dans le background-image (ex: slide 1 → {{PHOTO_1}}, slide 2 → {{PHOTO_2}}).
Le placeholder sera automatiquement remplacé par la vraie image.

RAPPEL : Le texte doit être LISIBLE sur chaque photo. Adapte le style d'overlay (gradient sombre, bandeau blanc, badge pilule) selon le style demandé et la luminosité de la photo. Varie les traitements d'une slide à l'autre.

Retourne UNIQUEMENT le JSON.`;
    }

    if (isMixCarousel) {
      finalSystemPrompt = `Tu es une directrice artistique experte en design de carrousels Instagram. Tu génères du HTML/CSS inline pour des slides au format 1080×1350px.

Ce carrousel est un MIX : certaines slides ont des photos, d'autres sont du texte pur. Tu dois adapter le design de CHAQUE slide selon son type.

═══ RÈGLES HTML/CSS STRICTES ═══
- Chaque slide = un <div> EXACTEMENT 1080px × 1350px
- CSS 100% inline (pas de classes CSS)
- CHAQUE slide commence par la balise @import Google Fonts (sera remplacée en post-processing)
- Pas de JavaScript
- JAMAIS de cercle, rond, ou border-radius: 50% en élément décoratif de fond

═══ CHARTE GRAPHIQUE ═══
Couleur principale : ${ch.color_primary}
Couleur secondaire (titres foncés) : ${ch.color_secondary}
Couleur accent (highlights) : ${ch.color_accent}
Fond par défaut : ${ch.color_background}
Texte : ${ch.color_text}
Police titres : ${ch.font_title} (JAMAIS en font-weight bold, toujours normal/400)
Police corps : ${ch.font_body}
Ambiance : ${ch.mood_keywords}
Border-radius : ${ch.border_radius}${ch.photo_style ? `\nStyle photo : ${ch.photo_style}` : ""}${ch.visual_donts ? `\n\n⛔ INTERDITS VISUELS :\n${ch.visual_donts}` : ""}${ch.ai_generated_brief ? `\n\nBRIEF CRÉATIF :\n${ch.ai_generated_brief}` : ""}${ch.template_layout_description ? `\n\n═══ LAYOUT DE RÉFÉRENCE (templates uploadés par l'utilisatrice) ═══\n${ch.template_layout_description}\n\nInspire-toi de ce layout pour le placement des éléments et l'ambiance générale.` : ""}

═══ DESIGN PAR TYPE DE SLIDE ═══

TYPE "photo_full" — Photo plein écran + overlay
- Le div principal a : background-image: url({{PHOTO_N}}); background-size: cover; background-position: center
- Le texte overlay est posé dessus avec un traitement de lisibilité :
  · Style "sensoriel" : gradient sombre en bas (linear-gradient transparent → rgba(0,0,0,0.7)), texte blanc italic en ${ch.font_title}
  · Style "narratif" : bandeau blanc semi-transparent (rgba(255,255,255,0.92), backdrop-filter blur), texte en ${ch.font_body}
  · Style "minimal" : badge pilule ${ch.color_primary} ou texte blanc grand avec ombre forte
- Position selon overlay_position (mais adapter si le sujet principal de la photo est à cet endroit)

TYPE "photo_integrated" — Photo intégrée dans un layout design
- La photo est une balise <img src="{{PHOTO_N}}" style="width:100%;height:auto;object-fit:cover;border-radius:${ch.border_radius}">
- Layouts selon photo_layout :
  · "top_photo" : photo en haut (55-60% de la hauteur), texte en bas sur fond ${ch.color_background} ou blanc. La photo a des coins arrondis en haut, le texte est dans une zone avec padding 40px.
  · "left_photo" : 2 colonnes flex. Photo à gauche (40%), texte à droite (60%) avec padding. Hauteur complète.
  · "right_photo" : inverse. Texte à gauche, photo à droite.
  · "card_photo" : fond ${ch.color_background}. Carte blanche centrée avec la photo en haut (border-radius haut) et le texte en bas. La carte fait ~85% de la largeur.
  · "banner_photo" : photo en bandeau horizontal (height: 400px, object-fit cover) + titre et body en dessous avec padding.
- Le texte utilise le design system : ${ch.font_title} pour les titres, ${ch.font_body} pour le corps, badges pilules, barres latérales colorées.

TYPE "text_only" — Slide texte pure
- Design system Nowadays classique (identique aux carrousels texte).
- Fond ${ch.color_background} ou blanc.
- Cartes blanches, badges pilules, barres latérales, soulignements colorés.
- Si visual_schema est fourni, rendre le schéma en HTML/CSS.

═══ COHÉRENCE ENTRE LES TYPES ═══
- TOUTES les slides (quel que soit le type) utilisent les mêmes fonts, la même palette, les mêmes badges
- Le padding latéral est constant (80px pour text_only et photo_integrated, adapté pour photo_full)
- L'alternance des types crée un rythme visuel agréable
- Les slides photo_integrated font la TRANSITION entre les slides photo_full et text_only

═══ PLACEHOLDERS PHOTOS ═══
Pour chaque slide qui utilise une photo :
- photo_full : background-image: url({{PHOTO_N}})
- photo_integrated : <img src="{{PHOTO_N}}">
N = le photo_index de la slide (1, 2, 3...)
N'essaie PAS d'écrire le base64. Le placeholder sera remplacé automatiquement.

═══ ANTI-PATTERNS ═══
- ❌ Texte illisible sur photo (TOUJOURS un traitement : gradient, bandeau, ombre)
- ❌ Photo déformée (TOUJOURS object-fit: cover)
- ❌ Toutes les slides avec le même layout
- ❌ Photo intégrée trop petite (minimum 40% de la surface de la slide)
- ❌ Cercles ou ronds décoratifs
- ❌ Font-weight bold sur ${ch.font_title}

Retourne un JSON :
{
  "slides_html": [
    { "slide_number": 1, "html": "..." }
  ]
}

Retourne UNIQUEMENT le JSON, pas de texte avant ou après.`;

      finalUserPrompt = `Génère les slides HTML pour ce carrousel MIXTE.

SLIDES :
${JSON.stringify(slides, null, 2)}

Les photos sont fournies dans l'ordre (photo 1, photo 2, etc.).
Pour les slides de type "photo_full", utilise background-image: url({{PHOTO_N}}).
Pour les slides de type "photo_integrated", utilise <img src="{{PHOTO_N}}">.
Pour les slides de type "text_only", pas de photo.

Adapte le design de CHAQUE slide à son type. Crée une continuité visuelle entre les trois types.

Retourne UNIQUEMENT le JSON.`;
    }

    // Build messages - include template reference image if available
    const messages: any[] = [];

    if (isPhotoCarousel || isMixCarousel) {
      // Mode photo/mix : envoyer chaque photo en vision
      const messageContent: any[] = [];
      for (let i = 0; i < reqBody.photos.length; i++) {
        const photo = reqBody.photos[i];
        if (photo.base64) {
          // Strip data URL prefix if present (Anthropic expects raw base64)
          const rawBase64 = photo.base64.replace(/^data:image\/[a-z]+;base64,/, "");
          messageContent.push({
            type: "image",
            source: { type: "base64", media_type: "image/jpeg", data: rawBase64 }
          });
          messageContent.push({
            type: "text",
            text: `↑ Photo ${i + 1} (pour slide ${i + 1})`
          });
        }
      }
      messageContent.push({ type: "text", text: finalUserPrompt });
      messages.push({ role: "user", content: messageContent });
    } else {
      // Mode texte existant
    const imageExtensions = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"];
    const isImageUrl = (url: string) => {
      const lower = url.toLowerCase().split("?")[0];
      return imageExtensions.some(ext => lower.endsWith(ext));
    };

    if (isCharterRef && templateUrls.length > 0) {
      // Filter to only image URLs (exclude PDFs and other unsupported formats)
      const imageUrls = templateUrls.filter((u: string) => isImageUrl(u));
      
      // Vérifier que les URLs sont accessibles (signed URLs Supabase peuvent expirer)
      const validImageUrls: string[] = [];
      for (const url of imageUrls) {
        try {
          const headRes = await fetch(url, { method: "HEAD" });
          if (headRes.ok) {
            const contentLength = parseInt(headRes.headers.get("content-length") || "0", 10);
            if (contentLength > 0 && contentLength < 5_000_000) {
              validImageUrls.push(url);
            } else {
              console.warn(`carousel-visual: template image trop grosse ou taille inconnue: ${url} (${contentLength} bytes)`);
            }
          } else {
            console.warn(`carousel-visual: template image inaccessible (${headRes.status}): ${url}`);
          }
        } catch (e) {
          console.warn(`carousel-visual: erreur accès template image: ${url}`, e);
        }
      }
      
      if (validImageUrls.length > 0) {
        // Use vision: send the template image + text prompt
        const content: any[] = [];
        for (const url of validImageUrls) {
          content.push({
            type: "image",
            source: { type: "url", url },
          });
        }
        content.push({
          type: "text",
          text: `Voici le template de référence de l'utilisatrice. Analyse son design (mise en page, style, espacement, ambiance) et reproduis-le fidèlement pour les slides suivantes.\n\n${finalUserPrompt}`,
        });
        messages.push({ role: "user", content });
      } else {
        // No valid image templates, fallback to text-only
        messages.push({ role: "user", content: finalUserPrompt });
      }
    } else {
      messages.push({ role: "user", content: finalUserPrompt });
    }
    } // end else (text mode)

    const model: AnthropicModel = "claude-opus-4-6";

    console.log(JSON.stringify({
      type: "carousel_visual_call",
      model,
      slides_count: messages.length,
      style,
      is_photo: isPhotoCarousel,
      is_mix: isMixCarousel,
      timestamp: new Date().toISOString(),
    }));

    const rawResponse = await callAnthropic({
      model,
      system: finalSystemPrompt,
      messages,
      temperature: 0.5,
      max_tokens: 16384,
    });

    let result: any;
    try {
      // Strip markdown code fences if present
      let cleaned = rawResponse.replace(/```(?:json)?\s*/gi, "").replace(/```\s*$/gi, "");
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found");
      }
    } catch (parseErr) {
      console.error("Failed to parse carousel-visual response:", rawResponse.slice(0, 500));
      // Retry: try to find the slides_html array directly
      try {
        const arrayMatch = rawResponse.match(/\[\s*\{[\s\S]*\}\s*\]/);
        if (arrayMatch) {
          result = { slides_html: JSON.parse(arrayMatch[0]) };
        } else {
          throw parseErr;
        }
      } catch {
        throw new Error("L'IA n'a pas retourné un format valide. Réessaie.");
      }
    }

    // ═══ Post-processing : injecter les photos base64 dans le HTML ═══
    if ((isPhotoCarousel || isMixCarousel) && result?.slides_html && reqBody.photos) {
      result.slides_html = result.slides_html.map((slide: any) => {
        let html = slide.html || "";
        
        // Remplacer chaque placeholder {{PHOTO_N}} par le vrai base64
        for (let i = 0; i < reqBody.photos.length; i++) {
          const placeholder = `{{PHOTO_${i + 1}}}`;
          // Le base64 peut déjà contenir le préfixe data URL
          const raw = reqBody.photos[i].base64;
          const base64Url = raw.startsWith("data:") ? raw : `data:image/jpeg;base64,${raw}`;
          while (html.includes(placeholder)) {
            html = html.replace(placeholder, base64Url);
          }
        }
        
        return { ...slide, html };
      });
    }

    // ═══ Post-processing 2 : forcer les Google Fonts via <link> ═══
    // Les @import dans les iframes srcDoc ne chargent pas les fonts de façon fiable.
    // On remplace tous les @import Google Fonts par un <link> en tête du HTML.
    if (result?.slides_html) {
      const fontsLink = `<link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(ch.font_title)}:ital,wght@0,400;0,700;1,400&family=${encodeURIComponent(ch.font_body)}:wght@400;500;600;700&display=swap" rel="stylesheet">`;
      
      result.slides_html = result.slides_html.map((slide: any) => {
        let html = slide.html || "";
        // Supprimer les @import Google Fonts existants (ils ne marchent pas dans les iframes)
        html = html.replace(/<style>\s*@import\s+url\([^)]*fonts\.googleapis\.com[^)]*\)\s*;?\s*<\/style>/gi, "");
        // Ajouter le <link> au tout début
        html = fontsLink + html;
        return { ...slide, html };
      });
    }

    // Vérifier qu'il ne reste plus de placeholders non remplacés
    if ((isPhotoCarousel || isMixCarousel) && result?.slides_html) {
      for (const slide of result.slides_html) {
        if (slide.html && slide.html.includes("{{PHOTO_")) {
          console.warn(`carousel-visual: placeholder non remplacé dans slide ${slide.slide_number}`);
        }
      }
    }

    await logUsage(user.id, "content", "carousel_visual", undefined, model, workspaceId);

    return new Response(JSON.stringify({ result, remaining: quota.remaining }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("carousel-visual error:", err?.message || err, err?.status || "");

    if (err.message === "Non autorisé") {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (err.name === "ValidationError") {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const status = err.status || 500;
    const message = err.message || "Erreur interne du serveur";

    const userMessage = status === 429
      ? "L'IA est surchargée. Réessaie dans quelques secondes."
      : status === 529
      ? "L'IA est temporairement indisponible. Réessaie dans 1-2 minutes."
      : status === 400
      ? `Erreur de configuration IA : ${message}`
      : `Erreur lors de la génération des visuels : ${message}`;

    return new Response(JSON.stringify({ error: userMessage, debug: message }), {
      status: status >= 400 && status < 600 ? status : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
