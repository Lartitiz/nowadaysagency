// Publie une épingle (image simple ou carrousel) sur un tableau Pinterest du compte connecté.
// Body attendu : { board_id, image_url | image_urls[], title?, description?, link?, alt_text?, workspace_id? }
import { getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest, AuthError, getServiceClient } from "../_shared/auth.ts";
import { publishPinToPinterest, pinterestPermalink } from "../_shared/pinterest-graph.ts";
import { decryptConnTokens } from "../_shared/token-crypto.ts";

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
    const boardId: string = typeof body?.board_id === "string" ? body.board_id : "";
    const imageUrls: string[] = Array.isArray(body?.image_urls)
      ? body.image_urls
      : typeof body?.image_url === "string"
      ? [body.image_url]
      : [];
    const title: string = typeof body?.title === "string" ? body.title : "";
    const description: string = typeof body?.description === "string" ? body.description : "";
    const link: string = typeof body?.link === "string" ? body.link : "";
    const altText: string = typeof body?.alt_text === "string" ? body.alt_text : "";
    const workspaceId: string | null = body?.workspace_id ?? null;

    if (!boardId) return jsonError("Un tableau de destination est requis.", corsHeaders);
    if (imageUrls.length === 0) return jsonError("Au moins une image publique est requise.", corsHeaders);

    const supabase = getServiceClient();
    const filterCol = workspaceId ? "workspace_id" : "user_id";
    const filterVal = workspaceId || userId;
    let q = supabase
      .from("social_connections")
      .select("*")
      .eq("platform", "pinterest")
      .eq(filterCol, filterVal);
    if (workspaceId) q = q.eq("user_id", userId);
    else q = q.is("workspace_id", null);
    const { data: conn, error: connErr } = await q.maybeSingle();

    if (connErr || !conn) {
      return jsonError("Aucun compte Pinterest connecté. Connecte-le dans Paramètres > Connexions.", corsHeaders);
    }
    await decryptConnTokens(conn);

    let pinId: string;
    try {
      pinId = await publishPinToPinterest(supabase, conn, {
        boardId,
        imageUrls,
        title,
        description,
        link,
        altText,
      });
    } catch (e: any) {
      return jsonError(e?.message || "Publication Pinterest échouée.", corsHeaders);
    }

    return new Response(
      JSON.stringify({ success: true, postId: pinId, permalink: pinterestPermalink(pinId) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    if (e instanceof AuthError) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: e.status, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }
    console.error("social-pinterest-publish error:", e);
    return new Response(JSON.stringify({ error: "Erreur interne du serveur" }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
