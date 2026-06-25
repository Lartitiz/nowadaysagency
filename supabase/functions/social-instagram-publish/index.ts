// Publish a single image + caption to the user's Instagram Business account.
// Phase 1: one publicly-accessible image URL.
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

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId } = await authenticateRequest(req);
    const body = await req.json().catch(() => ({}));
    const caption: string = typeof body?.caption === "string" ? body.caption : "";
    const imageUrl: string = typeof body?.imageUrl === "string" ? body.imageUrl : "";
    const workspaceId: string | null = body?.workspace_id ?? null;

    if (!imageUrl || !/^https?:\/\//.test(imageUrl)) {
      return new Response(
        JSON.stringify({ error: "Une URL d'image publique (https) est requise." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
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
      return new Response(
        JSON.stringify({ error: "Aucun compte Instagram connecté. Connecte-le dans Paramètres > Connexions." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const token = await refreshTokenIfNeeded(supabase, conn);
    const igUserId = conn.platform_account_id;

    // 1. Create media container
    const createUrl = new URL(`${GRAPH}/${igUserId}/media`);
    createUrl.searchParams.set("image_url", imageUrl);
    if (caption) createUrl.searchParams.set("caption", caption);
    createUrl.searchParams.set("access_token", token);
    const createRes = await fetch(createUrl, { method: "POST" });
    const createJson = await createRes.json();
    if (!createRes.ok || !createJson.id) {
      const msg = createJson?.error?.message || "Création du média échouée.";
      return new Response(JSON.stringify({ error: msg, details: createJson?.error }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const creationId = String(createJson.id);

    // 2. Poll status
    const status = await pollStatus(creationId, token);
    if (status !== "FINISHED") {
      return new Response(
        JSON.stringify({ error: `Instagram n'a pas pu traiter l'image (status: ${status}).` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 3. Publish
    const pubUrl = new URL(`${GRAPH}/${igUserId}/media_publish`);
    pubUrl.searchParams.set("creation_id", creationId);
    pubUrl.searchParams.set("access_token", token);
    const pubRes = await fetch(pubUrl, { method: "POST" });
    const pubJson = await pubRes.json();
    if (!pubRes.ok || !pubJson.id) {
      const msg = pubJson?.error?.message || "Publication échouée.";
      return new Response(JSON.stringify({ error: msg, details: pubJson?.error }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const postId = String(pubJson.id);
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
