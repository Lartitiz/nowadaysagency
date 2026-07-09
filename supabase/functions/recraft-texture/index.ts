/**
 * recraft-texture (nom historique — génération désormais PROCÉDURALE)
 *
 * Génère UNE texture de fond « matière » (papier, lin…) par marque, en SVG
 * procédural (feTurbulence) teinté sur la couleur de fond de la charte.
 * Pipeline :
 *   1. Standard auth/rate-limit (category: photo_retouch, rien n'est consommé)
 *   2. Validate body + fetch brand_charter (color_background)
 *   3. Construction du SVG (recette par matière, seed propre à la marque)
 *   4. Upload bucket public brand-assets
 *   5. Update brand_charter (texture_url, texture_material, texture_enabled)
 *
 * Historique : 3 itérations Recraft (realistic_image v1-v2 puis
 * digital_illustration/grain) ont toutes produit des « scènes » (fiche
 * produit, feuille sur table, personnage) — les modèles d'image ne savent
 * pas produire un fond vide uniforme de façon fiable. Le procédural est
 * déterministe, gratuit et instantané. Recraft reste utilisé pour les
 * sujets figuratifs (lot 2 : pictos de schémas).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { runPipeline } from "../_shared/request-pipeline.ts";
import { validateInput, ValidationError } from "../_shared/input-validators.ts";

// ── Body schema ──
const MATERIAL_KEYS = [
  "papier_grain",
  "papier_craft",
  "lin",
  "papier_recycle",
  "grain_mineral",
] as const;

const BodySchema = z.object({
  workspace_id: z.string().uuid().optional().nullable(),
  material: z.enum(MATERIAL_KEYS),
});

// ── Recettes procédurales par matière ──
// Chaque recette = couches feTurbulence (grain, fibres, taches) posées en
// voiles noir/blanc très légers sur la couleur de fond de la marque : le
// motif vient de la matière, la teinte vient TOUJOURS de la charte.
type NoiseLayer = {
  baseFrequency: string;
  octaves: number;
  /** voile sombre (0-1) */
  dark: number;
  /** voile clair (0-1) */
  light: number;
};

const MATERIAL_RECIPES: Record<(typeof MATERIAL_KEYS)[number], NoiseLayer[]> = {
  papier_grain: [
    { baseFrequency: "0.8", octaves: 2, dark: 0.05, light: 0.04 },
  ],
  papier_craft: [
    // fibres horizontales + grain serré
    { baseFrequency: "0.012 0.18", octaves: 2, dark: 0.06, light: 0.03 },
    { baseFrequency: "0.9", octaves: 2, dark: 0.05, light: 0.04 },
  ],
  lin: [
    // tissage : deux directions croisées
    { baseFrequency: "0.01 0.35", octaves: 1, dark: 0.05, light: 0.03 },
    { baseFrequency: "0.35 0.01", octaves: 1, dark: 0.05, light: 0.03 },
  ],
  papier_recycle: [
    { baseFrequency: "0.7", octaves: 2, dark: 0.05, light: 0.04 },
    // mouchetures éparses plus larges
    { baseFrequency: "0.08", octaves: 3, dark: 0.05, light: 0 },
  ],
  grain_mineral: [
    // marbrures larges très douces + grain fin
    { baseFrequency: "0.02", octaves: 3, dark: 0.04, light: 0.04 },
    { baseFrequency: "0.6", octaves: 2, dark: 0.03, light: 0.03 },
  ],
};

const TEXTURE_W = 1080;
const TEXTURE_H = 1350;

function buildTextureSvg(material: (typeof MATERIAL_KEYS)[number], bgColor: string, seed: number): string {
  const layers = MATERIAL_RECIPES[material];
  const defs: string[] = [];
  const rects: string[] = [];

  layers.forEach((l, i) => {
    // Deux filtres par couche : le bruit module l'alpha d'un voile sombre
    // puis d'un voile clair (fonctionne sur n'importe quelle couleur de fond).
    if (l.dark > 0) {
      defs.push(
        `<filter id="d${i}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${l.baseFrequency}" numOctaves="${l.octaves}" seed="${seed + i}" stitchTiles="stitch"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.6 0.6 0.6 0 -0.55"/><feComponentTransfer><feFuncA type="linear" slope="${l.dark}"/></feComponentTransfer></filter>`,
      );
      rects.push(`<rect width="${TEXTURE_W}" height="${TEXTURE_H}" filter="url(#d${i})"/>`);
    }
    if (l.light > 0) {
      defs.push(
        `<filter id="l${i}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${l.baseFrequency}" numOctaves="${l.octaves}" seed="${seed + i + 50}" stitchTiles="stitch"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0.6 0.6 0.6 0 -0.55"/><feComponentTransfer><feFuncA type="linear" slope="${l.light}"/></feComponentTransfer></filter>`,
      );
      rects.push(`<rect width="${TEXTURE_W}" height="${TEXTURE_H}" filter="url(#l${i})"/>`);
    }
  });

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${TEXTURE_W}" height="${TEXTURE_H}" viewBox="0 0 ${TEXTURE_W} ${TEXTURE_H}">` +
    `<defs>${defs.join("")}</defs>` +
    `<rect width="${TEXTURE_W}" height="${TEXTURE_H}" fill="${bgColor}"/>` +
    rects.join("") +
    `</svg>`
  );
}

serve(async (req) => {
  const t0 = Date.now();

  let bodyJson: any;
  let workspaceIdForPipeline: string | undefined;
  if (req.method !== "OPTIONS") {
    try {
      bodyJson = await req.json();
      workspaceIdForPipeline = typeof bodyJson?.workspace_id === "string" ? bodyJson.workspace_id : undefined;
    } catch {
      bodyJson = null;
    }
  }

  const pipe = await runPipeline(req, {
    category: "photo_retouch",
    workspaceId: workspaceIdForPipeline,
    rateLimit: { max: 10, windowMs: 60_000 },
  });
  if (!pipe.ok) return pipe.response;
  const { userId, supabase, corsHeaders } = pipe;

  const jsonResponse = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    // 2. Validate body (Zod)
    let parsed: z.infer<typeof BodySchema>;
    try {
      parsed = validateInput(bodyJson, BodySchema) as z.infer<typeof BodySchema>;
    } catch (e) {
      const msg = e instanceof ValidationError ? e.message : "Body invalide";
      return jsonResponse({ error: msg }, 400);
    }

    const { material } = parsed;
    const bodyWorkspaceId = parsed.workspace_id ?? null;

    // 3. Fetch brand_charter (couleur de fond pour teinter la texture)
    const col = bodyWorkspaceId ? "workspace_id" : "user_id";
    const val = bodyWorkspaceId || userId;
    const { data: charter, error: charterErr } = await supabase
      .from("brand_charter")
      .select("id, color_background")
      .eq(col, val)
      .maybeSingle();

    if (charterErr) {
      console.error("[recraft-texture] charter fetch error:", charterErr);
      return jsonResponse({ error: "Erreur DB" }, 500);
    }

    const rawBg = charter?.color_background || "#F6F4F0";
    // Garde stricte : la couleur part telle quelle dans un SVG
    const bgColor = /^#[0-9a-fA-F]{3,8}$/.test(rawBg) ? rawBg : "#F6F4F0";

    // 4. Construire le SVG (seed stable par utilisateur·rice → texture propre
    // à la marque, reproductible d'une régénération à l'autre)
    const seed = Array.from(userId).reduce((a, c) => (a + c.charCodeAt(0)) % 997, 7);
    const svg = buildTextureSvg(material, bgColor, seed);
    const textureBlob = new Blob([svg], { type: "image/svg+xml" });

    // 5. Upload dans le bucket public brand-assets
    const texturePath = `${userId}/texture-${material}-${Date.now()}.svg`;
    const { error: upErr } = await supabase.storage
      .from("brand-assets")
      .upload(texturePath, textureBlob, {
        contentType: "image/svg+xml",
        upsert: true,
      });

    if (upErr) {
      console.error("[recraft-texture] upload error:", upErr);
      return jsonResponse({ error: `Échec upload texture: ${upErr.message}` }, 500);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const textureUrl = `${supabaseUrl}/storage/v1/object/public/brand-assets/${texturePath}`;

    // 6. Update brand_charter (upsert si la charte n'existe pas encore)
    if (charter?.id) {
      const { error: updErr } = await supabase
        .from("brand_charter")
        .update({
          texture_url: textureUrl,
          texture_material: material,
          texture_enabled: true,
        })
        .eq("id", charter.id);
      if (updErr) {
        console.error("[recraft-texture] charter update error:", updErr);
        return jsonResponse({ error: "Erreur DB (update charte)" }, 500);
      }
    } else {
      const insertPayload: Record<string, unknown> = {
        user_id: userId,
        texture_url: textureUrl,
        texture_material: material,
        texture_enabled: true,
      };
      if (bodyWorkspaceId) insertPayload.workspace_id = bodyWorkspaceId;
      const { error: insErr } = await supabase.from("brand_charter").insert(insertPayload);
      if (insErr) {
        console.error("[recraft-texture] charter insert error:", insErr);
        return jsonResponse({ error: "Erreur DB (création charte)" }, 500);
      }
    }

    // Pas de logUsage : génération procédurale, aucun coût — aucun crédit
    // consommé.

    console.log(JSON.stringify({
      event: "recraft_texture_success",
      user_id: userId,
      workspace_id: bodyWorkspaceId,
      material,
      procedural: true,
      total_ms: Date.now() - t0,
      output_bytes: svg.length,
    }));

    return jsonResponse(
      {
        success: true,
        texture_url: textureUrl,
        material,
      },
      200
    );
  } catch (e) {
    console.error("[recraft-texture] unexpected error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Erreur interne" }, 500);
  }
});
