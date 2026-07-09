/**
 * recraft-texture
 *
 * Génère UNE texture de fond « matière » (papier, lin…) par marque via
 * l'API Recraft, teintée sur la couleur de fond de la charte.
 * Pipeline :
 *   1. Standard auth/quota/rate-limit (category: photo_retouch)
 *   2. Validate body + fetch brand_charter (color_background)
 *   3. Appel Recraft /v1/images/generations (retry 1× sur 5xx/timeout)
 *   4. Download image → upload bucket public brand-assets
 *   5. Update brand_charter (texture_url, texture_material, texture_enabled)
 *   6. logUsage (uniquement après succès complet)
 *
 * La texture est générée UNE fois par marque puis réutilisée par les
 * templates (carousel-visual). Pas de génération par post.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { runPipeline } from "../_shared/request-pipeline.ts";
import { validateInput, ValidationError } from "../_shared/input-validators.ts";
import { logUsage } from "../_shared/plan-limiter.ts";

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

// ── Prompts par matière ──
// Style digital_illustration + substyle grain (V3 uniquement) : rendu PLAT
// plein cadre par construction. Le style realistic_image est banni ici :
// il génère systématiquement une « scène » (feuille posée sur une table,
// fiche produit avec bannière) malgré tous les prompts essayés (v1→v3).
const MATERIAL_PROMPTS: Record<(typeof MATERIAL_KEYS)[number], string> = {
  papier_grain: "subtle fine art paper grain background, plain, uniform",
  papier_craft:
    "subtle kraft paper background, warm natural tone, faint fibers, plain, uniform",
  lin: "subtle linen weave background, fine even fabric grain, plain, uniform",
  papier_recycle:
    "subtle recycled paper background, tiny speckles and faint fibers, plain, uniform",
  grain_mineral: "subtle light stone grain background, soft mineral surface, plain, uniform",
};

const NEGATIVE_PROMPT =
  "text, letters, typography, watermark, logo, label, banner, border, frame, " +
  "product photo, mockup, packaging, perspective, tilt, depth of field, " +
  "paper edges, table, objects, hands, shadows, vignette";

const RECRAFT_URL = "https://external.api.recraft.ai/v1/images/generations";
const RECRAFT_TIMEOUT_MS = 60_000;
const RETRY_DELAY_MS = 2_000;

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
    rateLimit: { max: 3, windowMs: 60_000 },
  });
  if (!pipe.ok) return pipe.response;
  const { userId, supabase, corsHeaders, quota } = pipe;

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

    const bgColor = charter?.color_background || "#F6F4F0";

    // 4. Recraft API key
    const recraftKey = Deno.env.get("RECRAFT_API_TOKEN");
    if (!recraftKey) {
      console.error("[recraft-texture] RECRAFT_API_TOKEN missing");
      return jsonResponse({ error: "Configuration Recraft manquante" }, 500);
    }

    const prompt =
      `${MATERIAL_PROMPTS[material]}, tinted ${bgColor} color tone, ` +
      "fills the entire frame, flat, minimal, muted, very low contrast";

    // 5. Appel Recraft (1 retry sur 5xx/timeout)
    const callRecraft = async (): Promise<Response> =>
      await fetch(RECRAFT_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${recraftKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          negative_prompt: NEGATIVE_PROMPT,
          model: "recraftv3",
          style: "digital_illustration",
          substyle: "grain",
          size: "1024x1024",
          n: 1,
        }),
        signal: AbortSignal.timeout(RECRAFT_TIMEOUT_MS),
      });

    let recraftRes: Response | null = null;
    let retried = false;
    let lastError: string | null = null;
    const recraftT0 = Date.now();

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        recraftRes = await callRecraft();
        if (recraftRes.ok) break;
        if (recraftRes.status >= 500 && attempt === 0) {
          await recraftRes.text().catch(() => "");
          retried = true;
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          continue;
        }
        break;
      } catch (e) {
        const isTimeout = e instanceof DOMException && e.name === "TimeoutError";
        lastError = isTimeout ? "Recraft timeout" : (e instanceof Error ? e.message : "fetch error");
        if (attempt === 0 && (isTimeout || (e instanceof Error && e.name === "TypeError"))) {
          retried = true;
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          continue;
        }
        recraftRes = null;
        break;
      }
    }

    const recraftMs = Date.now() - recraftT0;

    if (!recraftRes) {
      console.error(JSON.stringify({
        event: "recraft_texture_failed",
        reason: "network_or_timeout",
        user_id: userId, retried, last_error: lastError, recraft_ms: recraftMs,
      }));
      return jsonResponse({ error: "Recraft temporairement indisponible" }, 502);
    }

    if (!recraftRes.ok) {
      const errBody = await recraftRes.text().catch(() => "");
      let friendly = `Erreur Recraft (status ${recraftRes.status})`;
      if (recraftRes.status === 401 || recraftRes.status === 403) {
        friendly = "Clé API Recraft invalide";
      } else if (recraftRes.status === 429) {
        friendly = "Limite Recraft atteinte, réessaie dans 1 min";
      } else if (recraftRes.status === 400 || recraftRes.status === 422) {
        // Détail volontairement exposé : sans accès aux logs edge, c'est le
        // seul moyen de diagnostiquer un paramètre refusé (style, substyle…).
        friendly = `Recraft a refusé la demande : ${errBody.slice(0, 300)}`;
      } else if (recraftRes.status >= 500) {
        friendly = "Recraft temporairement indisponible";
      }
      console.error(JSON.stringify({
        event: "recraft_texture_failed",
        reason: "recraft_http_error",
        user_id: userId, retried,
        recraft_status: recraftRes.status,
        recraft_body: errBody.slice(0, 500),
        recraft_ms: recraftMs,
      }));
      return jsonResponse({ error: friendly }, 502);
    }

    // 6. Récupérer l'URL de l'image générée puis la télécharger
    const recraftJson = await recraftRes.json().catch(() => null);
    const imageUrl: string | undefined = recraftJson?.data?.[0]?.url;
    if (!imageUrl) {
      console.error("[recraft-texture] réponse Recraft sans URL:", JSON.stringify(recraftJson).slice(0, 300));
      return jsonResponse({ error: "Réponse Recraft invalide" }, 502);
    }

    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
    if (!imgRes.ok) {
      console.error("[recraft-texture] download error:", imgRes.status);
      return jsonResponse({ error: "Téléchargement de la texture impossible" }, 502);
    }
    const textureBlob = await imgRes.blob();

    // 7. Upload dans le bucket public brand-assets
    const texturePath = `${userId}/texture-${material}-${Date.now()}.png`;
    const { error: upErr } = await supabase.storage
      .from("brand-assets")
      .upload(texturePath, textureBlob, {
        contentType: textureBlob.type || "image/png",
        upsert: true,
      });

    if (upErr) {
      console.error("[recraft-texture] upload error:", upErr);
      return jsonResponse({ error: `Échec upload texture: ${upErr.message}` }, 500);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const textureUrl = `${supabaseUrl}/storage/v1/object/public/brand-assets/${texturePath}`;

    // 8. Update brand_charter (upsert si la charte n'existe pas encore)
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

    // 9. Log usage (uniquement après succès complet)
    await logUsage(
      userId,
      "photo_retouch",
      "brand_texture",
      undefined,
      "recraft-v3",
      bodyWorkspaceId ?? undefined
    );

    console.log(JSON.stringify({
      event: "recraft_texture_success",
      user_id: userId,
      workspace_id: bodyWorkspaceId,
      material,
      recraft_ms: recraftMs,
      total_ms: Date.now() - t0,
      output_bytes: textureBlob.size,
      retry_used: retried,
    }));

    return jsonResponse(
      {
        success: true,
        texture_url: textureUrl,
        material,
        remaining: quota?.remaining,
        remaining_total: quota?.remaining_total,
      },
      200
    );
  } catch (e) {
    console.error("[recraft-texture] unexpected error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Erreur interne" }, 500);
  }
});
