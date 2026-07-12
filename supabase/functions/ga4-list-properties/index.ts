// Liste les propriétés Google Analytics (GA4) accessibles à l'utilisatrice via sa
// connexion OAuth Google (per-user, Phase 2). Sert au sélecteur affiché quand la
// connexion existe mais qu'aucune propriété n'a encore été choisie (ex. compte
// Google avec plusieurs propriétés GA4).
import { getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest, AuthError, getServiceClient } from "../_shared/auth.ts";
import { decryptConnTokens, encryptToken } from "../_shared/token-crypto.ts";
import { accountSummaries, resolveGoogleUserToken } from "../_shared/ga4.ts";

function jsonError(message: string, corsHeaders: Record<string, string>, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId } = await authenticateRequest(req);
    const body = await req.json().catch(() => ({}));
    const workspaceId: string | null = body?.workspace_id ?? null;

    const supabase = getServiceClient();
    const resolved = await resolveGoogleUserToken(supabase, userId, workspaceId, {
      decryptConnTokens,
      encryptToken,
    });
    if (!resolved.conn) {
      return jsonError("Google Analytics n'est pas connecté sur ce compte.", corsHeaders, 404);
    }
    if (!resolved.accessToken) {
      // Connexion par compte de service (Phase 1) : pas de sélecteur possible.
      return jsonError(
        "Cette connexion Google utilise un compte de service : la sélection de propriété n'est pas disponible.",
        corsHeaders,
        409,
      );
    }

    const properties = await accountSummaries(resolved.accessToken);
    return new Response(
      JSON.stringify({
        properties: properties.map((p) => ({
          propertyId: p.propertyId,
          displayName: p.displayName,
          account: p.accountName,
        })),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    if (e instanceof AuthError) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: e.status,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }
    console.error("ga4-list-properties error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Erreur interne du serveur" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
