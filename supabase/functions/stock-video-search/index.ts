/**
 * stock-video-search
 *
 * Recherche de vidéos libres de droit via l'API Pexels (endpoint /videos).
 * Jumelle de `stock-photo-search` : même clé PEXELS_API_KEY, même pipeline
 * auth + rate-limit, même forme de réponse normalisée — mais renvoie des clips
 * MP4 verticaux (idéaux pour le montage de reels 9:16) au lieu de photos.
 *
 * - Auth + rate-limit via le pipeline standard (skipQuota : pas d'appel IA, c'est
 *   une simple recherche, on ne consomme pas le quota de génération).
 * - La clé PEXELS_API_KEY est lue côté serveur, jamais exposée dans le bundle client.
 * - Retour normalisé : id, url (meilleur MP4 vertical), thumbnail, durée en
 *   secondes, dimensions, auteur + source (pour le crédit, optionnel chez Pexels).
 * - Pas de pubs iStock ici : contrairement au site web, l'API ne renvoie que des
 *   résultats Pexels gratuits.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { runPipeline } from "../_shared/request-pipeline.ts";
import { pickBestVerticalFile, type PexelsVideoFile } from "./select.ts";

const BodySchema = z.object({
  query: z.string().min(1).max(200),
  per_page: z.number().int().min(1).max(30).optional(),
  orientation: z.enum(["portrait", "landscape", "square"]).optional(),
  locale: z.string().max(10).optional(),
});

const PEXELS_URL = "https://api.pexels.com/videos/search";
const PEXELS_TIMEOUT_MS = 15_000;

serve(async (req) => {
  // Auth + rate-limit. skipQuota : la recherche ne touche pas l'IA.
  const r = await runPipeline(req, { skipQuota: true });
  if (!r.ok) return r.response;
  const { corsHeaders } = r;

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

  const apiKey = Deno.env.get("PEXELS_API_KEY");
  if (!apiKey) {
    console.error("[stock-video-search] PEXELS_API_KEY manquante");
    return json(
      { error: "La recherche de vidéos n'est pas encore configurée (clé API manquante)." },
      503,
    );
  }

  const params = new URLSearchParams({
    query: body.query,
    per_page: String(body.per_page ?? 24),
    orientation: body.orientation ?? "portrait",
    locale: body.locale ?? "fr-FR",
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PEXELS_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${PEXELS_URL}?${params.toString()}`, {
      headers: { Authorization: apiKey },
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    console.error("[stock-video-search] fetch error", e);
    return json({ error: "La recherche de vidéos a échoué. Réessaie dans un instant." }, 502);
  }
  clearTimeout(timer);

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.error("[stock-video-search] Pexels error", res.status, txt.slice(0, 300));
    const msg =
      res.status === 429
        ? "Trop de recherches d'un coup. Réessaie dans une minute."
        : "La recherche de vidéos a échoué.";
    return json({ error: msg }, 502);
  }

  const data = await res.json().catch(() => ({}));
  const videos = (Array.isArray(data?.videos) ? data.videos : [])
    .map((v: any) => {
      const best = pickBestVerticalFile(
        (Array.isArray(v?.video_files) ? v.video_files : []) as PexelsVideoFile[],
      );
      if (!best) return null;
      return {
        id: String(v.id),
        // Meilleur fichier MP4 vertical disponible (portrait HD de préférence).
        url: best.link,
        width: best.width ?? v?.width ?? null,
        height: best.height ?? v?.height ?? null,
        // Durée du clip source, en secondes (utile pour l'aperçu / la coupe).
        duration: typeof v?.duration === "number" ? v.duration : null,
        thumbnail: v?.image || "",
        author: v?.user?.name || "",
        author_url: v?.user?.url || "",
        source_url: v?.url || "",
      };
    })
    .filter((v: any) => v && v.url && v.thumbnail);

  return json({ videos, total: data?.total_results ?? videos.length });
});
