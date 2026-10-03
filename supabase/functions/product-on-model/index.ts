/**
 * product-on-model — « Mettre en scène » une photo produit de la bibliothèque.
 *
 * Génère des variantes réalistes du produit porté par une vraie personne (ou
 * posé en situation) via OpenAI Images Edits (gpt-image-2.5-sunburst par défaut,
 * cf. _shared/openai-image-model.ts). La photo produit
 * ORIGINALE est envoyée à CHAQUE appel (fidélité haute automatique) : c'est elle
 * qui protège la fidélité du produit (jamais d'itération sur une image générée,
 * sinon le produit s'érode).
 *
 * Pipeline :
 *   1. Standard auth/quota/rate-limit (category: photo_retouch)
 *   2. Gate Premium (plan free → { error: "premium_required" }, bypass QA)
 *   3. Validate body + fetch user_photos + download depuis le bucket
 *   4. Charte + profil → bloc « univers de marque » du prompt
 *   5. OpenAI /v1/images/edits (n=1 initial, n=2 variantes opt-in, n=1
 *      ajustement, retry 1× sur 5xx) — maîtrise des coûts 09/07/2026 : les
 *      3 propositions d'office triplaient la facture OpenAI (~0,50 €/clic)
 *   6. logUsage 1× PAR image générée (uniquement après succès)
 *
 * Recette anti-effet-IA (validée en tests le 09/07/2026) : fond NET décrit
 * (jamais de bokeh), rendu iPhone, imperfections dosées, casting naturel et
 * varié. Voir la fiche mémoire produit-porté-mannequin.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { runPipeline } from "../_shared/request-pipeline.ts";
import { validateInput, ValidationError } from "../_shared/input-validators.ts";
import { getServiceClient, isQaTestAccount, logUsage } from "../_shared/plan-limiter.ts";
import { fetchWithRetry } from "../_shared/http-retry.ts";
import { openaiImageModel } from "../_shared/openai-image-model.ts";
import {
  blobToDataUrl, generateHiggsfieldImageSync, higgsfieldImagesEnabled, MARKETING_FIDELITY_MODEL, MARKETING_PROMPT_MAX,
  SYNC_IMAGE_MESSAGES,
} from "../_shared/higgsfield-image-api.ts";
import { buildPrompt } from "./prompt.ts";

// ── Body schema ──
const BodySchema = z.object({
  workspace_id: z.string().uuid().optional().nullable(),
  photo_id: z.string().uuid(),
  mode: z.enum(["auto", "porte", "pose"]).default("auto"),
  framing: z.enum(["auto", "sans_visage", "portrait"]).default("auto"),
  ambiance: z.string().max(300).optional().nullable(),
  // Présent = régénération ciblée (1 image, 1 crédit) de la proposition affichée.
  adjustment: z.string().max(300).optional().nullable(),
  // Mode série (photo dump) : 1 image par appel, et une personne de référence
  // (data URL jpeg/png) pour garder LE MÊME mannequin d'une slide à l'autre.
  single: z.boolean().optional(),
  // « Voir d'autres variantes » : 2 images supplémentaires demandées depuis
  // l'écran résultat (opt-in — remplace les 3 propositions d'office).
  variants: z.boolean().optional(),
  reference_person_b64: z.string().max(4_000_000).optional().nullable(),
});

function dataUrlToBlob(input: string): Blob | null {
  const m = input.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!m) return null;
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1] });
}

const OPENAI_URL = "https://api.openai.com/v1/images/edits";
const OPENAI_TIMEOUT_MS = 200_000;
const PHOTOROOM_URL = "https://image-api.photoroom.com/v2/edit";
const PHOTOROOM_TIMEOUT_MS = 45_000;

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

    const bodyWorkspaceId = parsed.workspace_id ?? null;
    const adjustment = parsed.adjustment?.trim() || null;
    // 1 image par défaut (coût maîtrisé) ; 2 de plus quand la cliente demande
    // explicitement d'autres variantes depuis l'écran résultat.
    // Plafond images (grille du 01/10/2026) : le pipeline a vérifié qu'il reste
    // AU MOINS 1 image ; `quota.remaining` = images restantes APRÈS celle-ci.
    // Sans ce bornage, 2 variantes demandées à 1 image du plafond le
    // dépassaient (51/50) : on en génère alors une seule.
    const requested = adjustment || parsed.single ? 1 : parsed.variants ? 2 : 1;
    const n = typeof quota?.remaining === "number" ? Math.min(requested, 1 + Math.max(0, quota.remaining)) : requested;
    const referenceBlob = parsed.reference_person_b64
      ? dataUrlToBlob(parsed.reference_person_b64)
      : null;

    // 3. Gate Premium : la mise en scène est réservée aux plans payants
    // (décision produit 09/07/2026 — gpt-image = feature Premium). Le plan
    // vient du pipeline (même source de vérité que le quota, cf. T19).
    // Statut 200 + error code (pattern limit_reached) pour un parsing front simple.
    // Le compte QA garde un plan "free" réel mais passe le gate (bypass
    // déterministe par UUID, cf. QA_TEST_USER_IDS dans plan-limiter).
    if (quota && quota.plan === "free" && !isQaTestAccount(userId)) {
      return jsonResponse({ error: "premium_required" }, 200);
    }

    // 4. Photo source (RLS-scoped : la cliente ne voit que ses photos)
    const { data: photo, error: photoErr } = await supabase
      .from("user_photos")
      .select("id, storage_path, description, name, status, workspace_id")
      .eq("id", parsed.photo_id)
      .maybeSingle();

    if (photoErr) {
      console.error("[product-on-model] photo fetch error:", photoErr);
      return jsonResponse({ error: "Erreur DB" }, 500);
    }
    if (!photo || photo.status !== "ready") {
      return jsonResponse({ error: "Photo introuvable ou pas encore prête" }, 404);
    }

    const { data: blob, error: dlErr } = await supabase.storage
      .from("user-photos")
      .download(photo.storage_path);
    if (dlErr || !blob) {
      console.error("[product-on-model] download error:", dlErr);
      return jsonResponse({ error: "Téléchargement de la photo impossible" }, 500);
    }

    // 4bis. Détourage Photoroom AVANT gpt-image (lot 1ter, validé le 09/07) :
    // en fidélité haute, gpt-image hérite du STYLE OPTIQUE de la source — un
    // bokeh d'origine rend le fond flou, incorrigible par prompt. Une source
    // détourée sur fond blanc n'a rien à hériter → scène re-générée NETTE
    // selon la recette. Dégrade proprement : si Photoroom échoue (quota,
    // panne), on continue avec la photo brute plutôt que de bloquer.
    let sourceBlob: Blob = blob;
    let detoured = false;
    const photoroomKey = Deno.env.get("PHOTOROOM_API_KEY");
    if (photoroomKey) {
      try {
        const fd = new FormData();
        fd.append("imageFile", blob, "input.jpg");
        fd.append("removeBackground", "true");
        fd.append("background.color", "FFFFFF");
        fd.append("referenceBox", "originalImage");
        fd.append("outputSize", "originalImage");
        fd.append("export.format", "jpg");
        const prRes = await fetch(PHOTOROOM_URL, {
          method: "POST",
          headers: { "x-api-key": photoroomKey },
          body: fd,
          signal: AbortSignal.timeout(PHOTOROOM_TIMEOUT_MS),
        });
        if (prRes.ok) {
          sourceBlob = await prRes.blob();
          detoured = true;
        } else {
          await prRes.text().catch(() => "");
          console.warn(
            "[product-on-model] détourage Photoroom KO (status " + prRes.status + ") — photo brute utilisée"
          );
        }
      } catch (e) {
        console.warn(
          "[product-on-model] détourage Photoroom erreur — photo brute utilisée:",
          e instanceof Error ? e.message : e
        );
      }
    }

    // 5. Charte + profil pour le bloc « univers de marque »
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

    // Route temporaire et réversible (03/10/2026) : crédit OpenAI direct épuisé
    // → Higgsfield Marketing Studio (Sunburst, fidélité d'édition) tant que
    // HIGGSFIELD_IMAGE_ENABLED=true. Retirer le secret = retour à OpenAI.
    const useHiggsfield = higgsfieldImagesEnabled();
    const prompt = buildPrompt({
      ...(useHiggsfield ? { maxLength: MARKETING_PROMPT_MAX } : {}),
      mode: parsed.mode,
      framing: parsed.framing,
      ambiance: parsed.ambiance ?? null,
      adjustment,
      productDescription: photo.description,
      hasPersonReference: !!referenceBlob,
      brand: {
        activite: profileRes.data?.activite,
        photo_style: charterRes.data?.photo_style,
        mood_keywords: charterRes.data?.mood_keywords,
        visual_donts: charterRes.data?.visual_donts,
        moodboard_description: charterRes.data?.moodboard_description,
      },
    });

    if (useHiggsfield) {
      // Une demande par image (pas de n côté Higgsfield). Photo produit en 1re
      // position (fidélité), personne de référence en 2e — comme pour OpenAI.
      const inputs = referenceBlob ? [sourceBlob, referenceBlob] : [sourceBlob];
      const db = getServiceClient();
      const results = await Promise.all(Array.from({ length: n }, () =>
        generateHiggsfieldImageSync(db, {
          source: "product-on-model",
          userId,
          workspaceId: bodyWorkspaceId,
          model: MARKETING_FIDELITY_MODEL,
          prompt,
          format: "portrait",
          inputs,
          // Le front abandonne à 160 s (200 s pour les variantes).
          deadline: t0 + (parsed.variants ? 190_000 : 150_000),
        })
      ));
      const blobs = results.flatMap((r) => r.ok ? [r.blob] : []);
      if (!blobs.length) {
        const reason = results.find((r) => !r.ok)?.reason ?? "failed";
        console.error(JSON.stringify({
          event: "product_on_model_failed", reason: `higgsfield_${reason}`,
          user_id: userId, n_requested: n, detoured, total_ms: Date.now() - t0,
        }));
        return jsonResponse({ error: SYNC_IMAGE_MESSAGES[reason] }, 502);
      }
      // 1 crédit PAR image générée (après succès uniquement)
      for (let i = 0; i < blobs.length; i++) {
        await logUsage(
          userId,
          "photo_retouch",
          adjustment
            ? "mise_en_scene_adjust"
            : parsed.variants
              ? "mise_en_scene_variants"
              : "mise_en_scene",
          undefined,
          MARKETING_FIDELITY_MODEL,
          bodyWorkspaceId ?? undefined
        );
      }
      console.log(JSON.stringify({
        event: "product_on_model_success",
        user_id: userId,
        model: MARKETING_FIDELITY_MODEL,
        provider: "higgsfield",
        workspace_id: bodyWorkspaceId,
        n_requested: n,
        n_returned: blobs.length,
        mode: parsed.mode,
        framing: parsed.framing,
        has_adjustment: !!adjustment,
        has_reference: !!referenceBlob,
        detoured,
        total_ms: Date.now() - t0,
      }));
      return jsonResponse(
        {
          success: true,
          images: await Promise.all(blobs.map(blobToDataUrl)),
          remaining: quota?.remaining,
          remaining_total: quota?.remaining_total,
        },
        200
      );
    }

    // 6. OpenAI API key
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      console.error("[product-on-model] OPENAI_API_KEY missing");
      return jsonResponse({ error: "Configuration OpenAI manquante" }, 500);
    }

    // Sunburst par défaut (précision d'édition = fidélité produit) ; retour
    // arrière par le secret OPENAI_IMAGE_MODEL_PRODUCT=gpt-image-2.
    const imageModel = openaiImageModel("product");

    const buildForm = () => {
      const form = new FormData();
      form.append("model", imageModel);
      // ⚠️ notation tableau `image[]` obligatoire (la forme `image` est celle
      // de dall-e-2 → 400 immédiat).
      form.append(
        "image[]",
        new File([sourceBlob], "product.jpg", { type: sourceBlob.type || "image/jpeg" })
      );
      if (referenceBlob) {
        // Personne de référence en 2e position (la 1re image garde la
        // priorité de fidélité produit).
        form.append(
          "image[]",
          new File([referenceBlob], "person-reference.jpg", {
            type: referenceBlob.type || "image/jpeg",
          })
        );
      }
      form.append("prompt", prompt);
      form.append("n", String(n));
      form.append("size", "1024x1536");
      form.append("quality", "high");
      // Pas d'input_fidelity : gpt-image-2 traite TOUTE image d'entrée en
      // fidélité haute automatiquement (le paramètre est refusé par l'API) ;
      // la doc 2.5 ne le mentionne pas non plus.
      form.append("output_format", "jpeg");
      return form;
    };

    const callOpenAI = async (): Promise<Response> =>
      await fetch(OPENAI_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}` },
        body: buildForm(),
        signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
      });

    // Retry uniquement sur 5xx rapide — un timeout de génération ne se
    // retente pas (on exploserait le budget temps de l'edge).
    const {
      response: aiRes,
      retried,
      lastError,
      elapsedMs: aiMs,
    } = await fetchWithRetry(callOpenAI, {
      maxElapsedMsFor5xxRetry: 30_000,
      networkErrorRetryMode: "type-error-only",
      timeoutLabel: "OpenAI timeout",
    });

    if (!aiRes) {
      console.error(JSON.stringify({
        event: "product_on_model_failed",
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
        friendly = "Cette photo n'a pas pu être traitée, essaie une autre photo";
      } else if (aiRes.status >= 500) {
        friendly = "OpenAI temporairement indisponible";
      }
      console.error(JSON.stringify({
        event: "product_on_model_failed",
        reason: "openai_http_error",
        user_id: userId, retried,
        openai_status: aiRes.status,
        openai_body: errBody.slice(0, 500),
        ai_ms: aiMs,
      }));
      return jsonResponse({ error: friendly }, 502);
    }

    const aiJson = await aiRes.json().catch(() => null);
    const b64List: string[] = (aiJson?.data ?? [])
      .map((d: any) => d?.b64_json)
      .filter((s: unknown): s is string => typeof s === "string" && s.length > 0);

    if (!b64List.length) {
      console.error(
        "[product-on-model] réponse OpenAI sans image:",
        JSON.stringify(aiJson)?.slice(0, 300)
      );
      return jsonResponse({ error: "Réponse OpenAI invalide" }, 502);
    }

    const tokens =
      (aiJson?.usage?.input_tokens ?? 0) + (aiJson?.usage?.output_tokens ?? 0) || undefined;

    // 7. Log usage : 1 crédit PAR image générée (après succès uniquement)
    for (let i = 0; i < b64List.length; i++) {
      await logUsage(
        userId,
        "photo_retouch",
        adjustment
          ? "mise_en_scene_adjust"
          : parsed.variants
            ? "mise_en_scene_variants"
            : "mise_en_scene",
        i === 0 ? tokens : undefined,
        imageModel,
        bodyWorkspaceId ?? undefined
      );
    }

    console.log(JSON.stringify({
      event: "product_on_model_success",
      user_id: userId,
      model: imageModel,
      workspace_id: bodyWorkspaceId,
      n_requested: n,
      n_returned: b64List.length,
      mode: parsed.mode,
      framing: parsed.framing,
      has_adjustment: !!adjustment,
      detoured,
      tokens,
      ai_ms: aiMs,
      total_ms: Date.now() - t0,
      retry_used: retried,
    }));

    return jsonResponse(
      {
        success: true,
        images: b64List.map((b) => `data:image/jpeg;base64,${b}`),
        remaining: quota?.remaining,
        remaining_total: quota?.remaining_total,
      },
      200
    );
  } catch (e) {
    console.error("[product-on-model] unexpected error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Erreur interne" }, 500);
  }
});
