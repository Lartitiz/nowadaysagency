// Publication programmée Instagram. Appelée toutes les ~5 min par le cron
// (public.trigger_publish_due_posts) avec la clé service-role en bearer, OU
// manuellement par un admin (pour tester). Publie les posts du calendrier dont la
// date de publication auto est échue, et met à jour leur statut.
import { getCorsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { publishImagesToInstagram } from "../_shared/instagram-graph.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // ─── AUTH : clé service-role (cron/interne) OU JWT d'un user admin (test manuel) ───
  const authHeader = req.headers.get("Authorization") || "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "");
  let authorized = false;
  if (bearer && bearer === serviceRoleKey) {
    authorized = true;
  } else if (bearer) {
    try {
      const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
      const { data: userData, error: userErr } = await anonClient.auth.getUser(bearer);
      if (!userErr && userData.user) {
        const { data: roleRow } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userData.user.id)
          .eq("role", "admin")
          .maybeSingle();
        if (roleRow) authorized = true;
      }
    } catch (_) { /* fall through */ }
  }
  if (!authorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const nowIso = new Date().toISOString();

    // Posts dus : auto-publication échue, en attente, Instagram, avec image(s).
    const { data: due, error: dueErr } = await supabase
      .from("calendar_posts")
      .select("id, workspace_id, user_id, canal, content_draft, media_urls, scheduled_publish_at")
      .eq("auto_publish", true)
      .eq("publish_status", "scheduled")
      .eq("canal", "instagram")
      .lte("scheduled_publish_at", nowIso)
      .limit(20);
    if (dueErr) throw dueErr;

    const results: any[] = [];

    for (const post of due || []) {
      // Verrou optimiste : passe à 'publishing' seulement si encore 'scheduled' (anti double-publi).
      const { data: claimed } = await supabase
        .from("calendar_posts")
        .update({ publish_status: "publishing", updated_at: new Date().toISOString() })
        .eq("id", post.id)
        .eq("publish_status", "scheduled")
        .select("id")
        .maybeSingle();
      if (!claimed) continue;

      try {
        const imageUrls = (post.media_urls || []).filter(
          (u: unknown): u is string => typeof u === "string" && /^https?:\/\//.test(u),
        );
        if (imageUrls.length === 0) throw new Error("Aucune image publique à publier.");

        // Connexion Instagram du workspace/owner du post (même logique que social-instagram-publish).
        let q = supabase.from("social_connections").select("*").eq("platform", "instagram");
        if (post.workspace_id) q = q.eq("workspace_id", post.workspace_id).eq("user_id", post.user_id);
        else q = q.eq("user_id", post.user_id).is("workspace_id", null);
        const { data: conn } = await q.maybeSingle();
        if (!conn) throw new Error("Aucun compte Instagram connecté pour ce workspace.");

        const postId = await publishImagesToInstagram(supabase, conn, post.content_draft || "", imageUrls);

        await supabase
          .from("calendar_posts")
          .update({
            publish_status: "published",
            published_post_id: postId,
            published_at: new Date().toISOString(),
            publish_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", post.id);
        results.push({ id: post.id, ok: true, postId });
      } catch (e: any) {
        await supabase
          .from("calendar_posts")
          .update({
            publish_status: "failed",
            publish_error: String(e?.message || e).slice(0, 500),
            updated_at: new Date().toISOString(),
          })
          .eq("id", post.id);
        results.push({ id: post.id, ok: false, error: String(e?.message || e) });
      }
    }

    return new Response(
      JSON.stringify({ processed: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("social-publish-scheduled error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Erreur interne" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
