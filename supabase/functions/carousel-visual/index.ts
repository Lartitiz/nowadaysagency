import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkQuota, logUsage, quotaDeniedResponse } from "../_shared/plan-limiter.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
import { callAnthropic, SONNET_MODEL, type AnthropicModel, type UsageSink } from "../_shared/anthropic.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { validateInput, ValidationError } from "../_shared/input-validators.ts";
import { buildPptxInvariants, formatInvariantsForPrompt, NEUTRAL_DEFAULT_PALETTE } from "../_shared/pptx-invariants.ts";
import { isSafePublicUrl } from "../_shared/scraping.ts";
import { extractImagePayload } from "../_shared/image-utils.ts";
import { assertWorkspaceMembership, workspaceDeniedResponse } from "../_shared/workspace-guard.ts";
import { fetchRecraftIllustrationSvg, buildCoverSlideHtml, hexToRgb } from "../_shared/recraft-illustration.ts";
import { enforceTextContrast } from "../_shared/contrast-guard.ts";
import { enforceMinFontSize } from "../_shared/font-size-guard.ts";
import { enforceAnchoredText, ensureAnchor, ensurePptxEditable, type VerbatimAnchor } from "../_shared/verbatim-guard.ts";
import { checkSchemaFidelity } from "../_shared/schema-telemetry.ts";
import { runWithHeartbeatSSE, type StatusEmitter } from "../_shared/anthropic-stream.ts";

/**
 * Bloc partagé : templates HTML/CSS des schémas visuels (visual_schema).
 * Utilisé à la fois pour les carrousels texte ET les carrousels mixtes,
 * sinon le mixte rendrait les slides à visual_schema en simple texte.
 */
/**
 * Fond de charte SOMBRE ? Pilote le choix des fonds de slides : pour une marque
 * sombre, l'alternance ne doit JAMAIS imposer de slide à fond blanc plein — les
 * fonds restent dans la gamme sombre de la charte (décision Laetitia, 10/07/2026,
 * suite à l'audit rendu visuel : 2-3 slides sur 8 sortaient en blanc plein sur
 * une charte quasi noire). Couleur non parsable → considérée CLAIRE (comportement
 * historique inchangé). Seuil 0.5 = même convention que la garde de contraste.
 */
function isDarkBackground(color: string | undefined | null): boolean {
  let h = String(color || "").trim().replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return false;
  const c = (i: number) => {
    const x = parseInt(h.slice(i, i + 2), 16) / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * c(0) + 0.7152 * c(2) + 0.0722 * c(4) <= 0.5;
}

function buildVisualSchemaBlock(ch: any): string {
  return `═══ SCHÉMAS VISUELS — TEMPLATES HTML/CSS ═══

Certaines slides contiennent un champ "visual_schema" avec des données structurées. Tu DOIS les rendre comme des schémas visuels en HTML/CSS, PAS comme du texte simple.

Voici le design pour chaque type :

█ BEFORE_AFTER — Deux colonnes côte à côte
<div style="display:flex;gap:24px;width:100%">
  <div data-pptx-shape="card" style="flex:1;background:#FFF;border-radius:${ch.border_radius || 12}px;padding:32px">
      <p data-pptx-editable="caption" style="font-size:30px;font-weight:600;color:#E74C3C;margin-bottom:16px">❌ AVANT_LABEL</p>
      <p data-pptx-editable="body" style="font-size:38px;color:${ch.color_text};line-height:1.6;margin:0 0 16px 0">✗ ITEM</p>
      <!-- un <p> par item, TOUJOURS préfixé du glyphe ✗ — JAMAIS de ponctuation (virgule, tiret, point) comme puce -->
  </div>
  <div data-pptx-shape="card" style="flex:1;background:#FFF;border-radius:${ch.border_radius || 12}px;padding:32px">
      <p data-pptx-editable="caption" style="font-size:30px;font-weight:600;color:#27AE60;margin-bottom:16px">✅ APRÈS_LABEL</p>
      <p data-pptx-editable="body" style="font-size:38px;color:${ch.color_text};line-height:1.6;margin:0 0 16px 0">✓ ITEM</p>
      <!-- un <p> par item, TOUJOURS préfixé du glyphe ✓ -->
  </div>
</div>


█ COMPARISON — Similaire mais avec les couleurs/labels du schema
Même structure que before_after mais avec les labels et couleurs du champ left/right.
Puces : ✗ pour la colonne mythe/imaginé, ✓ pour la colonne réalité — JAMAIS de ponctuation comme puce.
⚠️ Si une des deux cartes a un fond sombre (${ch.color_secondary}…), TOUT son texte (items inclus) passe en clair (blanc ou ${ch.color_background}) — jamais ${ch.color_text} sur fond sombre.

█ TIMELINE — Ligne verticale avec des étapes
<div style="position:relative;padding-left:60px">
  <div style="position:absolute;left:24px;top:0;bottom:0;width:3px;background:linear-gradient(to bottom, ${ch.color_primary}, ${ch.color_accent})"></div>
  <!-- Pour chaque step : -->
  <div style="display:flex;gap:20px;margin-bottom:24px;align-items:flex-start">
    <div data-pptx-shape="pill" style="width:52px;height:52px;border-radius:50%;background:${ch.color_secondary};color:#FFF;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:600;flex-shrink:0">01</div>
    <div data-pptx-shape="card" style="flex:1;background:#FFF;border-radius:${ch.border_radius || 12}px;padding:24px;box-shadow:0 2px 8px rgba(0,0,0,0.04)">
      <p data-pptx-editable="subtitle" style="font-size:36px;color:${ch.color_secondary}">LABEL</p>
      <p data-pptx-editable="body" style="font-size:32px;color:${ch.color_text};opacity:0.85;margin-top:6px">DESC</p>
    </div>
  </div>
</div>

█ CHECKLIST — Liste avec des badges ✅/❌
Pour chaque item :
<div data-pptx-shape="card" style="display:flex;align-items:center;gap:16px;padding:16px 24px;background:#FFF;border-radius:${ch.border_radius || 12}px;margin-bottom:12px;box-shadow:0 2px 8px rgba(0,0,0,0.04)">
  <span style="font-size:32px">✅ ou ❌</span>
  <p data-pptx-editable="body" style="font-size:38px;color:${ch.color_text}">TEXTE</p>
</div>

█ STATS — Gros chiffres avec labels
Pour chaque stat :
<div style="text-align:center;padding:24px">
  <p data-pptx-editable="title" style="font-size:80px;font-weight:700;color:${ch.color_primary};line-height:1">73%</p>
  <p data-pptx-editable="body" style="font-size:32px;color:${ch.color_text};margin-top:8px;opacity:0.8">description</p>
</div>
Dispose 2-3 stats en flex row avec des séparateurs visuels.

█ MATRIX_2X2 — Grille 2×2 avec axes
<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
  <div data-pptx-shape="card" style="background:${ch.color_primary}15;border-radius:${ch.border_radius || 12}px;padding:24px;text-align:center">
    <span style="font-size:40px">EMOJI</span>
    <p data-pptx-editable="body" style="font-size:32px;font-weight:600;margin-top:8px">LABEL</p>
  </div>
</div>

Ajoute les labels d'axes autour de la grille.

█ PYRAMID — Niveaux empilés (le plus large en bas)
Le sommet = 50% de largeur, la base = 100%. Couleurs du plus foncé (sommet) au plus clair (base).

█ EQUATION — A + B = C
<div style="display:flex;align-items:center;justify-content:center;gap:24px">
  <div style="background:#FFF;border-radius:${ch.border_radius || 12}px;padding:24px 32px;box-shadow:0 2px 12px rgba(0,0,0,0.06);text-align:center">
    <p style="font-size:32px;font-weight:600;color:${ch.color_secondary}">A</p>
  </div>
  <span style="font-size:48px;color:${ch.color_primary}">+</span>
  <!-- ... -->
  <span style="font-size:48px;color:${ch.color_primary}">=</span>
  <div style="background:${ch.color_primary};border-radius:${ch.border_radius || 12}px;padding:24px 32px;text-align:center">
    <p style="font-size:32px;font-weight:600;color:white">C</p>
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
    <p data-pptx-editable="body" style="font-size:32px;font-weight:600;color:${ch.color_secondary}">LABEL</p>
  </div>
</div>

█ STORY_ARC — Récit en 3-5 étapes verticales (numéros décoratifs + cartes connectées par filet pointillé)
<div style="display:flex;flex-direction:column;gap:0">
  <!-- Pour chaque step (i = index 0-based, formate "01", "02"…) : -->
  <div style="display:flex;gap:24px;align-items:flex-start">
    <div style="flex-shrink:0;width:64px;text-align:right;padding-top:8px">
      <span data-pptx-editable="caption" style="font-size:40px;font-weight:700;color:${ch.color_primary};opacity:0.4;font-family:${ch.font_title};line-height:1">01</span>
    </div>
    <div data-pptx-shape="card" style="flex:1;background:#FFF;border-radius:${ch.border_radius || 12}px;padding:24px 28px;box-shadow:0 2px 12px rgba(0,0,0,0.05)">
      <h3 data-pptx-editable="title" style="font-size:34px;font-weight:600;color:${ch.color_primary};margin:0 0 8px 0;font-family:${ch.font_title}">LABEL</h3>
      <p data-pptx-editable="body" style="font-size:32px;color:${ch.color_text};line-height:1.4;margin:0;font-family:${ch.font_body}">DESC</p>
    </div>
  </div>
  <!-- Filet pointillé entre steps (PAS après le dernier) : -->
  <div style="margin-left:88px;width:2px;height:20px;border-left:2px dotted ${ch.color_secondary};opacity:0.4"></div>
</div>
Si story_arc.steps.length < 3 → rends comme une simple liste verticale sans filet (peu probable, mais tolère).

█ QUOTE_BIG — Citation typographique (guillemet décoratif XL + citation italique + attribution discrète)
<div style="position:relative;padding:60px;display:flex;flex-direction:column;justify-content:center;height:100%">
  <!-- Si "context" présent — sinon omettre ce bloc : -->
  <p data-pptx-editable="caption" style="font-size:28px;color:${ch.color_secondary};margin:0 0 24px 0;font-family:${ch.font_body}">CONTEXT</p>
  <span aria-hidden="true" style="position:absolute;top:20px;left:30px;font-size:140px;line-height:1;color:${ch.color_primary};opacity:0.2;font-family:Georgia,serif">"</span>
  <p data-pptx-editable="title" style="font-size:56px;font-style:italic;line-height:1.3;color:${ch.color_text};margin:0;font-family:${ch.font_title};font-weight:normal">QUOTE</p>
  <!-- Si "attribution" présente — sinon omettre : -->
  <p data-pptx-editable="body" style="font-size:28px;color:${ch.color_secondary};margin:32px 0 0 0;font-family:${ch.font_body}">ATTRIBUTION</p>
</div>
RÈGLE TAILLE QUOTE : 64px si quote < 60 chars, 56px par défaut (60-120 chars), 48px si > 120 chars.
RÈGLE FALLBACK : si quote_big.quote est absent → utilise slide.title à la place.

█ OBJECTION_RESPONSE — Déconstruction verticale (objection en haut grisé, response en bas dominante)
<div style="display:flex;flex-direction:column;gap:32px">
  <div data-pptx-shape="card" style="background:${ch.color_secondary}15;border-radius:${ch.border_radius || 12}px;padding:32px;position:relative">
    <span aria-hidden="true" style="position:absolute;top:16px;right:24px;font-size:32px;color:${ch.color_primary};opacity:0.5">❝</span>
    <p data-pptx-editable="caption" style="font-size:28px;font-weight:600;color:${ch.color_secondary};text-transform:uppercase;letter-spacing:1px;margin:0 0 12px 0;font-family:${ch.font_body}">CE QU'ON DIT</p>
    <p data-pptx-editable="body" style="font-size:38px;color:${ch.color_text};line-height:1.4;margin:0;font-style:italic;font-family:${ch.font_body}">OBJECTION</p>
  </div>
  <div data-pptx-shape="card" style="background:#FFF;border-radius:${ch.border_radius || 12}px;padding:32px;box-shadow:0 4px 16px rgba(0,0,0,0.06)">
      <p data-pptx-editable="caption" style="font-size:28px;font-weight:600;color:${ch.color_primary};text-transform:uppercase;letter-spacing:1px;margin:0 0 12px 0;font-family:${ch.font_body}">MA POSITION</p>
      <p data-pptx-editable="title" style="font-size:40px;color:${ch.color_text};line-height:1.4;margin:0;font-weight:500;font-family:${ch.font_title}">RESPONSE</p>
  </div>
</div>
La RESPONSE est typographiquement plus grande que l'OBJECTION — elle domine.

█ PROCESS_VISIBLE — 3 colonnes égales (Avant/Pendant/Après) reliées par flèches
<div style="display:flex;align-items:stretch;gap:16px">
  <!-- Pour chaque stage (i = 0..2, formate "01", "02", "03") : -->
  <div data-pptx-shape="card" style="flex:1;background:#FFF;border-radius:${ch.border_radius || 12}px;padding:28px 20px;box-shadow:0 2px 12px rgba(0,0,0,0.05)">
    <span data-pptx-editable="caption" style="font-size:64px;font-weight:700;color:${ch.color_primary};opacity:0.25;line-height:1;font-family:${ch.font_title};display:block;margin-bottom:8px">01</span>
    <h3 data-pptx-editable="title" style="font-size:32px;font-weight:600;color:${ch.color_secondary};margin:0 0 12px 0;font-family:${ch.font_title}">LABEL</h3>
    <p data-pptx-editable="body" style="font-size:30px;color:${ch.color_text};line-height:1.4;margin:0;font-family:${ch.font_body}">DESC</p>
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

  // SSE heartbeat (même pattern que carousel-ai) : garde la connexion vivante
  // pendant la génération ET porte les events de progression réelle (lots de
  // slides terminés) que le front affiche à la place d'une barre simulée.
  const wantsSSE = (req.headers.get("accept") || "").includes("text/event-stream");

  const handle = async (emitStatus: StatusEmitter = () => {}): Promise<Response> => {

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

    const reqBody = await req.json();
    // Carrousel « Qualité Max » = Opus (~50× le coût d'un post) → quota dédié
    // `quality_max` (gratuit = 0, Premium = 20/mois).
    const quota = await checkQuota(user.id, reqBody?.quality_max ? "quality_max" : "content", ownerWorkspaceId);
    if (!quota.allowed) {
      return quotaDeniedResponse(quota, corsHeaders);
    }

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
      cover_illustration: z.boolean().optional(),
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
        .select("color_primary, color_secondary, color_accent, color_background, color_text, font_title, font_body, mood_keywords, border_radius, uploaded_templates, photo_style, visual_donts, ai_generated_brief, moodboard_description, icon_style, template_layout_description, texture_url, texture_enabled")
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
      // Palette par défaut NEUTRE & éditoriale — source unique NEUTRAL_DEFAULT_PALETTE
      // (pptx-invariants), sinon charte vide = prompt bicolore (audit 10/07).
      color_primary: charter.color_primary || NEUTRAL_DEFAULT_PALETTE.primary,
      color_secondary: charter.color_secondary || NEUTRAL_DEFAULT_PALETTE.secondary,
      color_accent: charter.color_accent || NEUTRAL_DEFAULT_PALETTE.accent,
      color_background: charter.color_background || NEUTRAL_DEFAULT_PALETTE.background,
      color_text: charter.color_text || NEUTRAL_DEFAULT_PALETTE.text,
      font_title: charter.font_title || "Libre Baskerville",
      font_body: charter.font_body || "IBM Plex Mono",
      mood_keywords: Array.isArray(charter.mood_keywords) ? charter.mood_keywords.join(", ") : (charter.mood_keywords || "épuré, élégant, minimal, éditorial"),
      border_radius: charter.border_radius || "12px",
      photo_style: charter.photo_style || "",
      visual_donts: charter.visual_donts || "",
      ai_generated_brief: charter.ai_generated_brief || "",
      moodboard_description: charter.moodboard_description || "",
      icon_style: charter.icon_style || "",
      template_layout_description: charter.template_layout_description || "",
      // Texture de fond « matière » (générée 1× par marque via recraft-texture).
      // Vide si non activée → les prompts retombent sur l'aplat color_background.
      texture_url: (charter.texture_enabled && typeof charter.texture_url === "string")
        ? charter.texture_url.replace(/['"<>\\]/g, "")
        : "",
    };

    // Marque SOMBRE : les fonds de slides restent dans la gamme sombre de la
    // charte (jamais de blanc plein imposé par l'alternance). La texture de
    // marque étant une matière claire, elle garde la logique claire.
    const darkBrand = isDarkBackground(String(ch.color_background)) && !ch.texture_url;

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
Fond par défaut : ${ch.texture_url ? `background:url('${ch.texture_url}') center/cover — c'est la TEXTURE DE MARQUE (matière papier). Utilise EXACTEMENT ce CSS pour tout fond de slide où tu aurais mis un aplat ${ch.color_background}. Les cartes/bandeaux posés PAR-DESSUS restent en aplats opaques (blanc ou teintes de la charte), jamais la texture dans une carte.` : ch.color_background}
Texte : ${ch.color_text}
Police titres : ${ch.font_title} (JAMAIS en font-weight bold, toujours normal/400)
Police corps : ${ch.font_body}
Ambiance : ${ch.mood_keywords}
Border-radius : ${ch.border_radius}${ch.photo_style ? `\nStyle photo / ambiance visuelle : ${ch.photo_style}` : ""}${ch.visual_donts ? `\n\n⛔ INTERDITS VISUELS (l'utilisatrice a EXPLICITEMENT interdit ces éléments) :\n${ch.visual_donts}` : ""}${ch.ai_generated_brief ? `\n\nBRIEF CRÉATIF DE LA MARQUE :\n${ch.ai_generated_brief}` : ""}${ch.moodboard_description ? `\n\nAMBIANCE MOODBOARD :\n${ch.moodboard_description}` : ""}${ch.icon_style ? `\nStyle d'icônes : ${ch.icon_style}` : ""}${ch.template_layout_description ? `\n\n═══ LAYOUT DE RÉFÉRENCE (des templates uploadés par l'utilisatrice) ═══\n${ch.template_layout_description}\n\nIMPORTANT : Inspire-toi de ce layout pour le placement des éléments, le style des blocs, l'alternance des mises en page. Adapte-le au contenu de chaque slide.` : ""}

═══ DESIGN SYSTEM — VALEURS CSS CONCRÈTES ═══

CONTRASTE (règle absolue, vérifie CHAQUE bloc avant de retourner) :
- La couleur d'un texte est TOUJOURS très éloignée de la couleur de son fond DIRECT (la carte ou le bloc qui le porte, pas la slide).
- Sur une carte/fond sombre (${ch.color_secondary}, #1A1A1A, dark box…) : texte en blanc, ${ch.color_background} ou ${ch.color_accent} — JAMAIS ${ch.color_text} ni la couleur du fond.
- Erreur réelle à ne jamais reproduire : des items écrits en color:#1C1C20 dans une carte background:#1C1C20 (invisibles).

PADDING : 80px sur les côtés, 60px en haut et en bas. JAMAIS de texte collé aux bords.

TITRES (headlines) :
- Font : ${ch.font_title}, font-weight: normal (JAMAIS bold), font-style: normal
- Taille : 64-84px pour le hook (slide 1), 48-58px pour les autres slides
- Couleur : ${ch.color_secondary} ou ${ch.color_text}
- Line-height : 1.25
- Certains MOTS-CLÉS en couleur accent ${ch.color_primary} et font-style: italic pour créer du contraste

CORPS DE TEXTE :
- Font : ${ch.font_body}, font-weight: 400
- Taille : 34-40px
- Couleur : ${ch.color_text}
- Line-height : 1.6
- Opacity: 0.85 pour le texte secondaire

BADGES "PILULES" (élément signature) :
- Display: inline-block
- Background : ${ch.color_primary}
- Color: white, font-family: ${ch.font_body}, font-weight: 600
- Font-size: 22-26px, text-transform: uppercase, letter-spacing: 2px
- Padding: 8px 24px
- Border-radius: 100px (pilule)
- Utilise-les pour : catégorie, label de section, mot-clé. JAMAIS un numéro de slide ni un label "SLIDE".

EYEBROWS (petit label au-dessus du titre — à DOSER, jamais systématique) :
- Un eyebrow = une ligne courte au-dessus du titre : font-family: ${ch.font_body}, font-size: 24-26px, font-weight: 600, text-transform: uppercase, letter-spacing: 3px, couleur ${ch.color_primary}
- Deux formes possibles : texte nu OU badge pilule (voir ci-dessus).
- Sur 1-2 slides du carrousel MAXIMUM, là où un label éditorial apporte vraiment quelque chose ("LE PIÈGE", "CE QUE ÇA CHANGE"…) — jamais un numéro de slide.
- L'absence d'eyebrow est le cas NORMAL. Un eyebrow sur chaque slide = effet template généré par IA, c'est un défaut.
- Gap eyebrow → titre : 16-20px.

MISE EN VALEUR DES MOTS-CLÉS (OBLIGATOIRE dans chaque titre) :
- 1 à 3 mots par titre reçoivent un traitement visuel. Trois techniques, à VARIER d'une slide à l'autre (l'italique seul sur tout le carrousel = raté ; utilise l'effet surligneur sur AU MOINS une slide) :
  · Italique accentué : color: ${ch.color_primary}; font-style: italic
  · Effet surligneur : background: linear-gradient(transparent 55%, ${ch.color_accent}66 55%); padding: 0 6px
  · Soulignement épais : border-bottom: 6px solid ${ch.color_accent}
- Dans le corps de texte : au plus 1 mot par bloc en font-weight: 600 + couleur ${ch.color_primary}.

DENSITÉ & RESPIRATION (à juger à l'échelle du CARROUSEL, pas de la slide) :
- Une slide minimaliste (titre fort + texte nu, typographie impeccable, bien centrée) est LÉGITIME et souvent élégante — surtout pour une punchline, une citation, un moment de storytelling. Ne la surcharge pas pour la « designer ».
- Mais un carrousel ENTIER de slides nues = plat. Sur l'ensemble, au moins 2-3 slides portent un vrai moment de design : carte blanche, chiffre géant décoratif (120-200px en ${ch.font_title}, opacity 0.12-0.2), emoji 48-64px posé comme élément graphique (pas en fin de ligne), ou encadré pointillé.
- Les chiffres et données du contenu sont TOUJOURS mis en scène : très grande taille (72-120px) en ${ch.font_title}, couleur ${ch.color_primary}, jamais noyés dans une phrase. Pour ça, DUPLIQUE le chiffre dans un élément décoratif (carte, chiffre géant) — mais l'élément ancré data-slide-text garde le texte source COMPLET et inchangé (ne déplace jamais un morceau du body vers un élément décoratif).
- Nombres à la française : décimale avec virgule collée ("3,5 ans" — jamais "3, 5 ans" ni "3.5").

CARTES BLANCHES (pour les blocs de contenu) :
- Background: #FFFFFF
- Border-radius: ${ch.border_radius}
- Box-shadow: 0 4px 24px rgba(0,0,0,0.06)
- Padding: 40px
- ❌ JAMAIS de barre/trait vertical accolé au flanc d'une carte (le « trait coloré à gauche » = tell « généré par IA », banni). Pour différencier une carte : ombre légère, fond très légèrement teinté (${ch.color_background}), ou encadré pointillé.

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

- Optionnel : petit badge pilule de thème/catégorie en haut, AU-DESSUS du titre (jamais un numéro de slide).

- Le titre est verticalement centré dans la slide (flex, justify-content:center), le badge en haut.

- Optionnel : motif décoratif subtil en fond (lignes, zigzag — pas de ronds).

CONTEXTE / STORYTELLING (slide 2) — Personnel, immersif :
- Fond : ${darkBrand ? `${ch.color_background} ou une déclinaison à peine plus claire de ${ch.color_background} (même famille sombre — JAMAIS blanc)` : `blanc ou ${ch.color_background}`}
- Titre en ${ch.font_title} (48-56px)
- Corps en ${ch.font_body} avec un ton intime
- Optionnel : bordure pointillée autour du bloc de texte
- Optionnel : petit emoji en grand (48px) comme élément visuel

TIPS / CONTENU PÉDAGOGIQUE (slides du milieu) — Clair, structuré :
- Fond : ${darkBrand ? `${ch.color_background} (les cartes posées dessus portent la clarté)` : "blanc"}
- Optionnel : badge pilule en haut à gauche avec un label éditorial court ("Le piège", "À éviter", etc.) — jamais un numéro de slide.
- Titre headline en ${ch.font_title} (48-56px), couleur ${ch.color_secondary}
- Corps du tip en ${ch.font_body} (34-38px)
- Pour structurer le bloc : un mot-clé surligné ou un encadré pointillé — JAMAIS de barre verticale accolée au texte
- Un mot-clé souligné en ${ch.color_accent} (soulignement jaune type highlighter)
- Alterner les couleurs d'accent entre les slides pour la variété, UNIQUEMENT dans la palette de la charte : ${ch.color_primary}, ${ch.color_accent}, ${ch.color_secondary}. JAMAIS de couleur hors charte pour les accents.

SLIDE SÉPARATEUR (optionnelle, entre les blocs) — Rupture visuelle :
- Fond : ${ch.color_primary} (rose vif, plein)
- Titre en BLANC, ${ch.font_title}, 64px, centré
- Pas de body, juste le titre
- Optionnel : numéro de bloc en très grand (200px) coupé en bas de slide, opacity 0.15

DARK BOX (pour les punchlines fortes) :
- Fond : #1A1A1A
- Texte blanc en ${ch.font_title} (56px)
- Un mot en ${ch.color_accent} (jaune) pour le contraste
- Padding généreux (80px)

CTA (dernière slide) — Douce, invitante :
- Fond : ${ch.color_background}
- Carte blanche centrée
- Texte du CTA en ${ch.font_title} (44-52px), couleur ${ch.color_primary}
- Badge pilule dessous avec "lien en bio" ou le CTA court
- Ambiance chaleureuse, pas commerciale
- Optionnel : petits badges de compétences/thèmes dispersés autour de la carte principale

═══ COHÉRENCE ENTRE LES SLIDES ═══
- TOUTES les slides utilisent les MÊMES fonts (${ch.font_title} pour les titres, ${ch.font_body} pour le corps)
- Le padding latéral est IDENTIQUE sur toutes les slides (80px)
- Les badges pilules ont le MÊME style partout
- Le fond ${darkBrand ? `reste dans la GAMME SOMBRE de la charte : ${ch.color_background}, une déclinaison à peine plus claire ou plus foncée de ${ch.color_background} (même famille), et ponctuellement ${ch.color_primary} — l'alternance est OPTIONNELLE et JAMAIS une slide à fond blanc/clair plein : la marque est sombre, chaque fond de slide reste sombre` : `ALTERNE entre : ${ch.texture_url ? `la texture de marque (background:url('${ch.texture_url}') center/cover), blanc, et ponctuellement ${ch.color_primary}` : `blanc, ${ch.color_background}, et ponctuellement ${ch.color_primary}`} (max 1-2 slides en fond coloré plein)`}
- La hiérarchie titre/corps est CONSTANTE : le titre est toujours plus grand, toujours en ${ch.font_title}
- Les éléments décoratifs (barres, soulignements) utilisent une palette cohérente

═══ ANTI-PATTERNS — CE QUE TU NE FAIS JAMAIS ═══
- ❌ Texte centré nu sur un fond de couleur uni (c'est un PowerPoint 2003, pas du design)
- ❌ Toutes les slides avec le même layout (il faut de la variété visuelle)
- ❌ Texte trop petit (<30px) ou trop gros (>84px sauf numéros décoratifs)
- ❌ Pas de padding (texte qui touche les bords)
- ❌ Cercles ou ronds comme éléments décoratifs
- ❌ Font-weight bold sur ${ch.font_title} (toujours normal)
- ❌ Couleurs qui ne sont pas dans la charte
- ❌ Plus de 3 couleurs de fond différentes dans tout le carrousel${darkBrand ? `\n- ❌ Slide à fond BLANC ou clair plein alors que la charte est sombre — les fonds de slides restent dans la gamme sombre (les cartes/bandeaux clairs posés DESSUS restent autorisés)` : ""}
- ❌ Le même ornement répété sur toutes les slides (eyebrow partout, badge partout, carte partout) — effet template généré par IA
- ❌ Barre/trait vertical accolé au flanc d'une carte ou d'un bloc de texte — LE tell « généré par IA » par excellence
- ❌ Carrousel entier sans un seul moment de design (aucune carte, aucun chiffre mis en scène, aucune rupture) — le symptôme « lisible mais plat »
- ❌ Titre dont aucun mot-clé n'est mis en valeur (italique accent, surligneur ou soulignement épais)

${buildVisualSchemaBlock(ch)}

${styleInstructions}

═══ ANCRAGE DU TEXTE (OBLIGATOIRE — permet l'édition en direct) ═══
- Dans chaque slide, l'élément qui contient DIRECTEMENT le titre porte l'attribut data-slide-text="title" ; celui qui contient le corps porte data-slide-text="body". Un seul élément de chaque par slide.
- Le texte du JSON y est recopié VERBATIM (aucune reformulation, coupure, fusion ou ajout — la CASSE d'origine est conservée, MAJUSCULES comprises, et les émojis présents dans le texte restent DANS le texte). Tu peux styler des mots via des <span> À L'INTÉRIEUR de cet élément, mais le texte complet reste identique.
- Si un champ (title ou body) est VIDE dans le JSON, tu n'écris RIEN à sa place : n'invente jamais une phrase de complément, un sous-titre ou une accroche.
- Les textes décoratifs que TU crées (numéros géants, labels de schéma…) ne portent JAMAIS cet attribut.
- BOUTON D'APPEL À L'ACTION de la dernière slide (pilule/badge « Réponds en commentaire », « Enregistre ce post », « lien en bio »… — le CTA graphique, PAS le titre/corps) : enveloppe TOUT le bouton dans un élément portant l'attribut data-slide-cta, et l'élément qui contient DIRECTEMENT son texte porte data-slide-text="cta". Cela permet à l'utilisatrice de le modifier ou de le retirer entièrement. N'ajoute data-slide-cta QUE sur ce bouton, jamais sur un titre, un corps ou un élément décoratif.

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
Fond par défaut : ${ch.texture_url ? `background:url('${ch.texture_url}') center/cover — c'est la TEXTURE DE MARQUE (matière papier). Utilise EXACTEMENT ce CSS pour tout fond de slide où tu aurais mis un aplat ${ch.color_background}. Les cartes/bandeaux posés PAR-DESSUS restent en aplats opaques (blanc ou teintes de la charte), jamais la texture dans une carte.` : ch.color_background}
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
- Texte : font-family: ${ch.font_title}; font-size: 48-58px; color: white; font-weight: normal; font-style: italic
- Padding : 80px côtés, 60px du bord
- Ombre texte : text-shadow: 0 2px 20px rgba(0,0,0,0.6)

STYLE "narratif" (phrases d'histoire) :
- Position : selon overlay_position
- Bandeau CLAIR, annoté data-pptx-shape="card" : background: #FFFFFF (BLANC OPAQUE — JAMAIS rgba semi-transparent ni backdrop-filter : ils ne s'exportent pas et laissent voir la photo au travers) ; border-radius: ${ch.border_radius}; box-shadow: 0 8px 28px rgba(0,0,0,0.18)
- Texte FONCÉ : font-family: ${ch.font_body}; font-size: 40-46px; color: ${ch.color_text}
- Padding : 28px 40px
- Le bandeau ne fait PAS toute la largeur : max-width: 85%, centré ou aligné

STYLE "minimal" (phrases courtes percutantes) :
- Position : selon overlay_position
- Badge pilule : background ${ch.color_primary}; color white; font-family: ${ch.font_body}; font-size: 28-32px; text-transform: uppercase; letter-spacing: 2px; padding: 12px 32px; border-radius: 100px
- Ou texte nu en blanc très grand (60-72px) avec ombre forte : text-shadow: 0 4px 30px rgba(0,0,0,0.8) ET un voile sombre adaptatif derrière si la zone est claire

STYLE "technique" (détails produit) :
- Position : coin ou bord selon overlay_position
- Étiquette : background rgba(0,0,0,0.8); color white; font-family: ${ch.font_body}; font-size: 28-32px; padding: 12px 24px; border-radius: 8px
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
- ❌ Texte trop petit (< 28px)
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

═══ ANCRAGE DU TEXTE (OBLIGATOIRE — permet l'édition en direct) ═══
L'élément qui contient DIRECTEMENT l'overlay_text porte l'attribut data-slide-text="overlay" (un seul par slide, texte recopié VERBATIM ; les <span> de style restent À L'INTÉRIEUR de cet élément). Le CTA autorisé de la dernière slide ne porte PAS data-slide-text="overlay" : s'il prend la forme d'un bouton/pilule graphique, enveloppe-le dans un élément data-slide-cta avec son texte en data-slide-text="cta" (permet de le modifier ou de le retirer).

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
Fond par défaut : ${ch.texture_url ? `background:url('${ch.texture_url}') center/cover — c'est la TEXTURE DE MARQUE (matière papier). Utilise EXACTEMENT ce CSS pour tout fond de slide où tu aurais mis un aplat ${ch.color_background}. Les cartes/bandeaux posés PAR-DESSUS restent en aplats opaques (blanc ou teintes de la charte), jamais la texture dans une carte.` : ch.color_background}
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
  · "top_photo" : photo height 740px (≈55%), texte en bas (610px) sur fond ${ch.color_background}. ÉLÉMENT DISTINCTIF : soulignement coloré ${ch.color_accent} (4px, width 80px) sous le titre (pas de badge numéro de slide).
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
- INTERDIT : aucun badge "numéro de slide" (ex: "SLIDE 03", "01/08", "03/08") ni pastille de pagination en coin sur AUCUNE slide. Ces stamps n'apportent rien au lecteur et alourdissent le visuel. L'unité du carrousel vient des fonts, de la palette et des éléments graphiques récurrents — PAS d'un compteur posé par-dessus.
- Continuité photo→texte : entre une slide photo_full/photo_integrated et une slide text_only suivante, REPRENDS un élément graphique commun (même style de soulignement, même typographie de titre, même couleur d'accent).
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

═══ ANCRAGE DU TEXTE (OBLIGATOIRE — permet l'édition en direct) ═══
- Slides "photo_full" : l'élément qui contient DIRECTEMENT l'overlay_text porte data-slide-text="overlay".
- Slides "text_only" et "photo_integrated" : l'élément du titre porte data-slide-text="title", celui du corps data-slide-text="body".
- Texte recopié VERBATIM dans ces éléments (les <span> de style restent à l'intérieur) ; jamais cet attribut sur des textes décoratifs.
- BOUTON D'APPEL À L'ACTION de la dernière slide (pilule/badge « Réponds en commentaire », « Enregistre ce post »…) : enveloppe TOUT le bouton dans un élément portant data-slide-cta, et l'élément qui contient DIRECTEMENT son texte porte data-slide-text="cta" (permet de le modifier ou de le retirer). Uniquement sur ce bouton.

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

    // ═══ Construction des messages, factorisée ═══
    // La génération parallèle par lots construit un message par lot avec le même
    // squelette (photos en vision / templates de référence). On pré-résout donc
    // les URLs de templates une seule fois, puis `buildMessagesFor` assemble un
    // message pour un texte de prompt donné (et, en mode photo/mix, le sous-
    // ensemble de photos réellement référencées par le lot).
    const imageExtensions = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"];
    const isImageUrl = (url: string) => {
      const lower = url.toLowerCase().split("?")[0];
      return imageExtensions.some(ext => lower.endsWith(ext));
    };

    let validImageUrls: string[] = [];
    if (!isPhotoCarousel && !isMixCarousel && isCharterRef && templateUrls.length > 0) {
      // Filter to only image URLs (exclude PDFs and other unsupported formats)
      const imageUrls = templateUrls.filter((u: string) => isImageUrl(u));

      // Vérifier que les URLs sont accessibles (signed URLs Supabase peuvent expirer)
      for (const url of imageUrls) {
        try {
          if (!isSafePublicUrl(url)) { // anti-SSRF : bloque IP privées / métadata (les URLs signées Supabase passent)
            console.warn(`carousel-visual: URL template non sûre, ignorée: ${url}`);
            continue;
          }
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
    }

    // `photoIndexes` (1-based, optionnel) : sous-ensemble de photos à joindre
    // (celles référencées par les slides du lot) — évite de renvoyer toutes les
    // photos en vision à chaque appel parallèle.
    const buildMessagesFor = (userText: string, photoIndexes?: number[]): any[] => {
      if (isPhotoCarousel || isMixCarousel) {
        const messageContent: any[] = [];
        for (let i = 0; i < reqBody.photos.length; i++) {
          if (photoIndexes && !photoIndexes.includes(i + 1)) continue;
          const photo = reqBody.photos[i];
          if (photo.base64) {
            const { media_type, data } = extractImagePayload(photo.base64, photo.mimeType);
            messageContent.push({
              type: "image",
              source: { type: "base64", media_type, data }
            });
            messageContent.push({
              type: "text",
              text: `↑ Photo ${i + 1}`
            });
          }
        }
        messageContent.push({ type: "text", text: userText });
        return [{ role: "user", content: messageContent }];
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
          text: `Voici le template de référence de l'utilisatrice. Analyse son design (mise en page, style, espacement, ambiance) et reproduis-le fidèlement pour les slides suivantes.\n\n${userText}`,
        });
        return [{ role: "user", content }];
      }
      return [{ role: "user", content: userText }];
    };

    // Modèle des visuels branché sur « Mode qualité Max » : Sonnet par défaut (rapide,
    // ~2x plus court à générer), Opus seulement si l'utilisatrice a coché le toggle
    // (rendu le plus soigné, plus lent). Le pass de correction réutilise ce `model`.
    const model: AnthropicModel = reqBody.quality_max ? "claude-opus-4-8" : SONNET_MODEL;

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

- CONTRAINTE DE SORTIE VÉRIFIABLE : le dernier élément visible de chaque slide se termine entre 1010px et 1240px de hauteur (75-92% des 1350px). Si ton contenu finit plus haut, AUGMENTE font-sizes, paddings et gaps jusqu'à atteindre cette zone — n'ajoute pas de texte, agrandis l'existant. Si au contraire ton contenu DÉPASSE 1240px : RACCOURCIS les textes (moins de mots, moins d'items) — ne réduis JAMAIS une font-size sous 32px pour faire tenir.

Une slide dont le contenu flotte dans le tiers central avec les deux autres tiers vides est un DÉFAUT à corriger avant de répondre.

═══ ANNOTATIONS POUR EXPORT POWERPOINT ÉDITABLE — OBLIGATOIRE ═══

Sur CHAQUE bloc de texte significatif (titre, corps, overlay sur photo, légende, badge), ajoute l'attribut HTML \`data-pptx-editable\` avec une de ces valeurs :
- \`data-pptx-editable="title"\` → titre principal de la slide (hook, headline)
- \`data-pptx-editable="body"\` → corps de texte, paragraphes, items de liste, descriptions
- \`data-pptx-editable="overlay"\` → texte court superposé à une photo
- \`data-pptx-editable="caption"\` → badge "INFOGRAPHIE", watermark, légende discrète (jamais un numéro de slide)

Règles :
1. L'attribut va sur le NOEUD QUI CONTIENT DIRECTEMENT le texte (le <p>, <h1>, <h2>, <span>, <div>...), pas sur un parent qui en contient plusieurs.
2. N'annote PAS les éléments purement décoratifs (formes SVG, traits, fonds colorés, emojis isolés sans texte autour).
3. Si une carte contient un titre + un paragraphe, annote les DEUX séparément, pas la carte entière.
4. Si un même texte apparaît à plusieurs endroits visuellement (ex: titre dupliqué pour effet typographique), annote-en UN SEUL.

Exemple :
<div style="...carte..."><h2 data-pptx-editable="title" style="...">Mon titre</h2><p data-pptx-editable="body" style="...">Mon paragraphe</p></div>
<span data-pptx-editable="caption" style="...badge...">Infographie</span>

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
      slides_count: slides.length,
      style,
      is_photo: isPhotoCarousel,
      is_mix: isMixCarousel,
      invariants_motif: invariants.motif,
      invariants_title_pt: invariants.typography.title_pt,
      timestamp: new Date().toISOString(),
    }));

    // ═══ Parsing d'une réponse slides (même format pour chaque appel/lot) ═══
    const parseSlidesJson = (raw: string): any => {
      try {
        // Strip markdown code fences if present
        const cleaned = raw.replace(/```(?:json)?\s*/gi, "").replace(/```\s*$/gi, "");
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
        throw new Error("No JSON found");
      } catch (parseErr) {
        console.error("Failed to parse carousel-visual response:", raw.slice(0, 500));
        // Retry: try to find the slides_html array directly
        try {
          const arrayMatch = raw.match(/\[\s*\{[\s\S]*\}\s*\]/);
          if (arrayMatch) return { slides_html: JSON.parse(arrayMatch[0]) };
          throw parseErr;
        } catch {
          throw new Error("L'IA n'a pas retourné un format valide. Réessaie.");
        }
      }
    };

    // ═══ Génération PARALLÈLE par lots de slides ═══
    // Mesure du 05/07/2026 : UN appel monolithique qui écrit le HTML des 8-10
    // slides = ~78 s (le temps LLM est dominé par les tokens de SORTIE). En
    // rendant les slides par lots de ~3 en parallèle, le mur d'attente tombe à
    // la durée du lot le plus lent (~25-35 s). La cohérence inter-lots est
    // garantie par (a) le même system prompt + invariants, (b) le carrousel
    // COMPLET fourni en contexte à chaque lot, (c) un PLAN DE COHÉRENCE
    // déterministe (fonds, rupture, moments de design) calculé par code.
    const CHUNK_TARGET = 3;
    const useParallelChunks = slides.length >= 5;

    // Lots consécutifs équilibrés (8 → 3+3+2, 10 → 3+3+2+2) d'INDEX de slides.
    const buildChunks = (count: number, target: number): number[][] => {
      const n = Math.max(1, Math.ceil(count / target));
      const base = Math.floor(count / n);
      let extra = count % n;
      const out: number[][] = [];
      let idx = 0;
      for (let c = 0; c < n; c++) {
        const size = base + (extra-- > 0 ? 1 : 0);
        out.push(Array.from({ length: size }, (_, k) => idx + k));
        idx += size;
      }
      return out;
    };

    // Plan de cohérence (mode texte uniquement — en photo/mix le rythme vient
    // des photos et des styles d'overlay, déjà cadrés par le system prompt).
    const buildCoherencePlan = (): string => {
      const n = slides.length;
      const techniques = ["italique accentué (color primary + font-style italic)", "effet surligneur (linear-gradient accent)", "soulignement épais (border-bottom accent)"];
      const designMoments = new Set<number>(
        slides.filter((s: any) => s?.visual_schema).map((s: any) => Number(s.slide_number)).filter(Boolean),
      );
      if (designMoments.size < 2 && n >= 4) {
        const a = Number(slides[Math.floor(n / 3)]?.slide_number);
        const b = Number(slides[Math.floor((2 * n) / 3)]?.slide_number);
        if (a) designMoments.add(a);
        if (b) designMoments.add(b);
      }
      const sepSlide = slides.find((s: any) => /separator|punchline|dark/i.test(String(s?.role || "")));
      const ruptureNum = Number(sepSlide?.slide_number) || Number(slides[Math.floor(n / 2)]?.slide_number) || 0;
      const lines = slides.map((s: any, i: number) => {
        const num = Number(s?.slide_number) || i + 1;
        let bg: string;
        if (i === 0) bg = `fond ${ch.color_background} (hook plein format, typographie géante)`;
        else if (num === ruptureNum) bg = `SLIDE DE RUPTURE à fond plein (${ch.color_primary} ou dark box #1A1A1A, texte clair)`;
        else if (i === n - 1) bg = `fond ${ch.color_background} (CTA, carte blanche centrée)`;
        else bg = i % 2 === 1
          ? (darkBrand ? `fond dans la gamme sombre de la charte, à peine distinct de ${ch.color_background} (JAMAIS blanc)` : "fond blanc #FFFFFF")
          : `fond ${ch.color_background}`;
        const design = designMoments.has(num) ? " · MOMENT DE DESIGN (carte, chiffre géant décoratif ou encadré pointillé)" : "";
        return `- Slide ${num} : ${bg}${design} · mise en valeur des mots-clés : ${techniques[i % 3]}`;
      });
      return `═══ PLAN DE COHÉRENCE DU CARROUSEL (IMPOSÉ — chaque slide le respecte à la lettre) ═══
Ce plan garantit le rythme global (alternance des fonds, UNE seule rupture, techniques de mise en valeur variées) même quand les slides sont rendues par lots :
${lines.join("\n")}
Utilise AU PLUS 3 familles de layout sur tout le carrousel : hook plein format, bloc texte centré (avec ou sans carte), schéma visuel. Les slides d'une même famille gardent exactement la même structure (padding, tailles, position du titre).`;
    };

    const chunkDirective = (nums: number[]) => `

═══ RENDU PARTIEL — IMPÉRATIF ═══
Le carrousel COMPLET est fourni ci-dessus pour le contexte (cohérence, transitions, rythme), mais TU NE RENDS QUE les slides ${nums.join(", ")}.
Retourne "slides_html" avec UNIQUEMENT ces slides-là, chacune avec son "slide_number" d'origine. Le bloc "slides_invariants" reste obligatoire.`;

    const usage: UsageSink = {};
    const tStart = Date.now();
    let result: any;

    if (useParallelChunks) {
      const chunks = buildChunks(slides.length, CHUNK_TARGET);
      const planBlock = (!isPhotoCarousel && !isMixCarousel) ? `\n\n${buildCoherencePlan()}` : "";
      let doneCount = 0;
      emitStatus("visuals", { done: 0, total: chunks.length });

      const runChunk = async (idxs: number[]) => {
        const nums = idxs.map((i) => Number(slides[i]?.slide_number) || i + 1);
        // Photos réellement référencées par ce lot (photo/mix) — évite de
        // renvoyer toutes les photos en vision à chaque appel. Si une slide
        // photo du lot n'a pas de photo_index exploitable, repli sûr : toutes.
        let photoIdx: number[] | undefined;
        if (isPhotoCarousel || isMixCarousel) {
          const referenced = [...new Set(idxs.map((i) => Number(slides[i]?.photo_index)).filter((p) => Number.isInteger(p) && p >= 1))];
          const hasUnresolvedPhotoSlide = idxs.some((i) => {
            const st = String(slides[i]?.slide_type || "");
            const isPhotoSlide = st === "photo_full" || st === "photo_integrated" || (isPhotoCarousel && st !== "text_only");
            return isPhotoSlide && !(Number.isInteger(Number(slides[i]?.photo_index)) && Number(slides[i]?.photo_index) >= 1);
          });
          photoIdx = hasUnresolvedPhotoSlide ? undefined : referenced; // undefined = toutes ; [] = aucune (lot 100% texte)
        }
        const chunkUsage: UsageSink = {};
        const raw = await callAnthropic({
          model,
          system: systemPromptWithAnnotations,
          messages: buildMessagesFor(finalUserPrompt + planBlock + chunkDirective(nums), photoIdx),
          temperature: 0.5,
          max_tokens: 8192,
          // Rendu verbatim : ne pas réécrire les tirets du texte source des slides.
          keepDashes: true,
        }, chunkUsage);
        doneCount++;
        // Clamp : les appels de rattrapage ne doivent pas afficher « 4/3 »
        emitStatus("visuals", { done: Math.min(doneCount, chunks.length), total: chunks.length });
        return { parsed: parseSlidesJson(raw), usage: chunkUsage };
      };

      // Résilience : un lot qui échoue (surcharge Anthropic 529, parse raté…)
      // ne doit PAS tuer les autres — vécu le 06/07 : un 529 transitoire sur un
      // seul lot faisait échouer TOUTE la génération (Promise.all rejette), en
      // silence côté front (pré-génération background). On isole donc chaque
      // lot ; ses slides manquantes partent dans la passe de rattrapage.
      let firstChunkError: unknown = null;
      const settled = await Promise.all(chunks.map((idxs) =>
        runChunk(idxs).catch((e) => {
          console.error("carousel-visual: lot en échec → slides envoyées au rattrapage", e?.message || e);
          if (!firstChunkError) firstChunkError = e;
          return null;
        }),
      ));
      const chunkResults = settled.filter(Boolean) as { parsed: any; usage: UsageSink }[];
      if (chunkResults.length === 0) throw firstChunkError || new Error("Génération des visuels échouée sur tous les lots.");

      let allSlides = chunkResults
        .flatMap((r) => (Array.isArray(r.parsed?.slides_html) ? r.parsed.slides_html : []))
        .filter((s: any) => s && s.html);

      // Réparation : slides manquantes (lot en échec OU lot qui a « oublié »
      // des slides malgré la directive) → appels de rattrapage par lots de ~3,
      // eux aussi isolés. Jamais de carrousel troué tant qu'un lot passe.
      const got = new Set(allSlides.map((s: any) => Number(s?.slide_number)));
      const missing = slides
        .map((s: any, i: number) => Number(s?.slide_number) || i + 1)
        .filter((num: number) => !got.has(num));
      if (missing.length > 0) {
        console.warn(`carousel-visual: ${missing.length} slide(s) manquante(s) après rendu parallèle → rattrapage`, missing);
        const missingIdxs = slides
          .map((s: any, i: number) => ({ num: Number(s?.slide_number) || i + 1, i }))
          .filter((x: any) => missing.includes(x.num))
          .map((x: any) => x.i);
        const repairChunks = buildChunks(missingIdxs.length, CHUNK_TARGET)
          .map((positions) => positions.map((p) => missingIdxs[p]));
        const repairs = (await Promise.all(repairChunks.map((idxs) =>
          runChunk(idxs).catch((e) => {
            console.error("carousel-visual: rattrapage en échec", e?.message || e);
            return null;
          }),
        ))).filter(Boolean) as { parsed: any; usage: UsageSink }[];
        for (const repair of repairs) {
          if (Array.isArray(repair.parsed?.slides_html)) {
            allSlides = allSlides.concat(repair.parsed.slides_html.filter((s: any) => s && s.html && !got.has(Number(s.slide_number))));
            repair.parsed.slides_html.forEach((s: any) => got.add(Number(s?.slide_number)));
          }
          chunkResults.push(repair);
        }
      }

      allSlides.sort((a: any, b: any) => (Number(a?.slide_number) || 0) - (Number(b?.slide_number) || 0));

      // Invariants : palette/typo/motif identiques d'un lot à l'autre (mêmes
      // invariants serveur dans le prompt) → on prend le premier bloc retourné
      // et on agrège les layouts_used de tous les lots (1 entrée par slide).
      const firstInv = chunkResults.map((r) => r.parsed?.slides_invariants).find(Boolean);
      const layoutsUsed = chunkResults.flatMap((r) =>
        Array.isArray(r.parsed?.slides_invariants?.layouts_used) ? r.parsed.slides_invariants.layouts_used : [],
      );
      result = {
        slides_html: allSlides,
        ...(firstInv ? { slides_invariants: { ...firstInv, layouts_used: layoutsUsed.length ? layoutsUsed : (firstInv.layouts_used || []) } } : {}),
      };

      usage.input_tokens = chunkResults.reduce((s, r) => s + (r.usage.input_tokens || 0), 0);
      usage.output_tokens = chunkResults.reduce((s, r) => s + (r.usage.output_tokens || 0), 0);
      usage.total_tokens = (usage.input_tokens || 0) + (usage.output_tokens || 0);
      usage.model = chunkResults[0]?.usage.model;

      console.log(JSON.stringify({
        type: "carousel_visual_timing",
        mode: "parallel",
        chunks: chunks.length,
        slides: slides.length,
        duration_ms: Date.now() - tStart,
      }));
    } else {
      emitStatus("visuals", { done: 0, total: 1 });
      const rawResponse = await callAnthropic({
        model,
        system: systemPromptWithAnnotations,
        messages: buildMessagesFor(finalUserPrompt),
        temperature: 0.5,
        max_tokens: 16384,
        // Rendu verbatim : ne pas réécrire les tirets du texte source des slides.
        keepDashes: true,
      }, usage);
      result = parseSlidesJson(rawResponse);
      emitStatus("visuals", { done: 1, total: 1 });

      console.log(JSON.stringify({
        type: "carousel_visual_timing",
        mode: "single",
        slides: slides.length,
        duration_ms: Date.now() - tStart,
      }));
    }

    // ═══ D1 — Passe de correction du contraste (carrousel photo uniquement) ═══
    // Chaque slide s'auto-évalue (contrast_ok). Pour celles que l'IA signale encore
    // douteuses, UNE passe ciblée de régénération impose un bandeau opaque. Tout est
    // gardé : au moindre échec on conserve les slides d'origine (jamais de régression).
    if (isPhotoCarousel && Array.isArray(result?.slides_html)) {
      // Filet DÉTERMINISTE : `contrast_ok` est auto-déclaré par l'IA, qui sur-estime
      // souvent la lisibilité. On ne s'y fie donc pas seul. Heuristique sur le HTML
      // rendu : une slide à texte CLAIR (blanc/quasi-blanc) posé sur la photo SANS
      // aucun voile/bandeau/ombre sombre derrière est presque toujours illisible
      // (illisibilité n°1). On la route vers la passe de correction même si l'IA a
      // déclaré contrast_ok=true. Conservateur : on ne flague que l'absence TOTALE de
      // voile sombre — au moindre signal de scrim on laisse passer (zéro régression).
      const overlayLikelyUnreadable = (s: any): boolean => {
        const html: string = s?.html || "";
        if (!html) return false;
        // Texte clair utilisé quelque part (couleur de l'overlay).
        const hasLightText = /color\s*:\s*(#fff(?:fff)?\b|white\b|rgba?\(\s*2[45]\d\s*,\s*2[45]\d\s*,\s*2[45]\d)/i.test(html);
        if (!hasLightText) return false;
        // Signaux de scrim sombre qui rendent le texte clair lisible :
        const darkVeil = /rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*(?:0?\.(?:3[5-9]|[4-9]\d?)|1(?:\.0+)?)\s*\)/i.test(html); // voile/bandeau rgba(0,0,0,≥0.35)
        const darkShadow = /text-shadow\s*:[^;"']*rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*(?:0?\.[5-9]\d?|1)/i.test(html);   // ombre forte
        const darkSolid = /background[^;"']*:\s*(?:#0{3}\b|#0{6}\b|rgb\(\s*(?:[0-2]?\d|3[0-2])\s*,)/i.test(html);       // bandeau quasi-noir opaque
        return !(darkVeil || darkShadow || darkSolid);
      };
      const flagged = result.slides_html.filter(
        (s: any) => s?.contrast_ok === false || overlayLikelyUnreadable(s),
      );
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

          const fixUsage: UsageSink = {};
          const fixRaw = await callAnthropic({
            model,
            system: systemPromptWithAnnotations,
            messages: [{ role: "user", content: fixContent }],
            temperature: 0.4,
            max_tokens: 16384,
            keepDashes: true,
          }, fixUsage);
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

    // ═══ Kill DÉTERMINISTE des badges "numéro de slide" / pagination (TOUS types) ═══
    // L'utilisatrice ne veut aucune pastille "SLIDE 03", "01/08", "03/08"… en coin de slide :
    // ces stamps n'apportent rien au lecteur et alourdissent le visuel. Le prompt ne les
    // demande plus, mais on garantit leur absence par code (texte, photo ET mix), sur TOUTES
    // les slides. On ne touche PAS aux numéros d'étape d'un schéma (timeline "01", "02") :
    // ceux-là sont des entiers NUS, sans "SLIDE" ni "/total" — le motif ci-dessous les ignore.
    if (Array.isArray(result?.slides_html)) {
      // "SLIDE 03", "SLIDE 03/08", "03/08", "3 - 8" → stamp. PAS "03" nu (ambigu avec une étape).
      const SLIDE_STAMP_RE = /^(?:slide\s*)?\d{1,2}\s*[\/.\-]\s*\d{1,2}$|^slide\s*\d{1,2}$/i;
      const isStamp = (t: string) => SLIDE_STAMP_RE.test((t || "").trim());
      let stampsKilled = 0;
      const killStamps = (rawHtml: string): string => {
        let html = rawHtml || "";
        // a) Pilule enveloppant une caption : <span pill><span caption>TXT</span></span>
        html = html.replace(
          /<(span|div)\b[^>]*data-pptx-shape="pill"[^>]*>\s*<(span|div)\b[^>]*data-pptx-editable="caption"[^>]*>([^<]*)<\/\2>\s*<\/\1>/gi,
          (m: string, _a: string, _b: string, txt: string) => (isStamp(txt) ? (stampsKilled++, "") : m),
        );
        // b) Élément annoté pill OU caption dont le contenu est un stamp : <tag pill|caption>TXT</tag>
        html = html.replace(
          /<(span|div|p)\b[^>]*(?:data-pptx-shape="pill"|data-pptx-editable="caption")[^>]*>([^<]*)<\/\1>/gi,
          (m: string, _t: string, txt: string) => (isStamp(txt) ? (stampsKilled++, "") : m),
        );
        // c) Filet de sécurité : tout petit élément littéralement "SLIDE NN", même non annoté.
        html = html.replace(
          /<(span|div|p)\b[^>]*>\s*slide\s*\d{1,2}(?:\s*[\/.\-]\s*\d{1,2})?\s*<\/\1>/gi,
          () => { stampsKilled++; return ""; },
        );
        // d) Préfixe "Slide N," / "Slide N ·" / "Slide N —" DANS un label plus long
        //    (vu en prod : eyebrow "Slide 4, Analyse" rendu tel quel malgré les 4
        //    interdits du prompt). On retire le préfixe méta et on GARDE le label
        //    éditorial restant ("Analyse"). Ancré juste après un tag ouvrant → les
        //    mentions en milieu de phrase ne sont pas touchées.
        html = html.replace(
          /(<(?:span|div|p|h[1-6])\b[^>]*>\s*)slides?\s*(?:n[°o]\s*)?\d{1,2}\s*[,·—:–-]\s*(?=\S)/gi,
          (_m: string, open: string) => { stampsKilled++; return open; },
        );
        return html;
      };
      result.slides_html = result.slides_html.map((slide: any) => ({
        ...slide,
        html: killStamps(slide?.html || ""),
      }));
      if (stampsKilled > 0) {
        console.log(`carousel-visual: ${stampsKilled} badge(s) numéro de slide retiré(s) (kill déterministe, tous types)`);
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
        // Supprimer les @import Google Fonts existants (ils ne marchent pas dans les
        // iframes srcDoc — et fuitent en TEXTE VISIBLE sur la slide quand le modèle
        // émet le @import sans wrapper <style> ou mélangé à d'autres CSS).
        // On retire le @import OÙ QU'IL SOIT (nu ou dans un <style> plus large), puis
        // on nettoie les <style> devenus vides. La police reste fournie par le <link>.
        html = html
          .replace(/@import\s+url\(\s*['"]?[^)]*fonts\.googleapis\.com[^)]*['"]?\s*\)\s*;?/gi, "")
          .replace(/<style>\s*<\/style>/gi, "");
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
      // Couleurs CSS NOMMÉES → hex. Indispensable : le modèle écrit souvent `color:white`
      // (vu en prod : titre blanc sur fond rose CLAIR #ffa7c6 = ~1.8:1, illisible, qui
      // passait à travers la garde car non parsé). On couvre les noms réalistes sur des
      // titres ; un nom inconnu reste non parsé (la garde l'ignore, comportement sûr).
      const NAMED: Record<string, string> = {
        white: "#FFFFFF", black: "#000000", red: "#FF0000", green: "#008000",
        blue: "#0000FF", yellow: "#FFFF00", gray: "#808080", grey: "#808080",
        pink: "#FFC0CB", purple: "#800080", orange: "#FFA500", brown: "#A52A2A",
        navy: "#000080", teal: "#008080", silver: "#C0C0C0", gold: "#FFD700",
        beige: "#F5F5DC", ivory: "#FFFFF0", transparent: "",
      };
      const hexOnBg = (raw: string, bg6: string): string | null => {
        let v = (raw || "").trim();
        const named = NAMED[v.toLowerCase()];
        if (named !== undefined) { if (named === "") return null; v = named; }
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
      // Règle (validée avec Laetitia, option « stricte ») : la couleur du TITRE est imposée
      // par la luminance du FOND, pas laissée au hasard du modèle (qui dévie souvent vers la
      // primary vive #FB3D80 ~3.2:1, voire semi-transparente ~1.8:1 illisible). Fond CLAIR →
      // titre franchement foncé (secondary rose foncé = couleur de titre voulue par la charte) ;
      // fond SOMBRE/PLEIN → titre clair (blanc). On n'agit QUE si le contraste est insuffisant
      // pour le type de fond → les titres déjà foncés sur fond clair, et déjà blancs sur fond
      // plein, restent intacts.
      const LIGHT_BG_FLOOR = 4.5; // fond clair : on exige un titre NET (au-dessus de AA-large)
      const DARK_BG_FLOOR = 3.0;  // fond plein : blanc sur rose vif (~3.4) est voulu → toléré
      const norm = (x: string | null | undefined, fb: string) => hexOnBg(x || "", "FFFFFF") || fb;
      const secondary6 = norm(ch.color_secondary, "91014B");
      const text6 = norm(ch.color_text, "1A1A2E");
      const bgDefault6 = norm(ch.color_background, "FFF4F8");
      // Remplacement sur fond clair : secondary (rose foncé de charte) en priorité, sinon text,
      // sinon le plus contrasté des deux. Sur fond sombre : blanc.
      const bestDark = (bg6: string): string => {
        if (ratio(secondary6, bg6) >= LIGHT_BG_FLOOR) return secondary6;
        if (ratio(text6, bg6) >= LIGHT_BG_FLOOR) return text6;
        return ratio(text6, bg6) >= ratio(secondary6, bg6) ? text6 : secondary6;
      };
      let titlesFixed = 0;
      let bodyFixed = 0;
      // Fond ENGLOBANT réel d'un élément : mini-scan des tags avec une pile,
      // jusqu'à l'offset de l'élément. Indispensable sur les slides MULTI-FONDS
      // (photo en haut + bandeau coloré en bas, carte sombre sur fond clair…) :
      // l'ancien fond « 1ère couleur unie du HTML » comparait le titre au MAUVAIS
      // fond (vu en prod : titre olive sur bandeau magenta jugé lisible car testé
      // contre le fond clair global → passé tel quel dans l'aperçu ET l'export).
      // Les rgba sont composés sur le fond du parent dans la pile.
      const VOID_TAGS = new Set(["br", "img", "hr", "input", "meta", "link", "source", "area", "base", "col", "embed", "param", "track", "wbr"]);
      const BG_DECL_RE = /background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|[a-z]+)/i;
      // TEXTURE DE MARQUE = FOND CLAIR. La texture-papier est déclarée en
      // `background:url('…')` — illisible pour BG_DECL_RE, donc la garde
      // retombait sur un mauvais fond de repli et laissait passer du texte
      // blanc/jaune posé directement sur la texture (vu en prod, 3 slides d'un
      // même carrousel). La texture est par construction une matière CLAIRE
      // dérivée du fond de charte → un fond url(...) compte comme bgDefault6.
      const BG_URL_RE = /background\s*:\s*url\(/i;
      const bgEnclosingAt = (whole: string, offset: number, fallback6: string): string | null => {
        const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
        const stack: Array<{ tag: string; bg6: string | null }> = [];
        const nearest = (): string | null => {
          for (let i = stack.length - 1; i >= 0; i--) if (stack[i].bg6) return stack[i].bg6;
          return null;
        };
        let m: RegExpExecArray | null;
        while ((m = tagRe.exec(whole)) && m.index < offset) {
          const closing = m[1] === "/";
          const tag = m[2].toLowerCase();
          const attrs = m[3] || "";
          if (closing) {
            // Pop tolérant : referme jusqu'au tag correspondant (les tags internes
            // mal refermés sautent avec — HTML machine, cas marginal).
            for (let i = stack.length - 1; i >= 0; i--) {
              if (stack[i].tag === tag) { stack.length = i; break; }
            }
          } else if (!VOID_TAGS.has(tag) && !/\/\s*$/.test(attrs)) {
            const bm = attrs.match(BG_DECL_RE);
            // Gradient/nom inconnu → hexOnBg rend null → l'élément ne compte
            // pas comme fond (on retombe sur le parent) — comportement sûr.
            let composed = bm ? hexOnBg(bm[1], nearest() || fallback6) : null;
            if (!composed && BG_URL_RE.test(attrs)) composed = fallback6;
            stack.push({ tag, bg6: composed });
          }
        }
        return nearest();
      };
      result.slides_html = result.slides_html.map((slide: any) => {
        let html: string = slide.html || "";
        // Repli si l'élément n'a AUCUN fond englobant déclaré : 1ère couleur de
        // fond unie du HTML (≈ conteneur racine), sinon le fond de charte (clair).
        let bg6 = bgDefault6;
        const bgm = html.match(/background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))/i);
        if (bgm) { const c = hexOnBg(bgm[1], "FFFFFF"); if (c) bg6 = c; }
        html = html.replace(
          /<([a-z0-9]+)([^>]*\bdata-pptx-editable\s*=\s*["']title["'][^>]*)>/gi,
          (full: string, _t: string, _a: string, offset: number, whole: string) =>
            full.replace(/style\s*=\s*"([^"]*)"/i, (sm: string, style: string) => {
              const cm = style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
              if (!cm) return sm;
              const bgLocal = bgEnclosingAt(whole, offset, bgDefault6) ?? bg6;
              const eff = hexOnBg(cm[1], bgLocal);
              if (!eff) return sm;
              let repl: string | null = null;
              if (lum(bgLocal) > 0.5) {
                if (ratio(eff, bgLocal) < LIGHT_BG_FLOOR) repl = bestDark(bgLocal);
              } else {
                if (ratio(eff, bgLocal) < DARK_BG_FLOOR) repl = "FFFFFF";
              }
              if (!repl || repl === eff) return sm;
              titlesFixed++;
              const newStyle = style.replace(/((?:^|;)\s*)color\s*:\s*[^;]+/i, `$1color:#${repl}`);
              return `style="${newStyle}"`;
            }),
        );

        // Étendre la MÊME garde déterministe au CORPS et au SOUS-TITRE (texte descriptif
        // qui DOIT rester lisible). Sinon un body/subtitle colorisé en accent clair sur
        // fond clair (ex. #C9BFB2 / #FFE561) passe illisible, dans l'aperçu ET l'export.
        // On NE touche PAS `caption` (labels colorés ❌/✅ et numéros décoratifs voulus)
        // ni `overlay` (texte sur photo, géré par la passe de contraste photo dédiée).
        // Repli : le texte de charte (color_text) en priorité, sinon la meilleure option
        // foncée disponible ; blanc sur fond sombre.
        const bodyDark = (b: string): string =>
          ratio(text6, b) >= LIGHT_BG_FLOOR ? text6 : bestDark(b);
        html = html.replace(
          /<([a-z0-9]+)([^>]*\bdata-pptx-editable\s*=\s*["'](?:body|subtitle)["'][^>]*)>/gi,
          (full: string, _t: string, _a: string, offset: number, whole: string) =>
            full.replace(/style\s*=\s*"([^"]*)"/i, (sm: string, style: string) => {
              const cm = style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
              if (!cm) return sm;
              const bgLocal = bgEnclosingAt(whole, offset, bgDefault6) ?? bg6;
              const eff = hexOnBg(cm[1], bgLocal);
              if (!eff) return sm;
              let repl: string | null = null;
              if (lum(bgLocal) > 0.5) {
                if (ratio(eff, bgLocal) < LIGHT_BG_FLOOR) repl = bodyDark(bgLocal);
              } else {
                if (ratio(eff, bgLocal) < DARK_BG_FLOOR) repl = "FFFFFF";
              }
              if (!repl || repl === eff) return sm;
              bodyFixed++;
              const newStyle = style.replace(/((?:^|;)\s*)color\s*:\s*[^;]+/i, `$1color:#${repl}`);
              return `style="${newStyle}"`;
            }),
        );
        return { ...slide, html };
      });
      if (titlesFixed > 0) {
        console.log(`carousel-visual: ${titlesFixed} titre(s) à faible contraste corrigé(s) (garde déterministe)`);
      }
      if (bodyFixed > 0) {
        console.log(`carousel-visual: ${bodyFixed} corps/sous-titre(s) à faible contraste corrigé(s) (garde déterministe)`);
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

    // ═══ Télémétrie ancres d'édition (tous types de carrousel) ═══
    // Le prompt exige data-slide-text="title|body|overlay" autour des textes
    // verbatim (édition en direct côté front). On ne répare pas ici (le front
    // a un repli par correspondance de texte) mais on compte les manquants —
    // uniquement pour les slides dont la SOURCE a du texte (une slide photo
    // sans overlay n'a légitimement pas d'ancre).
    if (Array.isArray(result?.slides_html)) {
      const srcByNumber = new Map((slides || []).map((sl: any) => [sl.slide_number, sl]));
      const missing = result.slides_html.filter((sl: any) => {
        if (typeof sl?.html !== "string") return false;
        const src = srcByNumber.get(sl.slide_number) as any;
        const hasText = !!(src && (src.title || src.body || src.overlay_text));
        return hasText && !sl.html.includes("data-slide-text=");
      }).length;
      if (missing > 0) {
        console.warn(`carousel-visual: ${missing} slide(s) avec texte sans ancre data-slide-text (édition live en repli texte)`);
      }
    }

    // ═══ Garde DÉTERMINISTE de contraste (tous types de carrousel) ═══
    // Bug prod 04/07 : texte écrit dans la couleur de sa carte (noir sur noir)
    // → items de comparison et punchline de timeline invisibles. Le prompt
    // l'interdit désormais, mais on ne dépend pas du modèle : toute couleur de
    // texte quasi identique à son fond direct est réécrite en lisible.
    if (Array.isArray(result?.slides_html)) {
      let contrastFixes = 0;
      result.slides_html = result.slides_html.map((slide: any) => {
        const { html, fixes } = enforceTextContrast(slide?.html || "");
        contrastFixes += fixes;
        return fixes > 0 ? { ...slide, html } : slide;
      });
      if (contrastFixes > 0) {
        console.warn(`carousel-visual: ${contrastFixes} couleur(s) de texte illisible(s) corrigée(s) (garde contraste)`);
      }
    }

    // ═══ Garde DÉTERMINISTE de taille de police (tous types de carrousel) ═══
    // Audit lisibilité 12/07 : le modèle gravite vers les 26px des exemples →
    // illisible sur un feed mobile. Le prompt prescrit 34-40px de corps, mais
    // on ne dépend pas du modèle : tout élément texte éditable sous le plancher
    // de son rôle est remonté au plancher (jamais réduit).
    if (Array.isArray(result?.slides_html)) {
      let fontFixes = 0;
      result.slides_html = result.slides_html.map((slide: any) => {
        const { html, fixes } = enforceMinFontSize(slide?.html || "");
        fontFixes += fixes;
        return fixes > 0 ? { ...slide, html } : slide;
      });
      if (fontFixes > 0) {
        console.warn(`carousel-visual: ${fontFixes} font-size sous plancher remontée(s) (garde lisibilité)`);
      }
    }

    // ═══ Garde DÉTERMINISTE de verbatim du texte ancré (slides texte) ═══
    // Audit live 10/07 : malgré la règle d'ancrage, le modèle dévie (casse perdue,
    // émojis retirés, body éclaté quand il contient des chiffres) — et l'ancien
    // sanitizeDashes réécrivait les tirets (désormais keepDashes: true sur les
    // appels de rendu). On ne dépend pas du prompt : si le texte de l'ancre
    // diffère du texte source, la source est réinjectée telle quelle. Les <span>
    // d'accent internes sautent alors — même compromis que l'édition live.
    if (Array.isArray(result?.slides_html)) {
      const srcText = new Map((slides || []).map((sl: any) => [sl.slide_number, sl]));
      let verbatimFixes = 0;
      let anchorsAdded = 0;
      let anchorsUnmatched = 0;
      result.slides_html = result.slides_html.map((slide: any) => {
        const src = srcText.get(slide.slide_number) as any;
        // Slides texte uniquement — l'overlay photo a sa propre passe de lisibilité.
        if (!src || (src.slide_type && src.slide_type !== "text_only")) return slide;
        let slideHtml: string = slide?.html || "";
        let changed = false;
        // Ancre title MANQUANTE (audit 10/07 : slides à visual_schema, ~3 runs
        // sur 4) : on la pose sur l'élément au texte identique AVANT la passe
        // verbatim, sinon l'édition live retombe sur le repli par correspondance
        // de texte de carousel-html-edit.ts.
        if (typeof src.title === "string" && src.title.trim()) {
          const ensured = ensureAnchor(slideHtml, "title", src.title);
          if (ensured.status === "added") {
            slideHtml = ensured.html;
            changed = true;
            anchorsAdded++;
          } else if (ensured.status === "unmatched") {
            anchorsUnmatched++;
          }
        }
        const anchors: VerbatimAnchor[] = [];
        if (typeof src.title === "string" && src.title.trim()) anchors.push({ field: "title", text: src.title });
        if (typeof src.body === "string" && src.body.trim()) anchors.push({ field: "body", text: src.body });
        if (anchors.length > 0) {
          const { html, fixes } = enforceAnchoredText(slideHtml, anchors);
          if (fixes.length > 0) {
            slideHtml = html;
            changed = true;
            verbatimFixes += fixes.length;
          }
        }
        return changed ? { ...slide, html: slideHtml } : slide;
      });
      if (anchorsAdded > 0) {
        console.warn(`carousel-visual: ${anchorsAdded} ancre(s) data-slide-text="title" ajoutée(s) (garde déterministe)`);
      }
      if (anchorsUnmatched > 0) {
        console.warn(`carousel-visual: ${anchorsUnmatched} slide(s) avec title sans ancre ni élément au texte identique (repli texte côté édition)`);
      }
      if (verbatimFixes > 0) {
        console.warn(`carousel-visual: ${verbatimFixes} texte(s) ancré(s) réécrit(s) verbatim (garde déterministe)`);
      }
    }

    // ═══ Ancres d'édition des slides PHOTO (parité avec les slides texte) ═══
    // La passe ci-dessus ne couvre QUE text_only. Les slides photo n'avaient
    // AUCUNE réparation d'ancre : overlay (photo_full) et titre/corps
    // (photo_integrated) non ancrés ⇒ l'édition live est un no-op silencieux
    // (carousel-html-edit.ts ne retrouve pas l'élément à patcher) ET l'export
    // hybride/Canva perd le texte édité (le repli d'export re-matche l'overlay_text
    // COURANT contre un HTML resté sur l'ancien texte → aucune correspondance).
    // On pose ici l'ancre data-slide-text MANQUANTE + l'annotation d'export
    // data-pptx-editable, sans réinjection verbatim : on préserve le traitement de
    // lisibilité de l'overlay (voile/bandeau/spans d'accent). Le champ édité côté
    // front dépend du type : photo_full → overlay ; photo_integrated → title/body
    // (cf. CarouselPhotoResult.tsx).
    if (Array.isArray(result?.slides_html)) {
      const srcByNum = new Map((slides || []).map((sl: any) => [sl.slide_number, sl]));
      const photoFields = (st: string): Array<{ field: string; key: string }> =>
        st === "photo_full"
          ? [{ field: "overlay", key: "overlay_text" }]
          : st === "photo_integrated"
            ? [{ field: "title", key: "title" }, { field: "body", key: "body" }]
            : [];
      let photoAnchorsAdded = 0;
      let photoAnchorsUnmatched = 0;
      result.slides_html = result.slides_html.map((slide: any) => {
        const src = srcByNum.get(slide?.slide_number) as any;
        const fields = src?.slide_type ? photoFields(src.slide_type) : [];
        if (fields.length === 0) return slide;
        let html: string = slide?.html || "";
        let changed = false;
        for (const { field, key } of fields) {
          const text = typeof src[key] === "string" ? src[key].trim() : "";
          if (!text) continue;
          const ensured = ensureAnchor(html, field, text);
          if (ensured.status === "added") {
            html = ensured.html;
            changed = true;
            photoAnchorsAdded++;
          } else if (ensured.status === "unmatched") {
            photoAnchorsUnmatched++;
          }
          // Annotation d'export : l'ancre étant en place (ajoutée ou déjà présente),
          // on garantit data-pptx-editable pour que Canva/PPTX traite le bloc comme
          // texte éditable (Strategy A), au lieu du repli fragile par correspondance.
          if (ensured.status !== "unmatched") {
            const withEdit = ensurePptxEditable(html, field);
            if (withEdit !== html) {
              html = withEdit;
              changed = true;
            }
          }
        }
        return changed ? { ...slide, html } : slide;
      });
      if (photoAnchorsAdded > 0) {
        console.warn(`carousel-visual: ${photoAnchorsAdded} ancre(s) overlay/photo ajoutée(s) (garde déterministe)`);
      }
      if (photoAnchorsUnmatched > 0) {
        console.warn(`carousel-visual: ${photoAnchorsUnmatched} texte(s) de slide photo sans élément au texte identique (repli côté édition)`);
      }
    }

    // ═══ Télémétrie fidélité des SCHÉMAS visuels (mesure seule, pas de correction) ═══
    // Les champs d'un visual_schema ne sont ni ancrés ni couverts par la garde
    // verbatim (audit 10/07 : attribution de quote_big omise du rendu). On
    // MESURE d'abord l'ampleur via les logs avant de décider d'une réinjection.
    if (Array.isArray(result?.slides_html)) {
      const srcBySlide = new Map((slides || []).map((sl: any) => [sl.slide_number, sl]));
      const reports: Array<{ slide: number; missing: string[]; checked: number }> = [];
      for (const slide of result.slides_html) {
        const src = srcBySlide.get(slide?.slide_number) as any;
        if (!src?.visual_schema) continue;
        const { missing, checked } = checkSchemaFidelity(slide?.html || "", src.visual_schema);
        if (missing.length > 0) {
          reports.push({ slide: Number(slide.slide_number), missing: missing.map((m) => m.slice(0, 80)), checked });
        }
      }
      if (reports.length > 0) {
        console.warn(JSON.stringify({
          type: "carousel_schema_fidelity",
          user_id: user.id,
          slides_with_missing: reports.length,
          detail: reports,
          timestamp: new Date().toISOString(),
        }));
      }
    }

    // ═══ Illustration de COUVERTURE (opt-in, décoché par défaut) ═══
    // Recraft génère 1 illustration de marque ; la slide de couverture est
    // composée EN DUR (layout A validé) — déterministe, pas via l'IA. En cas
    // d'échec (Recraft KO, pas de clé…), on GARDE la couverture générée par
    // l'IA : jamais de carrousel cassé, et aucun crédit débité en plus.
    let coverIllustrationDone = false;
    if (reqBody?.cover_illustration === true && Array.isArray(result?.slides_html) && result.slides_html.length > 0) {
      try {
        const recraftKey = Deno.env.get("RECRAFT_API_TOKEN");
        if (!recraftKey) throw new Error("RECRAFT_API_TOKEN manquant");

        // Slide de couverture = plus petit slide_number (généralement 1)
        const coverIdx = result.slides_html.reduce(
          (best: number, s: any, i: number, arr: any[]) =>
            (s?.slide_number ?? 999) < (arr[best]?.slide_number ?? 999) ? i : best,
          0,
        );
        const coverSlideNumber = result.slides_html[coverIdx]?.slide_number ?? 1;
        const srcCover = (slides || []).find((sl: any) => sl.slide_number === coverSlideNumber) as any;
        const coverTitle: string = (srcCover?.title || srcCover?.overlay_text || "").toString().trim();

        if (!coverTitle) throw new Error("titre de couverture introuvable");

        // Concept visuel dérivé du titre (Haiku, court) — pas de texte dans l'image.
        const conceptRaw = await callAnthropic({
          model: "claude-haiku-4-5",
          system:
            "Tu proposes une scène d'illustration éditoriale simple et chaleureuse pour une couverture de carrousel. Concret (une personne ou des objets du quotidien du métier), jamais de texte ni de logo dans l'image.",
          messages: [{
            role: "user",
            content:
              `Titre de couverture : « ${coverTitle} ». Ambiance de marque : ${ch.mood_keywords}. ` +
              `Décris EN ANGLAIS, en 12 mots maximum, une scène d'illustration simple et positive pour ce carrousel. ` +
              `Réponds UNIQUEMENT la description, sans guillemets.`,
          }],
          temperature: 0.7,
          max_tokens: 60,
        }, usage);
        const concept = (conceptRaw || "").replace(/["\n]/g, " ").trim().slice(0, 180) ||
          "a creative solopreneur working calmly in a cozy studio";

        const colors = {
          primary: hexToRgb(ch.color_primary) ?? [28, 28, 32] as [number, number, number],
          secondary: hexToRgb(ch.color_secondary) ?? [110, 106, 102] as [number, number, number],
          background: hexToRgb(ch.color_background) ?? [246, 244, 240] as [number, number, number],
        };

        const svg = await fetchRecraftIllustrationSvg(concept, colors, recraftKey);
        const coverHtml = buildCoverSlideHtml({
          title: coverTitle,
          illustrationSvg: svg,
          ch: {
            color_primary: ch.color_primary,
            color_text: ch.color_text,
            color_background: ch.color_background,
            font_title: ch.font_title,
            font_body: ch.font_body,
            texture_url: ch.texture_url || undefined,
          },
        });

        result.slides_html[coverIdx] = {
          ...result.slides_html[coverIdx],
          html: coverHtml,
        };
        coverIllustrationDone = true;

        // Coût Recraft distinct (pas de tokens) — 1 illustration par carrousel.
        await logUsage(user.id, "photo_retouch", "cover_illustration", undefined, "recraftv3-vector", workspaceId);
        console.log(JSON.stringify({ event: "cover_illustration_success", slide_number: coverSlideNumber, concept }));
      } catch (coverErr) {
        console.error(JSON.stringify({
          event: "cover_illustration_failed",
          error: coverErr instanceof Error ? coverErr.message.slice(0, 300) : "inconnu",
        }));
        // silencieux côté client : la couverture IA d'origine est conservée
      }
    }

    await logUsage(user.id, reqBody?.quality_max ? "quality_max" : "content", "carousel_visual", usage.total_tokens, usage.model, workspaceId);

    return new Response(JSON.stringify({ result, cover_illustration_applied: coverIllustrationDone, remaining: quota.remaining }), {
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
  };

  if (wantsSSE) return runWithHeartbeatSSE(corsHeaders, handle);
  return handle();
});
