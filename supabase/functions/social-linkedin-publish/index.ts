// Publie un post sur le profil LinkedIn du membre connecté.
// body.text = légende ; body.media_urls (optionnel) : images → post IMAGE, PDF → carrousel document.
import { getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest, AuthError, getServiceClient } from "../_shared/auth.ts";
import { publishTextToLinkedIn, publishImagesToLinkedIn, publishDocumentToLinkedIn, isLinkedInImageUrl, isLinkedInPdfUrl, linkedInPermalink } from "../_shared/linkedin-graph.ts";

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
    const text: string = typeof body?.text === "string" ? body.text : "";
    const mediaUrls: string[] = Array.isArray(body?.media_urls) ? body.media_urls : [];
    const imageUrls = mediaUrls.filter(isLinkedInImageUrl);
    const pdfUrl = mediaUrls.find(isLinkedInPdfUrl) || null;
    const title: string = typeof body?.title === "string" ? body.title : "Carrousel";
    const workspaceId: string | null = body?.workspace_id ?? null;

    if (!text.trim() && imageUrls.length === 0 && !pdfUrl) {
      return jsonError("Ajoute du texte, une image ou un PDF pour publier sur LinkedIn.", corsHeaders);
    }

    const supabase = getServiceClient();
    const filterCol = workspaceId ? "workspace_id" : "user_id";
    const filterVal = workspaceId || userId;
    let q = supabase
      .from("social_connections")
      .select("*")
      .eq("platform", "linkedin")
      .eq(filterCol, filterVal);
    if (workspaceId) q = q.eq("user_id", userId);
    else q = q.is("workspace_id", null);
    const { data: conn, error: connErr } = await q.maybeSingle();

    if (connErr || !conn) {
      return jsonError("Aucun compte LinkedIn connecté. Connecte-le dans Paramètres > Connexions.", corsHeaders);
    }

    let postId: string;
    try {
      postId = pdfUrl
        ? await publishDocumentToLinkedIn(conn, text, pdfUrl, title)
        : imageUrls.length > 0
          ? await publishImagesToLinkedIn(conn, text, imageUrls)
          : await publishTextToLinkedIn(conn, text);
    } catch (e: any) {
      return jsonError(e?.message || "Publication LinkedIn échouée.", corsHeaders);
    }

    return new Response(
      JSON.stringify({ success: true, postId, permalink: linkedInPermalink(postId) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    if (e instanceof AuthError) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: e.status, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }
    console.error("social-linkedin-publish error:", e);
    return new Response(JSON.stringify({ error: "Erreur interne du serveur" }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
