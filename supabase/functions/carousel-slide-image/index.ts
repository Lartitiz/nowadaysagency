/**
 * carousel-slide-image — génère l'image d'une slide de carrousel « texte
 * d'abord » (lot 2 du chantier casting) à partir de sa photo_directive.
 *
 * Contrairement à product-on-model (édition d'une photo produit), c'est de la
 * CRÉATION PURE : pas d'image source, l'endpoint /images/generations construit
 * la scène depuis la directive (générée par carousel-ai, ancrée dans l'univers
 * de la marque) + la charte visuelle. Chaque régénération repart TOUJOURS de la
 * directive d'origine (jamais d'itération sur une image générée).
 *
 * Pipeline :
 *   1. Standard auth/quota/rate-limit (category: photo_retouch)
 *   2. Gate Premium (plan free → { error: "premium_required" }, bypass QA)
 *   3. Charte + profil → bloc « univers de marque » du prompt
 *   4. OpenAI /v1/images/generations (gpt-image-2, n=1, retry 1× sur 5xx)
 *   5. logUsage 1 crédit par image (après succès uniquement)
 *
 * Recette anti-effet-IA identique à product-on-model (validée 09/07/2026) :
 * fond NET décrit, rendu iPhone, imperfections dosées, casting naturel. En plus
 * ici : JAMAIS de personnalité réelle ni de marque tierce (droit à l'image —
 * l'actu du newsjacking vit dans le texte des slides, pas dans les images).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { runPipeline } from "../_shared/request-pipeline.ts";
import { validateInput, ValidationError } from "../_shared/input-validators.ts";
import { logUsage } from "../_shared/plan-limiter.ts";

const BodySchema = z.object({
  workspace_id: z.string().uuid().optional().nullable(),
  // La photo_directive de la slide (français, générée par carousel-ai).
  directive: z.string().min(10).max(600),
  // Ajustement optionnel (chips « Autre ambiance », « Avec une personne »…) —
  // appliqué PAR-DESSUS la directive d'origine, jamais à sa place.
  adjustment: z.string().max(300).optional().nullable(),
});

const OPENAI_URL = "https://api.openai.com/v1/images/generations";
const OPENAI_TIMEOUT_MS = 160_000;
const RETRY_DELAY_MS = 2_000;

// Comptes QA : mêmes emails que plan-limiter (bypass quota) — plan "free" réel,
// le gate Premium doit les laisser passer pour la QA automatisée.
const QA_TEST_EMAILS = new Set<string>(["laetitiatest@nowadaysagency.com"]);

interface BrandBlockInput {
  activite?: string | null;
  photo_style?: string | null;
  mood_keywords?: unknown;
  visual_donts?: string | null;
  moodboard_description?: string | null;
}

function buildPrompt(opts: {
  directive: string;
  adjustment: string | null;
  brand: BrandBlockInput;
}): string {
  const lines: string[] = [];

  lines.push(
    "Candid photo taken on an iPhone, amateur photography, unposed, captured mid-moment."
  );

  lines.push(
    "SCENE (description in French — follow it faithfully): " +
      opts.directive.trim() +
      " — with realistic everyday details; the background must stay fully readable."
  );

  lines.push(
    "PERSON (when the scene includes one): a real-looking person, NOT a professional model — natural visible skin texture, minimal makeup, subtle facial asymmetries, a few loose hair strands. Representation matters: vary ethnicity and age (25-55)."
  );

  lines.push(
    "CAPTURE: deep depth of field, EVERYTHING in sharp focus from foreground to background, as if shot at f/11 on a phone (small sensor look). Every element of the background must stay crisp, detailed and readable — walls, furniture, objects, textures. Natural daylight, true-to-life colors, fine visible grain, slightly off-center framing. At most 1-2 honest imperfections (slight motion blur OR slightly tilted horizon)."
  );

  lines.push(
    "STRICTLY FORBIDDEN: any real identifiable person, celebrity or public figure; any third-party brand name, logo or recognizable product. Also avoid: background blur, bokeh, shallow depth of field, cinematic look, studio lighting, golden-hour glow, magazine retouching, plastic smooth skin, added text, watermarks."
  );

  const b = opts.brand;
  const brandLines: string[] = [];
  if (b.activite) brandLines.push(`- Activité : ${b.activite}`);
  const moods = Array.isArray(b.mood_keywords) ? b.mood_keywords.filter(Boolean) : [];
  if (moods.length) brandLines.push(`- Style visuel : ${moods.join(", ")}`);
  if (b.photo_style) brandLines.push(`- Style photo : ${b.photo_style}`);
  if (b.visual_donts) brandLines.push(`- Interdits visuels : ${b.visual_donts}`);
  if (b.moodboard_description) brandLines.push(`- Ambiance moodboard : ${b.moodboard_description}`);
  if (brandLines.length) {
    lines.push("BRAND UNIVERSE (guide mood, palette and places):\n" + brandLines.join("\n"));
  }

  if (opts.adjustment?.trim()) {
    lines.push("ADJUSTMENT REQUESTED (apply on top of everything above): " + opts.adjustment.trim());
  }

  return lines.join("\n\n");
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
    let parsed: z.infer<typeof BodySchema>;
    try {
      parsed = validateInput(bodyJson, BodySchema) as z.infer<typeof BodySchema>;
    } catch (e) {
      const msg = e instanceof ValidationError ? e.message : "Body invalide";
      return jsonResponse({ error: msg }, 400);
    }

    const bodyWorkspaceId = parsed.workspace_id ?? null;
    const adjustment = parsed.adjustment?.trim() || null;

    // Gate Premium — même décision produit que la mise en scène (gpt-image =
    // feature Premium). Statut 200 + error code pour un parsing front simple.
    if (quota && quota.plan === "free") {
      let isQa = false;
      try {
        const { data: userData } = await supabase.auth.getUser();
        const email = (userData?.user?.email || "").toLowerCase();
        isQa = QA_TEST_EMAILS.has(email);
      } catch (_) {
        // silencieux : sans email on applique le gate normal
      }
      if (!isQa) {
        return jsonResponse({ error: "premium_required" }, 200);
      }
    }

    // Charte + profil pour le bloc « univers de marque »
    const col = bodyWorkspaceId ? "workspace_id" : "user_id";
    const val = bodyWorkspaceId || userId;
    const [charterRes, profileRes] = await Promise.all([
      supabase
        .from("brand_charter")
        .select("photo_style, mood_keywords, visual_donts, moodboard_description")
        .eq(col, val)
        .maybeSingle(),
      supabase.from("profiles").select("activite").eq("user_id", userId).maybeSingle(),
    ]);

    const prompt = buildPrompt({
      directive: parsed.directive,
      adjustment,
      brand: {
        activite: profileRes.data?.activite,
        photo_style: charterRes.data?.photo_style,
        mood_keywords: charterRes.data?.mood_keywords,
        visual_donts: charterRes.data?.visual_donts,
        moodboard_description: charterRes.data?.moodboard_description,
      },
    });

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      console.error("[carousel-slide-image] OPENAI_API_KEY missing");
      return jsonResponse({ error: "Configuration OpenAI manquante" }, 500);
    }

    const callOpenAI = async (): Promise<Response> =>
      await fetch(OPENAI_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-image-2",
          prompt,
          n: 1,
          size: "1024x1536",
          quality: "high",
          output_format: "jpeg",
        }),
        signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
      });

    let aiRes: Response | null = null;
    let retried = false;
    let lastError: string | null = null;
    const aiT0 = Date.now();

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        aiRes = await callOpenAI();
        if (aiRes.ok) break;
        if (aiRes.status >= 500 && attempt === 0 && Date.now() - aiT0 < 30_000) {
          await aiRes.text().catch(() => "");
          retried = true;
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          continue;
        }
        break;
      } catch (e) {
        const isTimeout = e instanceof DOMException && e.name === "TimeoutError";
        lastError = isTimeout ? "OpenAI timeout" : e instanceof Error ? e.message : "fetch error";
        if (attempt === 0 && !isTimeout && e instanceof Error && e.name === "TypeError") {
          retried = true;
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          continue;
        }
        aiRes = null;
        break;
      }
    }

    const aiMs = Date.now() - aiT0;

    if (!aiRes) {
      console.error(JSON.stringify({
        event: "carousel_slide_image_failed",
        reason: "network_or_timeout",
        user_id: userId, retried, last_error: lastError, ai_ms: aiMs,
      }));
      return jsonResponse({ error: "Génération trop longue ou indisponible, réessaie" }, 502);
    }

    if (!aiRes.ok) {
      const errBody = await aiRes.text().catch(() => "");
      // Le message OpenAI est remonté (tronqué) : sans accès direct aux logs
      // Supabase, c'est le seul moyen de diagnostiquer un 400 depuis le front.
      let openaiMsg = "";
      try {
        openaiMsg = JSON.parse(errBody)?.error?.message ?? "";
      } catch (_) { /* body non-JSON */ }
      let friendly = `Erreur OpenAI (status ${aiRes.status})${openaiMsg ? ` : ${openaiMsg.slice(0, 200)}` : ""}`;
      if (aiRes.status === 401 || aiRes.status === 403) {
        friendly = "Clé API OpenAI invalide ou organisation non vérifiée";
      } else if (aiRes.status === 429) {
        friendly = "Limite OpenAI atteinte, réessaie dans 1 min";
      } else if (aiRes.status === 400 && errBody.includes("moderation")) {
        friendly = "Cette description n'a pas pu être traitée, reformule la directive";
      } else if (aiRes.status >= 500) {
        friendly = "OpenAI temporairement indisponible";
      }
      console.error(JSON.stringify({
        event: "carousel_slide_image_failed",
        reason: "openai_http_error",
        user_id: userId, retried,
        openai_status: aiRes.status,
        openai_body: errBody.slice(0, 500),
        ai_ms: aiMs,
      }));
      return jsonResponse({ error: friendly }, 502);
    }

    const aiJson = await aiRes.json().catch(() => null);
    const b64 = aiJson?.data?.[0]?.b64_json;
    if (typeof b64 !== "string" || b64.length === 0) {
      console.error(
        "[carousel-slide-image] réponse OpenAI sans image:",
        JSON.stringify(aiJson)?.slice(0, 300)
      );
      return jsonResponse({ error: "Réponse OpenAI invalide" }, 502);
    }

    const tokens =
      (aiJson?.usage?.input_tokens ?? 0) + (aiJson?.usage?.output_tokens ?? 0) || undefined;

    // 1 crédit par image générée (après succès uniquement)
    await logUsage(
      userId,
      "photo_retouch",
      adjustment ? "casting_slide_image_adjust" : "casting_slide_image",
      tokens,
      "gpt-image-2",
      bodyWorkspaceId ?? undefined
    );

    console.log(JSON.stringify({
      event: "carousel_slide_image_success",
      user_id: userId,
      workspace_id: bodyWorkspaceId,
      has_adjustment: !!adjustment,
      tokens,
      ai_ms: aiMs,
      total_ms: Date.now() - t0,
      retry_used: retried,
    }));

    return jsonResponse(
      {
        success: true,
        image: `data:image/jpeg;base64,${b64}`,
        remaining: quota?.remaining,
        remaining_total: quota?.remaining_total,
      },
      200
    );
  } catch (e) {
    console.error("[carousel-slide-image] unexpected error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Erreur interne" }, 500);
  }
});
