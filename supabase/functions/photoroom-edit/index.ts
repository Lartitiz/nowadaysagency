/**
 * photoroom-edit
 *
 * Stateless variant of photo-background-replace.
 * Takes a raw base64 image + mode (remove_bg | replace_bg) and returns
 * the edited image as base64. Does NOT persist anything to storage or DB.
 *
 * Used by PhotoUploadZone where photos live only in memory until the user
 * validates the brief.
 *
 * Uses Photoroom Image Editing v2.
 *
 * Pipeline: auth + rate limit + quota (category: photo_retouch).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { runPipeline } from "../_shared/request-pipeline.ts";
import { validateInput, ValidationError } from "../_shared/input-validators.ts";
import { logUsage } from "../_shared/plan-limiter.ts";

const BodySchema = z
  .object({
    image_base64: z.string().min(100), // data URL or raw base64
    mode: z.enum(["remove_bg", "replace_bg"]),
    prompt: z.string().max(500).optional(),
    background_image_base64: z.string().min(100).optional(),
    workspace_id: z.string().uuid().optional().nullable(),
  })
  .refine(
    (d) =>
      d.mode === "remove_bg" ||
      (d.prompt && d.prompt.trim().length >= 3) ||
      (d.background_image_base64 && d.background_image_base64.length >= 100),
    { message: "Un prompt (≥3 caractères) ou une image de fond est requis pour replace_bg" }
  );

const PHOTOROOM_URL = "https://image-api.photoroom.com/v2/edit";
const PHOTOROOM_TIMEOUT_MS = 60_000;
const RETRY_DELAY_MS = 2_000;

function decodeBase64Image(input: string): { bytes: Uint8Array; mime: string } {
  let mime = "image/jpeg";
  let b64 = input;
  const m = input.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (m) {
    mime = m[1];
    b64 = m[2];
  }
  // Defensive: strip whitespace
  b64 = b64.replace(/\s+/g, "");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mime };
}

function uint8ToBase64(u8: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    bin += String.fromCharCode(...u8.subarray(i, i + chunk));
  }
  return btoa(bin);
}

serve(async (req) => {
  const t0 = Date.now();

  let bodyJson: any = null;
  let workspaceIdForPipeline: string | undefined;
  if (req.method !== "OPTIONS") {
    try {
      bodyJson = await req.json();
      workspaceIdForPipeline =
        typeof bodyJson?.workspace_id === "string" ? bodyJson.workspace_id : undefined;
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
  const { userId, corsHeaders, quota } = pipe;

  try {
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

    // Decode incoming image
    let imgBytes: Uint8Array;
    let imgMime: string;
    try {
      const decoded = decodeBase64Image(parsed.image_base64);
      imgBytes = decoded.bytes;
      imgMime = decoded.mime;
    } catch {
      return new Response(JSON.stringify({ error: "Image base64 invalide" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const photoroomKey = Deno.env.get("PHOTOROOM_API_KEY");
    if (!photoroomKey) {
      console.error("[photoroom-edit] PHOTOROOM_API_KEY missing");
      return new Response(
        JSON.stringify({ error: "Configuration Photoroom manquante" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const inputBlob = new Blob([imgBytes], { type: imgMime });

    const callPhotoroom = async (): Promise<Response> => {
      const fd = new FormData();
      fd.append("imageFile", inputBlob, "input." + (imgMime.split("/")[1] || "jpg"));
      fd.append("referenceBox", "originalImage");
      fd.append("removeBackground", "true");
      fd.append("outputSize", "originalImage");

      if (parsed.mode === "replace_bg") {
        fd.append("background.prompt", parsed.prompt!.trim());
      }
      // For remove_bg → no background.prompt → transparent PNG output.

      return await fetch(PHOTOROOM_URL, {
        method: "POST",
        headers: { "x-api-key": photoroomKey },
        body: fd,
        signal: AbortSignal.timeout(PHOTOROOM_TIMEOUT_MS),
      });
    };

    // 1 retry on 5xx / timeout / network
    let res: Response | null = null;
    let retried = false;
    let lastError: string | null = null;
    const photoroomT0 = Date.now();

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        res = await callPhotoroom();
        if (res.ok) break;
        if (res.status >= 500 && attempt === 0) {
          await res.text().catch(() => "");
          retried = true;
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          continue;
        }
        break;
      } catch (e) {
        const isTimeout = e instanceof DOMException && e.name === "TimeoutError";
        lastError = isTimeout
          ? "Photoroom timeout"
          : e instanceof Error
          ? e.message
          : "fetch error";
        if (attempt === 0) {
          retried = true;
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          continue;
        }
        res = null;
        break;
      }
    }

    const photoroomMs = Date.now() - photoroomT0;

    if (!res) {
      console.error(JSON.stringify({
        event: "photoroom_edit_failed",
        reason: "network_or_timeout",
        user_id: userId, retried, last_error: lastError, photoroom_ms: photoroomMs,
      }));
      return new Response(
        JSON.stringify({ error: "Photoroom temporairement indisponible" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      let friendly = `Erreur Photoroom (status ${res.status})`;
      if (res.status === 401 || res.status === 403) {
        friendly = "Clé API Photoroom invalide";
      } else if (res.status === 429) {
        friendly = "Limite Photoroom atteinte, réessaie dans 1 min";
      } else if (res.status === 400 || res.status === 422) {
        friendly = "Photo non traitable (format ou contenu refusé)";
      } else if (res.status >= 500) {
        friendly = "Photoroom temporairement indisponible";
      }
      console.error(JSON.stringify({
        event: "photoroom_edit_failed",
        reason: "photoroom_http_error",
        user_id: userId, retried,
        status: res.status,
        body: errBody.slice(0, 500),
        photoroom_ms: photoroomMs,
      }));
      return new Response(JSON.stringify({ error: friendly }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Success — read binary, encode base64
    const outBlob = await res.blob();
    const outMime = outBlob.type || (parsed.mode === "remove_bg" ? "image/png" : "image/jpeg");
    const outBytes = new Uint8Array(await outBlob.arrayBuffer());
    const outBase64 = `data:${outMime};base64,${uint8ToBase64(outBytes)}`;

    // Log usage (only on success)
    await logUsage(
      userId,
      "photo_retouch",
      parsed.mode,
      undefined,
      "photoroom-v2",
      parsed.workspace_id ?? undefined
    );

    console.log(JSON.stringify({
      event: "photoroom_edit_success",
      user_id: userId,
      mode: parsed.mode,
      photoroom_ms: photoroomMs,
      total_ms: Date.now() - t0,
      input_bytes: imgBytes.length,
      output_bytes: outBytes.length,
      retried,
    }));

    return new Response(
      JSON.stringify({
        success: true,
        image_base64: outBase64,
        mime_type: outMime,
        remaining: quota?.remaining,
        remaining_total: quota?.remaining_total,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[photoroom-edit] unexpected error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erreur interne" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
