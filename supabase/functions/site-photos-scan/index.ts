/**
 * site-photos-scan — propose les photos du site OU du compte Instagram de
 * l'utilisatrice à l'import dans sa bibliothèque (/photos). Trois modes :
 *
 *  - mode "scan"  : { websiteUrl } → liste d'images candidates (URLs absolues).
 *    Le tri fin (dimensions réelles, images mortes) se fait côté client, qui
 *    peut AFFICHER les images cross-origin sans CORS.
 *
 *  - mode "instagram" : { workspace_id? } → photos des 50 derniers posts du
 *    compte connecté (API Graph officielle, jamais de scraping) : images
 *    simples + enfants de carrousels, vidéos écartées. ⚠️ les media_url
 *    expirent → à rapatrier immédiatement via le mode fetch.
 *
 *  - mode "fetch" : { imageUrl } → l'image en base64. Nécessaire parce que le
 *    navigateur ne peut pas LIRE les octets d'une image cross-origin : le
 *    téléchargement passe par ici, puis l'image rejoint le circuit d'upload
 *    existant (compression + user_photos + photo-describe côté client).
 *
 * Sécurité : mêmes gardes anti-SSRF que pre-scrape-website (isSafePublicUrl à
 * chaque redirection via safeFetchFollow), utilisatrice authentifiée.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { safeFetchFollow } from "../_shared/scraping.ts";
import {
  extractImageCandidates,
  flattenInstagramMedia,
  type InstagramMediaItem,
} from "../_shared/site-photos.ts";
import { authenticateRequest, AuthError, getServiceClient } from "../_shared/auth.ts";
import { decryptConnTokens } from "../_shared/token-crypto.ts";
import { refreshTokenIfNeeded } from "../_shared/instagram-graph.ts";

const IG_GRAPH = "https://graph.instagram.com/v23.0";

const HTML_MAX_BYTES = 5_000_000; // page HTML
const IMAGE_MAX_BYTES = 10_000_000; // une photo web dépasse rarement 10 Mo
const FETCH_TIMEOUT_MS = 25_000;

/** Lit un corps de réponse en s'arrêtant net au-delà de maxBytes (→ null). */
async function readBodyCapped(resp: Response, maxBytes: number): Promise<Uint8Array | null> {
  const declared = Number(resp.headers.get("content-length") || 0);
  if (declared > maxBytes) {
    await resp.body?.cancel().catch(() => {});
    return null;
  }
  if (!resp.body) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = resp.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

function json(corsHeaders: Record<string, string>, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const { userId } = await authenticateRequest(req);
    const { mode, websiteUrl, imageUrl, workspace_id: workspaceId } = await req.json();

    if (mode === "scan") {
      if (!websiteUrl || typeof websiteUrl !== "string") {
        return json(corsHeaders, { error: "websiteUrl requis" }, 400);
      }
      let formattedUrl = websiteUrl.trim();
      if (!formattedUrl.startsWith("http")) formattedUrl = `https://${formattedUrl}`;

      const fetched = await safeFetchFollow(formattedUrl, controller.signal);
      if (!fetched || !fetched.response.ok) {
        await fetched?.response.body?.cancel().catch(() => {});
        return json(corsHeaders, {
          error: "Impossible d'ouvrir cette adresse. Vérifie l'URL de ton site.",
        }, 422);
      }
      const bytes = await readBodyCapped(fetched.response, HTML_MAX_BYTES);
      if (bytes === null) {
        return json(corsHeaders, { error: "Page trop lourde pour être analysée." }, 422);
      }
      const html = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      // finalUrl (après redirections) comme base : les chemins relatifs du HTML
      // se résolvent contre la page réellement servie, pas l'URL saisie.
      const images = extractImageCandidates(html, fetched.finalUrl);
      return json(corsHeaders, { success: true, images });
    }

    if (mode === "fetch") {
      if (!imageUrl || typeof imageUrl !== "string") {
        return json(corsHeaders, { error: "imageUrl requis" }, 400);
      }
      const fetched = await safeFetchFollow(imageUrl, controller.signal);
      if (!fetched || !fetched.response.ok) {
        await fetched?.response.body?.cancel().catch(() => {});
        return json(corsHeaders, { error: "Image inaccessible." }, 422);
      }
      const contentType = (fetched.response.headers.get("content-type") || "").split(";")[0].trim();
      // SVG exclu (pas une photo, et vecteur potentiellement scripté).
      // octet-stream toléré : certains CDN ne typent pas leurs images.
      const looksImage = contentType.startsWith("image/") && contentType !== "image/svg+xml";
      const isOpaque = contentType === "application/octet-stream" || contentType === "";
      if (!looksImage && !isOpaque) {
        await fetched.response.body?.cancel().catch(() => {});
        return json(corsHeaders, { error: "Ce lien ne pointe pas vers une image." }, 422);
      }
      const bytes = await readBodyCapped(fetched.response, IMAGE_MAX_BYTES);
      if (bytes === null || bytes.byteLength === 0) {
        return json(corsHeaders, { error: "Image trop lourde ou vide." }, 422);
      }
      return json(corsHeaders, {
        success: true,
        // readBodyCapped alloue un buffer à la taille exacte → .buffer est sûr
        base64: base64Encode(bytes.buffer as ArrayBuffer),
        contentType: looksImage ? contentType : "image/jpeg",
      });
    }

    if (mode === "instagram") {
      // Même chargement de connexion que instagram-insights-fetch : scoping
      // workspace (ou compte perso), token déchiffré puis rafraîchi si besoin.
      const supabase = getServiceClient();
      const filterCol = workspaceId ? "workspace_id" : "user_id";
      const filterVal = workspaceId || userId;
      let q = supabase
        .from("social_connections")
        .select("*")
        .eq("platform", "instagram")
        .eq(filterCol, filterVal);
      if (workspaceId) q = q.eq("user_id", userId);
      else q = q.is("workspace_id", null);
      const { data: conn, error: connErr } = await q.maybeSingle();
      if (connErr || !conn) {
        return json(corsHeaders, {
          error: "Aucun compte Instagram connecté. Connecte-le dans Paramètres > Connexions.",
        }, 404);
      }
      await decryptConnTokens(conn);
      const token = await refreshTokenIfNeeded(supabase, conn);

      const u = new URL(`${IG_GRAPH}/${conn.platform_account_id}/media`);
      u.searchParams.set(
        "fields",
        "id,caption,media_type,media_url,thumbnail_url,timestamp,children{media_type,media_url}",
      );
      u.searchParams.set("limit", "50");
      u.searchParams.set("access_token", token);
      const res = await fetch(u, { signal: controller.signal });
      const body = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(body?.data)) {
        console.error("IG media list failed:", res.status, body?.error?.message);
        return json(corsHeaders, {
          error: "Impossible de lire tes posts Instagram. Reconnecte ton compte et réessaie.",
        }, 502);
      }
      // ⚠️ Les media_url Meta EXPIRENT : le front doit les rapatrier (mode
      // fetch) dans la foulée, jamais les stocker.
      const images = flattenInstagramMedia(body.data as InstagramMediaItem[]);
      return json(corsHeaders, { success: true, images });
    }

    return json(corsHeaders, { error: "mode invalide (scan | fetch | instagram)" }, 400);
  } catch (e) {
    if (e instanceof AuthError) {
      return json(corsHeaders, { error: e.message }, e.status);
    }
    console.error("site-photos-scan error:", e);
    const aborted = (e as Error)?.name === "AbortError";
    return json(corsHeaders, {
      error: aborted ? "Le site a mis trop de temps à répondre." : "Analyse impossible.",
    }, aborted ? 504 : 500);
  } finally {
    clearTimeout(timeout);
  }
});
