/**
 * product-on-model — « Mettre en scène » une photo produit de la bibliothèque.
 *
 * Génère des variantes réalistes du produit porté par une vraie personne (ou
 * posé en situation) via OpenAI Images Edits (gpt-image-2). La photo produit
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
import { logUsage } from "../_shared/plan-limiter.ts";

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
const RETRY_DELAY_MS = 2_000;
const PHOTOROOM_URL = "https://image-api.photoroom.com/v2/edit";
const PHOTOROOM_TIMEOUT_MS = 45_000;

// Comptes QA : mêmes emails que plan-limiter (bypass quota) — ils gardent un
// plan "free" réel, le gate Premium doit donc les laisser passer pour que la
// QA automatisée et les tests live fonctionnent.
const QA_TEST_EMAILS = new Set<string>(["laetitiatest@nowadaysagency.com"]);

const MODE_TEXT: Record<string, string> = {
  porte: "The product must be WORN by a person.",
  pose:
    "The product is placed in a real-life scene without a person — resting on a table, a chair, a linen cloth, as if casually left there.",
  auto:
    "If the product is wearable (clothing, jewelry, accessory, bag), show it worn by a person; otherwise stage it naturally in a real-life scene.",
};

const FRAMING_TEXT: Record<string, string> = {
  sans_visage:
    "Close crop on the product: the face must stay OUT of frame (neck, ear, hands, shoulders or bust only).",
  portrait:
    "Include the person's face — natural relaxed expression, looking away from the camera, never posing at the lens.",
  auto:
    "Choose the most flattering crop for this product; for small jewelry prefer close-ups (ear, neck, hand) with the face partially out of frame.",
};

interface BrandBlockInput {
  activite?: string | null;
  photo_style?: string | null;
  mood_keywords?: unknown;
  visual_donts?: string | null;
  moodboard_description?: string | null;
}

function buildPrompt(opts: {
  mode: string;
  framing: string;
  ambiance: string | null;
  adjustment: string | null;
  productDescription: string | null;
  hasPersonReference: boolean;
  brand: BrandBlockInput;
}): string {
  const lines: string[] = [];

  lines.push(
    "Candid photo taken on an iPhone, amateur photography, unposed, captured mid-moment."
  );

  lines.push(
    "THE PRODUCT: the attached photo shows the exact product to feature. Reproduce it with perfect fidelity — shape, proportions, colors, materials, textures, patterns, clasps, engravings and every small component. Do not redesign, simplify or embellish it." +
      (opts.productDescription ? ` Product context: ${opts.productDescription}` : "")
  );

  lines.push(MODE_TEXT[opts.mode] ?? MODE_TEXT.auto);
  lines.push("FRAMING: " + (FRAMING_TEXT[opts.framing] ?? FRAMING_TEXT.auto));

  // 🔑 Point faible n°1 des bijoux « portés » : le modèle génératif n'a aucune
  // notion de jointure physique (une boucle qui passe DANS le lobe, une bague
  // qui encercle un doigt…) → il pose l'objet à côté, le fait flotter ou le
  // fond dans la peau. Consigne d'accroche anatomique explicite pour relever le
  // taux de bons tirages. Générique : sans effet si le produit n'a pas
  // d'accroche (vêtement, sac).
  lines.push(
    "ATTACHMENT (critical when the product is worn): if the product physically attaches to the body, render that connection anatomically correct and true to real life — a pierced earring passes THROUGH the earlobe and hangs straight down under gravity; a ring encircles a finger; glasses rest on the nose bridge and hook over the ears; a watch or bracelet wraps fully around the wrist; a necklace drapes around the neck following its curve. The piece must join at the exact correct point, at realistic scale, obeying gravity — never floating beside the body part, never fused flat onto the skin, never oversized or undersized."
  );

  if (opts.hasPersonReference) {
    lines.push(
      "PERSON: the SECOND attached image shows the person to feature — it is THE SAME person in this photo (same face, same hair, same skin tone, same style). Natural, unposed, real-looking."
    );
  } else {
    lines.push(
      "PERSON (when shown): a real-looking person, NOT a professional model — natural visible skin texture, minimal makeup, subtle facial asymmetries, a few loose hair strands. Representation matters: vary ethnicity and age (25-55) across variations."
    );
  }

  lines.push(
    "SCENE: " +
      (opts.ambiance?.trim()
        ? opts.ambiance.trim()
        : "an ordinary, lived-in place consistent with the brand universe below (café terrace, workshop, apartment, street…)") +
      " — with realistic everyday details; the background must stay fully readable."
  );

  lines.push(
    "CAPTURE: deep depth of field, EVERYTHING in sharp focus from foreground to background, as if shot at f/11 on a phone (small sensor look). Every element of the background must stay crisp, detailed and readable — walls, furniture, objects, textures. Natural daylight, true-to-life colors, fine visible grain, slightly off-center framing. At most 1-2 honest imperfections (slight motion blur OR slightly tilted horizon)."
  );

  // 🔑 En édition fidélité haute, le modèle hérite du STYLE OPTIQUE de la photo
  // source : si elle a du bokeh, il revient malgré la consigne (vu le 09/07 sur
  // un bol en grès). L'override doit être explicite.
  lines.push(
    "IMPORTANT: if the source photo has any background blur or shallow depth of field, do NOT reproduce it — re-render the whole scene with a fully sharp background. Only the product itself must be preserved from the source, never its optical style."
  );

  lines.push(
    "STRICTLY AVOID: background blur, bokeh, shallow depth of field, cinematic look, studio lighting, golden-hour glow, magazine retouching, plastic smooth skin, added text, logos, watermarks."
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
    const n = adjustment || parsed.single ? 1 : parsed.variants ? 2 : 1;
    const referenceBlob = parsed.reference_person_b64
      ? dataUrlToBlob(parsed.reference_person_b64)
      : null;

    // 3. Gate Premium : la mise en scène est réservée aux plans payants
    // (décision produit 09/07/2026 — gpt-image = feature Premium). Le plan
    // vient du pipeline (même source de vérité que le quota, cf. T19).
    // Statut 200 + error code (pattern limit_reached) pour un parsing front simple.
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

    const prompt = buildPrompt({
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

    // 6. OpenAI API key
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      console.error("[product-on-model] OPENAI_API_KEY missing");
      return jsonResponse({ error: "Configuration OpenAI manquante" }, 500);
    }

    const buildForm = () => {
      const form = new FormData();
      // gpt-image-2 = flagship actuel (gpt-image-1 déprécié oct. 2026) — même
      // génération que le ChatGPT avec lequel Laetitia a validé la qualité.
      form.append("model", "gpt-image-2");
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
      // fidélité haute automatiquement (le paramètre est refusé par l'API).
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

    let aiRes: Response | null = null;
    let retried = false;
    let lastError: string | null = null;
    const aiT0 = Date.now();

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        aiRes = await callOpenAI();
        if (aiRes.ok) break;
        // Retry uniquement sur 5xx rapide — un timeout de génération ne se
        // retente pas (on exploserait le budget temps de l'edge).
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
        "gpt-image-2",
        bodyWorkspaceId ?? undefined
      );
    }

    console.log(JSON.stringify({
      event: "product_on_model_success",
      user_id: userId,
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
