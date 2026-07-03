// Publication programmée (Instagram image/carrousel + LinkedIn texte). Appelée toutes
// les ~5 min par le cron (public.trigger_publish_due_posts) avec la clé service-role en
// bearer, OU manuellement par un admin (pour tester). Publie les posts du calendrier dont
// la date de publication auto est échue, selon leur canal, et met à jour leur statut.
import { getCorsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { publishImagesToInstagram } from "../_shared/instagram-graph.ts";
import { publishTextToLinkedIn, publishImagesToLinkedIn, publishDocumentToLinkedIn, isLinkedInImageUrl, isLinkedInPdfUrl } from "../_shared/linkedin-graph.ts";
import { decryptConnTokens } from "../_shared/token-crypto.ts";

// E-mail best-effort quand une publication programmée échoue : sans lui, la
// cliente ne l'apprend qu'en rouvrant son calendrier — elle croit avoir publié.
// Ne lève jamais (la notification ne doit pas casser le traitement du cron).
async function notifyPublishFailure(
  supabase: any,
  post: { id: string; user_id: string; canal: string; theme?: string | null },
  errMsg: string,
  interrupted = false,
) {
  try {
    const { data: userData } = await supabase.auth.admin.getUserById(post.user_id);
    const email = userData?.user?.email;
    if (!email) return;
    const reseau = post.canal === "linkedin" ? "LinkedIn" : "Instagram";
    const titre = (post.theme || "").trim().slice(0, 90);
    const consigne = interrupted
      ? "La publication a été interrompue par un incident technique. <strong>Vérifie d'abord sur ton compte si le post est parti</strong>, puis reprogramme-le si besoin."
      : "Tu peux réessayer depuis ton calendrier — et si le message parle de connexion expirée, reconnecte ton compte dans Paramètres &gt; Connexions.";
    const html = `
      <div style="font-family:Georgia,serif;max-width:540px;margin:0 auto;color:#2a2a2a;line-height:1.6;">
        <p>Hello,</p>
        <p>Ta publication automatique ${reseau}${titre ? ` « ${titre} »` : ""} n'est pas partie comme prévu.</p>
        ${errMsg ? `<p style="background:#fdf2f5;border-left:3px solid #fb3d80;padding:10px 14px;border-radius:4px;">${errMsg}</p>` : ""}
        <p>${consigne}</p>
        <p style="margin:24px 0;">
          <a href="https://nowadays-assistant.fr/calendrier" style="background:#fb3d80;color:#fff;padding:11px 22px;border-radius:999px;text-decoration:none;font-weight:bold;">Ouvrir mon calendrier</a>
        </p>
        <p>— L'Assistant Com'</p>
      </div>`;
    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: email,
        subject: `⚠️ Ta publication ${reseau} n'est pas partie`,
        html,
        from_name: "L'Assistant Com'",
        user_id: post.user_id,
      }),
    });
  } catch (e) {
    console.error("notifyPublishFailure failed:", e);
  }
}

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

    // Filet de sécurité : un post resté en 'publishing' (edge interrompue en plein vol :
    // timeout, crash, redéploiement) ne serait JAMAIS retenté ni marqué en échec — il
    // resterait coincé là, invisible. Au bout de 15 min on le bascule en 'failed' avec un
    // message clair. On ne le republie PAS automatiquement : la publication a pu aboutir
    // côté réseau juste avant le crash, et un retry aveugle créerait un doublon public.
    const staleCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: staleRecovered, error: staleErr } = await supabase
      .from("calendar_posts")
      .update({
        publish_status: "failed",
        publish_error:
          "Publication interrompue par un incident technique. Vérifie sur ton réseau si le post est parti, puis reprogramme-le si besoin.",
        updated_at: nowIso,
      })
      .eq("auto_publish", true)
      .eq("publish_status", "publishing")
      .lt("updated_at", staleCutoff)
      .select("id, user_id, canal, theme");
    if (staleErr) console.error("stale publishing recovery failed:", staleErr);
    for (const p of staleRecovered || []) {
      await notifyPublishFailure(supabase, p, "", true);
    }

    // Posts dus : auto-publication échue, en attente, sur un canal publiable (Instagram ou LinkedIn).
    const { data: due, error: dueErr } = await supabase
      .from("calendar_posts")
      .select("id, workspace_id, user_id, canal, theme, content_draft, media_urls, scheduled_publish_at")
      .eq("auto_publish", true)
      .eq("publish_status", "scheduled")
      .in("canal", ["instagram", "linkedin"])
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
        const platform = post.canal === "linkedin" ? "linkedin" : "instagram";

        // Connexion du workspace/owner du post pour la bonne plateforme.
        let q = supabase.from("social_connections").select("*").eq("platform", platform);
        if (post.workspace_id) q = q.eq("workspace_id", post.workspace_id).eq("user_id", post.user_id);
        else q = q.eq("user_id", post.user_id).is("workspace_id", null);
        const { data: conn } = await q.maybeSingle();
        if (!conn) {
          throw new Error(
            platform === "linkedin"
              ? "Aucun compte LinkedIn connecté pour ce workspace."
              : "Aucun compte Instagram connecté pour ce workspace.",
          );
        }
        await decryptConnTokens(conn);

        let postId: string;
        if (platform === "linkedin") {
          const text = (post.content_draft || "").trim();
          const media = (post.media_urls || []) as string[];
          const pdf = media.find(isLinkedInPdfUrl);
          const liImages = media.filter(isLinkedInImageUrl);
          if (pdf) {
            // PDF → carrousel natif LinkedIn (document).
            postId = await publishDocumentToLinkedIn(conn, text, pdf, post.theme || "Carrousel");
          } else if (liImages.length > 0) {
            postId = await publishImagesToLinkedIn(conn, text, liImages);
          } else if (text) {
            postId = await publishTextToLinkedIn(conn, text);
          } else {
            throw new Error("Aucun contenu à publier sur LinkedIn.");
          }
        } else {
          const imageUrls = (post.media_urls || []).filter(
            (u: unknown): u is string => typeof u === "string" && /^https?:\/\//.test(u),
          );
          if (imageUrls.length === 0) throw new Error("Aucune image publique à publier.");
          postId = await publishImagesToInstagram(supabase, conn, post.content_draft || "", imageUrls);
        }

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
        const errMsg = String(e?.message || e).slice(0, 500);
        await supabase
          .from("calendar_posts")
          .update({
            publish_status: "failed",
            publish_error: errMsg,
            updated_at: new Date().toISOString(),
          })
          .eq("id", post.id);
        await notifyPublishFailure(supabase, post, errMsg);
        results.push({ id: post.id, ok: false, error: errMsg });
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
