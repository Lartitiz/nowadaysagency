// Publication programmée (Instagram image/carrousel + LinkedIn texte). Appelée toutes
// les ~5 min par le cron (public.trigger_publish_due_posts) avec la clé service-role en
// bearer, OU manuellement par un admin (pour tester). Publie les posts du calendrier dont
// la date de publication auto est échue, selon leur canal, et met à jour leur statut.
import { getCorsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { publishImagesToInstagram, publishReelToInstagram } from "../_shared/instagram-graph.ts";
import { publishTextToLinkedIn, publishImagesToLinkedIn, publishDocumentToLinkedIn, isLinkedInImageUrl, isLinkedInPdfUrl } from "../_shared/linkedin-graph.ts";
import { decryptConnTokens } from "../_shared/token-crypto.ts";

// E-mail best-effort quand une publication programmée échoue : sans lui, la
// cliente ne l'apprend qu'en rouvrant son calendrier — elle croit avoir publié.
// Ne lève jamais (la notification ne doit pas casser le traitement du cron).
export async function notifyPublishFailure(
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

// Cœur du traitement (hors auth/CORS/HTTP), extrait pour être testable en
// injectant un client Supabase factice — le comportement est inchangé.
export async function processScheduledPosts(supabase: any): Promise<{ processed: number; results: any[] }> {
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
    .select("id, workspace_id, user_id, canal, theme, content_draft, media_urls, scheduled_publish_at, story_sequence_detail")
    .eq("auto_publish", true)
    .eq("publish_status", "scheduled")
    .in("canal", ["instagram", "linkedin"])
    .lte("scheduled_publish_at", nowIso)
    .limit(20);
  if (dueErr) throw dueErr;

  const results: any[] = [];

  // Légende réelle du post : un carrousel sauvegardé en brouillon garde le
  // dump « SLIDE 1 : … » dans content_draft (édité tel quel dans le dialog
  // calendrier) alors que la vraie légende vit dans story_sequence_detail.
  // Sans ce choix, le dump des slides partait TEL QUEL en légende.
  const resolveCaption = (post: any): string => {
    const draft = (post?.content_draft || "").trim();
    const detail = post?.story_sequence_detail;
    const cap = detail && typeof detail === "object" ? (detail as any).caption : null;
    let capText = typeof cap === "string"
      ? cap.trim()
      : cap && typeof cap === "object"
        ? [cap.hook, cap.body, cap.cta].filter(Boolean).join("\n\n").trim()
        : "";
    if (capText && cap && typeof cap === "object" && Array.isArray(cap.hashtags) && cap.hashtags.length) {
      capText += "\n\n" + cap.hashtags.map((h: unknown) => `#${String(h).replace(/^#/, "")}`).join(" ");
    }
    const looksLikeSlideDump = /^\s*(?:📌\s*)?SLIDE\s*\d+\s*[:.–-]/i.test(draft) || /\n\s*(?:📌\s*)?SLIDE\s*\d+\s*[:.–-]/i.test(draft);
    // Une légende éditée à la main dans le calendrier reste prioritaire — on ne
    // bascule sur la légende structurée que si le draft est vide ou est un dump.
    if (capText && (looksLikeSlideDump || !draft)) return capText;
    return draft;
  };

  for (const post of due || []) {
    // Verrou optimiste : passe à 'publishing' seulement si encore 'scheduled' (anti double-publi).
    const { data: claimed, error: claimError } = await supabase
      .from("calendar_posts")
      .update({ publish_status: "publishing", updated_at: new Date().toISOString() })
      .eq("id", post.id)
      .eq("publish_status", "scheduled")
      .select("id")
      .maybeSingle();
    // Sans danger si cet échec est transitoire : le post reste 'scheduled' et sera
    // retenté au prochain passage du cron.
    if (claimError) console.error(`social-publish-scheduled: échec verrou post ${post.id}:`, claimError);
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
        const publicUrls = (post.media_urls || []).filter(
          (u: unknown): u is string => typeof u === "string" && /^https?:\/\//.test(u),
        );
        // Un reel monté vit dans media_urls comme les images : sans ce tri il
        // partirait en `image_url` et Instagram refuserait le média.
        const isMp4 = (u: string) => /\.mp4(\?|$)/i.test(u);
        const videoUrl = publicUrls.find(isMp4);
        const imageUrls = publicUrls.filter((u: string) => !isMp4(u));
        if (videoUrl) {
          postId = await publishReelToInstagram(supabase, conn, post.content_draft || "", videoUrl);
        } else {
          if (imageUrls.length === 0) throw new Error("Aucun média public à publier.");
          postId = await publishImagesToInstagram(supabase, conn, post.content_draft || "", imageUrls);
        }
      }

      const { error: publishedError } = await supabase
        .from("calendar_posts")
        .update({
          publish_status: "published",
          published_post_id: postId,
          published_at: new Date().toISOString(),
          publish_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", post.id);
      // Ne PAS jeter ici : la publication externe a déjà réussi (postId obtenu) —
      // marquer 'failed' ferait retenter et publierait EN DOUBLE sur le réseau.
      if (publishedError) console.error(`social-publish-scheduled: post ${post.id} publié mais échec marquage 'published':`, publishedError);
      results.push({ id: post.id, ok: true, postId });
    } catch (e: any) {
      const errMsg = String(e?.message || e).slice(0, 500);
      const { error: failedError } = await supabase
        .from("calendar_posts")
        .update({
          publish_status: "failed",
          publish_error: errMsg,
          updated_at: new Date().toISOString(),
        })
        .eq("id", post.id);
      if (failedError) console.error(`social-publish-scheduled: échec marquage 'failed' pour ${post.id}:`, failedError);
      await notifyPublishFailure(supabase, post, errMsg);
      results.push({ id: post.id, ok: false, error: errMsg });
    }
  }

  return { processed: results.length, results };
}

// Gardé par import.meta.main : évite de démarrer un serveur HTTP (accès réseau)
// quand ce module est simplement importé, notamment par index_test.ts.
if (import.meta.main) {
  Deno.serve(handleRequest);
}

async function handleRequest(req: Request): Promise<Response> {
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
    const result = await processScheduledPosts(supabase);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("social-publish-scheduled error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Erreur interne" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}
