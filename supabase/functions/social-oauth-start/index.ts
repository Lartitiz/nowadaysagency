// Build the Instagram Business Login authorization URL for the current user.
import { getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest, AuthError } from "../_shared/auth.ts";
import { signState, generateCodeVerifier, codeChallengeS256 } from "../_shared/oauth-state.ts";

// instagram_business_manage_insights = lire les stats du compte + des posts (reach,
// engagement, croissance d'abonnés) pour nourrir l'audit avec des données réelles.
// ⚠️ Permission en accès avancé : nécessite une revue Meta (App Review).
const IG_SCOPES =
  "instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights";
// OpenID Connect + partage sur le profil membre (les anciens r_liteprofile/r_emailaddress
// sont supprimés depuis 2026). w_member_social = publier au nom du membre.
const LI_SCOPES = "openid profile w_member_social";
// Connexion LinkedIn ANALYTICS — app développeur distincte de la publication
// ("Nowadays Assistant Analytics", Community Management API, Development Tier).
// r_basicprofile (pas openid/profile : non approuvés sur cette app) identifie le
// membre connecté ; r_member_postAnalytics + r_member_profileAnalytics lisent les
// stats réelles (posts + abonnés). Aucun droit de publication.
const LI_ANALYTICS_SCOPES = "r_basicprofile r_member_postAnalytics r_member_profileAnalytics";
// Canva Connect — scopes au strict minimum (exigence review Canva) :
// - design:content:write : importer le carrousel PPTX (POST /url-imports)
// - design:meta:read     : lire l'URL d'édition du design créé (GET /designs/{id})
// - profile:read         : afficher le compte Canva connecté (GET /users/me)
// (design:content:read, asset:read, asset:write retirés : jamais appelés — l'import
//  passe par une URL publique, pas par l'API Assets.)
const CANVA_SCOPES =
  "design:content:write design:meta:read profile:read";
// Pinterest API v5 : lire le compte + les tableaux, et créer des épingles. Scopes séparés par des virgules.
const PI_SCOPES = "user_accounts:read,boards:read,pins:read,pins:write";
// Google Analytics : lecture seule des rapports GA4. Scope minimal (le compte est
// nommé via la propriété GA4, pas via l'email) → moins de friction à la validation
// Google. Doit correspondre EXACTEMENT au scope déclaré sur l'écran de consentement.
const GOOGLE_SCOPES = "https://www.googleapis.com/auth/analytics.readonly";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId } = await authenticateRequest(req);
    const body = await req.json().catch(() => ({}));
    const platform = body?.platform;
    const workspaceId: string | null = body?.workspace_id ?? null;
    const returnTo: string | null =
      typeof body?.return_to === "string" ? body.return_to : null;

    if (
      platform !== "instagram" &&
      platform !== "linkedin" &&
      platform !== "linkedin_analytics" &&
      platform !== "canva" &&
      platform !== "pinterest" &&
      platform !== "google"
    ) {
      return new Response(JSON.stringify({ error: "Plateforme non supportée pour l'instant." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const appId =
      platform === "canva"
        ? Deno.env.get("CANVA_CLIENT_ID")
        : platform === "linkedin"
        ? Deno.env.get("LINKEDIN_CLIENT_ID")
        : platform === "linkedin_analytics"
        ? Deno.env.get("LINKEDIN_ANALYTICS_CLIENT_ID")
        : platform === "pinterest"
        ? Deno.env.get("PINTEREST_CLIENT_ID")
        : platform === "google"
        ? Deno.env.get("GOOGLE_CLIENT_ID")
        : Deno.env.get("INSTAGRAM_APP_ID");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const stateSecret = Deno.env.get("OAUTH_STATE_SECRET");
    if (!appId || !supabaseUrl || !stateSecret) {
      return new Response(JSON.stringify({ error: "Configuration serveur incomplète." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Origin of the app for the post-callback redirect.
    const origin =
      returnTo ||
      req.headers.get("origin") ||
      req.headers.get("referer")?.replace(/\/[^/]*$/, "") ||
      Deno.env.get("ALLOWED_ORIGIN") ||
      "https://nowadays-assistant.fr";

    const redirectUri = `${supabaseUrl}/functions/v1/social-oauth-callback`;

    // Canva impose PKCE : on génère un code_verifier qu'on transporte (signé) dans
    // le state pour le réutiliser à l'échange du code côté callback.
    const codeVerifier = platform === "canva" ? generateCodeVerifier() : undefined;

    const state = await signState(
      {
        user_id: userId,
        workspace_id: workspaceId,
        platform,
        origin,
        nonce: crypto.randomUUID(),
        ts: Date.now(),
        ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
      },
      stateSecret,
    );

    const url =
      platform === "canva"
        ? new URL("https://www.canva.com/api/oauth/authorize")
        : platform === "linkedin" || platform === "linkedin_analytics"
        ? new URL("https://www.linkedin.com/oauth/v2/authorization")
        : platform === "pinterest"
        ? new URL("https://www.pinterest.com/oauth/")
        : platform === "google"
        ? new URL("https://accounts.google.com/o/oauth2/v2/auth")
        : new URL("https://www.instagram.com/oauth/authorize");
    url.searchParams.set("client_id", appId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set(
      "scope",
      platform === "canva"
        ? CANVA_SCOPES
        : platform === "linkedin"
        ? LI_SCOPES
        : platform === "linkedin_analytics"
        ? LI_ANALYTICS_SCOPES
        : platform === "pinterest"
        ? PI_SCOPES
        : platform === "google"
        ? GOOGLE_SCOPES
        : IG_SCOPES,
    );
    url.searchParams.set("state", state);
    if (platform === "canva" && codeVerifier) {
      url.searchParams.set("code_challenge", await codeChallengeS256(codeVerifier));
      url.searchParams.set("code_challenge_method", "s256");
    }
    if (platform === "google") {
      // access_type=offline + prompt=select_account consent : force Google à
      // renvoyer un refresh_token à CHAQUE autorisation ET à demander le compte.
      url.searchParams.set("access_type", "offline");
      url.searchParams.set("prompt", "select_account consent");
      url.searchParams.set("include_granted_scopes", "true");
    }

    return new Response(JSON.stringify({ url: url.toString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    if (e instanceof AuthError) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: e.status,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }
    console.error("social-oauth-start error:", e);
    return new Response(JSON.stringify({ error: "Erreur interne du serveur" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
