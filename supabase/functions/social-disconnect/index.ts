// Deletes a social connection for the current user/workspace.
// Pour Canva, on révoque d'abord le token côté Canva (best-effort) avant de
// supprimer la ligne, afin de ne laisser aucun accès actif après déconnexion.
import { getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest, AuthError, getServiceClient } from "../_shared/auth.ts";

// Révoque un token OAuth Canva (client confidentiel : auth Basic).
// Révoquer le refresh_token invalide toute l'autorisation (access + refresh).
async function revokeCanvaToken(token: string | null): Promise<void> {
  if (!token) return;
  const clientId = Deno.env.get("CANVA_CLIENT_ID");
  const clientSecret = Deno.env.get("CANVA_CLIENT_SECRET");
  if (!clientId || !clientSecret) return;
  const basic = btoa(`${clientId}:${clientSecret}`);
  const form = new URLSearchParams();
  form.set("token", token);
  const res = await fetch("https://api.canva.com/rest/v1/oauth/revoke", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: form.toString(),
  });
  if (!res.ok) {
    // Best-effort : on log mais on n'empêche pas la suppression locale.
    console.warn("Canva revoke failed:", res.status, await res.text().catch(() => ""));
  }
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId } = await authenticateRequest(req);
    const body = await req.json().catch(() => ({}));
    const platform: string = body?.platform;
    const workspaceId: string | null = body?.workspace_id ?? null;

    if (!["instagram", "linkedin", "canva", "pinterest"].includes(platform)) {
      return new Response(JSON.stringify({ error: "Plateforme invalide." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = getServiceClient();
    const filterCol = workspaceId ? "workspace_id" : "user_id";
    const filterVal = workspaceId || userId;
    // Filtres communs à la lecture (révocation) et à la suppression.
    const applyScope = (builder: any) => {
      let b = builder.eq("platform", platform).eq(filterCol, filterVal);
      b = workspaceId ? b.eq("user_id", userId) : b.is("workspace_id", null);
      return b;
    };

    // Canva : révoquer le token côté Canva avant de supprimer la ligne.
    if (platform === "canva") {
      const { data: conn } = await applyScope(
        supabase.from("social_connections").select("access_token, refresh_token"),
      ).maybeSingle();
      if (conn) {
        try {
          await revokeCanvaToken(conn.refresh_token || conn.access_token);
        } catch (revokeErr) {
          console.warn("Canva revoke error (ignored):", revokeErr);
        }
      }
    }

    const { error } = await applyScope(supabase.from("social_connections").delete());
    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    if (e instanceof AuthError) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: e.status, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }
    console.error("social-disconnect error:", e);
    return new Response(JSON.stringify({ error: "Erreur interne du serveur" }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
