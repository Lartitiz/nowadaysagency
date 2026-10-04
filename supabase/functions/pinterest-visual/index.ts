import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
import { callAnthropic, AnthropicError, OPUS_MODEL, type AnthropicModel, type AnthropicTool, type UsageSink } from "../_shared/anthropic.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { validateInput, ValidationError } from "../_shared/input-validators.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS } from "../_shared/user-context.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
import { parseAudienceAddress } from "../_shared/audience-address.ts";
import { addressPassOptions } from "../_shared/audience-address-pass.ts";
import { enforceAudienceAddressInFields } from "../_shared/audience-address-fields.ts";
import { buildPptxInvariants, formatInvariantsForPrompt, NEUTRAL_DEFAULT_PALETTE } from "../_shared/pptx-invariants.ts";
import { assertWorkspaceMembership, workspaceDeniedResponse } from "../_shared/workspace-guard.ts";
import { finalizePinHtml, normalizePinData, reportPinDataMismatch } from "../_shared/pinterest-pin-guards.ts";
import {
  addUsage,
  applyDesignEmojis,
  buildFallbackPinHtml,
  designWithTextFidelity,
  pinDataTextSpec,
  PIN_REQUEST_BUDGET_MS,
  PIN_WRITE_TIMEOUT_MS,
  stripWriterDesignFields,
} from "../_shared/pinterest-two-step.ts";

/**
 * Modèles des deux appels. Rédaction = modèle d'avant (Opus). Mise en forme =
 * Opus aussi : c'est lui qui dessinait ces épingles, et le style doit rester
 * le même ; un modèle plus rapide (Sonnet) changerait le rendu sans qu'on ait
 * pu le comparer sur de vraies épingles.
 */
export const PIN_WRITE_MODEL: AnthropicModel = OPUS_MODEL;
export const PIN_DESIGN_MODEL: AnthropicModel = OPUS_MODEL;

// Handler exporté pour les tests (index_test.ts) : `serve()` de std/http ouvre
// un vrai socket au chargement, d'où le guard `import.meta.main` en bas de
// fichier (même patron que branding-coaching) — comportement de prod inchangé.
export async function handlePinterestVisualRequest(req: Request): Promise<Response> {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const tStart = Date.now();

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
    const charter = (charterRes.data || {}) as Record<string, any>;
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

    // ═══ DEUX APPELS (chantier « séparation écriture / design », 04/10/2026) ═══
    // Appel 1 « rédaction » : UNIQUEMENT le texte (pin_data + titre/description
    // SEO). Appel 2 « mise en forme » : le HTML, à partir du texte FINAL, sans
    // droit d'y toucher ; validé par le code (_shared/pinterest-two-step.ts).
    // Les règles d'écriture et le système de design sont ceux du prompt unique
    // d'avant, répartis entre les deux appels.
    const writeSystemPrompt = `Tu es une directrice artistique ET experte SEO Pinterest. Tu rédiges le TEXTE d'une épingle Pinterest visuelle au format 1000×1500px (les textes affichés sur le visuel, en version structurée), PLUS le titre et la description SEO.

La mise en forme visuelle (disposition, couleurs, polices, icônes) est faite dans une étape séparée qui reprendra tes textes mot pour mot : écris exactement le texte à afficher, rien d'autre.
${reqBody.reference_image_base64 ? `
═══ IMAGE DE RÉFÉRENCE ═══
Une image d'épingle Pinterest est fournie comme inspiration.
ANALYSE sa structure (hiérarchie, nombre de blocs, densité) : ton texte suit cette structure (même nombre de blocs, même densité de texte), avec le nouveau contenu (sujet fourni).
Tu ne copies PAS le contenu de la référence.
` : ""}
═══ TYPES D'ÉPINGLES (contenu à rédiger) ═══

Si pin_type = "infographie" :
- Titre en haut
- 3-6 étapes
- Chaque étape = numéro + titre court + 1 ligne de description
- Watermark discret en bas

Si pin_type = "checklist" :
- Badge "CHECKLIST" en haut
- Titre principal sous le badge
- Liste de 5-8 items
- Chaque item = texte court (max 8 mots)
- CTA discret en bas ("Enregistre pour ne rien oublier")

Si pin_type = "mini_tuto" :
- Badge "TUTO" en haut
- Titre principal
- 3 à 5 étapes numérotées
- Chaque étape = numéro + titre court + 1-2 lignes d'explication

Si pin_type = "avant_apres" :
- Deux zones : AVANT et APRÈS
- 3-5 points de comparaison de chaque côté

Si pin_type = "schema_visuel" :
- Titre en haut
- Élément central relié à 3-6 éléments périphériques
- Chaque élément = texte court
- Peut être : mind map, diagramme en étoile, flow chart, équation visuelle

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

Tu réponds via l'outil save_pinterest_text (le schéma de l'outil est le contrat de sortie).

RÈGLES pour pin_data.elements :
- Pour "infographie" et "mini_tuto" : chaque élément a number, label, description
- Pour "checklist" : chaque élément a label (le texte de l'item), number pour l'ordre
- Pour "avant_apres" : chaque élément a label, side ("before" ou "after")
- Pour "schema_visuel" : le premier élément (number=0) est l'élément central, les suivants sont périphériques`;

    const writeUserPrompt = `Rédige le texte d'une épingle Pinterest visuelle pour le sujet suivant.

SUJET : ${subject}
TYPE D'ÉPINGLE : ${pin_type}
${pinterest_link ? `LIEN DE DESTINATION : ${pinterest_link}` : ""}
${pinterest_board ? `TABLEAU : ${pinterest_board}` : ""}

CONTEXTE BRANDING DE L'UTILISATRICE :
${contextText}

Réponds en appelant l'outil save_pinterest_text.`;

    // Sortie structurée par tool forcé (leçon audit formats : le schéma DEVIENT le
    // contrat) : troncature → erreur 422 propre AVANT logUsage.
    const TEXT_TOOL: AnthropicTool = {
      name: "save_pinterest_text",
      description: "Enregistre le texte de l'épingle Pinterest (textes affichés en version structurée + SEO)",
      input_schema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Titre SEO Pinterest, max 100 caractères" },
          description: { type: "string", description: "Description SEO 100-200 mots, 2-3 paragraphes" },
          pin_data: {
            type: "object",
            description: "Textes affichés sur le visuel, en version structurée (source unique des exports PNG et PPTX)",
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
        required: ["title", "description", "pin_data"],
      },
    };

    const hasReference = !!reqBody.reference_image_base64;
    const rawBase64 = hasReference
      ? reqBody.reference_image_base64.replace(/^data:image\/[a-z]+;base64,/, "")
      : "";
    // deno-lint-ignore no-explicit-any
    const withReference = (text: string): any[] => hasReference
      ? [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: rawBase64 } },
            { type: "text", text: `Voici l'épingle Pinterest de référence. Inspire-toi de sa structure.\n\n${text}` },
          ],
        }]
      : [{ role: "user", content: text }];

    const usage: UsageSink = {};

    // ── Appel 1 : rédaction ──
    const tWrite = Date.now();
    const writeUsage: UsageSink = {};
    const rawText = await callAnthropic({
      model: PIN_WRITE_MODEL,
      system: writeSystemPrompt,
      messages: withReference(writeUserPrompt),
      temperature: 0.5,
      max_tokens: 4096,
      abortTimeoutMs: PIN_WRITE_TIMEOUT_MS,
      maxRetries: 1,
      tool: TEXT_TOOL,
    }, writeUsage);
    addUsage(usage, writeUsage);
    const writeMs = Date.now() - tWrite;

    // deno-lint-ignore no-explicit-any
    let written: any;
    try {
      written = JSON.parse(rawText);
    } catch {
      console.error("Failed to parse pinterest-visual text tool input:", rawText.slice(0, 500));
      throw new AnthropicError("L'IA n'a pas retourné un format valide. Réessaie.", 502);
    }
    if (!written?.pin_data || typeof written.pin_data !== "object" || typeof written.pin_data.main_title !== "string") {
      throw new AnthropicError("L'IA n'a pas retourné un format valide. Réessaie.", 502);
    }

    // Tu ou vous (fiche de marque, 04/10/2026) : textes du visuel + titre et
    // description SEO, AVANT la mise en forme (qui recopie ces textes mot pour
    // mot). Ni le badge ni le filigrane ne s'adressent au public.
    await enforceAudienceAddressInFields(
      written,
      ["title", "description", "pin_data.main_title", "pin_data.elements[].label", "pin_data.elements[].description", "pin_data.cta_text"],
      parseAudienceAddress(ctx?.tone?.tone_register),
      addressPassOptions("pinterest-visual", 25_000),
    );

    // Structure complétée par le code (badge_label, pin_type) AVANT la mise en
    // forme, pour que l'appel 2 reçoive le texte définitif. L'emoji est un
    // choix de design : retiré s'il arrive de la rédaction.
    const norm = normalizePinData(stripWriterDesignFields(written.pin_data), pin_type);
    if (norm.fixes.length) console.warn(`pinterest-visual: pin_data complété par le code — ${norm.fixes.join(", ")}`);
    let pinData = norm.pinData;
    const textSpec = pinDataTextSpec(pinData);

    // ── Appel 2 : mise en forme (même système de design qu'avant) ──
    const designSystemPrompt = `Tu es une directrice artistique. Tu génères un visuel HTML/CSS inline pour une épingle Pinterest au format 1000×1500px, à partir de TEXTES DÉJÀ RÉDIGÉS ET VALIDÉS (bloc TEXTES À AFFICHER).

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
${hasReference ? `Une image d'épingle Pinterest est fournie comme inspiration.
ANALYSE sa structure (disposition des éléments, hiérarchie, nombre de blocs, densité).
REPRODUIS cette structure et ce layout, mais avec :
- Le nouveau contenu (textes fournis)
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

${invariantsBlock}

═══ TEXTES : FIDÉLITÉ ABSOLUE ═══
Les textes de l'épingle sont DÉJÀ rédigés et validés. Tu ne fais QUE la mise en forme.
- Affiche CHAQUE texte fourni, en entier et mot pour mot : badge_label, main_title, chaque label, chaque description, cta_text (et watermark s'il est fourni).
- Tu n'as PAS le droit de réécrire, reformuler, raccourcir, traduire, ajouter ou retirer un seul mot.
- N'ajoute AUCUN autre texte visible (pas de « Étape », « Astuce », « VS », sous-titre, slogan, hashtag, lien). Seuls ajouts permis : les numéros des éléments en chiffres, des emojis et des symboles (flèches, coches).
- Les libellés cités en exemple dans les types d'épingles (« CHECKLIST », « TUTO », CTA d'exemple) sont remplacés par les textes fournis. Seule exception : les tags « AVANT » et « APRÈS » d'une épingle avant_apres.
- Les quantités des types d'épingles décrivent le contenu déjà rédigé : garde exactement les éléments fournis, dans l'ordre fourni.

Tu réponds via l'outil save_pinterest_design (le schéma de l'outil est le contrat de sortie).

RÈGLES pour element_emojis (un par élément, dans l'ordre des éléments, chaîne vide si aucun) :
- Pour "infographie" et "mini_tuto" : emoji optionnel
- Pour "avant_apres" : emoji optionnel (❌ pour before, ✅ pour after)
- Ce sont les emojis affichés dans pin_html.`;

    const designTexts = {
      badge_label: pinData.badge_label,
      main_title: pinData.main_title,
      // deno-lint-ignore no-explicit-any
      elements: (Array.isArray(pinData.elements) ? pinData.elements : []).map((el: any) => ({
        ...(typeof el?.number === "number" ? { number: el.number } : {}),
        label: el?.label,
        ...(typeof el?.description === "string" && el.description ? { description: el.description } : {}),
        ...(el?.side === "before" || el?.side === "after" ? { side: el.side } : {}),
      })),
      ...(typeof pinData.cta_text === "string" && pinData.cta_text ? { cta_text: pinData.cta_text } : {}),
      ...(typeof pinData.watermark === "string" && pinData.watermark ? { watermark: pinData.watermark } : {}),
    };

    const designUserPrompt = `Mets en forme l'épingle Pinterest suivante.

TYPE D'ÉPINGLE : ${pin_type}

CHARTE GRAPHIQUE :
- Couleur principale : ${ch.color_primary}
- Couleur secondaire : ${ch.color_secondary}
- Couleur accent : ${ch.color_accent}
- Fond : ${ch.color_background}
- Texte : ${ch.color_text}
- Police titres : ${ch.font_title}
- Police corps : ${ch.font_body}
- Ambiance : ${ch.mood_keywords}

TEXTES À AFFICHER (définitifs, à reprendre mot pour mot) :
${JSON.stringify(designTexts, null, 2)}

Réponds en appelant l'outil save_pinterest_design.`;

    const DESIGN_TOOL: AnthropicTool = {
      name: "save_pinterest_design",
      description: "Enregistre la mise en forme de l'épingle Pinterest (visuel HTML des textes fournis)",
      input_schema: {
        type: "object",
        properties: {
          pin_html: {
            type: "string",
            description:
              "HTML complet et autonome du visuel 1000×1500px, CSS 100% inline, commençant par <style>@import Google Fonts</style>, affichant les textes fournis mot pour mot",
          },
          element_emojis: {
            type: "array",
            items: { type: "string" },
            description: "Emoji affiché pour chaque élément, dans l'ordre (chaîne vide si aucun)",
          },
        },
        required: ["pin_html"],
      },
    };

    const design = await designWithTextFidelity<unknown>({
      source: "pinterest-visual",
      pinType: pin_type,
      spec: textSpec,
      deadline: tStart + PIN_REQUEST_BUDGET_MS,
      writeMs,
      callDesign: async (gapNote, timeoutMs) => {
        const designUsage: UsageSink = {};
        try {
          // max_tokens 16384 (comme l'appel unique d'avant) : un pin_html dense
          // reste sous le plafond ; au-delà, 422 « génération coupée » → repli.
          const raw = await callAnthropic({
            model: PIN_DESIGN_MODEL,
            system: designSystemPrompt,
            messages: withReference(gapNote ? `${designUserPrompt}\n\n${gapNote}` : designUserPrompt),
            temperature: 0.5,
            max_tokens: 16384,
            abortTimeoutMs: timeoutMs,
            maxRetries: 0,
            tool: DESIGN_TOOL,
          }, designUsage);
          const parsed = JSON.parse(raw);
          return { html: parsed?.pin_html, extra: parsed?.element_emojis };
        } finally {
          addUsage(usage, designUsage);
        }
      },
      // Gardes déterministes (_shared/pinterest-pin-guards.ts) : @import →
      // <link>, contraste texte/fond, plancher GLOBAL de 20px (décoratifs
      // aria-hidden / opacity < 0.7 comme le watermark exemptés).
      finalize: (html) => {
        const fin = finalizePinHtml(html, { title: ch.font_title, body: ch.font_body }, 20);
        if (fin.contrastFixes > 0 || fin.fontFixes > 0) {
          console.warn(`pinterest-visual: gardes déterministes — ${fin.contrastFixes} contraste, ${fin.fontFixes} font-size sous plancher`);
        }
        return fin.html;
      },
      fallback: () => buildFallbackPinHtml(pinData, ch),
    });

    // Emojis choisis par la mise en forme ET affichés → reportés dans pin_data
    // (le PPTX éditable montre les mêmes que le PNG).
    if (design.outcome !== "fallback") pinData = applyDesignEmojis(pinData, design.extra, design.html);

    // deno-lint-ignore no-explicit-any
    const result: any = {
      pin_html: design.html,
      title: written.title,
      description: written.description,
      pin_data: pinData,
      design_source: design.outcome === "fallback" ? "fallback" : "ai",
    };
    // Filet de mesure historique (ne doit plus jamais se déclencher : le HTML
    // vient d'être validé contre pin_data).
    reportPinDataMismatch(result.pin_data, result.pin_html, "pinterest-visual");

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
}

// En prod (point d'entrée du bundle), import.meta.main est true : inchangé.
if (import.meta.main) {
  serve(handlePinterestVisualRequest);
}
