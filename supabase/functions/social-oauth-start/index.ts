// Build the Instagram Business Login authorization URL for the current user.
import { getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest, AuthError } from "../_shared/auth.ts";
import { signState, generateCodeVerifier, codeChallengeS256 } from "../_shared/oauth-state.ts";

const IG_SCOPES = "instagram_business_basic,instagram_business_content_publish";
// OpenID Connect + partage sur le profil membre (les anciens r_liteprofile/r_emailaddress
// sont supprimés depuis 2026). w_member_social = publier au nom du membre.
const LI_SCOPES = "openid profile w_member_social";
// Canva Connect : importer un design (PPTX) + lire son URL d'édition + le profil.
const CANVA_SCOPES =
  "design:content:read design:content:write design:meta:read asset:read asset:write profile:read";

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

    if (platform !== "instagram" && platform !== "linkedin" && platform !== "canva") {
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
        : platform === "linkedin"
        ? new URL("https://www.linkedin.com/oauth/v2/authorization")
        : new URL("https://www.instagram.com/oauth/authorize");
    url.searchParams.set("client_id", appId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set(
      "scope",
      platform === "canva" ? CANVA_SCOPES : platform === "linkedin" ? LI_SCOPES : IG_SCOPES,
    );
    url.searchParams.set("state", state);
    if (platform === "canva" && codeVerifier) {
      url.searchParams.set("code_challenge", await codeChallengeS256(codeVerifier));
      url.searchParams.set("code_challenge_method", "s256");
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
