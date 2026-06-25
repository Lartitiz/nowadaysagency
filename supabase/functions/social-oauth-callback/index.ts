// Public callback: receives ?code & ?state from Instagram, exchanges for a long-lived token,
// stores the connection (service-role), and redirects the browser back to the app.
import { getCorsHeaders } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/auth.ts";
import { verifyState } from "../_shared/oauth-state.ts";

interface StatePayload {
  user_id: string;
  workspace_id: string | null;
  platform: "instagram";
  origin: string;
  nonce: string;
  ts: number;
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
  const appId = Deno.env.get("INSTAGRAM_APP_ID")!;
  const appSecret = Deno.env.get("INSTAGRAM_APP_SECRET")!;
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
    const longToken: string = longJson.access_token;
    const expiresIn: number = Number(longJson.expires_in || 60 * 24 * 3600);
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // 3. Fetch account info
    const meUrl = new URL("https://graph.instagram.com/v21.0/me");
    meUrl.searchParams.set("fields", "user_id,username");
    meUrl.searchParams.set("access_token", longToken);
    const meRes = await fetch(meUrl);
    const meJson = await meRes.json();
    if (!meRes.ok) {
      console.error("IG me error:", meJson);
      return errorRedirect(origin, meJson?.error?.message || "Lecture du compte IG échouée.");
    }

    // 4. Upsert connection (service-role)
    const supabase = getServiceClient();
    const row = {
      user_id: payload.user_id,
      workspace_id: payload.workspace_id,
      platform: "instagram" as const,
      platform_account_id: String(meJson.user_id || ""),
      platform_account_name: String(meJson.username || ""),
      access_token: longToken,
      token_expires_at: expiresAt,
      scopes: "instagram_business_basic,instagram_business_content_publish",
      updated_at: new Date().toISOString(),
    };

    // Manual upsert because UNIQUE indexes are partial (separate for ws null / not null).
    const filterCol = payload.workspace_id ? "workspace_id" : "user_id";
    const filterVal = payload.workspace_id || payload.user_id;
    let query = supabase
      .from("social_connections")
      .select("id")
      .eq("platform", "instagram")
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
    success.searchParams.set("connected", "instagram");
    return redirect(success.toString());
  } catch (e: any) {
    console.error("social-oauth-callback error:", e);
    return errorRedirect(origin, e?.message || "Erreur interne lors de la connexion.");
  }
});
