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

const J2V_BASE = "https://api.json2video.com/v2/movies";
const J2V_TIMEOUT_MS = 20_000;

const SectionSchema = z.object({
  clip_url: z.string().url(),
  seek: z.number().min(0).optional(),
  duration: z.number().positive().max(90),
  voice_audio_url: z.string().url().optional(),
  voice_text: z.string().max(600).optional(),
});

const SubmitSchema = z.object({
  action: z.literal("submit"),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  sections: z.array(SectionSchema).min(1).max(20),
  voice_mode: z.enum(["recorded", "tts"]),
  tts_voice: z.string().max(60).optional(),
  subtitles: z.boolean().optional(),
  subtitle_settings: z.record(z.unknown()).optional(),
  // "filme" (prise face cam, clip gardé avec son) / "cache" (défaut, comportement existant).
  mode: z.enum(["filme", "cache"]).optional(),
});

const StatusSchema = z.object({
  action: z.literal("status"),
  project: z.string().min(1).max(120),
});

// L'URL est bornée au domaine de JSON2Video : cet endpoint recopie un fichier
// distant dans NOTRE bucket, il ne doit pas devenir un proxy universel.
const ArchiveSchema = z.object({
  action: z.literal("archive"),
  url: z.string().url().refine((u) => {
    try {
      const h = new URL(u).hostname;
      return h === "json2video.com" || h.endsWith(".json2video.com");
    } catch {
      return false;
    }
  }, "URL de rendu inattendue."),
});

const BodySchema = z.discriminatedUnion("action", [SubmitSchema, StatusSchema, ArchiveSchema]);

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

  // ── action "archive" : le MP4 devient NOTRE fichier ──
  // Ne touche pas à JSON2Video autrement que pour le télécharger : pas besoin
  // de la clé API, on ne fait que lire une URL de rendu déjà publique.
  if (body.action === "archive") {
    let src: Response;
    try {
      src = await fetch(body.url);
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

    const declared = Number(src.headers.get("content-length") || 0);
    if (declared > MAX_MP4_BYTES) {
      return json({ error: "La vidéo montée dépasse la taille autorisée (150 Mo)." }, 413);
    }
    const bytes = new Uint8Array(await src.arrayBuffer());
    if (bytes.byteLength > MAX_MP4_BYTES) {
      return json({ error: "La vidéo montée dépasse la taille autorisée (150 Mo)." }, 413);
    }

    // Rangé sous l'id de la créatrice : même bucket public que ses rushes.
    const path = `reels-montes/${userId}/${crypto.randomUUID()}.mp4`;
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
