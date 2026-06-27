import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
import { callAnthropic, type AnthropicModel } from "../_shared/anthropic.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { validateInput, ValidationError } from "../_shared/input-validators.ts";
import { buildPptxInvariants, formatInvariantsForPrompt } from "../_shared/pptx-invariants.ts";
import { extractImagePayload } from "../_shared/image-utils.ts";
import { assertWorkspaceMembership, workspaceDeniedResponse } from "../_shared/workspace-guard.ts";

/**
 * Bloc partagé : templates HTML/CSS des schémas visuels (visual_schema).
 * Utilisé à la fois pour les carrousels texte ET les carrousels mixtes,
 * sinon le mixte rendrait les slides à visual_schema en simple texte.
 */
function buildVisualSchemaBlock(ch: any): string {
  return `═══ SCHÉMAS VISUELS — TEMPLATES HTML/CSS ═══

Certaines slides contiennent un champ "visual_schema" avec des données structurées. Tu DOIS les rendre comme des schémas visuels en HTML/CSS, PAS comme du texte simple.

Voici le design pour chaque type :

█ BEFORE_AFTER — Deux colonnes côte à côte
<div style="display:flex;gap:24px;width:100%">
  <div style="flex:1;display:flex;gap:6px">
    <div data-pptx-shape="card" style="width:8px;border-radius:4px;background:#E74C3C;flex-shrink:0"></div>
    <div data-pptx-shape="card" style="flex:1;background:#FFF;border-radius:${ch.border_radius || 12}px;padding:32px">
      <p data-pptx-editable="caption" style="font-size:22px;font-weight:600;color:#E74C3C;margin-bottom:16px">❌ AVANT_LABEL</p>
      <!-- items en <p data-pptx-editable="body"> avec une puce rouge -->
    </div>
  </div>
  <div style="flex:1;display:flex;gap:6px">
    <div data-pptx-shape="card" style="width:8px;border-radius:4px;background:#27AE60;flex-shrink:0"></div>
    <div data-pptx-shape="card" style="flex:1;background:#FFF;border-radius:${ch.border_radius || 12}px;padding:32px">
      <p data-pptx-editable="caption" style="font-size:22px;font-weight:600;color:#27AE60;margin-bottom:16px">✅ APRÈS_LABEL</p>
      <!-- items en <p data-pptx-editable="body"> avec une puce verte -->
    </div>
  </div>
</div>


█ COMPARISON — Similaire mais avec les couleurs/labels du schema
Même structure que before_after mais avec les labels et couleurs du champ left/right.

█ TIMELINE — Ligne verticale avec des étapes
<div style="position:relative;padding-left:60px">
  <div style="position:absolute;left:24px;top:0;bottom:0;width:3px;background:linear-gradient(to bottom, ${ch.color_primary}, ${ch.color_accent})"></div>
  <!-- Pour chaque step : -->
  <div style="display:flex;gap:20px;margin-bottom:24px;align-items:flex-start">
    <div data-pptx-shape="pill" style="width:44px;height:44px;border-radius:50%;background:${ch.color_secondary};color:#FFF;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:600;flex-shrink:0">01</div>
    <div data-pptx-shape="card" style="flex:1;background:#FFF;border-radius:${ch.border_radius || 12}px;padding:24px;box-shadow:0 2px 8px rgba(0,0,0,0.04)">
      <p data-pptx-editable="subtitle" style="font-size:24px;color:${ch.color_secondary}">LABEL</p>
      <p data-pptx-editable="body" style="font-size:20px;color:${ch.color_text};opacity:0.85;margin-top:6px">DESC</p>
    </div>
  </div>
</div>

█ CHECKLIST — Liste avec des badges ✅/❌
Pour chaque item :
<div data-pptx-shape="card" style="display:flex;align-items:center;gap:16px;padding:16px 24px;background:#FFF;border-radius:${ch.border_radius || 12}px;margin-bottom:12px;box-shadow:0 2px 8px rgba(0,0,0,0.04)">
  <span style="font-size:28px">✅ ou ❌</span>
  <p data-pptx-editable="body" style="font-size:24px;color:${ch.color_text}">TEXTE</p>
</div>

█ STATS — Gros chiffres avec labels
Pour chaque stat :
<div style="text-align:center;padding:24px">
  <p data-pptx-editable="title" style="font-size:80px;font-weight:700;color:${ch.color_primary};line-height:1">73%</p>
  <p data-pptx-editable="body" style="font-size:22px;color:${ch.color_text};margin-top:8px;opacity:0.8">description</p>
</div>
Dispose 2-3 stats en flex row avec des séparateurs visuels.

█ MATRIX_2X2 — Grille 2×2 avec axes
<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
  <div data-pptx-shape="card" style="background:${ch.color_primary}15;border-radius:${ch.border_radius || 12}px;padding:24px;text-align:center">
    <span style="font-size:40px">EMOJI</span>
    <p data-pptx-editable="body" style="font-size:22px;font-weight:600;margin-top:8px">LABEL</p>
  </div>
</div>

Ajoute les labels d'axes autour de la grille.

█ PYRAMID — Niveaux empilés (le plus large en bas)
Le sommet = 50% de largeur, la base = 100%. Couleurs du plus foncé (sommet) au plus clair (base).

█ EQUATION — A + B = C
<div style="display:flex;align-items:center;justify-content:center;gap:24px">
  <div style="background:#FFF;border-radius:${ch.border_radius || 12}px;padding:24px 32px;box-shadow:0 2px 12px rgba(0,0,0,0.06);text-align:center">
    <p style="font-size:28px;font-weight:600;color:${ch.color_secondary}">A</p>
  </div>
  <span style="font-size:48px;color:${ch.color_primary}">+</span>
  <!-- ... -->
  <span style="font-size:48px;color:${ch.color_primary}">=</span>
  <div style="background:${ch.color_primary};border-radius:${ch.border_radius || 12}px;padding:24px 32px;text-align:center">
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
  <div data-pptx-shape="card" style="text-align:center;background:#FFF;border-radius:${ch.border_radius || 12}px;padding:24px;box-shadow:0 2px 8px rgba(0,0,0,0.04)">
    <span style="font-size:48px;display:block;margin-bottom:8px">EMOJI</span>
    <p data-pptx-editable="body" style="font-size:20px;font-weight:600;color:${ch.color_secondary}">LABEL</p>
  </div>
</div>

█ STORY_ARC — Récit en 3-5 étapes verticales (numéros décoratifs + cartes connectées par filet pointillé)
<div style="display:flex;flex-direction:column;gap:0">
  <!-- Pour chaque step (i = index 0-based, formate "01", "02"…) : -->
  <div style="display:flex;gap:24px;align-items:flex-start">
    <div style="flex-shrink:0;width:64px;text-align:right;padding-top:8px">
      <span data-pptx-editable="caption" style="font-size:36px;font-weight:700;color:${ch.color_primary};opacity:0.4;font-family:${ch.font_title};line-height:1">01</span>
    </div>
    <div data-pptx-shape="card" style="flex:1;background:#FFF;border-radius:${ch.border_radius || 12}px;padding:24px 28px;box-shadow:0 2px 12px rgba(0,0,0,0.05)">
      <h3 data-pptx-editable="title" style="font-size:24px;font-weight:600;color:${ch.color_primary};margin:0 0 8px 0;font-family:${ch.font_title}">LABEL</h3>
      <p data-pptx-editable="body" style="font-size:20px;color:${ch.color_text};line-height:1.4;margin:0;font-family:${ch.font_body}">DESC</p>
    </div>
  </div>
  <!-- Filet pointillé entre steps (PAS après le dernier) : -->
  <div style="margin-left:88px;width:2px;height:20px;border-left:2px dotted ${ch.color_secondary};opacity:0.4"></div>
</div>
Si story_arc.steps.length < 3 → rends comme une simple liste verticale sans filet (peu probable, mais tolère).

█ QUOTE_BIG — Citation typographique (guillemet décoratif XL + citation italique + attribution discrète)
<div style="position:relative;padding:60px;display:flex;flex-direction:column;justify-content:center;height:100%">
  <!-- Si "context" présent — sinon omettre ce bloc : -->
  <p data-pptx-editable="caption" style="font-size:22px;color:${ch.color_secondary};margin:0 0 24px 0;font-family:${ch.font_body}">CONTEXT</p>
  <span aria-hidden="true" style="position:absolute;top:20px;left:30px;font-size:140px;line-height:1;color:${ch.color_primary};opacity:0.2;font-family:Georgia,serif">"</span>
  <p data-pptx-editable="title" style="font-size:48px;font-style:italic;line-height:1.3;color:${ch.color_text};margin:0;font-family:${ch.font_title};font-weight:normal">QUOTE</p>
  <!-- Si "attribution" présente — sinon omettre : -->
  <p data-pptx-editable="body" style="font-size:22px;color:${ch.color_secondary};margin:32px 0 0 0;font-family:${ch.font_body}">ATTRIBUTION</p>
</div>
RÈGLE TAILLE QUOTE : 56px si quote < 60 chars, 48px par défaut (60-120 chars), 40px si > 120 chars.
RÈGLE FALLBACK : si quote_big.quote est absent → utilise slide.title à la place.

█ OBJECTION_RESPONSE — Déconstruction verticale (objection en haut grisé, response en bas dominante)
<div style="display:flex;flex-direction:column;gap:32px">
  <div data-pptx-shape="card" style="background:${ch.color_secondary}15;border-radius:${ch.border_radius || 12}px;padding:32px;position:relative">
    <span aria-hidden="true" style="position:absolute;top:16px;right:24px;font-size:32px;color:${ch.color_primary};opacity:0.5">❝</span>
    <p data-pptx-editable="caption" style="font-size:18px;font-weight:600;color:${ch.color_secondary};text-transform:uppercase;letter-spacing:1px;margin:0 0 12px 0;font-family:${ch.font_body}">CE QU'ON DIT</p>
    <p data-pptx-editable="body" style="font-size:24px;color:${ch.color_text};line-height:1.4;margin:0;font-style:italic;font-family:${ch.font_body}">OBJECTION</p>
  </div>
  <div style="display:flex;gap:6px">
    <div data-pptx-shape="card" style="width:8px;border-radius:4px;background:${ch.color_primary};flex-shrink:0"></div>
    <div data-pptx-shape="card" style="flex:1;background:#FFF;border-radius:${ch.border_radius || 12}px;padding:32px;box-shadow:0 4px 16px rgba(0,0,0,0.06)">
      <p data-pptx-editable="caption" style="font-size:18px;font-weight:600;color:${ch.color_primary};text-transform:uppercase;letter-spacing:1px;margin:0 0 12px 0;font-family:${ch.font_body}">MA POSITION</p>
      <p data-pptx-editable="title" style="font-size:30px;color:${ch.color_text};line-height:1.4;margin:0;font-weight:500;font-family:${ch.font_title}">RESPONSE</p>
    </div>
  </div>
</div>
La RESPONSE est typographiquement plus grande que l'OBJECTION — elle domine.

█ PROCESS_VISIBLE — 3 colonnes égales (Avant/Pendant/Après) reliées par flèches
<div style="display:flex;align-items:stretch;gap:16px">
  <!-- Pour chaque stage (i = 0..2, formate "01", "02", "03") : -->
  <div data-pptx-shape="card" style="flex:1;background:#FFF;border-radius:${ch.border_radius || 12}px;padding:28px 20px;box-shadow:0 2px 12px rgba(0,0,0,0.05)">
    <span data-pptx-editable="caption" style="font-size:64px;font-weight:700;color:${ch.color_primary};opacity:0.25;line-height:1;font-family:${ch.font_title};display:block;margin-bottom:8px">01</span>
    <h3 data-pptx-editable="title" style="font-size:24px;font-weight:600;color:${ch.color_secondary};margin:0 0 12px 0;font-family:${ch.font_title}">LABEL</h3>
    <p data-pptx-editable="body" style="font-size:18px;color:${ch.color_text};line-height:1.4;margin:0;font-family:${ch.font_body}">DESC</p>
  </div>
  <!-- Flèche entre colonnes (PAS après la dernière) : -->
  <div style="display:flex;align-items:center;flex-shrink:0">
    <span aria-hidden="true" style="font-size:32px;color:${ch.color_primary};font-weight:300">→</span>
  </div>
</div>
RÈGLE FALLBACK : si process_visible.stages.length !== 3, rends quand même proprement (2 ou 4 colonnes au lieu de 3, garde la même structure de carte).

IMPORTANT pour les schémas :
- Utilise les vraies couleurs de la charte (${ch.color_primary}, ${ch.color_secondary}, ${ch.color_accent}, ${ch.color_text})
- Les cartes des templates sont blanches (#FFF) pour un fond de charte CLAIR. Si ${ch.color_background} est sombre, remplace le blanc des cartes par une teinte claire OPAQUE harmonisée avec la charte (jamais de rgba semi-transparent).
- Couleurs sémantiques autorisées hors charte (les SEULES) : le rouge #E74C3C et le vert #27AE60 des oppositions ❌/✅ (before_after, checklist, scale) et le fond #1A1A1A de la DARK BOX. Tout autre accent vient de la charte.
- CARTES SŒURS = MÊME HAUTEUR ENTRE ELLES, PAS PLEINE SLIDE : dans un schéma à cartes multiples côte à côte (before_after, comparison, process_visible, et toute rangée de cartes sœurs), les cartes d'une même rangée ont la MÊME hauteur entre elles (le conteneur flex de la rangée garde align-items:stretch, jamais center ou flex-start) ET le MÊME alignement vertical de leur contenu interne. EN REVANCHE, la rangée ne doit PAS être étirée pour remplir toute la hauteur de la slide : le wrapper de niveau slide centre la rangée verticalement (display:flex; align-items:center; justify-content:center) et laisse la rangée se dimensionner sur son contenu. La hauteur d'une carte est dictée par son contenu (avec un padding intérieur confortable) — JAMAIS par height:100% de la slide. Si le contenu est court, les cartes restent compactes et la slide montre de l'air autour, c'est volontaire.
- Le titre de la slide (s'il existe) reste AU-DESSUS du schéma
- Les schémas doivent respirer : pas de texte trop petit, pas de schéma qui remplit 100% de la slide
- Si une slide a un visual_schema, le design du schéma est PRIORITAIRE sur le design par rôle
- N'INVENTE PAS de cercles décoratifs (règle dure du design system). Les pastilles rondes numérotées des steps (border-radius:50% sur un carré contenant un numéro) sont FONCTIONNELLES, pas décoratives — elles restent autorisées.
- Les attributs data-pptx-shape et data-pptx-editable présents dans les templates ci-dessus sont OBLIGATOIRES : recopie-les à l'identique. Annote de la même façon tout élément équivalent que tu ajoutes (carte → card, badge/pastille → pill).`;
}

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
    const ownerWorkspaceId = wsMember?.workspace_id;

    const quota = await checkQuota(user.id, "content", ownerWorkspaceId);
    if (!quota.allowed) {
      return new Response(
        JSON.stringify({ error: "limit_reached", message: quota.message, quota }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const reqBody = await req.json();
    validateInput(reqBody, z.object({
      slides: z.array(z.record(z.unknown())).min(1, "Aucune slide fournie").max(20),
      template_style: z.string().max(100).optional().nullable(),
      charter: z.record(z.unknown()).optional().nullable(),
      custom_overrides: z.record(z.unknown()).optional().nullable(),
      template_reference_urls: z.array(z.string().url()).max(5).optional().nullable(),
      photos: z.array(z.object({ base64: z.string(), context: z.string().max(200).optional(), mimeType: z.string().max(50).optional() })).max(10).optional(),
      carousel_type: z.string().max(50).optional().nullable(),
      workspace_id: z.string().uuid().optional().nullable(),
      quality_max: z.boolean().optional(),
    }).passthrough());
    const { slides, template_style, charter: bodyCharter, custom_overrides, template_reference_urls } = reqBody;

    const sbGuard = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const membership = await assertWorkspaceMembership(sbGuard, user.id, reqBody.workspace_id);
    if (!membership.ok) {
      console.warn("[workspace-guard] denied", { userId: user.id, workspaceId: reqBody.workspace_id });
      return workspaceDeniedResponse(corsHeaders);
    }

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

    // Hybride : on enrichit avec le ton éditorial (brand_profile) pour dériver
    // motif visuel, dominante et tailles. La charte reste la source pour palette/polices.
    const bpCol = workspaceId ? "workspace_id" : "user_id";
    const bpVal = workspaceId || user.id;
    const { data: brandProfile } = await sbAdmin
      .from("brand_profile")
      .select("tone_register")
      .eq(bpCol, bpVal)
      .maybeSingle();

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

    // Construit les invariants PPTX (source de vérité unique pour la phase d'export).
    const invariants = buildPptxInvariants({ charter, brandProfile });
    const invariantsBlock = formatInvariantsForPrompt(invariants);

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
- Optionnel : barre latérale colorée = un div séparé (width:8px;border-radius:4px;background:[couleur accent]) accolé à la carte dans un flex avec gap:6px — JAMAIS border-left sur la carte (non exportable en shape éditable).

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

RYTHME DU CARROUSEL (obligatoire dès 5 slides) :

- Au moins UNE slide de rupture à fond plein dans le carrousel : SÉPARATEUR (fond ${ch.color_primary}), DARK BOX (punchline sur fond sombre) ou CTA inversé (fond ${ch.color_secondary}, texte clair).

- Place-la sur la slide la plus forte éditorialement (prise de position, punchline, chiffre choc) — c'est elle qui crée la respiration visuelle dans le feed.

- Alterne les densités : une slide dense (schéma, liste) est suivie d'une slide aérée (punchline, citation).

═══ DESIGN PAR RÔLE DE SLIDE ═══

HOOK (slide 1) — Design le plus fort, stoppe le scroll :

- La TYPOGRAPHIE est l'élément visuel principal : titre en ${ch.font_title}, 64-84px, qui occupe la largeur (marges 80px) — PAS de petite carte flottant au centre.

- Deux compositions au choix :

  · Plein format clair : fond ${ch.color_background}, titre énorme aligné gauche ou centré, 1-2 mots-clés en ${ch.color_primary} italic

  · Plein format inversé : fond ${ch.color_secondary}, titre en blanc/clair, 1 mot-clé en ${ch.color_accent}

- Petit badge pilule (thème ou numéro) en haut, AU-DESSUS du titre.

- Le titre est verticalement centré dans la slide (flex, justify-content:center), le badge en haut.

- Optionnel : motif décoratif subtil en fond (lignes, zigzag — pas de ronds).

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
- Alterner les couleurs d'accent entre les slides pour la variété, UNIQUEMENT dans la palette de la charte : ${ch.color_primary}, ${ch.color_accent}, ${ch.color_secondary}. JAMAIS de couleur hors charte pour les accents.

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

${buildVisualSchemaBlock(ch)}

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

═══ RÈGLE D'OR — ZÉRO TEXTE INVENTÉ ═══
Le SEUL texte que tu écris sur une slide est l'overlay_text fourni dans le JSON (mot pour mot). Tu n'AJOUTES jamais le moindre autre mot. Concrètement, INTERDIT de poser au-dessus, en dessous ou à côté de l'overlay :
- un SURTITRE / kicker / eyebrow / intertitre ;
- une étiquette de CATÉGORIE ou de THÈME, même si elle résume bien la slide (PAS de « LE VRAI PROBLÈME », « LA MÉTHODE », « LE DÉCLIC », « HISTOIRE VRAIE », « ÉTAPE 1 », « CONVERSATION #2 », « 3 SEMAINES PLUS TARD »…) ;
- un numéro de slide, un numéro de chapitre, un label de section.
Le carrousel photo se lit comme une histoire qui coule : le fil vit DANS les phrases, jamais dans des stamps posés par-dessus. Une pilule/un badge ne sert QU'À porter l'overlay_text lui-même (style « minimal »), jamais un mot que tu rajoutes. SEULE exception autorisée : sur la TOUTE DERNIÈRE slide uniquement, un CTA court (ex « Enregistre ce post », « On en parle ? »). En cas de doute : tu n'écris que l'overlay_text, rien d'autre.

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

═══ LISIBILITÉ AVANT TOUT (analyse VISUELLE de chaque photo fournie) ═══

Tu VOIS chaque photo. Avant de poser le texte, analyse-la :
- Repère la zone CLAIRE et la zone SOMBRE. Pose l'overlay là où le contraste avec ta couleur de texte est maximal :
  · Texte clair (blanc) → sur zone sombre, ou pose un voile/bandeau sombre derrière.
  · Texte foncé → sur zone claire, ou pose un bandeau clair derrière.
- Repère le SUJET PRINCIPAL (visage, mains, produit, point focal). N'écris JAMAIS dessus : décale le texte vers le 1/3 opposé de la photo.
- Si une slide porte un "visual_anchor" (un détail concret de la photo, ex : « les deux tasses encore pleines »), COMPOSE pour le laisser respirer : ne pose pas le texte par-dessus ce détail, cadre/positionne le texte de façon à le mettre en valeur.
- Si la photo est globalement CLAIRE, texturée, floue ou multicolore sous la zone de texte : un simple gradient ne suffit pas → IMPOSE un bandeau OPAQUE (rgba 0.92) ou un voile dense.
- La position du JSON (overlay_position) est une PRÉFÉRENCE : adapte-la si le sujet principal y est, ou si le contraste y est insuffisant.

SAFE ZONES Instagram (impératif) :
- 80px de marge en haut (zone tronquée par certains crops du feed).
- 200px de marge en bas (icône carrousel Instagram + crop mobile).
- Aucun texte critique (overlay) dans ces zones. Les éléments décoratifs (voile, photo qui dépasse) sont OK.

═══ DESIGN DES OVERLAYS TEXTE SUR PHOTO ═══

L'overlay_text doit être LISIBLE sur la photo. Utilise UN des styles suivants selon overlay_style :

STYLE "sensoriel" (phrases évocatrices) :
- Position : selon overlay_position (par défaut en bas)
- Voile sombre ADAPTATIF : un linear-gradient(transparent, rgba(0,0,0,0.7)) dont la hauteur ÉPOUSE le bloc texte (≈ hauteur du texte + 120px de marge) et démarre du bord où est posé le texte (bas, haut OU centre). Le voile ne couvre que ce qu'il faut pour lire — pas plus, pas moins.
- Si le texte est en haut ou au centre : le gradient part de ce bord-là (en haut : rgba(0,0,0,0.7) → transparent ; au centre : voile radial/horizontal centré). NE laisse JAMAIS un texte blanc sans voile parce que le gradient n'était "prévu qu'en bas".
- Texte : font-family: ${ch.font_title}; font-size: 42-48px; color: white; font-weight: normal; font-style: italic
- Padding : 80px côtés, 60px du bord
- Ombre texte : text-shadow: 0 2px 20px rgba(0,0,0,0.6)

STYLE "narratif" (phrases d'histoire) :
- Position : selon overlay_position
- Bandeau CLAIR, annoté data-pptx-shape="card" : background: #FFFFFF (BLANC OPAQUE — JAMAIS rgba semi-transparent ni backdrop-filter : ils ne s'exportent pas et laissent voir la photo au travers) ; border-radius: ${ch.border_radius}; box-shadow: 0 8px 28px rgba(0,0,0,0.18)
- Texte FONCÉ : font-family: ${ch.font_body}; font-size: 32-36px; color: ${ch.color_text}
- Padding : 28px 40px
- Le bandeau ne fait PAS toute la largeur : max-width: 85%, centré ou aligné

STYLE "minimal" (phrases courtes percutantes) :
- Position : selon overlay_position
- Badge pilule : background ${ch.color_primary}; color white; font-family: ${ch.font_body}; font-size: 24-28px; text-transform: uppercase; letter-spacing: 2px; padding: 12px 32px; border-radius: 100px
- Ou texte nu en blanc très grand (60-72px) avec ombre forte : text-shadow: 0 4px 30px rgba(0,0,0,0.8) ET un voile sombre adaptatif derrière si la zone est claire

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
- ❌ Texte blanc posé sur une zone claire SANS voile (illisibilité n°1) — toujours vérifier le contraste réel sous le texte
- ❌ Voile "prévu en bas" alors que le texte est en haut/centre → le texte flotte sans fond
- ❌ Texte par-dessus le visage / le sujet principal de la photo
- ❌ Bandeau qui cache plus de 45% de la photo (le voile doit épouser le texte, pas noyer l'image)
- ❌ Texte trop petit (< 22px)
- ❌ Toutes les slides avec le même traitement (varier les styles)
- ❌ Cercles ou ronds décoratifs
- ❌ Font-weight bold sur ${ch.font_title}
- ❌ INVENTER un SURTITRE / une étiquette de catégorie / un intertitre de section au-dessus ou en dessous de la phrase (ex : "HISTOIRE VRAIE", "CONVERSATION #2", "3 SEMAINES PLUS TARD", "ÉTAPE 1"). En carrousel photo, tu ne poses RIEN d'autre que l'overlay_text fourni : pas de label de section, pas de tag de catégorie, pas de numéro de chapitre. Le fil narratif vit DANS les phrases, pas dans des stamps qui transforment l'histoire en galerie d'images légendées. SEULE exception : la toute dernière slide peut porter un CTA court et discret (ex : "Enregistre ce post").

═══ SLIDE 1 = HERO D'OUVERTURE ═══
La slide 1 est la vignette qui doit STOPPER le scroll. Traite-la comme une affiche, pas comme une slide ordinaire :
- Choisis la photo la plus forte et pose-la plein écran.
- Si son overlay_text est court (≤ 12 mots) OU si overlay_text est null : joue l'impact maximal — texte TRÈS grand (style accroche : 64-88px, sur 2-3 lignes max) avec un voile/bandeau franc, ou photo nue si elle se suffit. Pas de petit texte timide en slide 1.
- Si l'overlay est plus long, applique le style demandé mais soigne la hiérarchie (un mot-clé peut être agrandi/coloré en ${ch.color_accent}).
- La slide 1 doit se distinguer visuellement des suivantes (échelle de texte plus grande, composition plus aérée).

═══ VÉRIFICATION FINALE DE LISIBILITÉ (OBLIGATOIRE, slide par slide) ═══
Tu VOIS chaque photo. Avant de finaliser CHAQUE slide, regarde la zone réelle de pixels SOUS ton texte :
- Le contraste texte/fond est-il suffisant pour lire sans effort sur un petit écran mobile ?
- Si NON (ou au moindre doute) : tu DOIS d'abord corriger — ajoute ou renforce le voile/bandeau (jusqu'à rgba opaque 0.92), déplace le texte vers une zone plus contrastée, ou agrandis l'ombre. Ne livre JAMAIS une slide au contraste douteux.
- Renseigne ensuite honnêtement le champ "contrast_ok" : true seulement si, APRÈS ta correction, le texte est franchement lisible. false si un doute subsiste malgré tout.

Retourne un JSON :
{
  "slides_html": [
    { "slide_number": 1, "html": "<style>@import url(...);</style><div style=\\"width:1080px;height:1350px;...\\">...</div>", "contrast_ok": true, "legibility": "voile sombre adaptatif sous le texte (zone claire en haut)" }
  ]
}

Chaque entrée de slides_html DOIT inclure "contrast_ok" (booléen) et "legibility" (courte note sur le traitement de lisibilité appliqué).

IMPORTANT : Pour chaque slide, utilise le placeholder {{PHOTO_N}} dans le background-image, où N est le photo_index fourni dans le JSON de la slide (PAS son numéro de slide — une même photo peut être réutilisée sur plusieurs slides).
Exemple : slide 1 avec photo_index 1 → background-image: url({{PHOTO_1}})
Exemple : slide 5 avec photo_index 2 → background-image: url({{PHOTO_2}})
N'essaie PAS d'écrire le base64 toi-même. Utilise UNIQUEMENT le placeholder {{PHOTO_N}}.
Retourne UNIQUEMENT le JSON, pas de texte avant ou après.`;

      finalUserPrompt = `Génère les slides HTML pour ce carrousel PHOTO.

SLIDES (textes overlay à poser sur les photos) :
${JSON.stringify(slides, null, 2)}

Chaque slide du JSON ci-dessus contient son photo_index. Utilise {{PHOTO_N}} où N = ce photo_index (ex: photo_index 2 → {{PHOTO_2}}), jamais le numéro de slide.
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
  · Style "sensoriel" : gradient sombre en bas (linear-gradient transparent → rgba(0,0,0,0.7) sur 40% de la hauteur), texte blanc italic en ${ch.font_title}
  · Style "narratif" : bandeau blanc OPAQUE (background #FFFFFF, data-pptx-shape="card", box-shadow 0 8px 28px rgba(0,0,0,0.18) ; JAMAIS rgba semi-transparent ni backdrop-filter), texte en ${ch.font_body}, padding 32px
  · Style "minimal" : badge pilule ${ch.color_primary} ou texte blanc grand avec text-shadow: 0 4px 16px rgba(0,0,0,0.6)

RÈGLES DE LISIBILITÉ (analyse VISUELLE de chaque photo fournie) :
- Identifie la zone CLAIRE et la zone SOMBRE de la photo. Pose l'overlay sur la zone qui maximise le contraste avec ton style :
  · Texte clair (blanc) → zone sombre, ou ajoute un gradient/bandeau sombre.
  · Texte foncé → zone claire, ou ajoute un bandeau blanc.
- Identifie le SUJET PRINCIPAL (visage, produit, élément central). N'écris JAMAIS dessus. Décale l'overlay vers le 1/3 opposé de la photo.
- Si la photo est globalement texturée, floue ou multicolore, IMPOSE un bandeau opaque (rgba 0.92) — pas un simple gradient.
- Position selon overlay_position MAIS adapte si le sujet principal y est, ou si le contraste y est insuffisant.

SAFE ZONES Instagram (impératif) :
- Laisse 80px de marge en haut (zone tronquée par certains crops feed).
- Laisse 200px de marge en bas (zone où Instagram pose l'icône carrousel et où le bas est tronqué sur mobile).
- Aucun texte critique (overlay, titre, CTA) dans ces zones. Les éléments décoratifs (gradient, photo qui dépasse) sont OK.

TYPE "photo_integrated" — Photo intégrée dans un layout design
- La photo est une balise <img src="{{PHOTO_N}}" style="object-fit:cover;border-radius:${ch.border_radius}">
- Layouts selon photo_layout (chaque layout a un élément distinctif OBLIGATOIRE) :
  · "top_photo" : photo height 740px (≈55%), texte en bas (610px) sur fond ${ch.color_background}. ÉLÉMENT DISTINCTIF : badge pilule numéroté en haut à gauche du bloc texte + soulignement coloré ${ch.color_accent} (4px, width 80px) sous le titre.
  · "left_photo" : 2 colonnes flex, photo 432px (40%) à gauche, texte 648px (60%) à droite. ÉLÉMENT DISTINCTIF : barre verticale ${ch.color_accent} (4px) entre photo et texte, titre en ${ch.color_secondary}, body avec retrait à gauche de 16px.
  · "right_photo" : symétrique de left_photo, photo à droite. ÉLÉMENT DISTINCTIF : barre verticale ${ch.color_accent} à gauche du texte + petit badge "→" décoratif avant le titre.
  · "card_photo" : fond ${ch.color_background}. Carte blanche centrée 920px × 1190px, ombre douce (0 8px 32px rgba(0,0,0,0.08)). Photo en haut de la carte (660px, border-radius haut), texte en bas (530px, padding 48px). ÉLÉMENT DISTINCTIF : filet horizontal ${ch.color_primary} (3px, width 60px) sous le titre.
  · "banner_photo" : photo 380px en bandeau horizontal en haut, texte en dessous (970px, padding 80px). ÉLÉMENT DISTINCTIF : titre LARGE (font-size 56-64px) sur 2 lignes max, body en 2 colonnes (column-count: 2, column-gap: 40px).

RÈGLE DE RYTHME (impérative) :
- Sur 3 slides photo_integrated d'un même carrousel, utilise au moins 3 layouts DIFFÉRENTS.
- Ne répète JAMAIS le même photo_layout sur 2 slides consécutives.

TYPE "text_only" — Slide texte pure
- Design system Nowadays classique (identique aux carrousels texte) : cartes blanches, badges pilules, barres latérales, soulignements colorés.
- Fond ${ch.color_background} si la slide précédente est une photo (transition douce). Fond blanc sinon.
- Si visual_schema est fourni, rendre OBLIGATOIREMENT le schéma en HTML/CSS (voir la section SCHÉMAS VISUELS ci-dessous).

${buildVisualSchemaBlock(ch)}

═══ COHÉRENCE ET CONTINUITÉ VISUELLE ═══
- TOUTES les slides utilisent les mêmes fonts (${ch.font_title} pour les titres, ${ch.font_body} pour le corps) et la même palette.
- Le padding latéral est constant (80px pour text_only et photo_integrated ; pour photo_full, le padding s'applique au bloc d'overlay, pas au div).
- Le NUMÉRO DE SLIDE (badge pilule discret en coin, ex: "01/08", ${ch.color_primary} ou semi-transparent blanc sur photo_full) DOIT figurer sur TOUTES les slides — c'est l'élément qui unifie le carrousel.
- ZONE DE SÉCURITÉ TITRE / NUMÉRO (impératif) :
  · Le badge numéro de slide est positionné en absolu dans un coin (top/right ou bottom/right), AU-DESSUS du flux normal (z-index supérieur).
  · Le titre principal ne doit JAMAIS chevaucher ce badge. Deux options autorisées (au choix selon le layout) :
    – Soit le titre est placé SOUS la ligne du badge (le badge a son propre espace en haut, suivi d'un margin-top sur le titre ≥ hauteur du badge + 16px).
    – Soit le titre partage la ligne du haut MAIS son conteneur a max-width: 78% (ou padding-right ≥ largeur du badge + 24px) pour réserver la zone du badge.
  · Cette règle s'applique à TOUS les types de slide (text_only, photo_integrated, photo_full), schémas inclus.
- Continuité photo→texte : entre une slide photo_full/photo_integrated et une slide text_only suivante, REPRENDS un élément graphique commun (même couleur de badge, même style de soulignement, même typographie de titre).
- Les slides text_only encadrées par deux slides photo doivent utiliser un fond ${ch.color_background} (jamais blanc pur) pour adoucir la transition visuelle.
- L'alternance des types crée le rythme : photo → texte → photo → texte. Une slide photo_integrated peut servir de transition entre photo_full et text_only.
- Les slides photo_integrated font la TRANSITION entre les slides photo_full et text_only.

═══ PLACEHOLDERS PHOTOS ═══
Pour chaque slide qui utilise une photo :
- photo_full : background-image: url({{PHOTO_N}})
- photo_integrated : <img src="{{PHOTO_N}}">
N = le photo_index de la slide (1, 2, 3...)
N'essaie PAS d'écrire le base64. Le placeholder sera remplacé automatiquement.

═══ ANNOTATION POUR EXPORT PPTX ═══
Sur l'élément qui PORTE la photo (le div avec background-image OU la balise <img>), ajoute l'attribut data-pptx-photo="N" où N est le photo_index de la slide.

Exemples :
- photo_full : <div data-pptx-photo="1" style="background-image: url({{PHOTO_1}}); background-size: cover; ...">
- photo_integrated : <img data-pptx-photo="2" src="{{PHOTO_2}}" style="...">

Cette annotation permet à l'export PPTX éditable d'extraire la photo en qualité d'origine (sans recompression) et de la rendre manipulable individuellement dans PowerPoint.

N'ajoute JAMAIS data-pptx-photo sur un élément sans photo réelle (icône SVG, illustration vectorielle, etc.).

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

Adapte le design de CHAQUE slide à son type. Crée une continuité visuelle entre les trois types.${visualBlock}

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
          const { media_type, data } = extractImagePayload(photo.base64, photo.mimeType);
          messageContent.push({
            type: "image",
            source: { type: "base64", media_type, data }
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

    // Modèle des visuels branché sur « Mode qualité Max » : Sonnet par défaut (rapide,
    // ~2x plus court à générer), Opus seulement si l'utilisatrice a coché le toggle
    // (rendu le plus soigné, plus lent). Le pass de correction réutilise ce `model`.
    const model: AnthropicModel = reqBody.quality_max ? "claude-opus-4-6" : "claude-sonnet-4-5-20250929";

    // ═══ Append PPTX-editable annotation rules + invariants to ALL modes ═══
    // Discipline issue de l'étude "Le design via Claude" :
    //  - Section A (HTML libre) = déjà dans `finalSystemPrompt` (le prompt principal).
    //  - Section B (contrat PPTX) = invariants explicites ci-dessous + annotations.
    //  - Section C (output) = on demande aussi `slides_invariants` pour que l'exporter
    //    n'ait plus à deviner palette/polices/tailles via getComputedStyle.
    const pptxAnnotationRules = `

${invariantsBlock}

═══ ÉQUILIBRE VERTICAL — TOUTES LES SLIDES ═══

Chaque slide (texte, photo, schéma) est une colonne flex pleine hauteur :

display:flex;flex-direction:column;height:1350px (+ justify-content adapté au contenu).

- CONTRAINTE DE SORTIE VÉRIFIABLE : le dernier élément visible de chaque slide se termine entre 1010px et 1240px de hauteur (75-92% des 1350px). Si ton contenu finit plus haut, AUGMENTE font-sizes, paddings et gaps jusqu'à atteindre cette zone — n'ajoute pas de texte, agrandis l'existant.

Une slide dont le contenu flotte dans le tiers central avec les deux autres tiers vides est un DÉFAUT à corriger avant de répondre.

═══ ANNOTATIONS POUR EXPORT POWERPOINT ÉDITABLE — OBLIGATOIRE ═══

Sur CHAQUE bloc de texte significatif (titre, corps, overlay sur photo, légende, numéro de slide, badge), ajoute l'attribut HTML \`data-pptx-editable\` avec une de ces valeurs :
- \`data-pptx-editable="title"\` → titre principal de la slide (hook, headline)
- \`data-pptx-editable="body"\` → corps de texte, paragraphes, items de liste, descriptions
- \`data-pptx-editable="overlay"\` → texte court superposé à une photo
- \`data-pptx-editable="caption"\` → numéro de slide, badge "INFOGRAPHIE", watermark, légende discrète

Règles :
1. L'attribut va sur le NOEUD QUI CONTIENT DIRECTEMENT le texte (le <p>, <h1>, <h2>, <span>, <div>...), pas sur un parent qui en contient plusieurs.
2. N'annote PAS les éléments purement décoratifs (formes SVG, traits, fonds colorés, emojis isolés sans texte autour).
3. Si une carte contient un titre + un paragraphe, annote les DEUX séparément, pas la carte entière.
4. Si un même texte apparaît à plusieurs endroits visuellement (ex: titre dupliqué pour effet typographique), annote-en UN SEUL.

Exemple :
<div style="...carte..."><h2 data-pptx-editable="title" style="...">Mon titre</h2><p data-pptx-editable="body" style="...">Mon paragraphe</p></div>
<span data-pptx-editable="caption" style="...badge...">01 / 05</span>

═══ SHAPES STRUCTURELS — POUR ÉDITABILITÉ MAXIMALE PPTX (RECOMMANDÉ) ═══

En complément des annotations \`data-pptx-editable\` sur les TEXTES, annote les éléments visuels STRUCTURELS avec \`data-pptx-shape\` pour qu'ils deviennent des shapes natifs éditables dans PowerPoint :

- \`data-pptx-shape="background"\` → le <div> 1080×1350 racine de la slide (couleur de fond unie). UN SEUL par slide.
- \`data-pptx-shape="card"\` → un bloc rectangulaire avec un fill uni + border-radius qui contient du texte
- \`data-pptx-shape="pill"\` → un badge très arrondi (border-radius >= 100px ou >= 50% de la hauteur) contenant un label court
- \`data-pptx-shape="highlight"\` → un fond coloré derrière un mot pour le mettre en valeur (style "marker")

CONDITIONS D'ANNOTATION (NE PAS annoter si UNE de ces conditions est vraie — l'élément reste alors figé dans le PNG, ce qui est ACCEPTABLE) :
- L'élément utilise un gradient (linear-gradient, radial-gradient, conic-gradient)
- L'élément a une box-shadow complexe. AUTORISÉ : une seule ombre externe simple de la forme \`Xpx Ypx blur rgba(...)\` (sans spread, sans inset). INTERDIT : ombres multiples (séparées par virgule), \`inset\`, \`spread\` non nul.
- L'élément a un backdrop-filter, mask, mix-blend-mode, filter, clip-path
- L'élément a un transform autre que none (rotate, scale ≠ 1, skew, matrix)
- L'élément a une bordure. AUTORISÉ : bordure UNIFORME sur les 4 côtés, style \`solid\` / \`dashed\` / \`dotted\`. INTERDIT : bordures partielles (\`border-left\` seul, etc.), styles \`double\` / \`groove\` / \`ridge\` / \`inset\` / \`outset\`.
- Le fill n'est pas un aplat opaque (rgba avec alpha < 1 → ne pas annoter)
- L'élément CONTIENT un descendant \`data-pptx-photo\` (le shape natif recouvrirait la photo native)
- Un même élément ne porte JAMAIS à la fois \`data-pptx-editable\` et \`data-pptx-shape\` — un texte est un texte, un shape est un shape. Le texte vit DANS le shape comme enfant.

EXEMPLE :
<div style="width:1080px;height:1350px;background:#FB3D80" data-pptx-shape="background">
  <div style="background:#FFA7C6;border-radius:32px;padding:48px" data-pptx-shape="card">
    <span style="background:#FFE561;border-radius:100px;padding:8px 24px" data-pptx-shape="pill">
      <span data-pptx-editable="caption">CONSEIL #1</span>
    </span>
    <h2 data-pptx-editable="title">Mon titre avec un <span style="background:#FFE561" data-pptx-shape="highlight">mot surligné</span></h2>
  </div>
</div>

═══ FORMAT DE RÉPONSE — JSON enrichi ═══

Le JSON DOIT inclure deux champs au top-level :
{
  "slides_html": [ { "slide_number": 1, "html": "..." }, ... ],
  "slides_invariants": {
    "palette_used": { "primary": "#...", "secondary": "#...", "accent": "#...", "bg": "#...", "text": "#..." },
    "typography_used": { "title_pptx_safe": "Georgia", "body_pptx_safe": "Calibri", "title_pt": 40, "body_pt": 16 },
    "layouts_used": ["hook_card", "stack_centered", ...],  // 1 entrée par slide, max 4 valeurs distinctes
    "motif": "carte_blanche_ombre_douce"
  }
}

Le bloc \`slides_invariants\` confirme la palette/typo/layouts que TU as effectivement appliqués. Il pilote l'exporter PPTX. S'il manque, l'export échoue.

═══ AUTO-CHECK AVANT DE RETOURNER ═══

Avant de répondre, vérifie :
1. Chaque titre tient en ≤3 lignes à la taille indiquée (sinon réduis ou raccourcis).
2. Chaque corps de texte tient en ≤6 lignes.
3. Le carrousel utilise au maximum 3-4 layouts différents (cohérence > variété).
4. Aucune slide n'a de ligne décorative sous un titre.
5. Aucune slide n'a un fond beige/crème par défaut.
6. Le dernier élément de chaque slide se termine entre 1010px et 1240px de hauteur.
7. Les cartes sœurs d'un même schéma ont toutes la même hauteur.
Si un défaut est détecté, corrige DANS LA MÊME PASSE — ne livre pas de contenu cassé.
`;

    const systemPromptWithAnnotations = finalSystemPrompt + pptxAnnotationRules;

    console.log(JSON.stringify({
      type: "carousel_visual_call",
      model,
      slides_count: messages.length,
      style,
      is_photo: isPhotoCarousel,
      is_mix: isMixCarousel,
      invariants_motif: invariants.motif,
      invariants_title_pt: invariants.typography.title_pt,
      timestamp: new Date().toISOString(),
    }));

    const rawResponse = await callAnthropic({
      model,
      system: systemPromptWithAnnotations,
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

    // ═══ D1 — Passe de correction du contraste (carrousel photo uniquement) ═══
    // Chaque slide s'auto-évalue (contrast_ok). Pour celles que l'IA signale encore
    // douteuses, UNE passe ciblée de régénération impose un bandeau opaque. Tout est
    // gardé : au moindre échec on conserve les slides d'origine (jamais de régression).
    if (isPhotoCarousel && Array.isArray(result?.slides_html)) {
      const flagged = result.slides_html.filter((s: any) => s?.contrast_ok === false);
      if (flagged.length > 0) {
        console.warn(
          `carousel-visual: ${flagged.length} slide(s) au contraste douteux → passe de correction`,
          flagged.map((s: any) => s.slide_number)
        );
        try {
          const fixContent: any[] = [];
          for (let i = 0; i < reqBody.photos.length; i++) {
            const photo = reqBody.photos[i];
            if (photo?.base64) {
              const { media_type, data } = extractImagePayload(photo.base64, photo.mimeType);
              fixContent.push({ type: "image", source: { type: "base64", media_type, data } });
              fixContent.push({ type: "text", text: `↑ Photo ${i + 1}` });
            }
          }
          fixContent.push({
            type: "text",
            text: `Ces slides ont un contraste texte/photo INSUFFISANT. Régénère leur HTML (même format, mêmes placeholders {{PHOTO_N}}, même charte) en IMPOSANT un bandeau/voile OPAQUE derrière le texte (rgba opaque jusqu'à 0,92), dimensionné sur le bloc texte, pour une lisibilité franche sur mobile. Ne change rien d'autre que la lisibilité.

SLIDES À CORRIGER :
${JSON.stringify(flagged.map((s: any) => ({ slide_number: s.slide_number, html: s.html })), null, 2)}

Retourne UNIQUEMENT le JSON : { "slides_html": [ { "slide_number": N, "html": "...", "contrast_ok": true, "legibility": "..." } ] }`,
          });

          const fixRaw = await callAnthropic({
            model,
            system: systemPromptWithAnnotations,
            messages: [{ role: "user", content: fixContent }],
            temperature: 0.4,
            max_tokens: 16384,
          });
          const fixCleaned = fixRaw.replace(/```(?:json)?\s*/gi, "").replace(/```\s*$/gi, "");
          const fixMatch = fixCleaned.match(/\{[\s\S]*\}/);
          const fixed = fixMatch ? JSON.parse(fixMatch[0]) : null;
          if (fixed?.slides_html && Array.isArray(fixed.slides_html)) {
            const fixedById = new Map<number, any>();
            for (const s of fixed.slides_html) {
              if (s?.html) fixedById.set(s.slide_number, s);
            }
            result.slides_html = result.slides_html.map((s: any) => {
              const repl = fixedById.get(s.slide_number);
              return repl ? { ...s, html: repl.html, contrast_ok: true, legibility: repl.legibility || s.legibility } : s;
            });
            console.log(`carousel-visual: ${fixedById.size} slide(s) corrigée(s) pour le contraste`);
          }
        } catch (fixErr) {
          console.error("carousel-visual: passe de correction du contraste échouée (slides d'origine conservées)", fixErr);
        }
      }
    }

    // ═══ Kill DÉTERMINISTE des surtitres inventés (carrousel PHOTO uniquement) ═══
    // En mode photo, la prose DOIT porter le fil narratif. Tout label/badge de section
    // inventé par le modèle ("CONVERSATION N°1", "LA MÉTHODE", "LE VRAI BLOCAGE"…) vide la
    // prose et hache la lecture. Le prompt l'interdit mais le modèle le contourne (1 fois
    // sur 5). On le retire donc par code, sans dépendre du modèle.
    // Handle fiable : le modèle annote ces badges `data-pptx-editable="caption"` (cf. règles
    // d'annotation PPTX) et l'overlay réel `data-pptx-editable="overlay"` ; un élément ne
    // porte jamais les deux. On supprime les "caption" qui ne sont NI un numéro de slide NI
    // l'overlay réel, sauf sur la DERNIÈRE slide (CTA toléré).
    if (isPhotoCarousel && Array.isArray(result?.slides_html)) {
      const overlayBySlide = new Map<number, string>();
      if (Array.isArray(slides)) {
        slides.forEach((s: any) => {
          const ov = s?.overlay_text ?? s?.overlay ?? s?.text ?? s?.body;
          if (s && s.slide_number != null && typeof ov === "string") {
            overlayBySlide.set(Number(s.slide_number), ov);
          }
        });
      }
      const lastNum = Math.max(
        ...result.slides_html.map((s: any) => Number(s?.slide_number) || 0),
      );
      const norm = (t: string) =>
        (t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
      const isSlideNumber = (t: string) =>
        /^\s*\d{1,2}\s*([\/.\-]\s*\d{1,2}\s*)?$/.test((t || "").trim());
      let stripped = 0;
      const stripFromHtml = (rawHtml: string, overlayText: string): string => {
        const overlayNorm = norm(overlayText);
        const shouldDrop = (txt: string): boolean => {
          const t = (txt || "").trim();
          if (!t) return false;
          if (isSlideNumber(t)) return false; // garder les numéros de slide
          const tn = norm(t);
          if (!tn) return false;
          // ne JAMAIS retirer l'overlay réel (sécurité si le modèle l'a mal annoté)
          if (overlayNorm && (overlayNorm.includes(tn) || tn.includes(overlayNorm))) return false;
          return true;
        };
        let html = rawHtml;
        // 1) Pilule canonique enveloppant une caption : <span pill><span caption>TXT</span></span>
        html = html.replace(
          /<span\b[^>]*data-pptx-shape="pill"[^>]*>\s*<span\b[^>]*data-pptx-editable="caption"[^>]*>([^<]*)<\/span>\s*<\/span>/gi,
          (m: string, txt: string) => {
            if (shouldDrop(txt)) { stripped++; return ""; }
            return m;
          },
        );
        // 2) Caption autonome (non enveloppée) : <tag caption>TXT</tag>
        html = html.replace(
          /<(\w+)\b[^>]*data-pptx-editable="caption"[^>]*>([^<]*)<\/\1>/gi,
          (m: string, _tag: string, txt: string) => {
            if (shouldDrop(txt)) { stripped++; return ""; }
            return m;
          },
        );
        return html;
      };
      result.slides_html = result.slides_html.map((slide: any) => {
        const num = Number(slide?.slide_number) || 0;
        if (num === lastNum) return slide; // dernière slide : CTA toléré
        const html = stripFromHtml(slide.html || "", overlayBySlide.get(num) || "");
        return { ...slide, html };
      });
      if (stripped > 0) {
        console.log(`carousel-visual: ${stripped} surtitre(s) inventé(s) retiré(s) (kill déterministe mode photo)`);
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
          const p = reqBody.photos[i];
          const raw = p.base64;
          const base64Url = raw.startsWith("data:") ? raw : `data:${p.mimeType || "image/jpeg"};base64,${raw}`;
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
      const fontsLink = `<link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(safeFontTitle)}:ital,wght@0,400;0,700;1,400&family=${encodeURIComponent(safeFontBody)}:wght@400;500;600;700&display=swap" rel="stylesheet">`;
      // Reset défensif : empêche le débordement horizontal du texte hors du cadre
      // 1080px. Cause classique = carte en width:100% + padding sans box-sizing
      // border-box → la carte dépasse et se fait couper à droite (slides chargées
      // en texte). Corrige l'aperçu ET l'export (même HTML source).
      const safetyReset = `<style>*{box-sizing:border-box;}html,body{margin:0;padding:0;}h1,h2,h3,h4,h5,p,span,li,div{overflow-wrap:break-word;}</style>`;

      result.slides_html = result.slides_html.map((slide: any) => {
        let html = slide.html || "";
        // Supprimer les @import Google Fonts existants (ils ne marchent pas dans les iframes)
        html = html.replace(/<style>\s*@import\s+url\([^)]*fonts\.googleapis\.com[^)]*\)\s*;?\s*<\/style>/gi, "");
        // Ajouter le <link> police + le reset défensif au tout début
        html = fontsLink + safetyReset + html;
        return { ...slide, html };
      });
    }

    // ═══ Post-processing 2bis : garde de contraste DÉTERMINISTE sur les titres ═══
    // Diagnostic prod (27/06, mesuré sur un import Canva réel) : sur fond clair, le LLM
    // colore parfois le TITRE ENTIER en rose clair (couleur rendue ≈ rgb(252,156,192),
    // soit la primary semi-transparente) → contraste ~1.3:1, illisible. Ça se voit dans
    // l'aperçu, l'export PPTX ET Canva (l'export reproduit fidèlement la couleur du HTML ;
    // ce n'est donc PAS un bug Canva/export mais la génération). Correctif déterministe
    // (pas une N-ième règle de prompt qui se concurrence) : si la couleur d'un titre
    // éditable échoue le contraste contre le FOND RÉEL de sa slide, on la remplace par la
    // meilleure couleur de charte (foncée sur fond clair, blanche sur fond sombre). On ne
    // touche QUE la couleur du cadre titre → les mots-accent (spans internes en primary/
    // accent) sont préservés. Slides déjà lisibles (titre foncé, ou blanc sur fond plein)
    // = contraste OK → non modifiées.
    if (result?.slides_html) {
      // Compose une couleur (#hex 3/6/8 ou rgb/rgba) sur un fond hex6 → hex6 RENDU.
      // Gère l'alpha (rgba + #rrggbbaa) ET les couleurs claires solides de la même façon.
      const hexOnBg = (raw: string, bg6: string): string | null => {
        const v = (raw || "").trim();
        let r: number, g: number, b: number, a = 1;
        const m = v.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/i);
        if (m) {
          r = +m[1]; g = +m[2]; b = +m[3];
          if (m[4] !== undefined) a = parseFloat(m[4]);
        } else {
          let h = v.replace("#", "");
          if (h.length === 3) h = h.split("").map((c) => c + c).join("");
          if (h.length === 8) { a = parseInt(h.slice(6, 8), 16) / 255; h = h.slice(0, 6); }
          if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
          r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16);
        }
        const B = (i: number) => parseInt(bg6.slice(i, i + 2), 16);
        const comp = (c: number, bc: number) => Math.round(a * c + (1 - a) * bc);
        return [comp(r, B(0)), comp(g, B(2)), comp(b, B(4))]
          .map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();
      };
      const lum = (h6: string): number => {
        const c = (i: number) => {
          const x = parseInt(h6.slice(i, i + 2), 16) / 255;
          return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * c(0) + 0.7152 * c(2) + 0.0722 * c(4);
      };
      const ratio = (a6: string, b6: string): number => {
        const la = lum(a6), lb = lum(b6);
        return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
      };
      // Seuil VOLONTAIREMENT bas (2.8) : on ne corrige que les titres FRANCHEMENT illisibles
      // (rose clair sur fond clair, ratio mesuré ~1.8), SANS toucher aux choix de design
      // intentionnels qui sont seulement « moyens » au sens WCAG mais voulus et lisibles —
      // typiquement le titre BLANC sur slide à fond plein (ratio ~3.4) ou un titre primary
      // solide (~3.2). Le défaut réel (~1.8) et le design voulu (≥3.2) sont nettement séparés.
      const TITLE_MIN_CONTRAST = 2.8;
      const norm = (x: string | null | undefined, fb: string) => hexOnBg(x || "", "FFFFFF") || fb;
      const secondary6 = norm(ch.color_secondary, "91014B");
      const text6 = norm(ch.color_text, "1A1A2E");
      const bgDefault6 = norm(ch.color_background, "FFF4F8");
      // Couleur de remplacement : on PRIVILÉGIE la charte (secondary rose foncé = couleur de
      // titre voulue), puis text, puis blanc — premier candidat franchement lisible (≥4.5).
      // Si aucun n'atteint le confort (fond atypique), on prend le plus contrasté possible.
      const bestTitle = (bg6: string): string => {
        const prefs = [secondary6, text6, "FFFFFF"];
        for (const c of prefs) if (ratio(c, bg6) >= 4.5) return c;
        let best = prefs[0], bestR = ratio(prefs[0], bg6);
        for (const c of [...prefs, "1A1A2E"]) { const r = ratio(c, bg6); if (r > bestR) { best = c; bestR = r; } }
        return best;
      };
      let titlesFixed = 0;
      result.slides_html = result.slides_html.map((slide: any) => {
        let html: string = slide.html || "";
        // Fond réel de la slide = 1ère couleur de fond UNIE rencontrée (le regex n'attrape
        // pas `background:linear-gradient(...)` car la valeur ne commence pas par #/rgb) ;
        // sinon on retombe sur le fond de charte (clair) → titre foncé = choix sûr.
        let bg6 = bgDefault6;
        const bgm = html.match(/background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))/i);
        if (bgm) { const c = hexOnBg(bgm[1], "FFFFFF"); if (c) bg6 = c; }
        html = html.replace(
          /<([a-z0-9]+)([^>]*\bdata-pptx-editable\s*=\s*["']title["'][^>]*)>/gi,
          (full: string) =>
            full.replace(/style\s*=\s*"([^"]*)"/i, (sm: string, style: string) => {
              const cm = style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
              if (!cm) return sm;
              const eff = hexOnBg(cm[1], bg6);
              if (!eff || ratio(eff, bg6) >= TITLE_MIN_CONTRAST) return sm;
              const repl = bestTitle(bg6);
              titlesFixed++;
              const newStyle = style.replace(/((?:^|;)\s*)color\s*:\s*[^;]+/i, `$1color:#${repl}`);
              return `style="${newStyle}"`;
            }),
        );
        return { ...slide, html };
      });
      if (titlesFixed > 0) {
        console.log(`carousel-visual: ${titlesFixed} titre(s) à faible contraste corrigé(s) (garde déterministe)`);
      }
    }

    // P0-3 : remplacer les placeholders {{PHOTO_N}} non substitués par un fallback
    // (sinon l'iframe affiche `url({{PHOTO_2}})` cassé → slide vide).
    if ((isPhotoCarousel || isMixCarousel) && result?.slides_html) {
      // Construire un map des base64 dispos pour fallback (même normalisation que post-proc 1)
      const photoBase64Map = new Map<number, string>();
      const reqPhotos = reqBody.photos;
      if (Array.isArray(reqPhotos)) {
        reqPhotos.forEach((p: any, i: number) => {
          const raw = typeof p === "string" ? p : (p?.base64 || p?.data || "");
          const mime = typeof p === "object" && p?.mimeType ? p.mimeType : "image/jpeg";
          if (raw) {
            const dataUrl = raw.startsWith("data:") ? raw : `data:${mime};base64,${raw}`;
            photoBase64Map.set(i + 1, dataUrl);
          }
        });
      }
      const fallbackPhoto = photoBase64Map.get(1) || Array.from(photoBase64Map.values())[0] || "";
      const placeholderColor =
        "data:image/svg+xml;base64," +
        btoa(
          `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"><rect width="100%" height="100%" fill="#FFE4ED"/><text x="50%" y="50%" font-family="sans-serif" font-size="48" fill="#91014b" text-anchor="middle" dominant-baseline="middle">Photo manquante</text></svg>`
        );

      result.slides_html = result.slides_html.map((slide: any) => {
        let html = slide.html || "";
        if (html.includes("{{PHOTO_")) {
          html = html.replace(/\{\{PHOTO_(\d+)\}\}/g, (_match: string, num: string) => {
            const n = parseInt(num, 10);
            const b64 = photoBase64Map.get(n) || fallbackPhoto || placeholderColor;
            console.warn(
              `carousel-visual: placeholder {{PHOTO_${n}}} orphelin slide ${slide.slide_number} → fallback ${photoBase64Map.has(n) ? "(?)" : fallbackPhoto ? "photo 1" : "placeholder"}`
            );
            return b64;
          });
        }
        return { ...slide, html };
      });
    }

    // Fallback : si Claude a oublié `slides_invariants` dans la réponse, on injecte
    // les invariants serveur (déduits de la charte) pour que l'exporter ne soit jamais
    // privé de la source de vérité.
    if (result && !result.slides_invariants) {
      result.slides_invariants = {
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
        layouts_used: [],
        motif: invariants.motif,
      };
      console.warn("carousel-visual: slides_invariants manquant dans la réponse Claude → fallback serveur");
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
