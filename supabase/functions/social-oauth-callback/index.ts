// Public callback: receives ?code & ?state from Instagram, exchanges for a long-lived token,
// stores the connection (service-role), and redirects the browser back to the app.
import { getCorsHeaders } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/auth.ts";
import { verifyState } from "../_shared/oauth-state.ts";
import { encryptToken } from "../_shared/token-crypto.ts";

interface StatePayload {
  user_id: string;
  workspace_id: string | null;
  platform: "instagram" | "linkedin" | "canva" | "pinterest";
  origin: string;
  nonce: string;
  ts: number;
  /** PKCE : présent pour Canva, réutilisé à l'échange du code. */
  code_verifier?: string;
}

function redirect(url: string): Response {
  return new Response(null, { status: 302, headers: { Location: url } });
}

function errorRedirect(origin: string, message: string): Response {
  const u = new URL("/parametres/connexions", origin || "https://nowadays-assistant.fr");
  u.searchParams.set("connected", "error");
  u.searchParams.set("message", message);
  return redirect(u.toString());
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errParam = url.searchParams.get("error_description") || url.searchParams.get("error");

  const stateSecret = Deno.env.get("OAUTH_STATE_SECRET")!;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const fallbackOrigin =
    Deno.env.get("ALLOWED_ORIGIN") || "https://nowadays-assistant.fr";

  let payload: StatePayload | null = null;
  if (state) payload = (await verifyState<StatePayload>(state, stateSecret)) as any;
  const origin = payload?.origin || fallbackOrigin;

  if (errParam) return errorRedirect(origin, errParam);
  if (!code || !payload) return errorRedirect(origin, "Lien d'autorisation invalide ou expiré.");

  try {
    const redirectUri = `${supabaseUrl}/functions/v1/social-oauth-callback`;

    // Échange code -> jeton + lecture du compte, branché par plateforme.
    // Chaque branche produit le même `row` partiel (token, expiration, compte, scopes).
    let accountId = "";
    let accountName = "";
    let accessToken = "";
    let refreshToken: string | null = null;
    let expiresAt: string;
    let scopes: string;

    if (payload.platform === "canva") {
      const clientId = Deno.env.get("CANVA_CLIENT_ID")!;
      const clientSecret = Deno.env.get("CANVA_CLIENT_SECRET")!;
      if (!payload.code_verifier) {
        return errorRedirect(origin, "PKCE manquant pour Canva.");
      }

      // 1. Échange code -> tokens (client confidentiel : auth Basic + PKCE).
      const basic = btoa(`${clientId}:${clientSecret}`);
      const form = new URLSearchParams();
      form.set("grant_type", "authorization_code");
      form.set("code", code);
      form.set("code_verifier", payload.code_verifier);
      form.set("redirect_uri", redirectUri);
      const tokRes = await fetch("https://api.canva.com/rest/v1/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basic}`,
        },
        body: form.toString(),
      });
      const tokJson = await tokRes.json();
      if (!tokRes.ok || !tokJson.access_token) {
        console.error("Canva token error:", tokJson);
        return errorRedirect(origin, tokJson?.error_description || tokJson?.error || "Échange du code Canva échoué.");
      }
      accessToken = tokJson.access_token;
      // Jeton d'accès court (~4 h) → on garde le refresh_token (long) pour rafraîchir.
      refreshToken = tokJson.refresh_token || null;
      const expiresIn = Number(tokJson.expires_in || 4 * 3600);
      expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
      scopes = String(tokJson.scope || "design:content:write design:meta:read profile:read");

      // 2. Lecture du compte (id + nom d'affichage). Best-effort sur le nom.
      const meRes = await fetch("https://api.canva.com/rest/v1/users/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const meJson = await meRes.json();
      if (!meRes.ok) {
        console.error("Canva users/me error:", meJson);
        return errorRedirect(origin, meJson?.message || "Lecture du compte Canva échouée.");
      }
      accountId = String(meJson?.team_user?.user_id || meJson?.user_id || "");
      try {
        const profRes = await fetch("https://api.canva.com/rest/v1/users/me/profile", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const profJson = await profRes.json();
        accountName = String(profJson?.display_name || "Canva");
      } catch {
        accountName = "Canva";
      }
    } else if (payload.platform === "linkedin") {
      const clientId = Deno.env.get("LINKEDIN_CLIENT_ID")!;
      const clientSecret = Deno.env.get("LINKEDIN_CLIENT_SECRET")!;

      // 1. Échange code -> access token (~60 jours)
      const form = new URLSearchParams();
      form.set("grant_type", "authorization_code");
      form.set("code", code);
      form.set("redirect_uri", redirectUri);
      form.set("client_id", clientId);
      form.set("client_secret", clientSecret);
      const tokRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
      const tokJson = await tokRes.json();
      if (!tokRes.ok || !tokJson.access_token) {
        console.error("LinkedIn token error:", tokJson);
        return errorRedirect(origin, tokJson?.error_description || "Échange du code LinkedIn échoué.");
      }
      accessToken = tokJson.access_token;
      const expiresIn = Number(tokJson.expires_in || 60 * 24 * 3600);
      expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
      scopes = "openid profile w_member_social";

      // 2. Lecture du membre via OpenID Connect (sub = identifiant du membre).
      const meRes = await fetch("https://api.linkedin.com/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const meJson = await meRes.json();
      if (!meRes.ok || !meJson?.sub) {
        console.error("LinkedIn userinfo error:", meJson);
        return errorRedirect(origin, meJson?.message || "Lecture du compte LinkedIn échouée.");
      }
      accountId = String(meJson.sub);
      accountName = String(meJson.name || meJson.given_name || "LinkedIn");
    } else if (payload.platform === "pinterest") {
      const clientId = Deno.env.get("PINTEREST_CLIENT_ID")!;
      const clientSecret = Deno.env.get("PINTEREST_CLIENT_SECRET")!;

      // 1. Échange code -> tokens (client confidentiel : auth Basic).
      // Jeton d'accès court (~30 j) + refresh_token (~1 an) pour rafraîchir.
      const basic = btoa(`${clientId}:${clientSecret}`);
      const form = new URLSearchParams();
      form.set("grant_type", "authorization_code");
      form.set("code", code);
      form.set("redirect_uri", redirectUri);
      const tokRes = await fetch("https://api.pinterest.com/v5/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basic}`,
        },
        body: form.toString(),
      });
      const tokJson = await tokRes.json();
      if (!tokRes.ok || !tokJson.access_token) {
        console.error("Pinterest token error:", tokJson);
        return errorRedirect(origin, tokJson?.error_description || tokJson?.message || "Échange du code Pinterest échoué.");
      }
      accessToken = tokJson.access_token;
      refreshToken = tokJson.refresh_token || null;
      const expiresIn = Number(tokJson.expires_in || 30 * 24 * 3600);
      expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
      scopes = String(tokJson.scope || "user_accounts:read,boards:read,pins:read,pins:write");

      // 2. Lecture du compte (nom d'utilisateur).
      const meRes = await fetch("https://api.pinterest.com/v5/user_account", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const meJson = await meRes.json();
      if (!meRes.ok) {
        console.error("Pinterest user_account error:", meJson);
        return errorRedirect(origin, meJson?.message || "Lecture du compte Pinterest échouée.");
      }
      accountId = String(meJson?.username || "");
      accountName = String(meJson?.username || "Pinterest");
    } else {
      const appId = Deno.env.get("INSTAGRAM_APP_ID")!;
      const appSecret = Deno.env.get("INSTAGRAM_APP_SECRET")!;

      // 1. Exchange code -> short-lived token
      const form = new FormData();
      form.append("client_id", appId);
      form.append("client_secret", appSecret);
      form.append("grant_type", "authorization_code");
      form.append("redirect_uri", redirectUri);
      form.append("code", code);

      const shortRes = await fetch("https://api.instagram.com/oauth/access_token", {
        method: "POST",
        body: form,
      });
      const shortJson = await shortRes.json();
      if (!shortRes.ok || !shortJson.access_token) {
        console.error("IG short-token error:", shortJson);
        return errorRedirect(origin, shortJson?.error_message || "Échange du code échoué.");
      }
      const shortToken: string = shortJson.access_token;

      // 2. Exchange short -> long-lived token (~60 days)
      const longUrl = new URL("https://graph.instagram.com/access_token");
      longUrl.searchParams.set("grant_type", "ig_exchange_token");
      longUrl.searchParams.set("client_secret", appSecret);
      longUrl.searchParams.set("access_token", shortToken);
      const longRes = await fetch(longUrl);
      const longJson = await longRes.json();
      if (!longRes.ok || !longJson.access_token) {
        console.error("IG long-token error:", longJson);
        return errorRedirect(origin, longJson?.error?.message || "Échange du jeton long échoué.");
      }
      accessToken = longJson.access_token;
      const expiresIn: number = Number(longJson.expires_in || 60 * 24 * 3600);
      expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
      scopes = "instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights";

      // 3. Fetch account info
      const meUrl = new URL("https://graph.instagram.com/v23.0/me");
      meUrl.searchParams.set("fields", "user_id,username");
      meUrl.searchParams.set("access_token", accessToken);
      const meRes = await fetch(meUrl);
      const meJson = await meRes.json();
      if (!meRes.ok) {
        console.error("IG me error:", meJson);
        return errorRedirect(origin, meJson?.error?.message || "Lecture du compte IG échouée.");
      }
      accountId = String(meJson.user_id || "");
      accountName = String(meJson.username || "");
    }

    // Upsert connection (service-role)
    const supabase = getServiceClient();
    const row = {
      user_id: payload.user_id,
      workspace_id: payload.workspace_id,
      platform: payload.platform,
      platform_account_id: accountId,
      platform_account_name: accountName,
      access_token: await encryptToken(accessToken),
      refresh_token: await encryptToken(refreshToken),
      token_expires_at: expiresAt,
      scopes,
      updated_at: new Date().toISOString(),
    };

    // Manual upsert because UNIQUE indexes are partial (separate for ws null / not null).
    const filterCol = payload.workspace_id ? "workspace_id" : "user_id";
    const filterVal = payload.workspace_id || payload.user_id;
    let query = supabase
      .from("social_connections")
      .select("id")
      .eq("platform", payload.platform)
      .eq(filterCol, filterVal);
    if (payload.workspace_id) query = query.eq("user_id", payload.user_id);
    else query = query.is("workspace_id", null);
    const { data: existing } = await query.maybeSingle();

    if (existing?.id) {
      const { error: upErr } = await supabase
        .from("social_connections")
        .update(row)
        .eq("id", existing.id);
      if (upErr) throw upErr;
    } else {
      const { error: insErr } = await supabase.from("social_connections").insert(row);
      if (insErr) throw insErr;
    }

    const success = new URL("/parametres/connexions", origin);
    success.searchParams.set("connected", payload.platform);
    return redirect(success.toString());
  } catch (e: any) {
    console.error("social-oauth-callback error:", e);
    return errorRedirect(origin, e?.message || "Erreur interne lors de la connexion.");
  }
});
