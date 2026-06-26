// Cœur de publication Pinterest (API v5). Réutilise une connexion social_connections
// (platform = 'pinterest'). Particularités vs Instagram/LinkedIn :
//  - les jetons expirent vite (~30 j) et se rafraîchissent avec un refresh_token (~1 an) ;
//  - l'échange/rafraîchissement du jeton se fait en HTTP Basic auth (client_id:client_secret) ;
//  - une épingle va TOUJOURS dans un tableau précis (board_id obligatoire).
const PIN_API = "https://api.pinterest.com/v5";
const TOKEN_URL = `${PIN_API}/oauth/token`;
// On rafraîchit dès qu'il reste moins de ~3 jours sur le jeton d'accès (durée de vie ~30 j).
const REFRESH_THRESHOLD_MS = 3 * 24 * 3600 * 1000;

function basicAuthHeader(): string {
  const id = Deno.env.get("PINTEREST_CLIENT_ID");
  const secret = Deno.env.get("PINTEREST_CLIENT_SECRET");
  if (!id || !secret) throw new Error("Configuration Pinterest incomplète (client id/secret).");
  return "Basic " + btoa(`${id}:${secret}`);
}

/** Permalink lisible vers une épingle à partir de son id. */
export function pinterestPermalink(pinId: string): string {
  return `https://www.pinterest.com/pin/${pinId}/`;
}

/**
 * Renvoie un access_token valide, en le rafraîchissant via le refresh_token si le jeton
 * courant arrive à expiration. Met à jour la connexion en base le cas échéant.
 */
export async function refreshPinterestTokenIfNeeded(supabase: any, conn: any): Promise<string> {
  const expiresAtMs = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  if (expiresAtMs && expiresAtMs - Date.now() > REFRESH_THRESHOLD_MS) return conn.access_token;
  if (!conn.refresh_token) return conn.access_token; // pas de refresh possible : on tente le jeton tel quel

  const form = new URLSearchParams();
  form.set("grant_type", "refresh_token");
  form.set("refresh_token", conn.refresh_token);

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    console.warn("Pinterest refresh failed:", json);
    return conn.access_token;
  }

  const newExpires = new Date(Date.now() + Number(json.expires_in || 30 * 24 * 3600) * 1000).toISOString();
  const update: Record<string, unknown> = {
    access_token: json.access_token,
    token_expires_at: newExpires,
  };
  // Pinterest peut renvoyer un nouveau refresh_token (rotation) ; sinon on garde l'ancien.
  if (json.refresh_token) update.refresh_token = json.refresh_token;
  await supabase.from("social_connections").update(update).eq("id", conn.id);
  return json.access_token as string;
}

export interface PinterestBoard {
  id: string;
  name: string;
}

/** Liste les tableaux du compte connecté (pour le sélecteur de destination). */
export async function listPinterestBoards(supabase: any, conn: any): Promise<PinterestBoard[]> {
  const token = await refreshPinterestTokenIfNeeded(supabase, conn);
  const u = new URL(`${PIN_API}/boards`);
  u.searchParams.set("page_size", "100");
  const res = await fetch(u, { headers: { Authorization: `Bearer ${token}` } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("Jeton Pinterest expiré ou invalide. Reconnecte Pinterest dans Paramètres > Connexions.");
    }
    throw new Error(json?.message || `Lecture des tableaux Pinterest échouée (HTTP ${res.status}).`);
  }
  return ((json?.items as any[]) || []).map((b) => ({ id: String(b.id), name: String(b.name || "Tableau") }));
}

export interface PublishPinInput {
  boardId: string;
  imageUrls: string[]; // 1 image = épingle simple ; 2+ = carrousel (multiple_image_urls)
  title?: string;
  description?: string;
  link?: string;
  altText?: string;
}

/**
 * Publie une épingle (image simple ou carrousel) sur le tableau donné.
 * Renvoie l'id de l'épingle créée. Lève une Error avec un message lisible sinon.
 */
export async function publishPinToPinterest(
  supabase: any,
  conn: any,
  input: PublishPinInput,
): Promise<string> {
  const images = (input.imageUrls || []).filter(
    (u): u is string => typeof u === "string" && /^https?:\/\//.test(u),
  );
  if (images.length === 0) throw new Error("Au moins une image publique est requise pour l'épingle.");
  if (!input.boardId) throw new Error("Un tableau de destination est requis pour publier sur Pinterest.");

  const token = await refreshPinterestTokenIfNeeded(supabase, conn);

  const media_source =
    images.length === 1
      ? { source_type: "image_url", url: images[0] }
      : { source_type: "multiple_image_urls", items: images.slice(0, 5).map((url) => ({ url })) };

  const body: Record<string, unknown> = {
    board_id: input.boardId,
    media_source,
  };
  if (input.title) body.title = input.title.slice(0, 100);
  if (input.description) body.description = input.description.slice(0, 500);
  if (input.link) body.link = input.link;
  if (input.altText) body.alt_text = input.altText.slice(0, 500);

  const res = await fetch(`${PIN_API}/pins`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.id) {
    if (res.status === 401) {
      throw new Error("Jeton Pinterest expiré ou invalide. Reconnecte Pinterest dans Paramètres > Connexions.");
    }
    throw new Error(json?.message || `Publication Pinterest échouée (HTTP ${res.status}).`);
  }
  return String(json.id);
}
