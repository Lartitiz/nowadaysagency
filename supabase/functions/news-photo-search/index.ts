/**
 * news-photo-search — photos d'actualité LIBRES DE DROITS via Openverse
 * (lot 3 du chantier casting « texte d'abord »).
 *
 * Openverse (openverse.org, WordPress/Creative Commons) indexe ~800 M d'images
 * sous licence libre — dont Wikimedia Commons et Flickr CC, où vivent les photos
 * de personnalités/marques (événements publics, conférences…). C'est la source
 * proposée quand une actu newsjacking mentionne une entité nommée.
 *
 * ⚖️ Filtrage licences STRICT (décision produit 09/07/2026) :
 *   - Autorisées : CC0, Public Domain Mark, CC BY (crédit obligatoire → injecté
 *     automatiquement dans la légende côté front).
 *   - EXCLUES : toutes les NC (compte de marque = usage commercial) et toutes
 *     les ND (poser un overlay texte = modification).
 * Le droit à l'image reste distinct de la licence : usage réservé au COMMENTAIRE
 * d'actualité (note pédagogique côté front), jamais à suggérer un partenariat.
 *
 * Deux modes :
 *   - search : recherche Openverse (anonyme — quotas modestes, message clair si
 *     429 ; passer à une clé d'app enregistrée si l'usage décolle).
 *   - download : proxy de téléchargement d'une image sélectionnée (certains
 *     providers indexés n'envoient pas de CORS) — garde anti-SSRF + type/taille.
 *
 * skipQuota : pas d'appel IA. Rate-limit standard.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { runPipeline } from "../_shared/request-pipeline.ts";
import { isSafePublicUrl } from "../_shared/scraping.ts";

const BodySchema = z.object({
  mode: z.enum(["search", "download"]).default("search"),
  // mode search
  query: z.string().min(1).max(200).optional(),
  per_page: z.number().int().min(1).max(30).optional(),
  // mode download
  url: z.string().url().max(2000).optional(),
});

const OPENVERSE_URL = "https://api.openverse.org/v1/images/";
const OPENVERSE_TIMEOUT_MS = 15_000;
const DOWNLOAD_TIMEOUT_MS = 25_000;
const DOWNLOAD_MAX_BYTES = 15 * 1024 * 1024;
// Licences réutilisables commercialement ET modifiables, uniquement.
const ALLOWED_LICENSES = "cc0,pdm,by";

serve(async (req) => {
  const r = await runPipeline(req, {
    skipQuota: true,
    rateLimit: { max: 20, windowMs: 60_000 },
  });
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

  // ── mode download : proxy d'une image sélectionnée ──
  if (body.mode === "download") {
    if (!body.url) return json({ error: "URL manquante." }, 400);
    if (!isSafePublicUrl(body.url)) {
      return json({ error: "URL refusée." }, 400);
    }
    try {
      const res = await fetch(body.url, {
        redirect: "follow",
        headers: { "User-Agent": "LAssistantCom/1.0 (nowadays-assistant.fr)" },
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      });
      if (!res.ok) return json({ error: `Téléchargement impossible (HTTP ${res.status}).` }, 502);
      const type = res.headers.get("content-type") || "";
      if (!type.startsWith("image/")) {
        return json({ error: "Le lien ne pointe pas vers une image." }, 400);
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.byteLength > DOWNLOAD_MAX_BYTES) {
        return json({ error: "Image trop lourde (max 15 Mo)." }, 400);
      }
      let bin = "";
      const CHUNK = 32768;
      for (let i = 0; i < buf.length; i += CHUNK) {
        bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
      }
      return json({ image: `data:${type.split(";")[0]};base64,${btoa(bin)}` });
    } catch (e) {
      const isTimeout = e instanceof DOMException && e.name === "TimeoutError";
      return json(
        { error: isTimeout ? "Téléchargement trop long, réessaie." : "Téléchargement impossible." },
        502,
      );
    }
  }

  // ── mode search ──
  const q = body.query?.trim();
  if (!q) return json({ error: "Requête vide." }, 400);

  try {
    const params = new URLSearchParams({
      q,
      license: ALLOWED_LICENSES,
      category: "photograph",
      filter_dead: "true",
      page_size: String(body.per_page ?? 24),
    });
    const res = await fetch(`${OPENVERSE_URL}?${params}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": "LAssistantCom/1.0 (nowadays-assistant.fr)",
      },
      signal: AbortSignal.timeout(OPENVERSE_TIMEOUT_MS),
    });
    if (res.status === 429) {
      return json({
        error: "La banque de photos d'actu est très sollicitée, réessaie dans une minute.",
      }, 429);
    }
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error("[news-photo-search] Openverse HTTP", res.status, t.slice(0, 300));
      return json({ error: "Recherche momentanément indisponible." }, 502);
    }
    const data = await res.json();
    const photos = (data?.results ?? [])
      // Ceinture + bretelles : on re-filtre côté serveur au cas où l'API
      // renverrait une licence hors liste (nc/nd interdites).
      .filter((it: any) => ["cc0", "pdm", "by"].includes(String(it?.license || "").toLowerCase()))
      .map((it: any) => ({
        id: String(it.id ?? ""),
        title: it.title ?? "",
        url: it.url ?? "",
        thumbnail: it.thumbnail || it.url || "",
        width: it.width ?? null,
        height: it.height ?? null,
        creator: it.creator ?? "",
        creator_url: it.creator_url ?? "",
        license: String(it.license ?? "").toLowerCase(),
        license_version: it.license_version ?? "",
        license_url: it.license_url ?? "",
        source_url: it.foreign_landing_url ?? "",
        provider: it.source ?? it.provider ?? "",
        // Openverse fournit une phrase d'attribution prête à l'emploi.
        attribution: it.attribution ?? "",
      }))
      .filter((p: any) => p.url);
    return json({ photos });
  } catch (e) {
    const isTimeout = e instanceof DOMException && e.name === "TimeoutError";
    console.error("[news-photo-search] erreur:", e instanceof Error ? e.message : e);
    return json(
      { error: isTimeout ? "Recherche trop longue, réessaie." : "Recherche momentanément indisponible." },
      502,
    );
  }
});
