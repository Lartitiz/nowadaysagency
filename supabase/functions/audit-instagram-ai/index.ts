import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORE_PRINCIPLES } from "../_shared/copywriting-prompts.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS } from "../_shared/user-context.ts";
import { checkQuota, logUsage, quotaDeniedResponse } from "../_shared/plan-limiter.ts";
import { callAnthropic, callAnthropicSimple, getModelForAction } from "../_shared/anthropic.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { isDemoUser } from "../_shared/guard-demo.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
import { BASE_SYSTEM_RULES } from "../_shared/base-prompts.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const AuditInstagramSchema = z.object({
  auditTextData: z.object({
    displayName: z.string().optional().nullable(),
    username: z.string().optional().nullable(),
    bio: z.string().optional().nullable(),
    bioLink: z.string().optional().nullable(),
    photoDescription: z.string().optional().nullable(),
    highlights: z.array(z.string()).optional().nullable(),
    highlightsCount: z.number().optional().nullable(),
    pinnedPosts: z.array(z.object({ description: z.string() })).optional().nullable(),
    feedDescription: z.string().optional().nullable(),
    followers: z.number().optional().nullable(),
    postsPerMonth: z.number().optional().nullable(),
    frequency: z.string().optional().nullable(),
    pillars: z.array(z.string()).optional().nullable(),
    bestPostUrls: z.array(z.string()).optional().nullable(),
    worstPostUrls: z.array(z.string()).optional().nullable(),
    bestPostsComment: z.string().optional().nullable(),
    worstPostsComment: z.string().optional().nullable(),
  }).optional().nullable(),
  screenshotImages: z.array(z.object({ data: z.string(), media_type: z.string() })).optional(),
  screenshotUrls: z.array(z.string()).optional().nullable(),
  successPostsData: z.array(z.record(z.unknown())).optional().nullable(),
  failPostsData: z.array(z.record(z.unknown())).optional().nullable(),
  workspace_id: z.string().uuid().optional().nullable(),
  // Legacy fields
  bestContent: z.string().optional().nullable(),
  worstContent: z.string().optional().nullable(),
  rhythm: z.string().optional().nullable(),
  objective: z.string().optional().nullable(),
  profileUrl: z.string().optional().nullable(),
}).passthrough();

async function fetchImageAsBase64(url: string): Promise<{ data: string; media_type: string } | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const buffer = await resp.arrayBuffer();
    
    // Skip images larger than 3MB to avoid Edge Function memory/timeout issues
    if (buffer.byteLength > 3 * 1024 * 1024) {
      console.log(`Skipping image too large: ${buffer.byteLength} bytes`);
      return null;
    }
    
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    const contentType = resp.headers.get("content-type") || "image/jpeg";
    const mediaType = contentType.includes("png") ? "image/png" : "image/jpeg";
    return { data: base64, media_type: mediaType };
  } catch (e) {
    console.error("Failed to fetch image:", url, e);
    return null;
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentification requise" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Authentification invalide" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Guard: demo user cannot trigger real AI calls
    if (isDemoUser(user.id)) {
      return new Response(JSON.stringify({ error: "Demo mode: this feature is simulated" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Rate limit check
    const rateCheck = checkRateLimit(user.id);
    if (!rateCheck.allowed) return rateLimitResponse(rateCheck.retryAfterMs!, corsHeaders);

    const rawBody = await req.json();
    const parseResult = AuditInstagramSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return new Response(
        JSON.stringify({ error: "Données invalides", details: parseResult.error.issues.map(i => i.message).join(", ") }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const body = parseResult.data;
    const { auditTextData: atd, screenshotImages, successPostsData, failPostsData, workspace_id } = body;
    // Legacy fields (optional)
    const { bestContent: bc, worstContent: wc, rhythm: rh, objective: obj, profileUrl: pu } = body;

    // Check quota
    const quotaCheck = await checkQuota(user.id, "audit", workspace_id);
    if (!quotaCheck.allowed) {
      return quotaDeniedResponse(quotaCheck, corsHeaders);
    }

    // Server-side: convert screenshot URLs to base64 if no base64 images provided
    let visionImages = screenshotImages || [];
    if ((!visionImages || visionImages.length === 0) && body.screenshotUrls && body.screenshotUrls.length > 0) {
      const fetched = await Promise.all(
        body.screenshotUrls.slice(0, 1).map((url: string) => fetchImageAsBase64(url))
      );
      visionImages = fetched.filter(Boolean) as { data: string; media_type: string }[];
    }

    // Get branding context
    const ctx = await getUserContext(supabase, user.id, workspace_id);
    const fullContext = formatContextForAI(ctx, CONTEXT_PRESETS.content);

    // Build structured post descriptions for AI
    let successPostsBlock = "";
    if (successPostsData && successPostsData.length > 0) {
      successPostsBlock = "\nPOSTS QUI MARCHENT (données structurées) :\n" + successPostsData.map((p: any, i: number) => {
        const parts = [`Post ${i + 1}`];
        if (p.format) parts.push(`Format : ${p.format}`);
        if (p.subject) parts.push(`Sujet : "${p.subject}"`);
        const stats = [];
        if (p.likes) stats.push(`likes: ${p.likes}`);
        if (p.saves) stats.push(`saves: ${p.saves}`);
        if (p.shares) stats.push(`partages: ${p.shares}`);
        if (p.comments) stats.push(`commentaires: ${p.comments}`);
        if (p.reach) stats.push(`reach: ${p.reach}`);
        if (stats.length) parts.push(`Stats : ${stats.join(", ")}`);
        return `- ${parts.join(" · ")}`;
      }).join("\n");
    }

    let failPostsBlock = "";
    if (failPostsData && failPostsData.length > 0) {
      failPostsBlock = "\nPOSTS QUI NE MARCHENT PAS (données structurées) :\n" + failPostsData.map((p: any, i: number) => {
        const parts = [`Post ${i + 1}`];
        if (p.format) parts.push(`Format : ${p.format}`);
        if (p.subject) parts.push(`Sujet : "${p.subject}"`);
        const stats = [];
        if (p.likes) stats.push(`likes: ${p.likes}`);
        if (p.saves) stats.push(`saves: ${p.saves}`);
        if (p.shares) stats.push(`partages: ${p.shares}`);
        if (p.comments) stats.push(`commentaires: ${p.comments}`);
        if (p.reach) stats.push(`reach: ${p.reach}`);
        if (stats.length) parts.push(`Stats : ${stats.join(", ")}`);
        return `- ${parts.join(" · ")}`;
      }).join("\n");
    }

    // Build text-based profile data block
    let profileTextBlock = "";
    if (atd) {
      const lines = [];
      if (atd.displayName) lines.push(`- Nom d'affichage : ${atd.displayName}`);
      if (atd.username) lines.push(`- Username : ${atd.username}`);
      if (atd.bio) lines.push(`- Bio :\n${atd.bio}`);
      if (atd.bioLink) lines.push(`- Lien en bio : ${atd.bioLink}`);
      if (atd.photoDescription) lines.push(`- Photo de profil : ${atd.photoDescription}`);
      if (atd.highlights?.length) lines.push(`- Stories à la une : ${atd.highlights.join(", ")} (${atd.highlightsCount || atd.highlights.length} highlights)`);
      if (atd.pinnedPosts?.length) lines.push(`- Posts épinglés :\n${atd.pinnedPosts.map((p: any, i: number) => `  ${i+1}. ${p.description}`).join("\n")}`);
      if (atd.feedDescription) lines.push(`- Description du feed : ${atd.feedDescription}`);
      if (atd.followers) lines.push(`- Nombre d'abonnés : ${atd.followers}`);
      if (atd.postsPerMonth) lines.push(`- Posts publiés ce mois : ${atd.postsPerMonth}`);
      if (atd.frequency) lines.push(`- Fréquence de publication : ${atd.frequency}`);
      if (atd.pillars?.length) lines.push(`- Piliers de contenu : ${atd.pillars.join(", ")}`);
      // Best/worst posts comments from the user
      if (atd.bestPostsComment) lines.push(`- Ce qui marche le mieux selon l'utilisateur·ice : "${atd.bestPostsComment}"`);
      if (atd.worstPostsComment) lines.push(`- Ce qui marche le moins selon l'utilisateur·ice : "${atd.worstPostsComment}"`);
      // Best/worst post URLs (for reference in text-only mode)
      if (atd.bestPostUrls?.length) lines.push(`- URLs des posts qui marchent : ${atd.bestPostUrls.join(", ")}`);
      if (atd.worstPostUrls?.length) lines.push(`- URLs des posts qui ne marchent pas : ${atd.worstPostUrls.join(", ")}`);
      profileTextBlock = "\nPROFIL INSTAGRAM (saisi par l'utilisatrice) :\n" + lines.join("\n");
    }

    const systemPrompt = `${CORE_PRINCIPLES}
${profileTextBlock}

${bc || wc || rh || obj ? `RÉPONSES COMPLÉMENTAIRES :
${bc ? `- Contenus qui marchent le mieux : "${bc}"` : ""}
${wc ? `- Contenus qui ne marchent pas : "${wc}"` : ""}
${rh ? `- Rythme actuel : "${rh}"` : ""}
${obj ? `- Objectif principal : "${obj}"` : ""}` : ""}
${pu ? `- URL du profil : ${pu}` : ""}
${successPostsBlock}
${failPostsBlock}

${fullContext}

Audite ce profil Instagram. Pour CHAQUE élément, retourne un verdict visuel.

ANALYSE DE PERFORMANCE DES CONTENUS :
- Identifie les POINTS COMMUNS des contenus qui marchent (format, sujet, ton, accroche, présence de visage, longueur...)
- Identifie les POINTS COMMUNS des contenus qui ne marchent pas
- Compare avec les piliers de contenu et le ton définis dans le branding
- Calcule les taux d'engagement si les stats sont fournies
- Identifie minimum 2-3 patterns positifs et 1-2 patterns négatifs
- Le "combo gagnant" est LA combinaison format x angle qui performe le mieux

Score global = moyenne pondérée (photo 10, nom 10, bio 25, feed 15, highlights 15, posts epingles 10, CTA 10, lien 5).

Sois directe mais bienveillante. Compare TOUJOURS avec le branding.

RÉPONSE : Tu dois retourner UNIQUEMENT un objet JSON valide. C'est une contrainte technique absolue.
- Pas de texte avant le JSON (pas de "Voici", pas de "Je vais", pas d'introduction)
- Pas de texte après le JSON (pas de conclusion, pas de commentaire)
- Pas de backticks markdown (pas de ${"```"}json)
- Le premier caractère de ta réponse doit être { et le dernier doit être }
- Si tu ajoutes du texte autour du JSON, le système plantera. C'est critique.

REGLES STRICTES :
- NE JAMAIS utiliser de markdown dans le JSON : pas de **gras**, pas de *italique*, pas de backticks. Texte brut UNIQUEMENT.
- Pour la bio, analyse LIGNE PAR LIGNE avec un status par ligne.
- Pour chaque element "improve" ou "critical", donne TOUJOURS un conseil concret et actionnable.
- Pour la bio et le nom, donne TOUJOURS une proposition complete prete a copier.
- Identifie la priorite n1 : l'element qui aura le plus d'impact si ameliore.

Reponds en JSON :
{
  "score_global": 71,
  "resume": "phrase resume de l'audit",
  "visual_audit": {
    "elements": [
      {
        "element": "photo_profil",
        "label": "Photo de profil",
        "status": "ok",
        "current": "Description de ce que tu vois",
        "verdict": "Ton visage est visible, souriant, fond coherent.",
        "conseil": null,
        "proposition": null
      },
      {
        "element": "nom",
        "label": "Nom d'affichage",
        "status": "improve",
        "current": "Le nom actuel",
        "verdict": "Pas optimise pour la recherche Instagram.",
        "conseil": "Ajouter un mot-cle metier dans le nom.",
        "proposition": "Prenom | Activite mot-cle"
      },
      {
        "element": "bio",
        "label": "Bio",
        "status": "improve",
        "current": "La bio complete",
        "verdict": "Positionnement OK mais promesse floue et pas de CTA.",
        "lignes": [
          {"texte": "Premiere ligne de la bio", "status": "ok", "commentaire": "Positionnement clair."},
          {"texte": "Deuxieme ligne", "status": "improve", "commentaire": "Remplace par ta promesse concrete."},
          {"texte": "(absent)", "status": "critical", "commentaire": "Il manque un CTA avec emoji pointant vers le lien."}
        ],
        "conseil": "Ajouter une ligne avec benefice client et CTA.",
        "proposition": "Ligne 1\nLigne 2\nLigne 3\nLigne 4 CTA"
      },
      {
        "element": "feed",
        "label": "Coherence visuelle du feed",
        "status": "ok",
        "current": "Description du feed",
        "verdict": "Identite visuelle forte et reconnaissable.",
        "conseil": "Alterner avec plus de photos de toi (visages = +38% likes).",
        "proposition": null
      },
      {
        "element": "highlights",
        "label": "Stories a la une",
        "status": "critical",
        "current": "Liste des highlights actuels",
        "verdict": "Il manque des highlights strategiques.",
        "conseil": "Ajouter : Qui je suis, Temoignages, Mes offres, Coulisses, Tips.",
        "proposition": null
      },
      {
        "element": "posts_epingles",
        "label": "Posts epingles",
        "status": "improve",
        "current": "Description",
        "verdict": "Tu rates ta vitrine.",
        "conseil": "3 posts : expertise + resultat + storytelling perso.",
        "proposition": null
      },
      {
        "element": "cta",
        "label": "Call to action",
        "status": "improve",
        "current": "Description du CTA actuel",
        "verdict": "Le lien existe mais rien ne donne envie de cliquer.",
        "conseil": "Ajouter une ligne avec emoji et benefice.",
        "proposition": null
      },
      {
        "element": "lien",
        "label": "Lien en bio",
        "status": "ok",
        "current": "Le lien actuel",
        "verdict": "Le lien est present et fonctionnel.",
        "conseil": null,
        "proposition": null
      }
    ],
    "priorite_1": {
      "element": "highlights",
      "message": "Tes stories a la une sont le plus gros levier d'amelioration."
    },
    "resume": {
      "ok_count": 3,
      "improve_count": 4,
      "critical_count": 1
    }
  },
  "sections": {
    "nom": {"score": 70, "summary": {"positives": ["..."], "improvements": ["..."]}, "recommendations": [{"number": 1, "title": "...", "explanation": "...", "example": "..."}], "proposed_version": "..."},
    "bio": {"score": 0, "summary": {"positives": ["..."], "improvements": ["..."]}, "recommendations": [{"number": 1, "title": "...", "explanation": "...", "example": "..."}], "proposed_version": "..."},
    "stories": {"score": 0, "summary": {"positives": ["..."], "improvements": ["..."]}, "recommendations": [{"number": 1, "title": "...", "explanation": "...", "example": "..."}]},
    "epingles": {"score": 0, "summary": {"positives": ["..."], "improvements": ["..."]}, "recommendations": [{"number": 1, "title": "...", "explanation": "...", "example": "..."}]},
    "feed": {"score": 0, "summary": {"positives": ["..."], "improvements": ["..."]}, "recommendations": [{"number": 1, "title": "...", "explanation": "...", "example": "..."}]},
    "edito": {"score": 0, "summary": {"positives": ["..."], "improvements": ["..."]}, "recommendations": [{"number": 1, "title": "...", "explanation": "...", "example": "..."}]}
  },
  "content_analysis": {
    "patterns_positifs": [
      {"number": 1, "title": "...", "explanation": "...", "metric_highlight": "...", "posts_concerned": ["..."]}
    ],
    "patterns_negatifs": [
      {"number": 1, "title": "...", "explanation": "...", "alternative": "..."}
    ]
  },
  "content_dna": [
    {"type": "Storytelling perso", "emoji": "...", "rating": 5, "verdict": "ton_arme"},
    {"type": "Carrousel", "emoji": "...", "rating": 4, "verdict": "continue"}
  ],
  "combo_gagnant": "Carrousel + Storytelling perso",
  "editorial_recommendations": {
    "recommended_mix": {"storytelling": 40, "opinion": 30, "coulisses": 20, "educatif": 10},
    "best_format": "carrousel",
    "best_angle": "storytelling_personnel",
    "best_content_types": ["storytelling", "prise_de_position"],
    "worst_content_types": ["educatif_liste"],
    "reel_advice": "...",
    "general_advice": "..."
  }
}`;

    const finalSystemPrompt = BASE_SYSTEM_RULES + "\n\n" + systemPrompt;

    // Build user message (multimodal if screenshots available)
    if (visionImages && visionImages.length > 0) {
      const userContent: any[] = visionImages.map((img: any) => ({
        type: "image",
        source: { type: "base64", media_type: img.media_type, data: img.data },
      }));
      userContent.push({
        type: "text",
        text: "Analyse mon profil Instagram en détail avec les captures fournies et les données textuelles ci-dessus.",
      });

      const visionResult = await callAnthropic({
        model: getModelForAction("audit"),
        system: finalSystemPrompt,
        messages: [{ role: "user", content: userContent }],
        temperature: 0.7,
        max_tokens: 8192,
      });

      await logUsage(user.id, "audit", "audit_instagram", undefined, undefined, workspace_id);
      return new Response(
        JSON.stringify({ content: visionResult }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fallback: text-only audit if no screenshots
    const userPrompt = "Analyse mon profil Instagram et donne-moi un audit complet avec audit visuel annote et analyse de performance des contenus.";
    const content = await callAnthropicSimple(getModelForAction("audit"), finalSystemPrompt, userPrompt, 0.7, 8192);

    await logUsage(user.id, "audit", "audit_instagram", undefined, undefined, workspace_id);
    return new Response(
      JSON.stringify({ content }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error(JSON.stringify({
      type: "edge_function_error",
      function_name: "audit-instagram-ai",
      error: e.message || "Erreur inconnue",
      timestamp: new Date().toISOString(),
    }));
    return new Response(
      JSON.stringify({ error: "Erreur interne du serveur" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
