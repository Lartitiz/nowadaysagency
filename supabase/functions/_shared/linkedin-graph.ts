// Cœur de publication LinkedIn (texte) pour un membre, via l'API ugcPosts.
// Réutilise une connexion social_connections (platform = 'linkedin') dont
// platform_account_id contient le `sub` OpenID Connect du membre.
//
// On utilise /v2/ugcPosts (et non /rest/posts) : shareCommentary.text accepte du
// texte BRUT, sans l'échappement « Little Text » des caractères ( ) [ ] @ * etc.
// Indispensable pour du copywriting FR avec parenthèses, hashtags et emojis.
// (Le passage à /rest/posts viendra avec l'ajout des images/carrousels.)

const UGC_POSTS_URL = "https://api.linkedin.com/v2/ugcPosts";

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
