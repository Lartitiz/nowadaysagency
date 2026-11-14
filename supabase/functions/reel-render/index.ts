import { isAllowedReelRenderUrl } from "./archive-url.ts";
/**
 * reel-render
 *
 * Moteur de montage de reels. Reçoit le plan (une section = un clip + la voix),
 * construit la recette JSON2Video (via `buildReelRecipe`) et pilote le rendu :
 *   - action "submit"  : lance le rendu → renvoie l'identifiant de projet.
 *   - action "status"  : interroge l'avancement → renvoie statut + URL du MP4.
 *   - action "archive" : RECOPIE le MP4 rendu dans le bucket `calendar-media`.
 *
 * Pourquoi "archive" existe : l'URL renvoyée par "status" est celle de
 * JSON2Video, un service EXTERNE dont les rendus expirent. Attacher cette URL
 * à un contenu, c'est programmer un lien mort. Tant que le fichier n'est pas
 * chez nous, « ta vidéo est prête » est une promesse à durée limitée.
 *
 * Le rendu est asynchrone (30 s à 2 min) : l'UI lance puis interroge le statut.
 *
 * - Auth + rate-limit via le pipeline standard. skipQuota : ce n'est pas un appel
 *   IA de génération. (Le suivi des crédits JSON2Video se fera à part, au rapport
 *   de coûts — lot dédié.)
 * - La clé JSON2VIDEO_API_KEY est lue côté serveur, jamais exposée au client.
 * - Bloc échangeable : seul cet edge parle à JSON2Video. Le reste de l'app ne
 *   connaît que "submit / status".
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { runPipeline } from "../_shared/request-pipeline.ts";
import { buildReelRecipe } from "./recipe.ts";
import { SubmitSchema, TweakSchema } from "./schema.ts";
import { sanitizeTweaks } from "./tweaks.ts";
import { TWEAK_SYSTEM, TWEAK_TOOL, tweakPrompt, tweaksFromAi } from "./ai-tweak.ts";
import { callAnthropicToolSimple, HAIKU_MODEL, type UsageSink } from "../_shared/anthropic.ts";
import { checkQuota, getServiceClient, logUsage } from "../_shared/plan-limiter.ts";
import { assertWorkspaceMembership, workspaceDeniedResponse } from "../_shared/workspace-guard.ts";
import { buildReelComposition, isHyperframesEligible, isSpokenHyperframesEligible } from "./hyperframes.ts";
import { voiceTracks } from "./captions.ts";
import { transcribeVoiceTracks } from "./transcribe-gateway.ts";
import {
  HYPERFRAMES_ENABLED,
  hyperframesStatus,
  isHyperframesProject,
  submitHyperframes,
} from "./hyperframes-gateway.ts";

const J2V_BASE = "https://api.json2video.com/v2/movies";
const J2V_TIMEOUT_MS = 20_000;

const StatusSchema = z.object({
  action: z.literal("status"),
  project: z.string().min(1).max(120),
});

// L'URL est bornée au domaine de JSON2Video : cet endpoint recopie un fichier
// distant dans NOTRE bucket, il ne doit pas devenir un proxy universel.
const ArchiveSchema = z.object({
  action: z.literal("archive"),
  url: z.string().url().refine(isAllowedReelRenderUrl, "URL de rendu inattendue."),
});

const BodySchema = z.discriminatedUnion("action", [SubmitSchema, StatusSchema, ArchiveSchema, TweakSchema]);

// Plafond du bucket `calendar-media` (cf. src/lib/upload-limits.ts).
const MAX_MP4_BYTES = 150 * 1024 * 1024;

serve(async (req) => {
  const r = await runPipeline(req, { skipQuota: true });
  if (!r.ok) return r.response;
  const { corsHeaders, userId, supabase } = r;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (e) {
    return json({ error: "Requête invalide.", details: String(e) }, 400);
  }

  // ── action "tweak" : « Dis ce que tu veux changer » → réglages bornés ──
  // Seule action IA de cette fonction : pattern quota strict (checkQuota →
  // appel IA → logUsage). Les boutons de retouche et les demandes simples sont
  // traités dans le navigateur, sans appel ici (donc sans crédit).
  if (body.action === "tweak") {
    const n = body.passages.length;
    const current = sanitizeTweaks(body.current, n);
    if (body.workspace_id) {
      const membership = await assertWorkspaceMembership(getServiceClient(), userId, body.workspace_id);
      if (!membership.ok) return workspaceDeniedResponse(corsHeaders);
    }
    const quota = await checkQuota(userId, "adaptation", body.workspace_id);
    if (!quota.allowed) return json({ error: quota.message, quota }, 429);
    const usage: UsageSink = {};
    let raw: unknown;
    try {
      raw = await callAnthropicToolSimple(HAIKU_MODEL, TWEAK_SYSTEM, tweakPrompt(body.request, body.passages, current), TWEAK_TOOL, 0.2, 800, usage, 30_000);
    } catch (e) {
      console.error("[reel-render] tweak IA échouée", e);
      return json({ error: "Je n'ai pas réussi à comprendre la demande. Réessaie avec d'autres mots." }, 502);
    }
    const result = tweaksFromAi(raw, current, n);
    await logUsage(userId, "adaptation", "reel_tweak", usage.total_tokens, usage.model ?? HAIKU_MODEL, body.workspace_id);
    return json(result);
  }

  // ── action "archive" : le MP4 devient NOTRE fichier ──
  // Ne touche pas à JSON2Video autrement que pour le télécharger : pas besoin
  // de la clé API, on ne fait que lire une URL de rendu déjà publique.
  if (body.action === "archive") {
    let src: Response;
    try {
      src = await fetch(body.url, { redirect: "error", signal: AbortSignal.timeout(30_000) });
    } catch (e) {
      console.error("[reel-render] archive download error", e);
      return json({ error: "Impossible de récupérer la vidéo montée." }, 502);
    }
    if (!src.ok) {
      console.error("[reel-render] archive download refusé", src.status);
      // 404 = le rendu a déjà expiré côté JSON2Video : le dire clairement
      // plutôt que de laisser croire à un souci de réseau.
      return json(
        {
          error:
            src.status === 404
              ? "Cette vidéo montée n'est plus disponible au téléchargement. Relance le montage."
              : "Impossible de récupérer la vidéo montée.",
        },
        502,
      );
    }

    const contentType = (src.headers.get("content-type") || "").split(";")[0].toLowerCase();
    if (!["video/mp4", "application/octet-stream"].includes(contentType)) {
      return json({ error: "Le fichier reçu n’est pas une vidéo MP4." }, 502);
    }
    const declared = Number(src.headers.get("content-length") || 0);
    if (declared > MAX_MP4_BYTES) {
      return json({ error: "La vidéo montée dépasse la taille autorisée (150 Mo)." }, 413);
    }
    const bytes = new Uint8Array(await src.arrayBuffer());
    if (bytes.byteLength > MAX_MP4_BYTES) {
      return json({ error: "La vidéo montée dépasse la taille autorisée (150 Mo)." }, 413);
    }

    if (bytes.length < 12 || String.fromCharCode(...bytes.slice(4, 8)) !== "ftyp") {
      return json({ error: "Le fichier reçu n’est pas une vidéo MP4 valide." }, 502);
    }

    // Rangé sous l'id de la créatrice : même bucket public que ses rushes.
    const path = `${userId}/reels-montes/${crypto.randomUUID()}.mp4`;
    const { error: upErr } = await supabase.storage
      .from("calendar-media")
      .upload(path, bytes, { contentType: "video/mp4", upsert: false });
    if (upErr) {
      console.error("[reel-render] archive upload error", upErr);
      return json({ error: "La vidéo montée n'a pas pu être rangée dans ta bibliothèque." }, 502);
    }
    const { data: pub } = supabase.storage.from("calendar-media").getPublicUrl(path);
    if (!pub?.publicUrl) {
      return json({ error: "La vidéo montée n'a pas pu être rangée dans ta bibliothèque." }, 502);
    }
    return json({ url: pub.publicUrl, bytes: bytes.byteLength });
  }

  // ── Reel « sans voix » : montage HyperFrames sur notre Google Cloud ──
  // Repli automatique sur JSON2Video si le relais ne répond pas au lancement.
  const authorization = req.headers.get("Authorization");
  if (body.action === "status" && isHyperframesProject(body.project)) {
    return json(await hyperframesStatus(body.project, authorization));
  }
  if (body.action === "submit" && HYPERFRAMES_ENABLED && isHyperframesEligible(body)) {
    const started = await submitHyperframes(buildReelComposition(body, { look: body.look, brand: body.brand }), authorization);
    if (started.ok) {
      console.log(JSON.stringify({ event: "reel_render_engine", engine: "hyperframes", sections: body.sections.length }));
      return json({ project: started.project, status: "running" });
    }
    console.warn(JSON.stringify({ event: "reel_render_engine", engine: "json2video", fallback_reason: started.reason }));
  }
  // ── Reel parlé (« Je me filme » ou voix enregistrée) : HyperFrames + sous-titres
  // calés sur la voix (écoute Whisper sur notre Google Cloud). Écoute ratée ou
  // lancement refusé → JSON2Video, qui sous-titre lui-même.
  if (body.action === "submit" && HYPERFRAMES_ENABLED && isSpokenHyperframesEligible(body)) {
    const wantsCaptions = body.subtitles !== false;
    const captions = wantsCaptions ? await transcribeVoiceTracks(voiceTracks(body), authorization) : voiceTracks(body).map(() => []);
    if (captions) {
      const started = await submitHyperframes(buildReelComposition(body, { look: body.look, brand: body.brand, captions }), authorization);
      if (started.ok) {
        console.log(JSON.stringify({ event: "reel_render_engine", engine: "hyperframes", spoken: body.mode ?? "cache", sections: body.sections.length }));
        return json({ project: started.project, status: "running" });
      }
      console.warn(JSON.stringify({ event: "reel_render_engine", engine: "json2video", spoken: true, fallback_reason: started.reason }));
    } else {
      console.warn(JSON.stringify({ event: "reel_render_engine", engine: "json2video", spoken: true, fallback_reason: "transcribe_unavailable" }));
    }
  }

  const apiKey = Deno.env.get("JSON2VIDEO_API_KEY");
  if (!apiKey) {
    console.error("[reel-render] JSON2VIDEO_API_KEY manquante");
    return json(
      { error: "Le montage vidéo n'est pas encore configuré (clé API manquante)." },
      503,
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), J2V_TIMEOUT_MS);

  try {
    if (body.action === "submit") {
      const recipe = buildReelRecipe(body);
      let res: Response;
      try {
        res = await fetch(J2V_BASE, {
          method: "POST",
          headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify(recipe),
          signal: controller.signal,
        });
      } catch (e) {
        console.error("[reel-render] submit fetch error", e);
        return json({ error: "Le lancement du montage a échoué. Réessaie." }, 502);
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success || !data?.project) {
        console.error("[reel-render] submit refusé", res.status, JSON.stringify(data).slice(0, 300));
        return json({ error: "Le montage n'a pas pu démarrer. Réessaie dans un instant." }, 502);
      }
      return json({ project: data.project as string, status: "running" });
    }

    // action === "status"
    const url = `${J2V_BASE}?project=${encodeURIComponent(body.project)}`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "x-api-key": apiKey },
        signal: controller.signal,
      });
    } catch (e) {
      console.error("[reel-render] status fetch error", e);
      return json({ error: "Impossible de récupérer l'avancement. Réessaie." }, 502);
    }
    const data = await res.json().catch(() => ({}));
    const movie = data?.movie ?? {};
    return json({
      status: movie.status ?? "unknown", // running | done | error
      url: movie.url ?? null,
      message: movie.message ?? "",
      duration: typeof movie.duration === "number" ? movie.duration : null,
    });
  } finally {
    clearTimeout(timer);
  }
});
