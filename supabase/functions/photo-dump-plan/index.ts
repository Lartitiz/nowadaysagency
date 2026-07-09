/**
 * photo-dump-plan — planifie la séquence d'un « photo dump » (lot 3 mise en scène).
 *
 * Entrée : le sujet du post + les photos attachées. Sortie : un arc narratif
 * de 6-8 slides, chaque slide assignée à la source la MOINS chère qui raconte
 * le beat :
 *   - "library"        → une vraie photo de la bibliothèque (gratuit)
 *   - "photoroom"      → une vraie photo, fond refait Photoroom (1 crédit —
 *                        bon sujet, fond faible ; jamais l'IA sur le sujet)
 *   - "generate_porte" → slide produit portée gpt-image (1 crédit, seulement
 *                        si photo produit dispo)
 *   - "generate_pose"  → slide objet/lieu SANS personne gpt-image (1 crédit)
 *   - "missing"        → introuvable → wishlist « Photos à prendre »
 *
 * Règles produit (décisions Laetitia 09/07) : les photos attachées par
 * l'utilisatrice sont TOUTES placées ; bibliothèque avant génération ;
 * JAMAIS générer une personne pour incarner l'utilisatrice (deepfake) ;
 * produit frontal 2 slides max ; une slide « respiration » et une slide
 * mouvement/floue assumée quand la séquence s'y prête.
 *
 * skipQuota : micro-appel de planification (le coût réel = les slides
 * générées, facturées par product-on-model / photoroom-edit).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { runPipeline } from "../_shared/request-pipeline.ts";
import { validateInput, ValidationError } from "../_shared/input-validators.ts";
import { callAnthropic, AnthropicError } from "../_shared/anthropic.ts";

const BodySchema = z.object({
  workspace_id: z.string().uuid().optional().nullable(),
  sujet: z.string().min(3).max(600),
  attached_photo_ids: z.array(z.string().uuid()).max(10).default([]),
  target_count: z.number().int().min(5).max(9).default(7),
});

const PLAN_TOOL = {
  name: "save_dump_plan",
  description: "Enregistre le plan du photo dump",
  input_schema: {
    type: "object",
    properties: {
      narrative_thread: {
        type: "string",
        description:
          "Le fil narratif de la séquence, en français, 6-12 mots, concret et vécu (ex : « une journée dans la préparation de la collection »)",
      },
      slides: {
        type: "array",
        items: {
          type: "object",
          properties: {
            beat: {
              type: "string",
              description:
                "Ce que montre la slide, français, 4-10 mots, concret (ex : « l'atelier au matin, lumière rasante »)",
            },
            source: {
              type: "string",
              enum: ["library", "photoroom", "generate_porte", "generate_pose", "missing"],
              description:
                "library = photo du catalogue qui colle au beat (id repris tel quel). photoroom = photo du catalogue au bon SUJET mais fond faible/hors-DA. generate_porte = produit porté par une personne (UNIQUEMENT si le catalogue contient une photo produit, et 2 max par plan). generate_pose = objet/lieu SANS personne. missing = rien ne convient, à prendre en vrai.",
            },
            photo_id: {
              type: "string",
              description: "OBLIGATOIRE pour library et photoroom : l'id exact du catalogue. Pour generate_* : l'id de la photo PRODUIT source si pertinent.",
            },
            scene_en: {
              type: "string",
              description:
                "Pour generate_* : la scène en ANGLAIS, concrète, 8-20 mots (lieu, action, lumière). Pour photoroom : le NOUVEAU fond en anglais, simple et proche de la lumière d'origine (ex : « textured cream wall, soft daylight »).",
            },
            blurry: {
              type: "boolean",
              description: "true pour LA slide mouvement/floue assumée (une seule max, jamais la première)",
            },
          },
          required: ["beat", "source"],
        },
      },
    },
    required: ["narrative_thread", "slides"],
  },
};

serve(async (req) => {
  let bodyJson: unknown = null;
  let workspaceIdForPipeline: string | undefined;
  if (req.method !== "OPTIONS") {
    try {
      bodyJson = await req.json();
      const w = (bodyJson as Record<string, unknown>)?.workspace_id;
      workspaceIdForPipeline = typeof w === "string" ? w : undefined;
    } catch {
      bodyJson = null;
    }
  }

  const pipe = await runPipeline(req, {
    skipQuota: true,
    workspaceId: workspaceIdForPipeline,
    rateLimit: { max: 10, windowMs: 60_000 },
  });
  if (!pipe.ok) return pipe.response;
  const { userId, supabase, corsHeaders } = pipe;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  let body: z.infer<typeof BodySchema>;
  try {
    body = validateInput(bodyJson, BodySchema) as z.infer<typeof BodySchema>;
  } catch (e) {
    const msg = e instanceof ValidationError ? e.message : "Body invalide";
    return json({ error: msg }, 400);
  }

  try {
    // Catalogue bibliothèque (RLS-scoped) : descriptions + types pour le matching
    const col = body.workspace_id ? "workspace_id" : "user_id";
    const val = body.workspace_id || userId;
    const [photosRes, profileRes, charterRes] = await Promise.all([
      supabase
        .from("user_photos")
        .select("id, description, tags, kind")
        .eq(col === "workspace_id" ? "workspace_id" : "user_id", val)
        .eq("status", "ready")
        .not("description", "is", null)
        .order("created_at", { ascending: false })
        .limit(60),
      supabase.from("profiles").select("activite, type_activite").eq("user_id", userId).maybeSingle(),
      supabase
        .from("brand_charter")
        .select("photo_style, mood_keywords, visual_donts, moodboard_description")
        .eq(col, val)
        .maybeSingle(),
    ]);

    const catalogue = (photosRes.data ?? []) as {
      id: string;
      description: string | null;
      tags: string[] | null;
      kind: string | null;
    }[];

    const attachedSet = new Set(body.attached_photo_ids);
    const hasProductPhoto = catalogue.some(
      (p) => p.kind === "produit" || p.kind === "produit_porte",
    );

    const catalogueLines = catalogue.map(
      (p) =>
        `- id ${p.id}${attachedSet.has(p.id) ? " [ATTACHÉE par l'utilisatrice]" : ""} · type ${p.kind ?? "?"} · ${p.description}`,
    );

    const ch = charterRes.data ?? {};
    const brandLines: string[] = [];
    if (profileRes.data?.activite) brandLines.push(`Activité : ${profileRes.data.activite}`);
    const moods = Array.isArray(ch.mood_keywords) ? ch.mood_keywords.filter(Boolean) : [];
    if (moods.length) brandLines.push(`Style visuel : ${moods.join(", ")}`);
    if (ch.photo_style) brandLines.push(`Style photo : ${ch.photo_style}`);
    if (ch.moodboard_description) brandLines.push(`Ambiance : ${ch.moodboard_description}`);

    const raw = await callAnthropic({
      model: "claude-sonnet-4-6",
      system:
        "Tu composes des « photo dumps » Instagram : des carrousels 100 % photos, spontanés, qui racontent une histoire vécue — jamais un catalogue commercial. Codes du format : 6-8 slides, arc narratif (ouverture qui pose la scène → moments qui se suivent → une respiration → une chute qui reboucle), le produit n'est frontal que sur 2 slides MAX, une slide mouvement/floue assumée, variété d'échelles (large, détail, geste). Le VRAI passe avant le généré : privilégie les photos du catalogue quand elles collent au beat. INTERDIT ABSOLU : générer une personne pour incarner l'utilisatrice ou son équipe (source generate_porte = uniquement un produit porté par un mannequin anonyme, et seulement si le catalogue contient des photos produit).",
      messages: [
        {
          role: "user",
          content: `SUJET du post (l'histoire à raconter) : ${body.sujet}

MARQUE :
${brandLines.length ? brandLines.join("\n") : "(branding non rempli)"}

CATALOGUE bibliothèque (photos réelles disponibles) :
${catalogueLines.length ? catalogueLines.join("\n") : "(bibliothèque vide)"}

${hasProductPhoto ? "Le catalogue contient des photos PRODUIT → generate_porte autorisé (2 max)." : "AUCUNE photo produit au catalogue → generate_porte INTERDIT (n'utilise que library/photoroom/generate_pose/missing)."}

Compose un plan de ${body.target_count} slides. Règles :
- Les photos [ATTACHÉES par l'utilisatrice] doivent TOUTES être placées (source library).
- Bibliothèque d'abord : chaque photo du catalogue qui raconte un beat → source library (id exact).
- photoroom SEULEMENT si le sujet d'une photo est bon mais son fond dessert la marque.
- generate_pose : objets, lieux, matières, nourriture — JAMAIS de personne.
- missing en dernier recours (ce sera une photo « à prendre » proposée à l'utilisatrice).
- Ordre = l'arc narratif, pas l'ordre du catalogue.`,
        },
      ],
      tool: PLAN_TOOL,
      temperature: 0.6,
      max_tokens: 1800,
      abortTimeoutMs: 40_000,
    });

    const parsed = JSON.parse(raw) as { narrative_thread?: unknown; slides?: unknown };
    const validIds = new Set(catalogue.map((p) => p.id));
    const SOURCES = new Set(["library", "photoroom", "generate_porte", "generate_pose", "missing"]);

    let porteCount = 0;
    const slides = (Array.isArray(parsed.slides) ? parsed.slides : [])
      .map((s: any) => {
        let source = SOURCES.has(s?.source) ? (s.source as string) : "missing";
        let photo_id = typeof s?.photo_id === "string" && validIds.has(s.photo_id) ? s.photo_id : null;
        // Garde-fous déterministes post-parse (le modèle peut déraper) :
        if ((source === "library" || source === "photoroom") && !photo_id) source = "missing";
        if (source === "generate_porte") {
          porteCount++;
          if (!hasProductPhoto || porteCount > 2) source = "generate_pose";
        }
        return {
          beat: typeof s?.beat === "string" ? s.beat.trim().slice(0, 120) : "",
          source,
          photo_id,
          scene_en: typeof s?.scene_en === "string" ? s.scene_en.trim().slice(0, 300) : null,
          blurry: s?.blurry === true,
        };
      })
      .filter((s) => s.beat.length > 0)
      .slice(0, 9);

    if (slides.length < 4) return json({ error: "Plan trop court, réessaie." }, 502);

    const narrative =
      typeof parsed.narrative_thread === "string"
        ? parsed.narrative_thread.trim().slice(0, 160)
        : "";

    console.log(JSON.stringify({
      event: "photo_dump_plan",
      user_id: userId,
      slides: slides.length,
      by_source: slides.reduce((acc: Record<string, number>, s) => {
        acc[s.source] = (acc[s.source] ?? 0) + 1;
        return acc;
      }, {}),
    }));

    return json({ narrative_thread: narrative, slides, has_product_photo: hasProductPhoto });
  } catch (e) {
    if (e instanceof AnthropicError) {
      return json({ error: e.message }, e.status >= 500 ? 502 : e.status);
    }
    console.error("[photo-dump-plan] unexpected:", e);
    return json({ error: "Erreur inattendue" }, 500);
  }
});
