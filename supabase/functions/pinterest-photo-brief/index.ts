import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
import { AnthropicError, callAnthropic, OPUS_MODEL, type AnthropicModel, type AnthropicTool, type UsageSink } from "../_shared/anthropic.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { validateInput, ValidationError } from "../_shared/input-validators.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS } from "../_shared/user-context.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
import { assertWorkspaceMembership, workspaceDeniedResponse } from "../_shared/workspace-guard.ts";
import { finalizePinHtml } from "../_shared/pinterest-pin-guards.ts";
import {
  addUsage,
  buildFallbackOverlayHtml,
  designWithTextFidelity,
  PHOTO_OVERLAY_HINT,
  photoOverlayTextSpec,
  PIN_REQUEST_BUDGET_MS,
  PIN_WRITE_TIMEOUT_MS,
} from "../_shared/pinterest-two-step.ts";

/** Modèles des deux appels : ceux d'avant (Opus), pour garder le même rendu (cf. pinterest-visual). */
export const PHOTO_WRITE_MODEL: AnthropicModel = OPUS_MODEL;
export const PHOTO_DESIGN_MODEL: AnthropicModel = OPUS_MODEL;

/**
 * Plancher de taille de l'overlay : le prompt de cette edge fixe « corps min
 * 18px » (≠ 20px de pinterest-visual) — la garde ne rattrape que ce qui est
 * SOUS le contrat du prompt, elle ne change pas un overlay qui le respecte.
 */
export const PHOTO_OVERLAY_MIN_FONT_PX = 18;

// Handler exporté pour les tests (index_test.ts) : `serve()` de std/http ouvre
// un vrai socket au chargement, d'où le guard `import.meta.main` en bas de
// fichier (même patron que branding-coaching) — comportement de prod inchangé.
export async function handlePinterestPhotoBriefRequest(req: Request): Promise<Response> {
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
      reference_image_base64: z.string().max(10000000).optional().nullable(),
      pin_type: z.enum(["photo_product", "photo_lifestyle", "photo_flat_lay"]),
      brief_hint: z.string().max(5000).optional().nullable(),
      pinterest_link: z.string().max(500).optional().nullable(),
      pinterest_board: z.string().max(200).optional().nullable(),
      workspace_id: z.string().uuid().optional().nullable(),
    }).passthrough());

    const membership = await assertWorkspaceMembership(sbAdmin, user.id, reqBody.workspace_id);
    if (!membership.ok) {
      console.warn("[workspace-guard] denied", { userId: user.id, workspaceId: reqBody.workspace_id });
      return workspaceDeniedResponse(corsHeaders);
    }

    const { subject, pin_type, brief_hint, pinterest_link, pinterest_board } = reqBody;
    const filterWs = reqBody.workspace_id || workspaceId;

    const quota = await checkQuota(user.id, "content", filterWs);
    if (!quota.allowed) {
      return new Response(JSON.stringify({ error: quota.message, quota }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
    const charter = (charterRes.data || {}) as Record<string, any>;

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

    // ═══ DEUX APPELS (chantier « séparation écriture / design », 04/10/2026) ═══
    // Appel 1 « rédaction » : brief photo + TEXTE de l'overlay + SEO. Appel 2
    // « mise en forme » : overlay_html à partir de ce texte FINAL, validé par
    // le code (_shared/pinterest-two-step.ts). Mêmes règles qu'avant, réparties.
    const writeSystemPrompt = `Tu es une directrice artistique spécialisée en photographie pour Pinterest ET experte SEO Pinterest. Tu reçois une image d'épingle Pinterest comme inspiration. Tu dois :
1) Générer un brief photo détaillé pour l'utilisatrice
2) Rédiger le texte de l'overlay (le texte qui apparaîtra sur la photo finale)
3) Générer le titre et la description SEO

La mise en forme de l'overlay (disposition, couleurs, polices) est faite dans une étape séparée qui reprendra ton texte mot pour mot : écris exactement le texte à afficher, rien d'autre.

═══ BRIEF PHOTO ═══
Le brief doit être concret et actionnable :
- what : quoi photographier exactement (décris la scène)
- framing : cadrage (flat lay, portrait, plan large, détail, etc.)
- lighting : éclairage (lumière naturelle, studio, golden hour, etc.)
- props : liste de 3-6 accessoires/éléments à inclure
- colors : palette de couleurs dominantes à viser
- mood : ambiance en 2-3 mots (ex: "chaleureux et professionnel")

═══ TEXTE DE L'OVERLAY ═══
- title : le texte overlay principal, tel qu'il apparaîtra sur la photo finale
- subtitle : texte secondaire, optionnel
- badge : texte d'un badge pilule ou d'un élément signature Nowadays si pertinent, optionnel
- cta : appel à l'action affiché, optionnel

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

Tu réponds via l'outil save_pinterest_photo_text (le schéma de l'outil est le contrat de sortie).`;

    const hasReference = !!reqBody.reference_image_base64;
    const rawBase64 = hasReference
      ? reqBody.reference_image_base64.replace(/^data:image\/[a-z]+;base64,/, "")
      : "";

    // La charte reste dans le message de rédaction : le brief photo (colors)
    // vise la palette de l'utilisatrice.
    const writeUserPrompt = hasReference
      ? `Voici l'épingle Pinterest d'inspiration. Crée un brief photo + le texte de l'overlay pour l'adapter au projet de cette utilisatrice.

SUJET : ${subject}
TYPE : ${pin_type}
${brief_hint ? `BRIEF INITIAL : ${brief_hint}` : ""}
${pinterest_link ? `LIEN : ${pinterest_link}` : ""}

CONTEXTE BRANDING :
${contextText}

CHARTE : primary ${ch.color_primary}, secondary ${ch.color_secondary}, accent ${ch.color_accent}, bg ${ch.color_background}, text ${ch.color_text}, font_title ${ch.font_title}, font_body ${ch.font_body}`
      : `Crée un brief photo + le texte de l'overlay pour cette utilisatrice à partir du sujet et de sa charte uniquement (pas d'image de référence).

SUJET : ${subject}
TYPE : ${pin_type}
${brief_hint ? `BRIEF INITIAL : ${brief_hint}` : ""}
${pinterest_link ? `LIEN : ${pinterest_link}` : ""}

CONTEXTE BRANDING :
${contextText}

CHARTE : primary ${ch.color_primary}, secondary ${ch.color_secondary}, accent ${ch.color_accent}, bg ${ch.color_background}, text ${ch.color_text}, font_title ${ch.font_title}, font_body ${ch.font_body}`;

    // deno-lint-ignore no-explicit-any
    const withReference = (text: string): any => hasReference
      ? [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: rawBase64 } },
            { type: "text", text },
          ],
        }]
      : [{ role: "user", content: text }];

    // Sortie structurée par tool forcé (au lieu du JSON libre d'avant) : plus
    // de réponse illisible, troncature → 422 propre avant logUsage.
    const TEXT_TOOL: AnthropicTool = {
      name: "save_pinterest_photo_text",
      description: "Enregistre le brief photo, le texte de l'overlay et le SEO de l'épingle photo",
      input_schema: {
        type: "object",
        properties: {
          photo_brief: {
            type: "object",
            properties: {
              what: { type: "string" },
              framing: { type: "string" },
              lighting: { type: "string" },
              props: { type: "array", items: { type: "string" } },
              colors: { type: "string" },
              mood: { type: "string" },
            },
            required: ["what", "framing", "lighting", "props", "colors", "mood"],
          },
          overlay_text: {
            type: "object",
            description: "Texte affiché sur l'overlay (repris mot pour mot par la mise en forme)",
            properties: {
              title: { type: "string" },
              subtitle: { type: "string" },
              badge: { type: "string" },
              cta: { type: "string" },
            },
            required: ["title"],
          },
          title: { type: "string", description: "Titre SEO max 100 caractères" },
          description: { type: "string", description: "Description SEO 100-200 mots" },
        },
        required: ["photo_brief", "overlay_text", "title", "description"],
      },
    };

    const usage: UsageSink = {};

    // ── Appel 1 : rédaction ──
    const tWrite = Date.now();
    const writeUsage: UsageSink = {};
    const rawText = await callAnthropic({
      model: PHOTO_WRITE_MODEL,
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
    let written: any = null;
    try {
      written = JSON.parse(rawText);
    } catch {
      written = null;
    }
    // Plus de fallback muet : une réponse illisible = erreur claire (502), sans débiter le quota.
    if (!written || typeof written.overlay_text?.title !== "string" || !written.overlay_text.title.trim()) {
      console.error("pinterest-photo-brief: texte illisible", rawText.slice(0, 300));
      return new Response(
        JSON.stringify({ error: "L'IA n'a pas retourné un format valide. Réessaie." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const overlayText = written.overlay_text;
    const textSpec = photoOverlayTextSpec(overlayText);

    // ── Appel 2 : mise en forme de l'overlay (mêmes règles de design qu'avant) ──
    const designSystemPrompt = `Tu es une directrice artistique spécialisée en photographie pour Pinterest. Tu génères un visuel overlay HTML (1000×1500px) avec fond dégradé + texte positionné, à partir d'un TEXTE D'OVERLAY DÉJÀ RÉDIGÉ ET VALIDÉ (bloc TEXTE À AFFICHER).

═══ VISUEL OVERLAY ═══
Génère un <div> HTML/CSS inline de 1000×1500px avec :
- Fond : DÉGRADÉ DOUX utilisant les couleurs de la charte (du plus clair en haut au plus soutenu en bas, ou un angle diagonal)
  Exemple : background: linear-gradient(160deg, ${ch.color_background} 0%, ${ch.color_primary}20 50%, ${ch.color_secondary}30 100%);
- Le texte overlay positionné comme il apparaîtrait sur la photo finale
- Le texte utilise les polices de la charte (${ch.font_title} pour les titres, ${ch.font_body} pour le corps)
- Un badge pilule ou un élément signature Nowadays si pertinent
- L'ensemble doit être joli même SANS photo derrière (le dégradé sert d'attente)
- Indication discrète en bas : "${PHOTO_OVERLAY_HINT}" en petit texte muted

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

═══ TEXTE : FIDÉLITÉ ABSOLUE ═══
Le texte de l'overlay est DÉJÀ rédigé et validé. Tu ne fais QUE la mise en forme.
- Affiche CHAQUE texte fourni (title, subtitle, badge, cta s'ils sont fournis), en entier et mot pour mot.
- Tu n'as PAS le droit de réécrire, reformuler, raccourcir, traduire, ajouter ou retirer un seul mot.
- N'ajoute AUCUN autre texte visible, à part l'indication "${PHOTO_OVERLAY_HINT}". Emojis et symboles permis.

Tu réponds via l'outil save_pinterest_overlay (le schéma de l'outil est le contrat de sortie).`;

    const designUserPrompt = `${hasReference ? "Voici l'épingle Pinterest d'inspiration. Crée l'overlay pour l'adapter au projet de cette utilisatrice." : "Crée l'overlay pour cette utilisatrice à partir de sa charte (pas d'image de référence)."}

TYPE : ${pin_type}

CHARTE : primary ${ch.color_primary}, secondary ${ch.color_secondary}, accent ${ch.color_accent}, bg ${ch.color_background}, text ${ch.color_text}, font_title ${ch.font_title}, font_body ${ch.font_body}

PHOTO PRÉVUE (pour placer le texte) :
${JSON.stringify(written.photo_brief ?? {}, null, 2)}

TEXTE À AFFICHER (définitif, à reprendre mot pour mot) :
${JSON.stringify(overlayText, null, 2)}

Réponds en appelant l'outil save_pinterest_overlay.`;

    const DESIGN_TOOL: AnthropicTool = {
      name: "save_pinterest_overlay",
      description: "Enregistre la mise en forme de l'overlay (HTML du texte fourni)",
      input_schema: {
        type: "object",
        properties: {
          overlay_html: {
            type: "string",
            description: "<style>@import url(...);</style><div style=\"width:1000px;height:1500px;...\">...</div> affichant le texte fourni mot pour mot",
          },
        },
        required: ["overlay_html"],
      },
    };

    const design = await designWithTextFidelity<undefined>({
      source: "pinterest-photo-brief",
      pinType: pin_type,
      spec: textSpec,
      deadline: tStart + PIN_REQUEST_BUDGET_MS,
      writeMs,
      callDesign: async (gapNote, timeoutMs) => {
        const designUsage: UsageSink = {};
        try {
          const raw = await callAnthropic({
            model: PHOTO_DESIGN_MODEL,
            system: designSystemPrompt,
            messages: withReference(gapNote ? `${designUserPrompt}\n\n${gapNote}` : designUserPrompt),
            temperature: 0.5,
            max_tokens: 6144,
            abortTimeoutMs: timeoutMs,
            maxRetries: 0,
            tool: DESIGN_TOOL,
          }, designUsage);
          return { html: JSON.parse(raw)?.overlay_html };
        } finally {
          addUsage(usage, designUsage);
        }
      },
      // Post-traitement commun avec pinterest-visual (_shared/pinterest-pin-guards.ts) :
      // @import → <link>, puis gardes DÉTERMINISTES contraste texte/fond et
      // plancher de police (n'agissent que sur les cas cassés ; décors
      // aria-hidden / opacity < 0.7 exemptés).
      finalize: (html) => {
        const fin = finalizePinHtml(html, { title: ch.font_title, body: ch.font_body }, PHOTO_OVERLAY_MIN_FONT_PX);
        if (fin.contrastFixes > 0 || fin.fontFixes > 0) {
          console.warn(`pinterest-photo-brief: gardes déterministes — ${fin.contrastFixes} contraste, ${fin.fontFixes} font-size sous plancher`);
        }
        return fin.html;
      },
      fallback: () => buildFallbackOverlayHtml(overlayText, ch),
    });

    const result = {
      photo_brief: written.photo_brief,
      overlay_html: design.html,
      overlay_text: overlayText,
      title: written.title,
      description: written.description,
      design_source: design.outcome === "fallback" ? "fallback" : "ai",
    };

    await logUsage(user.id, "content", "pinterest_photo_brief", usage.total_tokens, usage.model, filterWs);

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
    // Erreurs IA typées (troncature, surcharge…) : message clair, et logUsage
    // n'a pas tourné → l'échec n'est pas facturé (même patron que pinterest-visual).
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
  serve(handlePinterestPhotoBriefRequest);
}
