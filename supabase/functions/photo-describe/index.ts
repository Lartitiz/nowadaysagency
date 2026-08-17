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
 * - mode "classify_missing" (lot 1bis mise en scène) : rattrape le champ `kind`
 *   des photos décrites avant son introduction — classification TEXTE (les
 *   descriptions existent déjà, pas de re-vision) en un seul appel Haiku par
 *   lot de 40. Appelé par la bibliothèque quand elle voit des photos sans
 *   kind : auto-réparant, pas de backfill admin.
 *
 * - mode "portrait_ambiances" (Portrait pro) : 4 ambiances de fond de portrait
 *   personnalisées depuis le branding (titre + description + prompt Photoroom
 *   caché). Cache dans brand_charter.portrait_ambiances, invalidé par une
 *   signature des champs branding utilisés (PAS updated_at : notre propre
 *   écriture du cache le bumperait → régénération infinie). `regenerate`
 *   force un nouveau lot en évitant les titres précédents.
 *
 * skipQuota : micro-appels d'assistance (comme stock-photo-keywords), pas de
 * débit crédit. Sortie structurée en `tool` forcé (jamais de parse texte).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { runPipeline } from "../_shared/request-pipeline.ts";
import { callAnthropic, AnthropicError } from "../_shared/anthropic.ts";
import { getUserContext } from "../_shared/user-context.ts";
import { mergePhotoTags } from "../_shared/photo-tags.ts";

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
    mode: z.literal("classify_missing"),
    workspace_id: z.string().uuid().optional(),
  }),
  z.object({
    mode: z.literal("portrait_ambiances"),
    workspace_id: z.string().uuid().optional(),
    regenerate: z.boolean().optional(),
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

// Types de photo : pilotent les actions contextuelles de la bibliothèque
// (Packshot/Mettre en scène = produit only) et le matching des futurs lots.
const PHOTO_KINDS = ["produit", "produit_porte", "portrait", "ambiance", "coulisses", "autre"] as const;

const KIND_GUIDE =
  "produit = l'objet à vendre est le sujet principal (posé, packshot, à plat) ; " +
  "produit_porte = le produit est porté/tenu par quelqu'un mais reste le sujet ; " +
  "portrait = une personne est le sujet principal ; " +
  "ambiance = lieu, décor, matière, nourriture, paysage ; " +
  "coulisses = travail en cours, mains à l'œuvre, atelier en action ; " +
  "autre = rien de tout ça (capture d'écran, texte, graphique…).";

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
          "2 à 5 tags courts en français, minuscules, singulier, qui décrivent UNIQUEMENT ce qui est visible sur l'image. N'invente aucun contexte : pas de saison, de fête, de lieu ni d'activité que l'image ne montre pas. Un objet de saison ne se tague que s'il est VISIBLE (un sapin, une guirlande…). Mieux vaut 2 tags justes que 5 approximatifs.",
      },
      kind: {
        type: "string",
        enum: [...PHOTO_KINDS],
        description: `Type de photo. ${KIND_GUIDE}`,
      },
    },
    required: ["description", "tags", "kind"],
  },
};

const CLASSIFY_TOOL = {
  name: "save_photo_kinds",
  description: "Enregistre le type de chaque photo",
  input_schema: {
    type: "object",
    properties: {
      kinds: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "L'id de la photo, repris tel quel" },
            kind: { type: "string", enum: [...PHOTO_KINDS], description: KIND_GUIDE },
          },
          required: ["id", "kind"],
        },
      },
    },
    required: ["kinds"],
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

const PORTRAIT_AMBIANCES_TOOL = {
  name: "save_portrait_ambiances",
  description: "Enregistre les ambiances de fond de portrait proposées",
  input_schema: {
    type: "object",
    properties: {
      ambiances: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Nom court de l'ambiance, max 28 caractères (ex : « Dans ton atelier »)",
            },
            description: {
              type: "string",
              description:
                "Ce qu'on verra derrière la personne, concret, max 65 caractères (ex : « Établi en bois, pièces en cours, lumière du matin »)",
            },
            prompt: {
              type: "string",
              description:
                "Prompt du décor pour l'IA de remplacement de fond : le DÉCOR SEUL, sans personne ni texte, réaliste, net, lumière décrite. 60 à 220 caractères, en français.",
            },
          },
          required: ["title", "description", "prompt"],
        },
      },
    },
    required: ["ambiances"],
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
        .select("id, user_id, workspace_id, storage_path, status, tags")
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
                text: "Décris cette photo (8 à 15 mots, français), donne 2 à 5 tags de ce qui est VISIBLE, et classe son type (kind).",
              },
            ],
          },
        ],
        tool: DESCRIBE_TOOL,
        temperature: 0.2,
        max_tokens: 300,
        abortTimeoutMs: 25_000,
      });

      const parsed = JSON.parse(raw) as { description?: unknown; tags?: unknown; kind?: unknown };
      const description = typeof parsed.description === "string" ? parsed.description.trim().slice(0, 200) : "";
      // Garde déterministe : seule la PROVENANCE survit à une re-description,
      // tout ce qui décrit la scène est re-déduit de l'image (cf. photo-tags.ts).
      const tags = mergePhotoTags(photo.tags as unknown[] | null, parsed.tags as unknown[]);
      const kind = PHOTO_KINDS.includes(parsed.kind as (typeof PHOTO_KINDS)[number])
        ? (parsed.kind as string)
        : "autre";

      if (!description) return json({ error: "Description vide, réessaie." }, 502);

      // 4. Écriture (RLS update workspace-scoped)
      const { error: updErr } = await supabase
        .from("user_photos")
        .update({ description, tags, kind })
        .eq("id", photo.id);
      if (updErr) {
        console.error("[photo-describe] update error:", updErr);
        return json({ error: "Impossible d'enregistrer la description" }, 500);
      }

      console.log(JSON.stringify({ event: "photo_described", photo_id: photo.id, tags_count: tags.length, kind }));
      return json({ description, tags, kind });
    }

    if (body.mode === "classify_missing") {
      // Rattrapage : photos déjà décrites mais sans kind (antérieures au champ).
      // Classification TEXTE sur les descriptions stockées — un seul appel Haiku
      // par lot de 40, pas de re-vision. RLS-scoped : chaque bibliothèque se
      // répare elle-même à l'ouverture.
      const { data: rows, error: listErr } = await supabase
        .from("user_photos")
        .select("id, description, tags")
        .is("kind", null)
        .not("description", "is", null)
        .eq("status", "ready")
        .order("created_at", { ascending: true })
        .limit(40);

      if (listErr) {
        console.error("[photo-describe] classify list error:", listErr);
        return json({ error: "Erreur DB" }, 500);
      }
      if (!rows?.length) return json({ classified: 0, remaining: 0 });

      const lines = rows.map(
        (r: { id: string; description: string | null; tags: string[] | null }) =>
          `id ${r.id} : ${r.description}${r.tags?.length ? ` (tags : ${r.tags.join(", ")})` : ""}`,
      );

      const raw = await callAnthropic({
        model: "claude-haiku-4-5",
        system:
          "Tu classes des photos de la bibliothèque d'une marque à partir de leur description. Réponds pour CHAQUE photo listée, en reprenant son id tel quel.",
        messages: [
          {
            role: "user",
            content: `Types possibles : ${KIND_GUIDE}\n\nClasse chacune de ces photos :\n${lines.join("\n")}`,
          },
        ],
        tool: CLASSIFY_TOOL,
        temperature: 0,
        max_tokens: 1500,
        abortTimeoutMs: 25_000,
      });

      const parsed = JSON.parse(raw) as { kinds?: unknown };
      const validIds = new Set(rows.map((r: { id: string }) => r.id));
      let classified = 0;
      for (const item of Array.isArray(parsed.kinds) ? parsed.kinds : []) {
        const id = typeof (item as any)?.id === "string" ? (item as any).id : "";
        const kind = PHOTO_KINDS.includes((item as any)?.kind) ? ((item as any).kind as string) : null;
        if (!id || !kind || !validIds.has(id)) continue;
        const { error: updErr } = await supabase.from("user_photos").update({ kind }).eq("id", id);
        if (!updErr) classified++;
      }

      console.log(JSON.stringify({ event: "photos_classified", classified, batch: rows.length }));
      return json({ classified, remaining: rows.length === 40 ? 1 : 0 });
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

    if (body.mode === "portrait_ambiances") {
      const ctx = await getUserContext(supabase, userId, body.workspace_id);
      const p = ctx.profile || {};
      const charter = ctx.charter || {};

      const lines: string[] = [];
      if (p.prenom) lines.push(`Prénom : ${p.prenom}`);
      if (p.activite) lines.push(`Activité : ${p.activite}`);
      if (p.type_activite) lines.push(`Type d'activité : ${p.type_activite}`);
      if (p.cible) lines.push(`Cible : ${p.cible}`);
      if (charter.photo_style) lines.push(`Style photo souhaité : ${charter.photo_style}`);
      if (charter.mood_keywords) lines.push(`Ambiance de marque : ${JSON.stringify(charter.mood_keywords)}`);
      if (charter.moodboard_description) lines.push(`Moodboard : ${charter.moodboard_description}`);
      const colors = [charter.color_primary, charter.color_secondary, charter.color_accent, charter.color_background]
        .filter(Boolean)
        .join(", ");
      if (colors) lines.push(`Couleurs de la charte (hex) : ${colors}`);
      if (charter.visual_donts) lines.push(`À éviter absolument : ${charter.visual_donts}`);

      // Signature d'invalidation : les champs branding réellement utilisés.
      // (updated_at serait bumpé par notre propre écriture du cache.)
      const signature = lines.join("|");

      // Ligne charte pour le cache (colonne posée par la migration Portrait pro ;
      // select défensif : si la colonne manque encore, on génère sans cache).
      let charterRow: { id: string; portrait_ambiances: unknown } | null = null;
      try {
        const col = body.workspace_id ? "workspace_id" : "user_id";
        const val = body.workspace_id || userId;
        const { data } = await supabase
          .from("brand_charter")
          .select("id, portrait_ambiances")
          .eq(col, val)
          .maybeSingle();
        charterRow = data;
      } catch {
        charterRow = null;
      }

      const cache = (charterRow?.portrait_ambiances ?? null) as
        | { signature?: unknown; items?: unknown }
        | null;
      const cachedItems = Array.isArray(cache?.items) ? (cache!.items as any[]) : [];
      if (!body.regenerate && cachedItems.length >= 3 && cache?.signature === signature) {
        return json({ ambiances: cachedItems, cached: true });
      }

      const avoidTitles = body.regenerate
        ? cachedItems.map((a) => (typeof a?.title === "string" ? a.title : "")).filter(Boolean)
        : [];

      const raw = await callAnthropic({
        model: "claude-haiku-4-5",
        system:
          "Tu imagines des fonds de portrait professionnel pour une entrepreneuse. Une IA de remplacement d'arrière-plan (détourage) incrustera sa photo TELLE QUELLE sur le décor : la personne n'est jamais modifiée, seul le fond change. Les décors doivent être crédibles pour son activité, cohérents avec sa charte, et flatteurs derrière un buste/visage (pas de décor trop chargé au centre).",
        messages: [
          {
            role: "user",
            content:
              `Voici la marque :\n${lines.length ? lines.join("\n") : "(branding pas encore rempli : propose des ambiances universelles et chaleureuses pour une indépendante)"}\n\n` +
              `Propose exactement 4 ambiances de fond variées pour ses portraits professionnels :\n` +
              `1. son lieu de travail crédible (atelier, bureau, boutique… selon l'activité)\n` +
              `2. un fond uni ou studio dans une couleur de sa charte\n` +
              `3. une matière ou texture de son univers\n` +
              `4. libre, la plus juste pour sa marque.\n` +
              (avoidTitles.length
                ? `\nElle a déjà vu ces ambiances, propose-en de VRAIMENT différentes : ${avoidTitles.join(" · ")}.\n`
                : ""),
          },
        ],
        tool: PORTRAIT_AMBIANCES_TOOL,
        temperature: 0.8,
        max_tokens: 900,
        abortTimeoutMs: 25_000,
      });

      const parsed = JSON.parse(raw) as { ambiances?: unknown };
      const ambiances = (Array.isArray(parsed.ambiances) ? parsed.ambiances : [])
        .map((a: any) => ({
          title: typeof a?.title === "string" ? a.title.trim().slice(0, 40) : "",
          description: typeof a?.description === "string" ? a.description.trim().slice(0, 90) : "",
          prompt: typeof a?.prompt === "string" ? a.prompt.trim().slice(0, 300) : "",
        }))
        .filter((a) => a.title.length > 0 && a.prompt.length >= 20)
        .slice(0, 4);

      if (ambiances.length < 3) {
        return json({ error: "Ambiances incomplètes, réessaie." }, 502);
      }

      // Cache best-effort : une membre sans droit d'écriture sur la charte ou
      // une colonne pas encore migrée ne doivent pas faire échouer la réponse.
      if (charterRow?.id) {
        try {
          const { error: cacheError } = await supabase
            .from("brand_charter")
            .update({ portrait_ambiances: { signature, items: ambiances } })
            .eq("id", charterRow.id);
          if (cacheError) throw cacheError;
        } catch (e) {
          console.error("[photo-describe] portrait_ambiances cache write failed:", e);
        }
      }

      return json({ ambiances, cached: false });
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
