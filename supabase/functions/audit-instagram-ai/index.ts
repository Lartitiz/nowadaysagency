import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { CORE_PRINCIPLES } from "../_shared/copywriting-prompts.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS } from "../_shared/user-context.ts";
import { checkQuota, logUsage, quotaDeniedResponse } from "../_shared/plan-limiter.ts";
import { callAnthropic, callAnthropicSimple, getModelForAction, type UsageSink } from "../_shared/anthropic.ts";
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
  // Statistiques réelles tirées de l'API Instagram (instagram-insights-fetch).
  liveMetrics: z.record(z.unknown()).optional().nullable(),
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
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
    const { auditTextData: atd, screenshotImages, successPostsData, failPostsData, liveMetrics, workspace_id } = body;
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

    // Also fetch best/worst post images for vision analysis (limit to 3 total to avoid memory issues)
    const postImageUrls: string[] = [
      ...(atd?.bestPostUrls || []).slice(0, 2),
      ...(atd?.worstPostUrls || []).slice(0, 2),
    ].slice(0, 3);
    if (postImageUrls.length > 0) {
      const postImages = await Promise.all(
        postImageUrls.map((url: string) => fetchImageAsBase64(url))
      );
      const validPostImages = postImages.filter(Boolean) as { data: string; media_type: string }[];
      visionImages = [...visionImages, ...validPostImages];
    }

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

    // Bloc statistiques RÉELLES (API Instagram). Priorité au factuel sur le déclaratif.
    let liveMetricsBlock = "";
    if (liveMetrics && typeof liveMetrics === "object") {
      const lm: any = liveMetrics;
      const lines: string[] = [];
      const pct = (v: any) => (typeof v === "number" ? `${(v * 100).toFixed(1)}%` : null);
      if (typeof lm.followers === "number") lines.push(`- Abonnés : ${lm.followers}`);
      if (typeof lm.followerGrowth30d === "number") lines.push(`- Croissance d'abonnés (30 j) : ${lm.followerGrowth30d >= 0 ? "+" : ""}${lm.followerGrowth30d}`);
      if (typeof lm.reach30d === "number") lines.push(`- Reach (28 j) : ${lm.reach30d}`);
      if (typeof lm.postsLast30d === "number") lines.push(`- Posts publiés sur 30 j : ${lm.postsLast30d}${lm.frequencyLabel ? ` (${lm.frequencyLabel})` : ""}`);
      if (pct(lm.avgEngagementRate)) lines.push(`- Taux d'engagement moyen par post : ${pct(lm.avgEngagementRate)}`);
      // NB : les top/flop posts mesurés ne sont PAS re-listés ici — ils sont déjà
      // détaillés (avec leurs stats) dans les blocs POSTS QUI MARCHENT / NE MARCHENT PAS
      // (successPostsData / failPostsData). On évite la double présentation qui gonflait
      // l'entrée et allongeait la génération de l'audit.
      if (lines.length) {
        liveMetricsBlock =
          "\nSTATISTIQUES RÉELLES (API Instagram — ces chiffres sont factuels, appuie-toi dessus en priorité sur le déclaratif) :\n" +
          lines.join("\n") +
          (lm.partial ? "\n(Certaines métriques n'ont pas pu être récupérées.)" : "");
      }
    }

    // Bloc AUDIENCE RÉELLE (démographie des abonnés via follower_demographics).
    // Valeurs absolues converties en % du segment pour rester parlantes.
    let audienceBlock = "";
    const aud: any = (liveMetrics as any)?.audience;
    if (aud && typeof aud === "object") {
      const fmtPct = (arr: any[], n: number) => {
        const total = arr.reduce((s: number, x: any) => s + (Number(x?.value) || 0), 0) || 1;
        return arr
          .slice(0, n)
          .map((x: any) => `${x.label} ${Math.round((Number(x?.value) || 0) / total * 100)}%`)
          .join(", ");
      };
      const al: string[] = [];
      if (Array.isArray(aud.age) && aud.age.length) al.push(`- Tranches d'âge : ${fmtPct(aud.age, 4)}`);
      if (Array.isArray(aud.gender) && aud.gender.length) al.push(`- Genre : ${fmtPct(aud.gender, 3)}`);
      if (Array.isArray(aud.cities) && aud.cities.length) al.push(`- Top villes : ${fmtPct(aud.cities, 5)}`);
      if (Array.isArray(aud.countries) && aud.countries.length) al.push(`- Top pays : ${fmtPct(aud.countries, 5)}`);
      if (al.length) {
        audienceBlock =
          "\nAUDIENCE RÉELLE (API Instagram — démographie des abonnés) :\n" +
          al.join("\n") +
          "\nAdapte explicitement les recommandations éditoriales à CETTE audience (centres d'intérêt, références, langue, sujets), et appuie-toi dessus dans la ligne éditoriale.";
      }
    }

    const systemPrompt = `${CORE_PRINCIPLES}
${profileTextBlock}

${bc || wc || rh || obj ? `RÉPONSES COMPLÉMENTAIRES :
${bc ? `- Contenus qui marchent le mieux : "${bc}"` : ""}
${wc ? `- Contenus qui ne marchent pas : "${wc}"` : ""}
${rh ? `- Rythme actuel : "${rh}"` : ""}
${obj ? `- Objectif principal : "${obj}"` : ""}` : ""}
${pu ? `- URL du profil : ${pu}` : ""}
${liveMetricsBlock}
${audienceBlock}
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

Score global = moyenne pondérée (photo 10, nom 10, bio 25, feed 15, highlights 15, posts épinglés 10, CTA 10, lien 5).

Sois directe mais bienveillante. Compare TOUJOURS avec le branding.

RÉPONSE : Tu dois retourner UNIQUEMENT un objet JSON valide. C'est une contrainte technique absolue.
- Pas de texte avant le JSON (pas de "Voici", pas de "Je vais", pas d'introduction)
- Pas de texte après le JSON (pas de conclusion, pas de commentaire)
- Pas de backticks markdown (pas de ${"```"}json)
- Le premier caractère de ta réponse doit être { et le dernier doit être }
- Si tu ajoutes du texte autour du JSON, le système plantera. C'est critique.

RÈGLES STRICTES :
- NE JAMAIS utiliser de markdown dans le JSON : pas de **gras**, pas de *italique*, pas de backticks. Texte brut UNIQUEMENT.
- Pour la bio, analyse LIGNE PAR LIGNE avec un status par ligne.
- Pour chaque élément "improve" ou "critical", donne TOUJOURS un conseil concret et actionnable.
- Pour la bio et le nom, donne TOUJOURS une proposition complète prête à copier.
- Identifie la priorité n°1 : l'élément qui aura le plus d'impact si amélioré.

Réponds en JSON :
{
  "score_global": 71,
  "resume": "phrase résumé de l'audit",
  "visual_audit": {
    "elements": [
      {
        "element": "photo_profil",
        "label": "Photo de profil",
        "status": "ok",
        "current": "Description de ce que tu vois",
        "verdict": "Ton visage est visible, souriant, fond cohérent.",
        "conseil": null,
        "proposition": null
      },
      {
        "element": "nom",
        "label": "Nom d'affichage",
        "status": "improve",
        "current": "Le nom actuel",
        "verdict": "Pas optimisé pour la recherche Instagram.",
        "conseil": "Ajouter un mot-clé métier dans le nom.",
        "proposition": "Prénom | Activité mot-clé"
      },
      {
        "element": "bio",
        "label": "Bio",
        "status": "improve",
        "current": "La bio complète",
        "verdict": "Positionnement OK mais promesse floue et pas de CTA.",
        "lignes": [
          {"texte": "Première ligne de la bio", "status": "ok", "commentaire": "Positionnement clair."},
          {"texte": "Deuxième ligne", "status": "improve", "commentaire": "Remplace par ta promesse concrète."},
          {"texte": "(absent)", "status": "critical", "commentaire": "Il manque un CTA avec emoji pointant vers le lien."}
        ],
        "conseil": "Ajouter une ligne avec bénéfice client et CTA.",
        "proposition": "Ligne 1\nLigne 2\nLigne 3\nLigne 4 CTA"
      },
      {
        "element": "feed",
        "label": "Cohérence visuelle du feed",
        "status": "ok",
        "current": "Description du feed",
        "verdict": "Identité visuelle forte et reconnaissable.",
        "conseil": "Alterner avec plus de photos de toi (visages = +38% likes).",
        "proposition": null
      },
      {
        "element": "highlights",
        "label": "Stories à la une",
        "status": "critical",
        "current": "Liste des highlights actuels",
        "verdict": "Il manque des highlights stratégiques.",
        "conseil": "Ajouter : Qui je suis, Témoignages, Mes offres, Coulisses, Tips.",
        "proposition": null
      },
      {
        "element": "posts_epingles",
        "label": "Posts épinglés",
        "status": "improve",
        "current": "Description",
        "verdict": "Tu rates ta vitrine.",
        "conseil": "3 posts : expertise + résultat + storytelling perso.",
        "proposition": null
      },
      {
        "element": "cta",
        "label": "Call to action",
        "status": "improve",
        "current": "Description du CTA actuel",
        "verdict": "Le lien existe mais rien ne donne envie de cliquer.",
        "conseil": "Ajouter une ligne avec emoji et bénéfice.",
        "proposition": null
      },
      {
        "element": "lien",
        "label": "Lien en bio",
        "status": "ok",
        "current": "Le lien actuel",
        "verdict": "Le lien est présent et fonctionnel.",
        "conseil": null,
        "proposition": null
      }
    ],
    "priorite_1": {
      "element": "highlights",
      "message": "Tes stories à la une sont le plus gros levier d'amélioration."
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

    // L'audit fait 3-4 sous-appels en parallèle (runPart) → on SOMME les tokens
    // de tous les appels (Anthropic + fallback Gemini) pour la facturation.
    let auditTokens = 0;
    let auditModel = "";

    // Helper: fallback to Gemini via Lovable AI Gateway (text-only)
    async function fallbackToGemini(systemPrompt: string, userText: string): Promise<string> {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) throw new Error("No fallback API key available");
      console.log("[audit-instagram-ai] Falling back to Gemini (text-only)...");
      const geminiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userText },
          ],
          temperature: 0.7,
        }),
      });
      if (!geminiResp.ok) {
        const errText = await geminiResp.text();
        console.error("[audit-instagram-ai] Gemini fallback failed:", geminiResp.status, errText);
        throw new Error(`Gemini fallback failed: ${geminiResp.status}`);
      }
      const geminiData = await geminiResp.json();
      auditTokens += geminiData.usage?.total_tokens ?? ((geminiData.usage?.prompt_tokens ?? 0) + (geminiData.usage?.completion_tokens ?? 0));
      if (!auditModel) auditModel = "google/gemini-2.5-flash";
      return geminiData.choices?.[0]?.message?.content || "";
    }

    const textOnlyUserPrompt = "Analyse mon profil Instagram et donne-moi un audit complet avec audit visuel annoté et analyse de performance des contenus.";

    // Message user partagé par les sous-appels (multimodal si captures fournies).
    const hasImages = !!(visionImages && visionImages.length > 0);
    const userText = "Analyse mon profil Instagram avec les données ci-dessus" + (hasImages ? " et les captures fournies." : ".");
    const buildUserContent = (): any => {
      if (!hasImages) return userText;
      const uc: any[] = visionImages.map((img: any) => ({
        type: "image",
        source: { type: "base64", media_type: img.media_type, data: img.data },
      }));
      uc.push({ type: "text", text: userText });
      return uc;
    };

    // L'audit complet est trop long pour tenir sous le timeout edge (150s) en un seul appel.
    // On le découpe en sous-appels PLUS LÉGERS lancés EN PARALLÈLE (chacun bien sous 150s),
    // puis on recolle côté serveur. Le schéma complet (finalSystemPrompt) reste la source de
    // vérité — on restreint seulement la SORTIE de chaque appel → aucune perte de qualité.
    // 4 sous-appels parallèles (le temps total = le plus lent). "overview" a été scindé
    // en deux ("overview" + "reco") car, nourri des vraies stats (analyse de perf, combo,
    // recommandations), il dépassait à lui seul les 150s. Chaque part reste bien en-dessous.
    const PARTS: { label: string; instr: string }[] = [
      { label: "visual", instr: 'POUR CET APPEL UNIQUEMENT : retourne UNIQUEMENT la clé "visual_audit" (toute sa structure : elements, priorite_1, resume). N\'inclus AUCUNE autre clé du schéma.' },
      { label: "sections", instr: 'POUR CET APPEL UNIQUEMENT : retourne UNIQUEMENT la clé "sections" (les 6 sections nom, bio, stories, epingles, feed, edito, complètes). N\'inclus AUCUNE autre clé du schéma.' },
      { label: "overview", instr: 'POUR CET APPEL UNIQUEMENT : retourne UNIQUEMENT les clés "score_global", "resume" et "content_analysis". N\'inclus AUCUNE autre clé du schéma.' },
      { label: "reco", instr: 'POUR CET APPEL UNIQUEMENT : retourne UNIQUEMENT les clés "content_dna", "combo_gagnant" et "editorial_recommendations". N\'inclus AUCUNE autre clé du schéma.' },
    ];

    const runPart = async (instr: string, label: string): Promise<string> => {
      const sys = finalSystemPrompt + "\n\n" + instr;
      try {
        const u: UsageSink = {};
        let out: string;
        if (hasImages) {
          out = await callAnthropic({
            model: getModelForAction("audit"),
            system: sys,
            messages: [{ role: "user", content: buildUserContent() }],
            temperature: 0.7,
            max_tokens: 8192,
          }, u);
        } else {
          out = await callAnthropicSimple(getModelForAction("audit"), sys, userText, 0.7, 8192, u);
        }
        auditTokens += u.total_tokens ?? 0;
        if (u.model) auditModel = u.model;
        return out;
      } catch (anthropicErr: any) {
        console.error(`[audit-instagram-ai] part ${label} failed:`, anthropicErr.message);
        // Filet : si le fallback Gemini échoue AUSSI, on ne jette pas — sinon le Promise.all
        // rejette et tout l'audit tombe. On rend "" → cette part sera vide, les 2 autres passent.
        try {
          return await fallbackToGemini(sys, textOnlyUserPrompt);
        } catch (geminiErr: any) {
          console.error(`[audit-instagram-ai] part ${label} fallback (Gemini) failed:`, geminiErr.message);
          return "";
        }
      }
    };

    const extractJson = (raw: string): any => {
      if (!raw) return {};
      const s = raw.trim();
      const start = s.indexOf("{");
      const end = s.lastIndexOf("}");
      if (start === -1 || end === -1 || end <= start) return {};
      try { return JSON.parse(s.substring(start, end + 1)); } catch { return {}; }
    };

    const [visualRaw, sectionsRaw, overviewRaw, recoRaw] = await Promise.all(
      PARTS.map((p) => runPart(p.instr, p.label))
    );

    const visualObj = extractJson(visualRaw);
    const sectionsObj = extractJson(sectionsRaw);
    const overviewObj = extractJson(overviewRaw);
    const recoObj = extractJson(recoRaw);

    const merged = {
      ...overviewObj,
      ...recoObj,
      sections: sectionsObj.sections ?? overviewObj.sections,
      visual_audit: visualObj.visual_audit,
    };

    // Parse-gate : ne JAMAIS facturer un audit cassé. Si les parts sont revenues vides
    // (JSON illisible des 2 modèles, sans planter), on renvoie une erreur réessayable
    // SANS décompter le crédit. Si au moins une part a abouti, on facture et on rend le partiel.
    const nonEmpty = (v: any) =>
      v != null && (typeof v === "object"
        ? Object.keys(v).length > 0
        : typeof v === "string"
          ? v.trim().length > 0
          : true);
    const hasContent =
      nonEmpty(merged.sections) ||
      nonEmpty(merged.visual_audit) ||
      merged.score_global != null ||
      nonEmpty((merged as any).resume);

    if (!hasContent) {
      console.error("[audit-instagram-ai] toutes les parts sont vides — audit non facturé");
      return new Response(
        JSON.stringify({ error: "L'audit n'a pas pu être généré, réessaie dans un instant.", retryable: true }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sauvegarde serveur de l'audit AVANT de rendre la main. Le crédit est débité
    // côté serveur (logUsage juste après) : si on laissait l'insert au client (comme
    // avant), un rechargement pendant les ~3 min d'analyse débitait le crédit SANS
    // jamais sauver le résultat. En insérant ici, l'audit survit à la disparition du
    // client. Non bloquant : si l'insert échoue, le client retombe sur son propre insert.
    let savedAuditId: string | null = null;
    let savedAuditDate: string | null = null;
    try {
      const m = merged as any;
      const wsId = workspace_id && workspace_id !== user.id ? workspace_id : undefined;
      const findEl = (name: string) =>
        m.visual_audit?.elements?.find((e: any) => e.element === name)?.score;
      const bestPosts = (atd?.bestPostUrls || []).map((url: string, i: number) => ({
        image_url: url, comment: i === 0 ? (atd?.bestPostsComment || null) : null,
      }));
      const worstPosts = (atd?.worstPostUrls || []).map((url: string, i: number) => ({
        image_url: url, comment: i === 0 ? (atd?.worstPostsComment || null) : null,
      }));
      const { data: ins } = await supabase.from("instagram_audit").insert({
        user_id: user.id,
        workspace_id: wsId,
        score_global: m.score_global,
        score_nom: m.sections?.nom?.score ?? findEl("nom") ?? 0,
        score_bio: m.sections?.bio?.score ?? findEl("bio") ?? 0,
        score_stories: m.sections?.stories?.score ?? findEl("highlights") ?? 0,
        score_epingles: m.sections?.epingles?.score ?? findEl("posts_epingles") ?? 0,
        score_feed: m.sections?.feed?.score ?? findEl("feed") ?? 0,
        score_edito: m.sections?.edito?.score ?? 0,
        resume: m.resume,
        details: m,
        best_posts: bestPosts.length ? bestPosts : null,
        worst_posts: worstPosts.length ? worstPosts : null,
        best_posts_comment: atd?.bestPostsComment || null,
        worst_posts_comment: atd?.worstPostsComment || null,
        posts_analysis: m.posts_analysis || null,
        profile_url: pu || null,
      } as any).select("id, created_at").single();
      if (ins) { savedAuditId = (ins as any).id; savedAuditDate = (ins as any).created_at; }
    } catch (insErr: any) {
      console.error("[audit-instagram-ai] insert audit échoué (non bloquant):", insErr?.message || insErr);
    }

    await logUsage(user.id, "audit", "audit_instagram", auditTokens || undefined, auditModel || undefined, workspace_id);
    return new Response(
      JSON.stringify({ content: JSON.stringify(merged), auditId: savedAuditId, auditDate: savedAuditDate }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    const errMsg = e.message || "Erreur inconnue";
    console.error(JSON.stringify({
      type: "edge_function_error",
      function_name: "audit-instagram-ai",
      error: errMsg,
      timestamp: new Date().toISOString(),
    }));

    // Contextual error messages
    const isOverload = /429|529|overloaded|rate.?limit/i.test(errMsg);
    const isTimeout = /timeout|abort|timed.?out/i.test(errMsg);

    if (isOverload) {
      return new Response(
        JSON.stringify({ error: "L'IA est momentanément surchargée, réessaie dans 2 minutes.", retryable: true }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (isTimeout) {
      return new Response(
        JSON.stringify({ error: "Le traitement a pris trop de temps, réessaie.", retryable: true }),
        { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Erreur interne du serveur" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
