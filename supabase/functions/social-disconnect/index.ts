// Deletes a social connection for the current user/workspace.
import { getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest, AuthError, getServiceClient } from "../_shared/auth.ts";

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
    let q = supabase
      .from("social_connections")
      .delete()
      .eq("platform", platform)
      .eq(filterCol, filterVal);
    if (workspaceId) q = q.eq("user_id", userId);
    else q = q.is("workspace_id", null);
    const { error } = await q;
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
