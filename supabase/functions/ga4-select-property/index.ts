// Fixe la propriété GA4 choisie par l'utilisatrice sur sa connexion Google
// (per-user, Phase 2). Valide que la propriété fait bien partie de celles
// accessibles avec SON jeton (anti-usurpation), puis écrit platform_account_id
// (+ nom d'affichage) sur la ligne social_connections.
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
    // Normalise : on stocke l'id numérique, sans le préfixe "properties/".
    const propertyId = String(body?.propertyId ?? body?.property_id ?? "")
      .trim()
      .replace(/^properties\//, "");
    if (!propertyId) {
      return jsonError("propertyId manquant.", corsHeaders, 400);
    }

    const supabase = getServiceClient();
    const resolved = await resolveGoogleUserToken(supabase, userId, workspaceId, {
      decryptConnTokens,
      encryptToken,
    });
    if (!resolved.conn) {
      return jsonError("Google Analytics n'est pas connecté sur ce compte.", corsHeaders, 404);
    }
    if (!resolved.accessToken) {
      return jsonError(
        "Cette connexion Google utilise un compte de service : la sélection de propriété n'est pas disponible.",
        corsHeaders,
        409,
      );
    }

    // Validation : la propriété doit être accessible avec le jeton de l'appelant.
    const properties = await accountSummaries(resolved.accessToken);
    const match = properties.find((p) => p.propertyId === propertyId);
    if (!match) {
      return jsonError("Cette propriété n'est pas accessible avec ton compte Google.", corsHeaders, 403);
    }

    const { error: upErr } = await supabase
      .from("social_connections")
      .update({
        platform_account_id: match.propertyId,
        platform_account_name: match.displayName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", resolved.conn.id);
    if (upErr) throw upErr;

    return new Response(
      JSON.stringify({ success: true, propertyId: match.propertyId, displayName: match.displayName }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    if (e instanceof AuthError) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: e.status,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }
    console.error("ga4-select-property error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Erreur interne du serveur" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
