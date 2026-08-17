/**
 * photo-background-replace
 *
 * Wraps Photoroom /v2/edit (AI Backgrounds — generative).
 * Pipeline:
 *   1. Standard auth/quota/rate-limit pipeline (category: photo_retouch)
 *   2. Validate body + fetch user_photos row
 *   3. Security checks (owner + workspace match)
 *   4. Mark processing → download original → call Photoroom
 *   5. Retry once on 5xx/timeout
 *   6. Upload result → update DB → logUsage (only on success)
 *
 * The client (Plan Photo 3) MUST upload the original to
 *   {user_id}/{photo_id}_original.jpg
 * AND insert a user_photos row with status='pending' BEFORE calling this function.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { runPipeline } from "../_shared/request-pipeline.ts";
import { validateInput, ValidationError } from "../_shared/input-validators.ts";
import { logUsage } from "../_shared/plan-limiter.ts";
import { fetchWithRetry } from "../_shared/http-retry.ts";

// ── Body schema ──
const BodySchema = z
  .object({
    photo_id: z.string().uuid(),
    workspace_id: z.string().uuid().optional().nullable(),
    background_prompt: z.string().min(3).max(500).optional(),
    background_preset_key: z.string().max(100).optional(),
  })
  .refine(
    (d) => Boolean(d.background_prompt) || Boolean(d.background_preset_key),
    { message: "background_prompt ou background_preset_key requis" }
  );

// ── Preset prompts (Plan Photo 5 will populate this) ──
const PRESET_PROMPTS: Record<string, string> = {};

const PHOTOROOM_URL = "https://image-api.photoroom.com/v2/edit";
const PHOTOROOM_TIMEOUT_MS = 60_000;

serve(async (req) => {
  const t0 = Date.now();

  // 1. Pipeline (CORS preflight, auth, demo guard, rate limit, quota)
  // Body parsing happens AFTER pipeline, so we read body first into a
  // buffer the pipeline doesn't touch. Pipeline doesn't read req.body.
  let bodyJson: any;
  let workspaceIdForPipeline: string | undefined;
  if (req.method !== "OPTIONS") {
    try {
      bodyJson = await req.json();
      workspaceIdForPipeline = typeof bodyJson?.workspace_id === "string" ? bodyJson.workspace_id : undefined;
    } catch {
      // pipeline will still run; we'll fail validation below
      bodyJson = null;
    }
  }

  const pipe = await runPipeline(req, {
    category: "photo_retouch",
    workspaceId: workspaceIdForPipeline,
    rateLimit: { max: 10, windowMs: 60_000 },
  });
  if (!pipe.ok) return pipe.response;
  const { userId, supabase, corsHeaders, quota } = pipe;

  try {
    // 2. Validate body (Zod)
    let parsed: z.infer<typeof BodySchema>;
    try {
      parsed = validateInput(bodyJson, BodySchema) as z.infer<typeof BodySchema>;
    } catch (e) {
      const msg = e instanceof ValidationError ? e.message : "Body invalide";
      return new Response(JSON.stringify({ error: msg }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { photo_id, background_prompt, background_preset_key } = parsed;
    const bodyWorkspaceId = parsed.workspace_id ?? null;

    // 3. Fetch the user_photos row
    const { data: photo, error: fetchErr } = await supabase
      .from("user_photos")
      .select("id, user_id, workspace_id, original_storage_path, status")
      .eq("id", photo_id)
      .maybeSingle();

    if (fetchErr) {
      console.error("[photo-background-replace] fetch error:", fetchErr);
      return new Response(JSON.stringify({ error: "Erreur DB" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!photo) {
      return new Response(JSON.stringify({ error: "Photo introuvable" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Security checks
    if (photo.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Accès refusé" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (bodyWorkspaceId && photo.workspace_id !== bodyWorkspaceId) {
      return new Response(JSON.stringify({ error: "Workspace incohérent" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (photo.status === "processing" || photo.status === "ready") {
      return new Response(
        JSON.stringify({
          error: photo.status === "ready" ? "Photo déjà traitée" : "Traitement déjà en cours",
        }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ── Helper to mark failed (no logUsage = no quota consumed) ──
    const markFailed = async (errorMessage: string) => {
      const { error } = await supabase
        .from("user_photos")
        .update({ status: "failed", error_message: errorMessage })
        .eq("id", photo_id);
      if (error) console.error("[photo-background-replace] markFailed write error:", error);
    };

    // 5. Mark as processing
    {
      const { error: updErr } = await supabase
        .from("user_photos")
        .update({ status: "processing", error_message: null })
        .eq("id", photo_id);
      if (updErr) {
        console.error("[photo-background-replace] processing flag error:", updErr);
        return new Response(JSON.stringify({ error: "Erreur DB" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 6. Download the original from storage
    const { data: originalBlob, error: dlErr } = await supabase.storage
      .from("user-photos")
      .download(photo.original_storage_path);

    if (dlErr || !originalBlob) {
      const msg = `Photo originale introuvable dans le storage`;
      await markFailed(msg);
      console.error("[photo-background-replace] download error:", dlErr);
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const inputBytes = originalBlob.size;

    // 7. Resolve final prompt (preset wins if known, else free prompt)
    const finalPrompt =
      (background_preset_key && PRESET_PROMPTS[background_preset_key]) ||
      background_prompt ||
      "";

    if (!finalPrompt) {
      await markFailed("Prompt vide");
      return new Response(JSON.stringify({ error: "Prompt vide" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 8. Photoroom API key
    const photoroomKey = Deno.env.get("PHOTOROOM_API_KEY");
    if (!photoroomKey) {
      const msg = "Configuration Photoroom manquante";
      await markFailed(msg);
      console.error("[photo-background-replace] PHOTOROOM_API_KEY missing");
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 9. Build Photoroom request (single function for retry)
    const callPhotoroom = async (): Promise<Response> => {
      const formData = new FormData();
      formData.append("imageFile", originalBlob, "input.jpg");
      formData.append("referenceBox", "originalImage");
      formData.append("background.prompt", finalPrompt);
      formData.append("removeBackground", "true");
      formData.append("outputSize", "originalImage");

      return await fetch(PHOTOROOM_URL, {
        method: "POST",
        headers: { "x-api-key": photoroomKey },
        body: formData,
        signal: AbortSignal.timeout(PHOTOROOM_TIMEOUT_MS),
      });
    };

    // 10. Call Photoroom with 1 retry on 5xx/timeout
    const {
      response: photoroomRes,
      retried,
      lastError,
      elapsedMs: photoroomMs,
    } = await fetchWithRetry(callPhotoroom, { timeoutLabel: "Photoroom timeout" });

    // Network/timeout failure (no response at all)
    if (!photoroomRes) {
      const msg = "Photoroom temporairement indisponible";
      await markFailed(msg);
      console.error(JSON.stringify({
        event: "photo_retouch_failed",
        reason: "network_or_timeout",
        photo_id, user_id: userId, retried,
        last_error: lastError, photoroom_ms: photoroomMs,
      }));
      return new Response(JSON.stringify({ error: msg }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 11. Map Photoroom HTTP errors → friendly messages (no logUsage)
    if (!photoroomRes.ok) {
      const errBody = await photoroomRes.text().catch(() => "");
      let friendly = `Erreur Photoroom (status ${photoroomRes.status})`;
      if (photoroomRes.status === 401 || photoroomRes.status === 403) {
        friendly = "Clé API Photoroom invalide";
        console.error("[photo-background-replace] Photoroom auth failed", errBody);
      } else if (photoroomRes.status === 402) {
        // 402 Payment Required = crédits/plan Photoroom épuisés (à recharger).
        // Message utilisateur neutre ; la cause réelle est loguée pour l'admin.
        friendly = "Le service de retouche est momentanément indisponible (quota atteint). Réessaie un peu plus tard.";
        console.error("[photo-background-replace] Photoroom 402 Payment Required — crédits/plan API épuisés", errBody);
      } else if (photoroomRes.status === 429) {
        friendly = "Limite Photoroom atteinte, réessaie dans 1 min";
      } else if (photoroomRes.status === 400 || photoroomRes.status === 422) {
        if (errBody.includes("segmentation must have required property 'prompt'")) {
          friendly = "Le paramétrage PhotoRoom était invalide. Corrigé côté serveur, réessaie.";
        } else {
          friendly = "Photo non traitable par Photoroom (format ou contenu refusé)";
        }
      } else if (photoroomRes.status >= 500) {
        friendly = "Photoroom temporairement indisponible";
      }
      await markFailed(friendly);
      console.error(JSON.stringify({
        event: "photo_retouch_failed",
        reason: "photoroom_http_error",
        photo_id, user_id: userId, retried,
        photoroom_status: photoroomRes.status,
        photoroom_body: errBody.slice(0, 500),
        photoroom_ms: photoroomMs,
      }));
      return new Response(JSON.stringify({ error: friendly }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 12. Upload result to bucket
    const resultBlob = await photoroomRes.blob();
    const outputBytes = resultBlob.size;
    const resultPath = `${userId}/${photo_id}.jpg`;

    const { error: upErr } = await supabase.storage
      .from("user-photos")
      .upload(resultPath, resultBlob, {
        contentType: resultBlob.type || "image/jpeg",
        upsert: true,
      });

    if (upErr) {
      const msg = `Échec upload résultat: ${upErr.message}`;
      await markFailed(msg);
      console.error("[photo-background-replace] upload error:", upErr);
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 13. Update DB to ready
    {
      const { error: finalUpdErr } = await supabase
        .from("user_photos")
        .update({
          status: "ready",
          storage_path: resultPath,
          background_prompt: finalPrompt,
          background_preset_key: background_preset_key ?? null,
          file_size_bytes: outputBytes,
          error_message: null,
        })
        .eq("id", photo_id);

      if (finalUpdErr) {
        // Photo is in storage but DB row is not updated — log loudly but
        // still return success since the file exists. Caller can refetch.
        console.error("[photo-background-replace] final update error:", finalUpdErr);
      }
    }

    // 14. Log usage (only after full success)
    await logUsage(
      userId,
      "photo_retouch",
      "background_replace",
      undefined,
      "photoroom-v2",
      bodyWorkspaceId ?? undefined
    );

    // 15. Structured success log
    console.log(JSON.stringify({
      event: "photo_retouch_success",
      photo_id,
      user_id: userId,
      workspace_id: bodyWorkspaceId,
      photoroom_ms: photoroomMs,
      total_ms: Date.now() - t0,
      input_bytes: inputBytes,
      output_bytes: outputBytes,
      retry_used: retried,
      preset_key: background_preset_key ?? null,
    }));

    return new Response(
      JSON.stringify({
        success: true,
        photo_id,
        storage_path: resultPath,
        remaining: quota?.remaining,
        remaining_total: quota?.remaining_total,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    console.error("[photo-background-replace] unexpected error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erreur interne" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
