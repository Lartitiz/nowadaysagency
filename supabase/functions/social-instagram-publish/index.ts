// Publie sur le compte Instagram Business connecté :
//  - une image simple (body.imageUrl), ou
//  - un carrousel de 2 à 10 images (body.imageUrls[]).
// Toutes les images doivent être à une URL https publique (Instagram les cURL).
import { getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest, AuthError, getServiceClient } from "../_shared/auth.ts";

const GRAPH = "https://graph.instagram.com/v21.0";
const REFRESH_THRESHOLD_MS = 7 * 24 * 3600 * 1000;

async function refreshTokenIfNeeded(supabase: any, conn: any): Promise<string> {
  if (!conn.token_expires_at) return conn.access_token;
  const expiresAtMs = new Date(conn.token_expires_at).getTime();
  if (expiresAtMs - Date.now() > REFRESH_THRESHOLD_MS) return conn.access_token;

  const url = new URL("https://graph.instagram.com/refresh_access_token");
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", conn.access_token);
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    console.warn("IG refresh failed:", json);
    return conn.access_token; // keep going with current token
  }
  const newExpires = new Date(Date.now() + Number(json.expires_in || 60 * 24 * 3600) * 1000).toISOString();
  await supabase
    .from("social_connections")
    .update({ access_token: json.access_token, token_expires_at: newExpires })
    .eq("id", conn.id);
  return json.access_token as string;
}

async function pollStatus(creationId: string, token: string, maxMs = 30000): Promise<string> {
  const deadline = Date.now() + maxMs;
  let lastStatus = "UNKNOWN";
  while (Date.now() < deadline) {
    const u = new URL(`${GRAPH}/${creationId}`);
    u.searchParams.set("fields", "status_code");
    u.searchParams.set("access_token", token);
    const res = await fetch(u);
    const json = await res.json();
    lastStatus = json?.status_code || lastStatus;
    if (lastStatus === "FINISHED") return lastStatus;
    if (lastStatus === "ERROR" || lastStatus === "EXPIRED") return lastStatus;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return lastStatus;
}

// Crée un container média et renvoie son id (lève une Error avec le message Meta sinon).
async function createContainer(igUserId: string, token: string, params: Record<string, string>): Promise<string> {
  const u = new URL(`${GRAPH}/${igUserId}/media`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set("access_token", token);
  const res = await fetch(u, { method: "POST" });
  const json = await res.json();
  if (!res.ok || !json.id) throw new Error(json?.error?.message || "Création du média échouée.");
  return String(json.id);
}

async function publishContainer(igUserId: string, token: string, creationId: string): Promise<string> {
  const u = new URL(`${GRAPH}/${igUserId}/media_publish`);
  u.searchParams.set("creation_id", creationId);
  u.searchParams.set("access_token", token);
  const res = await fetch(u, { method: "POST" });
  const json = await res.json();
  if (!res.ok || !json.id) throw new Error(json?.error?.message || "Publication échouée.");
  return String(json.id);
}

function jsonError(message: string, corsHeaders: Record<string, string>, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId } = await authenticateRequest(req);
    const body = await req.json().catch(() => ({}));
    const caption: string = typeof body?.caption === "string" ? body.caption : "";
    const workspaceId: string | null = body?.workspace_id ?? null;

    // Liste d'images : imageUrls[] (carrousel) ou imageUrl (image simple).
    const rawList: unknown[] = Array.isArray(body?.imageUrls)
      ? body.imageUrls
      : (typeof body?.imageUrl === "string" ? [body.imageUrl] : []);
    const urls = rawList.filter((u): u is string => typeof u === "string" && /^https?:\/\//.test(u));

    if (urls.length === 0) {
      return jsonError("Au moins une URL d'image publique (https) est requise.", corsHeaders);
    }
    if (urls.length > 10) {
      return jsonError("Un carrousel Instagram accepte au maximum 10 images.", corsHeaders);
    }

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
      return jsonError("Aucun compte Instagram connecté. Connecte-le dans Paramètres > Connexions.", corsHeaders);
    }

    const token = await refreshTokenIfNeeded(supabase, conn);
    const igUserId = conn.platform_account_id;

    // 1. Préparer le container à publier (image simple ou carrousel).
    let creationId: string;
    try {
      if (urls.length === 1) {
        creationId = await createContainer(igUserId, token, {
          image_url: urls[0],
          ...(caption ? { caption } : {}),
        });
        const status = await pollStatus(creationId, token);
        if (status !== "FINISHED") {
          throw new Error(`Instagram n'a pas pu traiter l'image (status: ${status}).`);
        }
      } else {
        // Carrousel : un container enfant par image, puis le container CAROUSEL.
        const childIds: string[] = [];
        for (const url of urls) {
          childIds.push(await createContainer(igUserId, token, { image_url: url, is_carousel_item: "true" }));
        }
        for (const childId of childIds) {
          const st = await pollStatus(childId, token, 20000);
          if (st !== "FINISHED") {
            throw new Error(`Instagram n'a pas pu traiter une image du carrousel (status: ${st}).`);
          }
        }
        creationId = await createContainer(igUserId, token, {
          media_type: "CAROUSEL",
          children: childIds.join(","),
          ...(caption ? { caption } : {}),
        });
        const status = await pollStatus(creationId, token);
        if (status !== "FINISHED") {
          throw new Error(`Instagram n'a pas pu assembler le carrousel (status: ${status}).`);
        }
      }
    } catch (e: any) {
      return jsonError(e?.message || "Échec de la préparation du média.", corsHeaders);
    }

    // 2. Publier.
    let postId: string;
    try {
      postId = await publishContainer(igUserId, token, creationId);
    } catch (e: any) {
      return jsonError(e?.message || "Publication échouée.", corsHeaders);
    }

    const accountName = conn.platform_account_name;
    const permalink = accountName ? `https://www.instagram.com/${accountName}/` : null;

    return new Response(
      JSON.stringify({ success: true, postId, permalink }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    if (e instanceof AuthError) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: e.status, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }
    console.error("social-instagram-publish error:", e);
    return new Response(JSON.stringify({ error: "Erreur interne du serveur" }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
