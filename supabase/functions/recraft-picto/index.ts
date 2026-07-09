/**
 * recraft-picto (lot 2 Recraft — pictos de schémas)
 *
 * Génère 1 à 4 pictos vectoriels (SVG) « aplat 2 tons » dans les couleurs
 * de la charte, pour illustrer les étapes d'une slide schéma.
 * Pipeline :
 *   1. Standard auth/quota/rate-limit (category: photo_retouch)
 *   2. Validate body + fetch brand_charter (couleurs)
 *   3. Appels Recraft /v1/images/generations en parallèle (1 par concept,
 *      retry 1× sur 5xx/timeout) — style vector_illustration/roundish_flat,
 *      couleurs imposées via `controls`, `no_text: true`
 *   4. Download SVG → upload bucket public brand-assets (pictos/)
 *   5. logUsage 1× par lot (uniquement après succès complet)
 *
 * Mode QA (leçon lot 1) : le compte de test peut passer `qa_overrides`
 * (style/substyle/prompt_suffix/artistic_level) pour itérer sur le rendu
 * SANS redéployer l'edge. Ignoré pour tout autre compte.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { runPipeline } from "../_shared/request-pipeline.ts";
import { validateInput, ValidationError } from "../_shared/input-validators.ts";
import { logUsage } from "../_shared/plan-limiter.ts";

const BodySchema = z.object({
  concepts: z.array(z.string().min(2).max(80)).min(1).max(4),
  workspace_id: z.string().uuid().optional().nullable(),
  qa_overrides: z
    .object({
      style: z.string().max(50).optional(),
      substyle: z.string().max(50).optional(),
      prompt_suffix: z.string().max(300).optional(),
      artistic_level: z.number().int().min(0).max(5).optional(),
    })
    .optional(),
});

// Comparaison EXACTE sur email, même liste que plan-limiter (jamais de
// match partiel).
const QA_TEST_EMAILS = new Set<string>(["laetitiatest@nowadaysagency.com"]);

const RECRAFT_URL = "https://external.api.recraft.ai/v1/images/generations";
const RECRAFT_TIMEOUT_MS = 60_000;
const RETRY_DELAY_MS = 2_000;

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
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
    rateLimit: { max: 6, windowMs: 60_000 },
  });
  if (!pipe.ok) return pipe.response;
  const { userId, supabase, corsHeaders, quota } = pipe;

  const jsonResponse = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    let parsed: z.infer<typeof BodySchema>;
    try {
      parsed = validateInput(bodyJson, BodySchema) as z.infer<typeof BodySchema>;
    } catch (e) {
      const msg = e instanceof ValidationError ? e.message : "Body invalide";
      return jsonResponse({ error: msg }, 400);
    }

    const { concepts } = parsed;
    const bodyWorkspaceId = parsed.workspace_id ?? null;

    // qa_overrides réservé au compte de test
    let overrides: NonNullable<typeof parsed.qa_overrides> = {};
    if (parsed.qa_overrides) {
      try {
        const { data: userRow } = await supabase.auth.admin.getUserById(userId);
        const email = (userRow?.user?.email || "").toLowerCase();
        if (email && QA_TEST_EMAILS.has(email)) {
          overrides = parsed.qa_overrides;
        } else {
          console.warn("[recraft-picto] qa_overrides ignoré (compte non QA)", { userId });
        }
      } catch (_) {
        // silencieux : overrides ignorés si la lookup échoue
      }
    }

    // Couleurs de la charte
    const col = bodyWorkspaceId ? "workspace_id" : "user_id";
    const val = bodyWorkspaceId || userId;
    const { data: charter, error: charterErr } = await supabase
      .from("brand_charter")
      .select("color_primary, color_secondary, color_background")
      .eq(col, val)
      .maybeSingle();

    if (charterErr) {
      console.error("[recraft-picto] charter fetch error:", charterErr);
      return jsonResponse({ error: "Erreur DB" }, 500);
    }

    const primary = hexToRgb(charter?.color_primary || "") ?? hexToRgb("#1C1C20")!;
    const secondary = hexToRgb(charter?.color_secondary || "") ?? hexToRgb("#6E6A66")!;
    const background = hexToRgb(charter?.color_background || "") ?? hexToRgb("#F6F4F0")!;

    const recraftKey = Deno.env.get("RECRAFT_API_TOKEN");
    if (!recraftKey) {
      console.error("[recraft-picto] RECRAFT_API_TOKEN missing");
      return jsonResponse({ error: "Configuration Recraft manquante" }, 500);
    }

    // ── Génération d'un picto (1 retry sur 5xx/timeout) ──
    const generateOne = async (concept: string, idx: number) => {
      const prompt =
        `simple flat vector pictogram of ${concept}, ` +
        "minimal rounded geometric shapes, two-tone, clean composition, friendly" +
        (overrides.prompt_suffix ? `, ${overrides.prompt_suffix}` : "");

      const payload: Record<string, unknown> = {
        prompt,
        negative_prompt:
          "text, letters, numbers, words, watermark, frame, border, photorealistic, 3d, shadows, gradient",
        model: "recraftv3",
        style: overrides.style || "vector_illustration",
        substyle: overrides.substyle || "roundish_flat",
        size: "1024x1024",
        n: 1,
        controls: {
          colors: [{ rgb: primary }, { rgb: secondary }],
          background_color: { rgb: background },
          no_text: true,
        },
      };
      if (overrides.artistic_level !== undefined) {
        (payload.controls as Record<string, unknown>).artistic_level = overrides.artistic_level;
      }

      let res: Response | null = null;
      let lastError: string | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          res = await fetch(RECRAFT_URL, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${recraftKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(RECRAFT_TIMEOUT_MS),
          });
          if (res.ok) break;
          if (res.status >= 500 && attempt === 0) {
            await res.text().catch(() => "");
            await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
            continue;
          }
          break;
        } catch (e) {
          const isTimeout = e instanceof DOMException && e.name === "TimeoutError";
          lastError = isTimeout ? "Recraft timeout" : (e instanceof Error ? e.message : "fetch error");
          if (attempt === 0) {
            await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
            continue;
          }
          res = null;
        }
      }

      if (!res) throw new Error(`Recraft indisponible (${concept}): ${lastError || "réseau"}`);
      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        // Détail exposé : sans accès aux logs edge, seul moyen de
        // diagnostiquer un paramètre refusé (substyle, controls…).
        throw new Error(`Recraft ${res.status} (${concept}): ${errBody.slice(0, 300)}`);
      }

      const json = await res.json().catch(() => null);
      const imageUrl: string | undefined = json?.data?.[0]?.url;
      if (!imageUrl) throw new Error(`Réponse Recraft sans URL (${concept})`);

      const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
      if (!imgRes.ok) throw new Error(`Téléchargement picto impossible (${concept})`);
      const blob = await imgRes.blob();

      const path = `${userId}/pictos/${t0}-${idx}.svg`;
      const { error: upErr } = await supabase.storage
        .from("brand-assets")
        .upload(path, blob, {
          contentType: blob.type || "image/svg+xml",
          upsert: true,
        });
      if (upErr) throw new Error(`Échec upload picto (${concept}): ${upErr.message}`);

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      return { concept, url: `${supabaseUrl}/storage/v1/object/public/brand-assets/${path}` };
    };

    // ── Tous les concepts en parallèle ──
    let pictos: { concept: string; url: string }[];
    try {
      pictos = await Promise.all(concepts.map((c, i) => generateOne(c, i)));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Génération des pictos échouée";
      console.error(JSON.stringify({
        event: "recraft_picto_failed",
        user_id: userId,
        concepts,
        error: msg.slice(0, 400),
        total_ms: Date.now() - t0,
      }));
      return jsonResponse({ error: msg }, 502);
    }

    // 1 usage par LOT de pictos (pas par picto) — après succès complet
    await logUsage(
      userId,
      "photo_retouch",
      "schema_pictos",
      undefined,
      "recraftv3-vector",
      bodyWorkspaceId ?? undefined
    );

    console.log(JSON.stringify({
      event: "recraft_picto_success",
      user_id: userId,
      workspace_id: bodyWorkspaceId,
      count: pictos.length,
      substyle: overrides.substyle || "roundish_flat",
      total_ms: Date.now() - t0,
    }));

    return jsonResponse(
      {
        success: true,
        pictos,
        remaining: quota?.remaining,
        remaining_total: quota?.remaining_total,
      },
      200
    );
  } catch (e) {
    console.error("[recraft-picto] unexpected error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Erreur interne" }, 500);
  }
});
