// Cœur de publication LinkedIn (texte) pour un membre, via l'API ugcPosts.
// Réutilise une connexion social_connections (platform = 'linkedin') dont
// platform_account_id contient le `sub` OpenID Connect du membre.
//
// On utilise /v2/ugcPosts (et non /rest/posts) : shareCommentary.text accepte du
// texte BRUT, sans l'échappement « Little Text » des caractères ( ) [ ] @ * etc.
// Indispensable pour du copywriting FR avec parenthèses, hashtags et emojis.
// (Le passage à /rest/posts viendra avec l'ajout des images/carrousels.)

const UGC_POSTS_URL = "https://api.linkedin.com/v2/ugcPosts";
const ASSETS_REGISTER_URL = "https://api.linkedin.com/v2/assets?action=registerUpload";

/** Vrai si l'URL ressemble à une image bitmap publiable (exclut les PDF). */
export function isLinkedInImageUrl(url: unknown): url is string {
  return typeof url === "string" && /^https?:\/\//.test(url) && /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url);
}

/**
 * Enregistre puis téléverse une image vers LinkedIn (flux assets registerUpload),
 * renvoie l'URN de l'asset (urn:li:digitalmediaAsset:...) prêt à attacher à un post.
 */
async function uploadImageAsset(conn: any, author: string, imageUrl: string): Promise<string> {
  // 1) Octets de l'image (URL publique calendar-media).
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error("Image inaccessible pour la publication LinkedIn.");
  const bytes = new Uint8Array(await imgRes.arrayBuffer());
  const contentType = imgRes.headers.get("content-type") || "image/jpeg";

  // 2) registerUpload : LinkedIn renvoie une uploadUrl signée + l'URN de l'asset.
  const regRes = await fetch(ASSETS_REGISTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${conn.access_token}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      registerUploadRequest: {
        recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
        owner: author,
        serviceRelationships: [
          { relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" },
        ],
      },
    }),
  });
  const regJson = await regRes.json().catch(() => ({}));
  if (!regRes.ok) {
    if (regRes.status === 401) throw new Error("Jeton LinkedIn expiré ou invalide. Reconnecte LinkedIn dans Paramètres > Connexions.");
    throw new Error(regJson?.message || `Échec de l'enregistrement de l'image LinkedIn (HTTP ${regRes.status}).`);
  }
  const uploadUrl =
    regJson?.value?.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]?.uploadUrl;
  const asset = regJson?.value?.asset;
  if (!uploadUrl || !asset) throw new Error("LinkedIn n'a pas renvoyé d'URL d'upload pour l'image.");

  // 3) Téléverse le binaire vers l'uploadUrl signée.
  const upRes = await fetch(uploadUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${conn.access_token}`, "Content-Type": contentType },
    body: bytes,
  });
  if (!upRes.ok) throw new Error(`Échec de l'envoi de l'image vers LinkedIn (HTTP ${upRes.status}).`);
  return String(asset);
}

/**
 * Publie un post IMAGE (1 à 9 images) sur le profil LinkedIn du membre connecté.
 * Conserve le texte BRUT (ugcPosts, pas d'échappement « Little Text »).
 * Renvoie l'URN du post créé.
 */
export async function publishImagesToLinkedIn(conn: any, text: string, imageUrls: string[]): Promise<string> {
  const memberId = conn?.platform_account_id;
  if (!memberId) throw new Error("Identifiant du membre LinkedIn manquant. Reconnecte LinkedIn.");
  const urls = (imageUrls || []).filter(isLinkedInImageUrl).slice(0, 9); // LinkedIn limite à 9 images.
  if (urls.length === 0) throw new Error("Aucune image publique à publier sur LinkedIn.");
  const author = `urn:li:person:${memberId}`;

  const assets: string[] = [];
  for (const url of urls) assets.push(await uploadImageAsset(conn, author, url));

  const payload = {
    author,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text: (text || "").trim() },
        shareMediaCategory: "IMAGE",
        media: assets.map((a) => ({ status: "READY", media: a })),
      },
    },
    visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
  };

  const res = await fetch(UGC_POSTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${conn.access_token}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) throw new Error("Jeton LinkedIn expiré ou invalide. Reconnecte LinkedIn dans Paramètres > Connexions.");
    throw new Error(String(json?.message || json?.error_description || `Publication LinkedIn (image) échouée (HTTP ${res.status}).`));
  }
  const urn = json?.id || res.headers.get("x-restli-id");
  if (!urn) throw new Error("LinkedIn n'a pas renvoyé d'identifiant de post.");
  return String(urn);
}

/** Permalink lisible vers un post à partir de son URN (urn:li:share:... ou urn:li:ugcPost:...). */
export function linkedInPermalink(urn: string): string {
  return `https://www.linkedin.com/feed/update/${urn}/`;
}

/**
 * Publie un post texte sur le profil LinkedIn du membre connecté.
 * Renvoie l'URN du post créé. Lève une Error avec un message lisible sinon.
 */
export async function publishTextToLinkedIn(conn: any, text: string): Promise<string> {
  const body = (text || "").trim();
  if (!body) throw new Error("Le texte du post LinkedIn est vide.");

  const memberId = conn?.platform_account_id;
  if (!memberId) throw new Error("Identifiant du membre LinkedIn manquant. Reconnecte LinkedIn.");
  const author = `urn:li:person:${memberId}`;

  const payload = {
    author,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text: body },
        shareMediaCategory: "NONE",
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  };

  const res = await fetch(UGC_POSTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${conn.access_token}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(payload),
  });

  // L'URN du post est renvoyé dans le corps (champ `id`) et/ou l'en-tête x-restli-id.
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      json?.message ||
      json?.error_description ||
      res.headers.get("x-li-uuid") ||
      `Publication LinkedIn échouée (HTTP ${res.status}).`;
    // 401 / token expiré : message orienté reconnexion.
    if (res.status === 401) {
      throw new Error("Jeton LinkedIn expiré ou invalide. Reconnecte LinkedIn dans Paramètres > Connexions.");
    }
    throw new Error(String(message));
  }

  const urn = json?.id || res.headers.get("x-restli-id");
  if (!urn) throw new Error("LinkedIn n'a pas renvoyé d'identifiant de post.");
  return String(urn);
}
