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

// ─────────────────────────────────────────────────────────────────────────────
// Carrousel natif LinkedIn = un DOCUMENT PDF publié via l'API versionnée /rest.
// (Les images restent sur /v2/ugcPosts ; seuls les documents passent par /rest.)
const LINKEDIN_VERSION = "202401";
const REST_DOCUMENTS_INIT_URL = "https://api.linkedin.com/rest/documents?action=initializeUpload";
const REST_POSTS_URL = "https://api.linkedin.com/rest/posts";

/** Vrai si l'URL pointe vers un PDF (→ carrousel document LinkedIn). */
export function isLinkedInPdfUrl(url: unknown): url is string {
  return typeof url === "string" && /^https?:\/\//.test(url) && /\.pdf(\?|$)/i.test(url);
}

/**
 * Échappe le texte pour le champ `commentary` de l'API /rest/posts (format « Little Text ») :
 * les caractères réservés doivent être préfixés d'un backslash, sinon l'API rejette/affiche mal.
 */
function escapeLinkedInCommentary(text: string): string {
  return (text || "").replace(/[\\|{}@\[\]()<>#*_~]/g, (ch) => "\\" + ch);
}

/**
 * Publie un DOCUMENT (PDF) sur LinkedIn → s'affiche en CARROUSEL natif (swipe) dans le fil.
 * Flux : /rest/documents initializeUpload → upload du PDF → /rest/posts content.media.
 * Renvoie l'URN du post créé.
 */
export async function publishDocumentToLinkedIn(conn: any, text: string, pdfUrl: string, title?: string): Promise<string> {
  const memberId = conn?.platform_account_id;
  if (!memberId) throw new Error("Identifiant du membre LinkedIn manquant. Reconnecte LinkedIn.");
  if (!isLinkedInPdfUrl(pdfUrl)) throw new Error("Aucun PDF valide à publier en carrousel LinkedIn.");
  const author = `urn:li:person:${memberId}`;
  const restHeaders = {
    Authorization: `Bearer ${conn.access_token}`,
    "Content-Type": "application/json",
    "X-Restli-Protocol-Version": "2.0.0",
    "LinkedIn-Version": LINKEDIN_VERSION,
  };

  // 1) Récupère le PDF.
  const pdfRes = await fetch(pdfUrl);
  if (!pdfRes.ok) throw new Error("PDF inaccessible pour la publication LinkedIn.");
  const pdfBytes = new Uint8Array(await pdfRes.arrayBuffer());

  // 2) initializeUpload : LinkedIn renvoie une uploadUrl + l'URN du document.
  const initRes = await fetch(REST_DOCUMENTS_INIT_URL, {
    method: "POST",
    headers: restHeaders,
    body: JSON.stringify({ initializeUploadRequest: { owner: author } }),
  });
  const initJson = await initRes.json().catch(() => ({}));
  if (!initRes.ok) {
    if (initRes.status === 401) throw new Error("Jeton LinkedIn expiré ou invalide. Reconnecte LinkedIn dans Paramètres > Connexions.");
    throw new Error(initJson?.message || `Échec de l'init du document LinkedIn (HTTP ${initRes.status}).`);
  }
  const uploadUrl = initJson?.value?.uploadUrl;
  const documentUrn = initJson?.value?.document;
  if (!uploadUrl || !documentUrn) throw new Error("LinkedIn n'a pas renvoyé d'URL d'upload pour le document.");

  // 3) Upload du PDF vers l'uploadUrl signée.
  const upRes = await fetch(uploadUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${conn.access_token}`, "Content-Type": "application/octet-stream" },
    body: pdfBytes,
  });
  if (!upRes.ok) throw new Error(`Échec de l'envoi du PDF vers LinkedIn (HTTP ${upRes.status}).`);

  // 4) Crée le post document (carrousel).
  const payload = {
    author,
    commentary: escapeLinkedInCommentary((text || "").trim()),
    visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    content: { media: { id: documentUrn, title: (title || "Carrousel").slice(0, 100) } },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
  const postRes = await fetch(REST_POSTS_URL, { method: "POST", headers: restHeaders, body: JSON.stringify(payload) });
  if (!postRes.ok) {
    const j = await postRes.json().catch(() => ({}));
    if (postRes.status === 401) throw new Error("Jeton LinkedIn expiré ou invalide. Reconnecte LinkedIn dans Paramètres > Connexions.");
    throw new Error(String(j?.message || `Publication du carrousel LinkedIn échouée (HTTP ${postRes.status}).`));
  }
  const urn = postRes.headers.get("x-restli-id") || postRes.headers.get("x-linkedin-id");
  if (!urn) throw new Error("LinkedIn n'a pas renvoyé d'identifiant de post.");
  return String(urn);
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
