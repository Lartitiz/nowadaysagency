/**
 * photo-describe
 *
 * Deux assistances IA pour la bibliothèque de photos (lot A stories visuelles) :
 *
 * - mode "describe" : décrit UNE photo de la bibliothèque (vision Haiku →
 *   description factuelle FR + tags) et l'écrit dans user_photos. Appelé une
 *   seule fois à l'upload — ensuite tout le matching photo ↔ contenu est
 *   textuel (gratuit), le catalogue étant injecté dans les briefs (lot B).
 *
 * - mode "shoot_ideas" : génère la « séance photo » guidée (~8 idées de photos
 *   de marque à prendre au téléphone) depuis le branding du workspace. Le front
 *   les affiche dans l'état vide et peut les verser dans photo_wishlist.
 *
 * - mode "pick_stock" (lot C stories) : classe des candidates Pexels en vision
 *   (URLs des vignettes) selon la photo_directive d'UNE story — c'est ce choix
 *   IA parmi ~8 résultats qui fait la pertinence, au lieu du 1er résultat brut.
 *
 * skipQuota : micro-appels d'assistance (comme stock-photo-keywords), pas de
 * débit crédit. Sortie structurée en `tool` forcé (jamais de parse texte).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { runPipeline } from "../_shared/request-pipeline.ts";
import { callAnthropic, AnthropicError } from "../_shared/anthropic.ts";
import { getUserContext } from "../_shared/user-context.ts";

const BodySchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("describe"),
    photo_id: z.string().uuid(),
    workspace_id: z.string().uuid().optional(),
  }),
  z.object({
    mode: z.literal("shoot_ideas"),
    workspace_id: z.string().uuid().optional(),
  }),
  z.object({
    mode: z.literal("pick_stock"),
    workspace_id: z.string().uuid().optional(),
    directive: z.string().min(3).max(400),
    candidates: z
      .array(
        z.object({
          id: z.string().min(1).max(60),
          url: z.string().url().max(500),
        }),
      )
      .min(2)
      .max(10),
  }),
]);

const DESCRIBE_TOOL = {
  name: "save_photo_description",
  description: "Enregistre la description et les tags de la photo",
  input_schema: {
    type: "object",
    properties: {
      description: {
        type: "string",
        description:
          "Description factuelle et concrète de la photo, en français, 8 à 15 mots, commence par le sujet principal (ex : « mains qui lissent un bol en argile, lumière naturelle »)",
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description:
          "3 à 6 tags courts en français, minuscules, singulier. Inclure si pertinent une catégorie parmi : portrait, produit, atelier, coulisses, lifestyle, détail, lieu, équipe.",
      },
    },
    required: ["description", "tags"],
  },
};

const SHOOT_IDEAS_TOOL = {
  name: "save_photo_shoot_ideas",
  description: "Enregistre les idées de photos à prendre",
  input_schema: {
    type: "object",
    properties: {
      ideas: {
        type: "array",
        items: {
          type: "object",
          properties: {
            label: {
              type: "string",
              description: "L'idée de photo, concrète et actionnable au téléphone, max 60 caractères, tutoiement (ex : « Tes mains en plein geste de travail »)",
            },
            icon: {
              type: "string",
              enum: ["portrait", "mains", "lieu", "produit", "detail", "lumiere", "outil", "coulisses"],
            },
          },
          required: ["label", "icon"],
        },
      },
    },
    required: ["ideas"],
  },
};

const PICK_STOCK_TOOL = {
  name: "save_stock_ranking",
  description: "Enregistre le classement des photos candidates",
  input_schema: {
    type: "object",
    properties: {
      ranked_ids: {
        type: "array",
        items: { type: "string" },
        description:
          "Les ids des photos qui conviennent, de la MEILLEURE à la moins bonne. Exclure totalement celles qui sont hors sujet ou trop « stock corporate ».",
      },
    },
    required: ["ranked_ids"],
  },
};

/** Encode un Blob en base64 sans dépasser la pile (chunks). */
async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    binary += String.fromCharCode(...buf.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

serve(async (req) => {
  // Body lu avant le pipeline (le pipeline ne touche pas req.body).
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

  // Assistance non facturée ; rate-limit relevé car un upload par lot
  // déclenche un describe PAR photo (jusqu'à ~20 en rafale).
  const pipe = await runPipeline(req, {
    skipQuota: true,
    workspaceId: workspaceIdForPipeline,
    rateLimit: { max: 40, windowMs: 60_000 },
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
    body = BodySchema.parse(bodyJson);
  } catch (e) {
    return json({ error: "Requête invalide.", details: String(e) }, 400);
  }

  try {
    if (body.mode === "describe") {
      // 1. Ligne photo (client user-scoped : la RLS garantit l'accès workspace)
      const { data: photo, error: fetchErr } = await supabase
        .from("user_photos")
        .select("id, user_id, workspace_id, storage_path, status")
        .eq("id", body.photo_id)
        .maybeSingle();

      if (fetchErr) {
        console.error("[photo-describe] fetch error:", fetchErr);
        return json({ error: "Erreur DB" }, 500);
      }
      if (!photo) return json({ error: "Photo introuvable" }, 404);
      if (body.workspace_id && photo.workspace_id !== body.workspace_id) {
        return json({ error: "Workspace incohérent" }, 403);
      }
      if (photo.status !== "ready" || !photo.storage_path) {
        return json({ error: "Photo pas encore prête" }, 409);
      }

      // 2. Téléchargement de l'image affichée (storage_path, pas l'originale :
      // si la photo a été retouchée, c'est la version retouchée qu'on décrit)
      const { data: blob, error: dlErr } = await supabase.storage
        .from("user-photos")
        .download(photo.storage_path);
      if (dlErr || !blob) {
        console.error("[photo-describe] download error:", dlErr);
        return json({ error: "Photo introuvable dans le stockage" }, 500);
      }

      const data = await blobToBase64(blob);
      const media_type = blob.type && blob.type.startsWith("image/") ? blob.type : "image/jpeg";

      // 3. Vision Haiku, tool forcé
      const raw = await callAnthropic({
        model: "claude-haiku-4-5",
        system:
          "Tu décris des photos pour la bibliothèque de photos de marque d'une entrepreneuse. Tes descriptions serviront à retrouver la bonne photo pour illustrer un contenu Instagram : elles doivent être factuelles, visuelles et concrètes (sujet, action, ambiance/lumière). Jamais d'interprétation marketing.",
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type, data } },
              {
                type: "text",
                text: "Décris cette photo (8 à 15 mots, français) et donne 3 à 6 tags.",
              },
            ],
          },
        ],
        tool: DESCRIBE_TOOL,
        temperature: 0.2,
        max_tokens: 300,
        abortTimeoutMs: 25_000,
      });

      const parsed = JSON.parse(raw) as { description?: unknown; tags?: unknown };
      const description = typeof parsed.description === "string" ? parsed.description.trim().slice(0, 200) : "";
      const tags = Array.from(
        new Set(
          (Array.isArray(parsed.tags) ? parsed.tags : [])
            .map((t) => (typeof t === "string" ? t.trim().toLowerCase() : ""))
            .filter((t) => t.length > 0 && t.length <= 30),
        ),
      ).slice(0, 6);

      if (!description) return json({ error: "Description vide, réessaie." }, 502);

      // 4. Écriture (RLS update workspace-scoped)
      const { error: updErr } = await supabase
        .from("user_photos")
        .update({ description, tags })
        .eq("id", photo.id);
      if (updErr) {
        console.error("[photo-describe] update error:", updErr);
        return json({ error: "Impossible d'enregistrer la description" }, 500);
      }

      console.log(JSON.stringify({ event: "photo_described", photo_id: photo.id, tags_count: tags.length }));
      return json({ description, tags });
    }

    if (body.mode === "pick_stock") {
      // Classement en vision : les vignettes candidates passent en source URL
      // (Anthropic les télécharge côté API — pas de base64 à transporter).
      const content: unknown[] = [];
      for (const c of body.candidates) {
        content.push({ type: "text", text: `Candidate id "${c.id}" :` });
        content.push({ type: "image", source: { type: "url", url: c.url } });
      }
      content.push({
        type: "text",
        text: `Une créatrice cherche le FOND d'une story Instagram (photo plein écran 9:16, du texte sera posé par-dessus).

Le plan de tournage de cette story : "${body.directive}"

Classe les candidates de la meilleure à la moins bonne pour CE plan. Critères :
- La scène correspond au plan de tournage (sujet, action, ambiance).
- Authentique et vécu : lumière naturelle, matière, geste réel. ÉLIMINE le « stock corporate » (bureaux d'entreprise génériques, poignées de main, sourires posés en costume, fonds trop léchés).
- Utilisable en fond : pas de texte incrusté, pas de logo, assez de zones calmes pour poser du texte.
Exclus du classement toute candidate hors sujet — mieux vaut 2 bonnes photos que 8 moyennes.`,
      });

      const raw = await callAnthropic({
        model: "claude-haiku-4-5",
        messages: [{ role: "user", content }],
        tool: PICK_STOCK_TOOL,
        temperature: 0.2,
        max_tokens: 300,
        abortTimeoutMs: 25_000,
      });

      const parsed = JSON.parse(raw) as { ranked_ids?: unknown };
      const validIds = new Set(body.candidates.map((c) => c.id));
      const ranked = Array.from(
        new Set(
          (Array.isArray(parsed.ranked_ids) ? parsed.ranked_ids : [])
            .map((x) => (typeof x === "string" ? x : ""))
            .filter((x) => validIds.has(x)),
        ),
      );
      return json({ ranked_ids: ranked });
    }

    // mode === "shoot_ideas"
    const ctx = await getUserContext(supabase, userId, body.workspace_id);
    const p = ctx.profile || {};
    const charter = ctx.charter || {};
    const lines: string[] = [];
    if (p.prenom) lines.push(`Prénom : ${p.prenom}`);
    if (p.activite) lines.push(`Activité : ${p.activite}`);
    if (p.type_activite) lines.push(`Type d'activité : ${p.type_activite}`);
    if (p.cible) lines.push(`Cible : ${p.cible}`);
    if (p.offre) lines.push(`Offre : ${p.offre}`);
    if (ctx.strategy?.pillar_major) lines.push(`Pilier éditorial majeur : ${ctx.strategy.pillar_major}`);
    if (charter.photo_style) lines.push(`Style photo souhaité : ${charter.photo_style}`);
    if (charter.mood_keywords) lines.push(`Ambiance de marque : ${charter.mood_keywords}`);

    const raw = await callAnthropic({
      model: "claude-haiku-4-5",
      system:
        "Tu prépares une « séance photo de 20 minutes au téléphone » pour une entrepreneuse qui démarre sa bibliothèque de photos de marque. Les idées doivent être faisables SEULE, au smartphone, dans son lieu de travail, sans matériel. Elles serviront de fonds de stories Instagram et d'illustrations de posts : varie les échelles (portrait, mains/geste, lieu large, produit, détail) et privilégie l'authentique au posé.",
      messages: [
        {
          role: "user",
          content: `Voici la marque :\n${lines.length ? lines.join("\n") : "(branding pas encore rempli : propose des idées universelles pour une indépendante)"}\n\nPropose exactement 8 idées de photos à prendre, personnalisées pour cette activité. Chaque idée : concrète, max 60 caractères, en tutoiement.`,
        },
      ],
      tool: SHOOT_IDEAS_TOOL,
      temperature: 0.7,
      max_tokens: 700,
      abortTimeoutMs: 25_000,
    });

    const parsed = JSON.parse(raw) as { ideas?: unknown };
    const ICONS = new Set(["portrait", "mains", "lieu", "produit", "detail", "lumiere", "outil", "coulisses"]);
    const ideas = (Array.isArray(parsed.ideas) ? parsed.ideas : [])
      .map((i: any) => ({
        label: typeof i?.label === "string" ? i.label.trim().slice(0, 80) : "",
        icon: ICONS.has(i?.icon) ? (i.icon as string) : "coulisses",
      }))
      .filter((i) => i.label.length > 0)
      .slice(0, 10);

    if (!ideas.length) return json({ error: "Aucune idée proposée, réessaie." }, 502);
    return json({ ideas });
  } catch (e) {
    if (e instanceof AnthropicError) {
      return json({ error: e.message }, e.status >= 500 ? 502 : e.status);
    }
    console.error("[photo-describe] unexpected:", e);
    return json({ error: "Erreur inattendue" }, 500);
  }
});
