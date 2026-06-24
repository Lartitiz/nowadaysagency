/**
 * stock-photo-search
 *
 * Recherche de photos libres de droit via l'API Pexels.
 * Utilisé pour proposer des images quand l'utilisatrice n'a pas ses propres
 * photos sous la main (carrousel hybride / photo, posts…).
 *
 * - Auth + rate-limit via le pipeline standard (skipQuota : pas d'appel IA, c'est
 *   une simple recherche, on ne consomme pas le quota de génération).
 * - La clé PEXELS_API_KEY est lue côté serveur, jamais exposée dans le bundle client.
 * - Retour normalisé : id, url (taille portrait, idéale pour 1080×1350), thumbnail,
 *   photographe + source (pour le crédit, optionnel chez Pexels).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { runPipeline } from "../_shared/request-pipeline.ts";

const BodySchema = z.object({
  query: z.string().min(1).max(200),
  per_page: z.number().int().min(1).max(30).optional(),
  orientation: z.enum(["portrait", "landscape", "square"]).optional(),
  locale: z.string().max(10).optional(),
});

const PEXELS_URL = "https://api.pexels.com/v1/search";
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
    console.error("[stock-photo-search] PEXELS_API_KEY manquante");
    return json(
      { error: "La recherche de photos n'est pas encore configurée (clé API manquante)." },
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
    console.error("[stock-photo-search] fetch error", e);
    return json({ error: "La recherche d'images a échoué. Réessaie dans un instant." }, 502);
  }
  clearTimeout(timer);

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.error("[stock-photo-search] Pexels error", res.status, txt.slice(0, 300));
    const msg =
      res.status === 429
        ? "Trop de recherches d'un coup. Réessaie dans une minute."
        : "La recherche d'images a échoué.";
    return json({ error: msg }, 502);
  }

  const data = await res.json().catch(() => ({}));
  const photos = (Array.isArray(data?.photos) ? data.photos : []).map((p: any) => ({
    id: String(p.id),
    // src.portrait = ~800×1200, le ratio le plus proche du format carrousel 1080×1350.
    url: p?.src?.portrait || p?.src?.large2x || p?.src?.large || p?.src?.original || "",
    thumbnail: p?.src?.medium || p?.src?.small || p?.src?.tiny || "",
    width: p?.width ?? null,
    height: p?.height ?? null,
    alt: p?.alt || "",
    photographer: p?.photographer || "",
    photographer_url: p?.photographer_url || "",
    source_url: p?.url || "",
    avg_color: p?.avg_color || "#cccccc",
  })).filter((p: any) => p.url && p.thumbnail);

  return json({ photos, total: data?.total_results ?? photos.length });
});
