// Cœur de publication Instagram (Graph API v21, "Instagram Business Login").
// Publie 1 image (post simple) ou 2-10 images (carrousel) à partir d'une connexion
// social_connections. Réutilisé par la publication programmée (social-publish-scheduled).
import { encryptToken } from "./token-crypto.ts";

const GRAPH = "https://graph.instagram.com/v23.0";
const REFRESH_THRESHOLD_MS = 7 * 24 * 3600 * 1000;

export async function refreshTokenIfNeeded(supabase: any, conn: any): Promise<string> {
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
    return conn.access_token;
  }
  const newExpires = new Date(Date.now() + Number(json.expires_in || 60 * 24 * 3600) * 1000).toISOString();
  await supabase
    .from("social_connections")
    .update({ access_token: await encryptToken(json.access_token), token_expires_at: newExpires })
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

/**
 * Publie 1 à 10 images publiques sur le compte Instagram de la connexion donnée.
 * Renvoie l'id du post publié. Lève une Error avec un message lisible sinon.
 */
export async function publishImagesToInstagram(
  supabase: any,
  conn: any,
  caption: string,
  imageUrls: string[],
): Promise<string> {
  if (!imageUrls || imageUrls.length === 0) throw new Error("Au moins une image publique est requise.");
  if (imageUrls.length > 10) throw new Error("Un carrousel Instagram accepte au maximum 10 images.");

  const token = await refreshTokenIfNeeded(supabase, conn);
  const igUserId = conn.platform_account_id;

  let creationId: string;
  if (imageUrls.length === 1) {
    creationId = await createContainer(igUserId, token, {
      image_url: imageUrls[0],
      ...(caption ? { caption } : {}),
    });
    const status = await pollStatus(creationId, token);
    if (status !== "FINISHED") throw new Error(`Instagram n'a pas pu traiter l'image (status: ${status}).`);
  } else {
    const childIds: string[] = [];
    for (const url of imageUrls) {
      childIds.push(await createContainer(igUserId, token, { image_url: url, is_carousel_item: "true" }));
    }
    for (const childId of childIds) {
      const st = await pollStatus(childId, token, 20000);
      if (st !== "FINISHED") throw new Error(`Instagram n'a pas pu traiter une image du carrousel (status: ${st}).`);
    }
    creationId = await createContainer(igUserId, token, {
      media_type: "CAROUSEL",
      children: childIds.join(","),
      ...(caption ? { caption } : {}),
    });
    const status = await pollStatus(creationId, token);
    if (status !== "FINISHED") throw new Error(`Instagram n'a pas pu assembler le carrousel (status: ${status}).`);
  }

  return await publishContainer(igUserId, token, creationId);
}
