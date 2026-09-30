import { decryptConnTokens } from "./token-crypto.ts";
import { refreshTokenIfNeeded } from "./instagram-graph.ts";
import { fetchInstagramInsights } from "./instagram-insights.ts";
import { fetchLinkedInInsights } from "./linkedin-insights.ts";

export interface SocialDiagnosticEvidence {
  text: string;
  images: { base64: string; mediaType: string }[];
  sources: string[];
  failed: string[];
}

const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

function scopedConnectionQuery(supabase: any, userId: string, workspaceId: string | null, platform: string) {
  let query = supabase.from("social_connections").select("*")
    .eq("user_id", userId).eq("platform", platform);
  query = workspaceId ? query.eq("workspace_id", workspaceId) : query.is("workspace_id", null);
  return query.maybeSingle();
}

async function getConnected(supabase: any, userId: string, workspaceId: string | null, platform: string) {
  const { data, error } = await scopedConnectionQuery(supabase, userId, workspaceId, platform);
  if (error || !data) return null;
  await decryptConnTokens(data);
  return data;
}

async function graphJson(url: URL, signal: AbortSignal): Promise<any> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Meta HTTP ${response.status}`);
  return response.json();
}

async function readMediaImage(url: string, signal: AbortSignal) {
  const target = new URL(url);
  if (target.protocol !== "https:") return null;
  const response = await fetch(target, { signal });
  if (!response.ok) return null;
  const type = response.headers.get("content-type")?.split(";")[0];
  if (type !== "image/jpeg" && type !== "image/png" && type !== "image/webp") return null;
  const declaredSize = Number(response.headers.get("content-length"));
  if (declaredSize > 1_500_000) return null;
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > 1_500_000) return null;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return { mediaType: type, base64: btoa(binary) };
}

/** Only returns evidence that was actually fetched. A connection row alone is never a source. */
export async function readSocialDiagnosticEvidence(
  supabase: any, userId: string, workspaceId: string | null, signal: AbortSignal,
): Promise<SocialDiagnosticEvidence> {
  const result: SocialDiagnosticEvidence = { text: "", images: [], sources: [], failed: [] };
  const sections: string[] = [];
  const [ig, li, liAnalytics] = await Promise.all([
    getConnected(supabase, userId, workspaceId, "instagram").catch(() => null),
    getConnected(supabase, userId, workspaceId, "linkedin").catch(() => null),
    getConnected(supabase, userId, workspaceId, "linkedin_analytics").catch(() => null),
  ]);

  if (ig) {
    if (!String(ig.scopes || "").includes("instagram_business_basic") || !ig.platform_account_id) {
      result.failed.push("instagram_connected");
    } else {
      try {
        const token = await refreshTokenIfNeeded(supabase, ig);
        const base = new URL(`https://graph.instagram.com/v23.0/${encodeURIComponent(ig.platform_account_id)}`);
        base.searchParams.set("fields", "username,name,biography,website");
        base.searchParams.set("access_token", token);
        const media = new URL(`https://graph.instagram.com/v23.0/${encodeURIComponent(ig.platform_account_id)}/media`);
        media.searchParams.set("fields", "id,caption,media_type,media_url,thumbnail_url,timestamp,permalink");
        media.searchParams.set("limit", "6");
        media.searchParams.set("access_token", token);
        const [profile, posts] = await Promise.all([
          graphJson(base, signal).catch(() => null),
          graphJson(media, signal).catch(() => null),
        ]);
        const lines: string[] = [];
        let hasContentEvidence = false;
        if (nonEmpty(profile?.username)) lines.push(`Compte : @${profile.username}`);
        if (nonEmpty(profile?.name)) lines.push(`Nom affiché : ${profile.name}`);
        if (nonEmpty(profile?.biography)) { lines.push(`Bio : ${profile.biography}`); hasContentEvidence = true; }
        if (nonEmpty(profile?.website)) { lines.push(`Lien en bio : ${profile.website}`); hasContentEvidence = true; }
        const rows = Array.isArray(posts?.data) ? posts.data : [];
        for (const [index, post] of rows.entries()) {
          const parts = [`Publication ${index + 1}`];
          if (nonEmpty(post.media_type)) parts.push(`format ${post.media_type}`);
          if (nonEmpty(post.timestamp)) parts.push(`date ${post.timestamp}`);
          if (nonEmpty(post.caption)) { parts.push(`légende « ${post.caption.slice(0, 700)} »`); hasContentEvidence = true; }
          lines.push(parts.join(" ; "));
        }
        for (const post of rows.slice(0, 2)) {
          const imageUrl = post.media_type === "VIDEO" ? post.thumbnail_url : post.media_url;
          if (nonEmpty(imageUrl)) {
            const image = await readMediaImage(imageUrl, signal).catch(() => null);
            if (image) { result.images.push(image); hasContentEvidence = true; }
          }
        }
        if (hasContentEvidence) {
          result.sources.push("instagram_connected");
          sections.push(`=== SOURCE: INSTAGRAM_CONNECTÉ (profil, ${rows.length} publications récupérées, ${result.images.length} visuels lus) ===\n${lines.join("\n")}`);
        } else {
          result.failed.push("instagram_connected");
        }
        if (String(ig.scopes || "").includes("instagram_business_manage_insights")) {
          const metrics = await fetchInstagramInsights(supabase, ig).catch(() => null);
          const statLines: string[] = [];
          if (typeof metrics?.followers === "number") statLines.push(`Abonnés à la lecture : ${metrics.followers}`);
          if (typeof metrics?.reach30d === "number") statLines.push(`Portée unique sur 28 jours : ${metrics.reach30d}`);
          if (statLines.length) {
            result.sources.push("instagram_insights");
            sections.push(`=== SOURCE: INSTAGRAM_STATISTIQUES (fenêtres indiquées, données partielles possibles) ===\n${statLines.join("\n")}`);
          } else result.failed.push("instagram_insights");
        } else result.failed.push("instagram_insights");
      } catch {
        result.failed.push("instagram_connected");
      }
    }
  }

  // The publishing connection provides identity and publishing only. A name is
  // not an analysis of a LinkedIn profile or its posts.
  if (li && !liAnalytics) result.failed.push("linkedin_analytics");
  if (liAnalytics) {
    const scopes = String(liAnalytics.scopes || "");
    if (!scopes.includes("r_member_postAnalytics") || !scopes.includes("r_member_profileAnalytics")) {
      result.failed.push("linkedin_analytics");
    } else {
      const metrics = await fetchLinkedInInsights(liAnalytics).catch(() => null);
      const lines: string[] = [];
      if (typeof metrics?.followers === "number") lines.push(`Abonnés à la lecture : ${metrics.followers}`);
      if (typeof metrics?.followersGained30d === "number") lines.push(`Nouveaux abonnés sur 30 jours : ${metrics.followersGained30d}`);
      for (const [key, label] of [
        ["impressions", "Impressions"], ["reactions", "Réactions"],
        ["comments", "Commentaires"], ["reshares", "Repartages"],
      ]) {
        const value = metrics?.postAnalytics30d?.[key as keyof typeof metrics.postAnalytics30d];
        if (typeof value === "number") lines.push(`${label} des posts sur 30 jours : ${value}`);
      }
      if (lines.length) {
        result.sources.push("linkedin_analytics");
        sections.push(`=== SOURCE: LINKEDIN_ANALYTICS (agrégats de 30 jours ; aucun texte de profil ou publication) ===\n${lines.join("\n")}`);
      } else result.failed.push("linkedin_analytics");
    }
  }
  result.text = sections.join("\n\n");
  return result;
}
