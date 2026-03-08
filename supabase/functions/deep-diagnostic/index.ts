import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { scrapeLinkedin, processScreenshots } from "../_shared/scraping.ts";
import { callAnthropic, callAnthropicSimple, getModelForAction } from "../_shared/anthropic.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
import { authenticateRequest, AuthError } from "../_shared/auth.ts";

const MAX_TEXT_PER_SOURCE = 5000;
const GLOBAL_TIMEOUT_MS = 55000;

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GLOBAL_TIMEOUT_MS);

  try {
    const { userId } = await authenticateRequest(req);
    const { websiteUrl, instagramHandle, linkedinUrl, documentIds, profile, freeformAnswers, isOnboarding } = await req.json();

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get workspace
    const { data: wsData } = await supabaseAdmin
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", userId)
      .eq("role", "owner")
      .limit(1)
      .single();

    const workspaceId = wsData?.workspace_id || null;

    // Check quota (diagnostic = 3 credits, category: audit) — skip during onboarding
    if (!isOnboarding) {
      const quota = await checkQuota(userId, "audit", workspaceId);
      if (!quota.allowed) {
        clearTimeout(timeout);
        return new Response(JSON.stringify({ error: quota.message, quota }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ====== RÉCUPÉRATION DES DONNÉES (cache only, pas de scraping) ======
    const scrapedContent: Record<string, string> = {};
    const sourcesUsed: string[] = [];
    const sourcesFailed: string[] = [];

    const scrapePromises: Promise<void>[] = [];

    // Website : lire le cache du pre-scrape UNIQUEMENT (content + style_hints)
    let cachedStyleHints = "";
    if (websiteUrl) {
      scrapePromises.push((async () => {
        try {
          const { data: cached } = await supabaseAdmin
            .from("scrape_cache")
            .select("content, style_hints")
            .eq("user_id", userId)
            .eq("url", websiteUrl)
            .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (cached?.content) {
            scrapedContent.website = cached.content.slice(0, MAX_TEXT_PER_SOURCE);
            sourcesUsed.push("website");
            if (cached.style_hints) {
              cachedStyleHints = cached.style_hints;
            }
            console.log("Website content loaded from pre-scrape cache", cached.style_hints ? "(with style hints)" : "(no style hints)");
          } else {
            sourcesFailed.push("website");
          }
        } catch {
          sourcesFailed.push("website");
        }
      })());
    }

    // À propos : texte libre fourni par l'utilisatrice (anciennement "linkedin_summary")
    const aboutSummary = freeformAnswers?.linkedin_summary;
    if (aboutSummary && aboutSummary.trim().length > 10) {
      scrapedContent.about = `À propos (texte fourni par l'utilisatrice sur elle-même et son activité — ce n'est PAS un profil LinkedIn) :\n${aboutSummary.trim()}`.slice(0, MAX_TEXT_PER_SOURCE);
      sourcesUsed.push("about");
    } else if (linkedinUrl) {
      scrapePromises.push(
        scrapeLinkedin(linkedinUrl, controller.signal)
          .then((text) => {
            if (text) {
              scrapedContent.linkedin = text.slice(0, MAX_TEXT_PER_SOURCE);
              sourcesUsed.push("linkedin");
            } else {
              sourcesFailed.push("linkedin");
            }
          })
          .catch(() => { sourcesFailed.push("linkedin"); })
      );
    }

    // Process Instagram screenshots from uploads — max 1, size limit
    let instagramScreenshots: { base64: string; mediaType: string }[] = [];
    if (documentIds && documentIds.length > 0) {
      scrapePromises.push(
        processScreenshots(supabaseAdmin, documentIds.slice(0, 1), userId)
          .then((screenshots) => {
            // Filter out screenshots larger than 500KB base64 (~375KB image)
            instagramScreenshots = screenshots.filter(s => s.base64.length < 500000).slice(0, 1);
            if (instagramScreenshots.length > 0) {
              sourcesUsed.push("instagram_screenshot");
            } else {
              sourcesFailed.push("instagram_screenshot");
            }
          })
          .catch(() => { sourcesFailed.push("instagram_screenshot"); })
      );
    }

    await Promise.allSettled(scrapePromises);

    // ====== BUILD PROMPT ======
    const systemPrompt = `Tu es l'assistante com' de L'Assistant Com'. Diagnostic de communication personnalisé.

RÈGLES :
- Le "summary" (3-4 phrases) doit reformuler les mots de la personne. Elle doit se dire "oui c'est moi".
- Ne jamais inventer : si pas de données sur un canal, score = null.
- Forces et faiblesses CONCRÈTES avec exemples réels du contenu. Max 3-4 de chaque.
- 3 priorités actionnables dans l'outil, ordonnées par impact.
- Si branding incomplet, priorité n°1 = compléter le branding.
- Si scraping site échoué, le dire dans le summary.
- Pas de recommandations génériques. Chaque conseil basé sur une observation concrète.
- Écriture inclusive point médian, tutoiement.
- Pour le branding_prefill, déduis un maximum d'éléments depuis le contenu scrappé.

RÉPONDRE EN JSON UNIQUEMENT (pas de markdown, pas de backticks) :

{
  "summary": "3-4 phrases personnalisées",
  "strengths": [{ "title": "titre", "detail": "explication concrète", "source": "website|profile" }],
  "weaknesses": [{ "title": "titre", "detail": "explication", "source": "website|profile", "fix_hint": "piste" }],
  "scores": { "total": 0, "branding": 0, "instagram": null, "website": null, "linkedin": null },
  "priorities": [{ "title": "action", "why": "raison", "time": "durée", "route": "/route", "impact": "high|medium" }]
}

Routes disponibles : /storytelling, /persona, /proposition, /calendrier, /engagement, /bio-profile, /audit-instagram, /strategie, /offre, /charte-graphique
Scores sur 100. Null pour sources non analysées. Max 3-4 forces, 3-4 faiblesses, 3 priorités.`;

    // Build user prompt
    const userParts: string[] = [];

    // Context
    userParts.push(`=== CONTEXTE ===
Cette personne utilise L'Assistant Com'. Elle vient de terminer son onboarding. Ce diagnostic est la PREMIÈRE chose qu'elle verra. Il doit être personnalisé, honnête, et lui donner envie de continuer.`);

    // Profile info
    if (profile) {
      const profileLines = [
        `=== PROFIL ===`,
        `Activité : ${profile.activity || "non renseignée"}`,
        `Type : ${profile.activityType || "non renseigné"}`,
        `Objectif principal : ${profile.objective || "non renseigné"}`,
        `Blocage principal : ${profile.blocker || "non renseigné"}`,
        `Temps disponible/semaine : ${profile.weeklyTime || "non renseigné"}`,
      ];
      const channels = profile.channels || freeformAnswers?.canaux;
      if (channels) profileLines.push(`Canaux actuels : ${Array.isArray(channels) ? channels.join(", ") : channels}`);
      const desiredChannels = freeformAnswers?.desired_channels;
      if (desiredChannels) profileLines.push(`Canaux souhaités : ${Array.isArray(desiredChannels) ? desiredChannels.join(", ") : desiredChannels}`);
      userParts.push(profileLines.join("\n"));
    }

    // Freeform answers
    if (freeformAnswers) {
      const freeformParts: string[] = ["=== RÉPONSES LIBRES ==="];
      if (freeformAnswers.change_priority) freeformParts.push(`Priorité de changement : ${freeformAnswers.change_priority}`);
      if (freeformAnswers.product_or_service) freeformParts.push(`Produits ou services : ${freeformAnswers.product_or_service}`);
      if (freeformAnswers.uniqueness) freeformParts.push(`Ce qui te rend unique : ${freeformAnswers.uniqueness}`);
      if (freeformAnswers.positioning) freeformParts.push(`Positionnement : ${freeformAnswers.positioning}`);
      if (freeformAnswers.mission) freeformParts.push(`Mission : ${freeformAnswers.mission}`);
      if (freeformAnswers.target_description) freeformParts.push(`Cible : ${freeformAnswers.target_description}`);
      userParts.push(freeformParts.join("\n"));
    }

    // Scraped content
    for (const [source, text] of Object.entries(scrapedContent)) {
      userParts.push(`=== SOURCE: ${source.toUpperCase()} ===\n${text}`);
    }

    if (sourcesUsed.length === 0) {
      userParts.push("\n⚠️ Aucune source en ligne n'a pu être scrappée. Base ton diagnostic uniquement sur les réponses du profil.");
    }

    // Warn about failed sources
    if (sourcesFailed.length > 0) {
      const failedLabels = sourcesFailed.map(s => {
        if (s === "instagram") return `Instagram (@${instagramHandle})`;
        if (s === "website") return `Site web (${websiteUrl})`;
        if (s === "linkedin") return `LinkedIn`;
        return s;
      });
      userParts.push(`\n⚠️ Sources non analysées (scraping échoué) : ${failedLabels.join(", ")}. NE PAS inventer de score pour ces sources. Mettre leur score à null dans "scores".`);
    }

    // Final instructions
    userParts.push(`=== CONSIGNES FINALES ===
- Le résumé (summary) doit faire 3-4 phrases et reprendre les mots de la personne.
- Ne mets un score que pour les sources que tu as réellement analysées. Tout le reste : null.
- Les forces et faiblesses doivent citer des éléments CONCRETS du contenu. Pas de phrases génériques.`);

    const userPrompt = userParts.join("\n\n");

    // ====== CALL CLAUDE — PHASE 1 : Diagnostic rapide (Sonnet) ======
    let analysisResult: Record<string, unknown>;

    try {
      const fastModel = getModelForAction("content"); // Sonnet — rapide

      // Build user message content blocks for vision support
      const userContentBlocks: any[] = [];
      userContentBlocks.push({ type: "text", text: userPrompt });

      // Add Instagram screenshots as vision
      for (const screenshot of instagramScreenshots) {
        userContentBlocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: screenshot.mediaType,
            data: screenshot.base64,
          },
        });
        userContentBlocks.push({
          type: "text",
          text: "Ci-dessus : capture d'écran du profil Instagram de cette personne. Analyse la bio, le nombre d'abonnés, la cohérence visuelle du feed, le nom affiché, et tout élément visible.",
        });
      }

      let rawText: string;
      if (instagramScreenshots.length > 0) {
        // Use vision-capable call
        rawText = await callAnthropic({
          model: fastModel,
          system: systemPrompt,
          messages: [{ role: "user", content: userContentBlocks }],
          temperature: 0.6,
          max_tokens: 2000,
        });
      } else {
        // Simple text-only call
        rawText = await callAnthropicSimple(fastModel, systemPrompt, userPrompt, 0.7, 2000);
      }

      // Parse JSON
      try {
        analysisResult = JSON.parse(rawText);
      } catch {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysisResult = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("Réponse IA invalide");
        }
      }
    } catch (claudeError) {
      console.error("Claude fast diagnostic failed, using fallback:", claudeError);
      analysisResult = buildFallbackDiagnostic(profile, freeformAnswers, sourcesUsed);
    }

    // ====== SAVE TO DB (fast: only diagnostic essentials) ======
    const { data: savedDiag } = await supabaseAdmin
      .from("diagnostic_results")
      .insert({
        user_id: userId,
        workspace_id: workspaceId,
        summary: (analysisResult as any).summary || null,
        strengths: (analysisResult as any).strengths || null,
        weaknesses: (analysisResult as any).weaknesses || null,
        scores: (analysisResult as any).scores || null,
        priorities: (analysisResult as any).priorities || null,
        branding_prefill: null, // sera rempli par phase 2
        sources_used: sourcesUsed,
        sources_failed: sourcesFailed,
        raw_analysis: analysisResult,
      })
      .select("id")
      .single();

    // audit_recommendations + logUsage en parallèle
    const priorities = (analysisResult as any).priorities;
    const fastSaves: Promise<any>[] = [];

    if (priorities?.length > 0) {
      fastSaves.push(
        supabaseAdmin.from("audit_recommendations").insert(
          priorities.map((p: any, i: number) => ({
            user_id: userId, workspace_id: workspaceId,
            label: p.title, titre: p.title, module: "diagnostic",
            route: p.route || "/dashboard", detail: p.why || null,
            temps_estime: p.time || null, priorite: p.impact || "medium",
            position: i + 1, completed: false,
          }))
        ).then(() => {}).catch(e => console.error("Save recommendations failed:", e))
      );
    }

    fastSaves.push(
      Promise.all([
        logUsage(userId, "audit", "deep_diagnostic", undefined, "claude-sonnet", workspaceId),
        logUsage(userId, "audit", "deep_diagnostic", undefined, "claude-sonnet", workspaceId),
        logUsage(userId, "audit", "deep_diagnostic", undefined, "claude-sonnet", workspaceId),
      ]).catch(e => console.error("logUsage failed:", e))
    );

    await Promise.allSettled(fastSaves);

    // ====== PHASE 2 : Enrichissement branding — fire-and-forget ======
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      
      // Build enrichment prompt: include style hints if available
      let enrichmentPrompt = userPrompt.slice(0, 8000);
      if (cachedStyleHints) {
        enrichmentPrompt += `\n\n${cachedStyleHints}`;
      }
      
      fetch(`${supabaseUrl}/functions/v1/diagnostic-enrichment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          userId,
          workspaceId,
          userPrompt: enrichmentPrompt,
          savedDiagId: savedDiag?.id || null,
        }),
      }).catch(() => {});
    } catch {
      // Ignorer
    }

    clearTimeout(timeout);
    return new Response(
      JSON.stringify({
        success: true,
        id: savedDiag?.id,
        diagnostic: { ...analysisResult, branding_prefill: null },
        sources_used: sourcesUsed,
        sources_failed: sourcesFailed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    clearTimeout(timeout);
    if (e instanceof AuthError) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: e.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("deep-diagnostic error:", e);
    return new Response(
      JSON.stringify({ error: "Erreur interne du serveur" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ====== ACTIVITY INSIGHTS ======

const ACTIVITY_INSIGHTS: Record<string, { strengths: string[]; tips: string[]; priority: string }> = {
  artisane: {
    strengths: ["Le fait-main a une histoire à raconter : le processus de fabrication peut devenir ton meilleur contenu"],
    tips: ["Montre les coulisses de ta création : les mains, les matières, le travail en cours", "Le visuel produit est ton premier levier de vente en ligne"],
    priority: "Photographie tes produits sous plusieurs angles et en situation",
  },
  mode_textile: {
    strengths: ["La mode éthique est un marché en forte croissance, tu es sur le bon créneau"],
    tips: ["Les lookbooks et les mises en situation font vendre plus que les photos produit seules", "Ton histoire de marque (pourquoi l'éthique) est un puissant levier émotionnel"],
    priority: "Crée du contenu storytelling sur ta démarche éthique",
  },
  art_design: {
    strengths: ["Ton travail visuel est ton CV : chaque publication est une preuve de talent"],
    tips: ["Montre ton processus créatif, pas seulement le résultat final", "Les carrousels avant/après fonctionnent très bien pour les créatif·ves"],
    priority: "Constitue un portfolio en ligne qui montre ta diversité",
  },
  beaute_cosmetiques: {
    strengths: ["Les tutoriels et démonstrations sont le format roi dans la beauté"],
    tips: ["Le Reels/vidéo courte est ton meilleur allié : montre les textures, les applications", "Les avis client·es et avant/après sont très convaincants dans ton secteur"],
    priority: "Lance une série de tutoriels courts sur tes produits phares",
  },
  bien_etre: {
    strengths: ["Ton expertise se partage naturellement via du contenu éducatif"],
    tips: ["Les formats 'tips du jour' et 'mythes vs réalités' fonctionnent très bien", "Ta personnalité et ton approche sont ton principal différenciant"],
    priority: "Crée du contenu éducatif qui montre ton expertise unique",
  },
  coach: {
    strengths: ["Les témoignages et transformations client·es sont tes meilleurs arguments"],
    tips: ["Partage des mini-coachings gratuits en stories pour donner un avant-goût", "Ta posture personnelle (ce que tu incarnes) est aussi importante que tes méthodes"],
    priority: "Collecte et mets en avant 3 témoignages client·es",
  },
  coach_sportive: {
    strengths: ["Le contenu vidéo (démos, exercices) crée un lien fort avec ta communauté"],
    tips: ["Les transformations et défis engagent beaucoup sur les réseaux", "Montre ta propre pratique : l'authenticité inspire plus que la perfection"],
    priority: "Lance un mini-programme gratuit en stories pour engager ta communauté",
  },
  consultante: {
    strengths: ["Ton expertise peut se décliner en contenus éducatifs à forte valeur ajoutée"],
    tips: ["Les études de cas (anonymisées) sont le meilleur format pour prouver ton expertise", "LinkedIn est probablement ton canal prioritaire pour toucher des client·es B2B"],
    priority: "Publie une étude de cas détaillée de ta meilleure mission",
  },
  formatrice: {
    strengths: ["Tu sais déjà transmettre : ton contenu peut naturellement être pédagogique"],
    tips: ["Les carrousels 'X étapes pour...' et les mini-formations gratuites attirent ton audience", "Montre des extraits de tes formations pour donner envie"],
    priority: "Publie un extrait de ta méthode en contenu gratuit pour montrer ton expertise",
  },
  deco_interieur: {
    strengths: ["Les avant/après et les moodboards sont tes formats stars"],
    tips: ["Pinterest est un canal stratégique pour la déco : les gens y cherchent activement de l'inspiration", "Montre ton processus de réflexion, pas juste le résultat"],
    priority: "Crée un tableau Pinterest optimisé par style de décoration",
  },
};

// ====== FALLBACK DIAGNOSTIC ======

function buildFallbackDiagnostic(
  profile: any,
  freeformAnswers: any,
  sourcesUsed: string[]
): Record<string, unknown> {
  const hasWebPresence = sourcesUsed.length > 0;
  const activityType = profile?.activityType || "";
  const insights = ACTIVITY_INSIGHTS[activityType] || null;

  const strengths: any[] = [];
  const weaknesses: any[] = [];

  if (profile?.activity) {
    strengths.push({
      title: "Activité définie",
      detail: `Tu sais ce que tu fais : ${profile.activity}. C'est la base pour communiquer clairement.`,
      source: "profile",
    });
  }

  if (freeformAnswers?.uniqueness) {
    strengths.push({
      title: "Différenciation identifiée",
      detail: `Tu as identifié ce qui te rend unique : "${freeformAnswers.uniqueness}". C'est un atout à mettre en avant.`,
      source: "profile",
    });
  }

  // Add activity-specific strengths
  if (insights) {
    for (const s of insights.strengths) {
      strengths.push({ title: s, detail: s, source: "profile" });
    }
  }

  if (!hasWebPresence) {
    weaknesses.push({
      title: "Présence en ligne limitée",
      detail: "Je n'ai pas pu analyser de site web ni de réseaux sociaux. Sans présence en ligne visible, tes client·es potentiel·les ont du mal à te trouver.",
      source: "profile",
      fix_hint: insights?.tips[0] || "Commence par optimiser ta bio Instagram ou créer une page simple.",
    });
  }

  if (profile?.blocker === "invisible") {
    weaknesses.push({
      title: "Manque de visibilité",
      detail: "Tu te sens invisible — c'est le blocage principal que tu as identifié. Souvent, c'est une question de régularité et de clarté dans le message.",
      source: "profile",
      fix_hint: insights?.tips[1] || "Définis tes 3 piliers de contenu et publie 2-3 fois par semaine.",
    });
  }

  const totalScore = Math.min(100, Math.max(10, 
    (profile?.activity ? 15 : 0) +
    (freeformAnswers?.uniqueness ? 15 : 0) +
    (hasWebPresence ? 20 : 0) +
    (profile?.objective ? 10 : 0) +
    10 // base
  ));

  // Build summary
  const activityLabel = profile?.activityType || "entrepreneure";
  const activityDomain = profile?.activity || "ton activité";
  const blockerLine = profile?.blocker === "invisible"
    ? "Tu te sens invisible et cherches à gagner en visibilité."
    : "Tu veux développer ta communication.";
  const insightLine = insights?.tips[0] ? ` Mon conseil : ${insights.tips[0].toLowerCase()}.` : "";
  const sourceLine = hasWebPresence
    ? ""
    : " J'ai pas eu accès à tes réseaux ni à ton site, donc je me base sur ce que tu m'as dit. Ajoute tes liens pour un diagnostic plus poussé.";

  const summary = `Tu es ${activityLabel} dans le domaine "${activityDomain}". ${blockerLine}${insightLine}${sourceLine}`;

  // Build priorities — use activity-specific first priority if available
  const priorities = [
    {
      title: insights?.priority || "Complète ton identité de marque",
      why: insights ? "C'est le levier le plus impactant pour ton type d'activité" : "Sans fondations claires, ta communication manque de cohérence",
      time: "30 min",
      route: insights ? "/storytelling" : "/storytelling",
      impact: "high",
    },
    {
      title: "Définis ta cliente idéale",
      why: "Savoir à qui tu parles change tout dans ton contenu",
      time: "20 min",
      route: "/persona",
      impact: "high",
    },
    {
      title: "Planifie tes premiers contenus",
      why: "La régularité est plus importante que la perfection",
      time: "15 min",
      route: "/calendrier",
      impact: "medium",
    },
  ];

  return {
    summary,
    strengths,
    weaknesses,
    scores: {
      total: totalScore,
      branding: totalScore,
      instagram: null,
      website: null,
      linkedin: null,
    },
    priorities,
    branding_prefill: {
      positioning: null,
      mission: null,
      target_description: null,
      tone_keywords: [],
      values: [],
      offers: [],
    },
    _fallback: true,
  };
}
