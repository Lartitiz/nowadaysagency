import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { scrapeWebsite, scrapeInstagram, scrapeLinkedin, processDocuments } from "../_shared/scraping.ts";
import { callAnthropicSimple, getModelForAction } from "../_shared/anthropic.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";

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
    const {
      userId,
      websiteUrl,
      instagramHandle,
      linkedinUrl,
      documentIds,
      profile,
      freeformAnswers,
    } = await req.json();

    if (!userId) {
      clearTimeout(timeout);
      return new Response(JSON.stringify({ error: "userId requis" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    // Check quota (diagnostic = 3 credits, category: audit)
    const quota = await checkQuota(userId, "audit", workspaceId);
    if (!quota.allowed) {
      clearTimeout(timeout);
      return new Response(JSON.stringify({ error: quota.message, quota }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ====== SCRAPING ======
    const scrapedContent: Record<string, string> = {};
    const sourcesUsed: string[] = [];
    const sourcesFailed: string[] = [];

    // Scrape in parallel
    const scrapePromises: Promise<void>[] = [];

    if (websiteUrl) {
      scrapePromises.push(
        scrapeWebsite(websiteUrl, controller.signal)
          .then((text) => {
            if (text) {
              scrapedContent.website = text.slice(0, MAX_TEXT_PER_SOURCE);
              sourcesUsed.push("website");
            } else {
              sourcesFailed.push("website");
            }
          })
          .catch(() => { sourcesFailed.push("website"); })
      );
    }

    if (instagramHandle) {
      scrapePromises.push(
        scrapeInstagram(instagramHandle, controller.signal)
          .then((text) => {
            if (text) {
              scrapedContent.instagram = text.slice(0, MAX_TEXT_PER_SOURCE);
              sourcesUsed.push("instagram");
            } else {
              sourcesFailed.push("instagram");
            }
          })
          .catch(() => { sourcesFailed.push("instagram"); })
      );
    }

    if (linkedinUrl) {
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

    if (documentIds && documentIds.length > 0) {
      scrapePromises.push(
        processDocuments(supabaseAdmin, documentIds, userId, MAX_TEXT_PER_SOURCE)
          .then((text) => {
            if (text) {
              scrapedContent.documents = text.slice(0, MAX_TEXT_PER_SOURCE);
              sourcesUsed.push("documents");
            } else {
              sourcesFailed.push("documents");
            }
          })
          .catch(() => { sourcesFailed.push("documents"); })
      );
    }

    await Promise.allSettled(scrapePromises);

    // ====== BUILD PROMPT ======
    const systemPrompt = `Tu es l'assistante com' de Nowadays Agency. On te donne le contenu en ligne et les réponses d'une solopreneuse créative. Ta mission : faire un diagnostic de communication approfondi et honnête.

RÈGLES :
- Sois CONCRÈTE. Cite des exemples RÉELS tirés du contenu scrappé (extrait de caption, phrase du site, élément de bio). Ne dis jamais "ta communication est bonne" sans preuve.
- Sois HONNÊTE. Si quelque chose ne marche pas, dis-le clairement mais avec bienveillance.
- Utilise les MOTS de la personne. Tu as lu son contenu, parle comme elle.
- Utilise l'écriture inclusive avec le point médian.
- Tutoie.
- Pour le branding_prefill, déduis un maximum d'éléments depuis le contenu scrappé. Si tu trouves des offres sur le site, liste-les. Si tu peux deviner l'histoire, résume-la. Si tu identifies des combats ou convictions, note-les. Mieux vaut proposer quelque chose que la personne modifiera plutôt que laisser vide.
- Pour les offres, cherche : pages services, tarifs, accompagnements, formations, produits. Liste tout ce que tu trouves.
- Pour le story_draft, utilise ce que tu sais : la page à propos, les réponses libres (uniqueness, positioning), la bio.
- Pour les combats, identifie les causes défendues, les refus assumés, les convictions fortes visibles dans le contenu.
- Pour les content_pillars, identifie les 3 grands thèmes récurrents du contenu de la personne.

RÉPONDRE EN JSON (pas de markdown, pas de backticks) :

{
  "summary": "3-4 phrases qui résument ce que tu as compris de son projet. Elle doit se dire 'oui c'est exactement ça' en lisant.",
  "strengths": [
    { "title": "titre court", "detail": "explication concrète avec un exemple réel tiré du contenu", "source": "instagram|website|linkedin|documents" }
  ],
  "weaknesses": [
    { "title": "titre court", "detail": "explication concrète du problème avec données", "source": "instagram|website|linkedin|documents", "fix_hint": "une piste d'amélioration en une phrase" }
  ],
  "scores": {
    "total": 0,
    "branding": 0,
    "instagram": null,
    "website": null,
    "linkedin": null
  },
  "priorities": [
    { "title": "action concrète", "why": "pourquoi c'est prioritaire", "time": "durée estimée", "route": "route dans l'app", "impact": "high|medium" }
  ],
  "branding_prefill": {
    "positioning": "phrase de positionnement déduite. Ex : 'J'aide les solopreneuses créatives à être visibles sans se trahir.' ou null si pas assez d'info",
    "mission": "mission déduite. Ex : 'Rendre la communication accessible et joyeuse pour les créatrices éthiques.' ou null",
    "target_description": "description de la cible idéale déduite. Ex : 'Solopreneuse créative, 28-45 ans, engagée, qui veut communiquer sans se sentir vendue.' ou null",
    "tone_keywords": ["mot-clé 1", "mot-clé 2", "mot-clé 3"],
    "tone_style": "description du style de communication deviné en 1-2 phrases. Ex : 'Direct et chaleureux, oral assumé, avec humour discret et références pop.' ou null",
    "combats": ["conviction/engagement 1", "conviction 2", "conviction 3"],
    "values": ["valeur 1", "valeur 2", "valeur 3"],
    "content_pillars": ["pilier éditorial 1", "pilier 2", "pilier 3"],
    "story_draft": "2-4 phrases résumant l'histoire/parcours de la personne tel que deviné depuis son contenu. Le moment déclic, le pourquoi. ou null si pas assez d'info",
    "offers": [
      { "name": "nom de l'offre", "description": "description courte", "price": "prix si trouvé ou null" }
    ]
  }
}

LIMITES : 3-4 forces max, 3-4 faiblesses max, 3 priorités max. Qualité > quantité.
Les scores sont sur 100. Mets null pour les sources non analysées.
Pour les routes, utilise : /storytelling, /persona, /proposition, /calendrier, /engagement, /bio-profile, /audit-instagram, /strategie, /offre, /charte-graphique`;

    // Build user prompt
    const userParts: string[] = [];

    // Profile info
    if (profile) {
      userParts.push(`=== PROFIL ===
Activité : ${profile.activity || "non renseignée"}
Type : ${profile.activityType || "non renseigné"}
Objectif principal : ${profile.objective || "non renseigné"}
Blocage principal : ${profile.blocker || "non renseigné"}
Temps disponible/semaine : ${profile.weeklyTime || "non renseigné"}`);
    }

    // Freeform answers
    if (freeformAnswers) {
      const freeformParts: string[] = ["=== RÉPONSES LIBRES ==="];
      if (freeformAnswers.change_priority) freeformParts.push(`Priorité de changement : ${freeformAnswers.change_priority}`);
      if (freeformAnswers.product_or_service) freeformParts.push(`Produits ou services : ${freeformAnswers.product_or_service}`);
      if (freeformAnswers.uniqueness) freeformParts.push(`Ce qui te rend unique : ${freeformAnswers.uniqueness}`);
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

    const userPrompt = userParts.join("\n\n");

    // ====== CALL CLAUDE ======
    let analysisResult: Record<string, unknown>;

    try {
      const model = getModelForAction("branding_audit");
      const rawText = await callAnthropicSimple(model, systemPrompt, userPrompt, 0.7, 4096);

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
      console.error("Claude failed, using fallback:", claudeError);
      // Fallback: basic diagnostic from profile only
      analysisResult = buildFallbackDiagnostic(profile, freeformAnswers, sourcesUsed);
    }

    // ====== SAVE TO DB ======
    // 1. Save diagnostic_results
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
        branding_prefill: (analysisResult as any).branding_prefill || null,
        sources_used: sourcesUsed,
        sources_failed: sourcesFailed,
        raw_analysis: analysisResult,
      })
      .select("id")
      .single();

    // 2. Pre-fill brand_profile (upsert, don't overwrite existing)
    const prefill = (analysisResult as any).branding_prefill;
    if (prefill) {
      const filterCol = workspaceId ? "workspace_id" : "user_id";
      const filterVal = workspaceId || userId;

      const { data: existingProfile } = await supabaseAdmin
        .from("brand_profile")
        .select("id, positioning, mission, tone_keywords, tone_style, combats, values, content_pillars, content_editorial_line")
        .eq(filterCol, filterVal)
        .maybeSingle();

      if (existingProfile) {
        // Only fill empty fields
        const updates: Record<string, unknown> = {};
        if (!existingProfile.positioning && prefill.positioning) updates.positioning = prefill.positioning;
        if (!existingProfile.mission && prefill.mission) updates.mission = prefill.mission;
        if ((!existingProfile.tone_keywords || (Array.isArray(existingProfile.tone_keywords) && existingProfile.tone_keywords.length === 0)) && prefill.tone_keywords?.length) {
          updates.tone_keywords = prefill.tone_keywords;
        }
        if ((!existingProfile.values || (Array.isArray(existingProfile.values) && existingProfile.values.length === 0)) && prefill.values?.length) {
          updates.values = prefill.values;
        }
        if (!existingProfile.tone_style && prefill.tone_style) {
          updates.tone_style = prefill.tone_style;
        }
        if (!existingProfile.combats && prefill.combats?.length > 0) {
          updates.combats = Array.isArray(prefill.combats) ? prefill.combats.join("\n") : prefill.combats;
        }
        if ((!existingProfile.content_pillars || (Array.isArray(existingProfile.content_pillars) && existingProfile.content_pillars.length === 0)) && prefill.content_pillars?.length > 0) {
          updates.content_pillars = prefill.content_pillars;
        }

        if (Object.keys(updates).length > 0) {
          await supabaseAdmin
            .from("brand_profile")
            .update(updates)
            .eq("id", existingProfile.id);
        }
      } else {
        // Create brand_profile with all diagnostic data
        const newProfile: Record<string, unknown> = {
          user_id: userId,
          workspace_id: workspaceId,
        };
        if (prefill.positioning) newProfile.positioning = prefill.positioning;
        if (prefill.mission) newProfile.mission = prefill.mission;
        if (prefill.tone_keywords?.length) newProfile.tone_keywords = prefill.tone_keywords;
        if (prefill.tone_style) newProfile.tone_style = prefill.tone_style;
        if (prefill.combats?.length) newProfile.combats = Array.isArray(prefill.combats) ? prefill.combats.join("\n") : prefill.combats;
        if (prefill.values?.length) newProfile.values = prefill.values;
        if (prefill.content_pillars?.length) newProfile.content_pillars = prefill.content_pillars;

        await supabaseAdmin.from("brand_profile").insert(newProfile);
      }

      // 3. Pre-fill persona
      if (prefill.target_description) {
        const { data: existingPersona } = await supabaseAdmin
          .from("persona")
          .select("id, description")
          .eq(filterCol, filterVal)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingPersona && !existingPersona.description) {
          await supabaseAdmin
            .from("persona")
            .update({ description: prefill.target_description })
            .eq("id", existingPersona.id);
        } else if (!existingPersona) {
          await supabaseAdmin.from("persona").insert({
            user_id: userId,
            workspace_id: workspaceId,
            description: prefill.target_description,
            is_primary: true,
          });
        }
      }

      // 4. Pre-fill offers
      if (prefill.offers && Array.isArray(prefill.offers) && prefill.offers.length > 0) {
        const { count: existingOffersCount } = await supabaseAdmin
          .from("offers")
          .select("id", { count: "exact", head: true })
          .eq(filterCol, filterVal);

        if ((existingOffersCount || 0) === 0) {
          const offersToInsert = prefill.offers
            .filter((o: any) => o.name || o.title)
            .slice(0, 5)
            .map((o: any, i: number) => ({
              user_id: userId,
              workspace_id: workspaceId,
              name: o.name || o.title,
              promise: o.description || o.promise || null,
              price_text: o.price || null,
              offer_type: "paid",
              sort_order: i,
            }));

          if (offersToInsert.length > 0) {
            await supabaseAdmin.from("offers").insert(offersToInsert);
          }
        }
      }

      // 5. Pre-fill storytelling draft
      if (prefill.story_draft) {
        const { data: existingStory } = await supabaseAdmin
          .from("storytelling")
          .select("id")
          .eq(filterCol, filterVal)
          .limit(1)
          .maybeSingle();

        if (!existingStory) {
          await supabaseAdmin.from("storytelling").insert({
            user_id: userId,
            workspace_id: workspaceId,
            imported_text: prefill.story_draft,
            source: "diagnostic_prefill",
            is_primary: true,
          });
        }
      }
    }

    // 6. Save priorities as audit_recommendations
    const priorities = (analysisResult as any).priorities;
    if (priorities && Array.isArray(priorities)) {
      const recsToInsert = priorities.map((p: any, i: number) => ({
        user_id: userId,
        workspace_id: workspaceId,
        label: p.title,
        titre: p.title,
        module: "diagnostic",
        route: p.route || "/dashboard",
        detail: p.why || null,
        temps_estime: p.time || null,
        priorite: p.impact || "medium",
        position: i + 1,
        completed: false,
      }));

      await supabaseAdmin.from("audit_recommendations").insert(recsToInsert);
    }

    // 7. Log usage (3 credits for diagnostic)
    for (let i = 0; i < 3; i++) {
      await logUsage(userId, "audit", "deep_diagnostic", undefined, "claude-opus", workspaceId);
    }

    clearTimeout(timeout);
    return new Response(
      JSON.stringify({
        success: true,
        id: savedDiag?.id,
        diagnostic: analysisResult,
        sources_used: sourcesUsed,
        sources_failed: sourcesFailed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    clearTimeout(timeout);
    console.error("deep-diagnostic error:", e);
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ====== FALLBACK DIAGNOSTIC ======

function buildFallbackDiagnostic(
  profile: any,
  freeformAnswers: any,
  sourcesUsed: string[]
): Record<string, unknown> {
  const hasWebPresence = sourcesUsed.length > 0;

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

  if (!hasWebPresence) {
    weaknesses.push({
      title: "Présence en ligne limitée",
      detail: "Je n'ai pas pu analyser de site web ni de réseaux sociaux. Sans présence en ligne visible, tes client·es potentiel·les ont du mal à te trouver.",
      source: "profile",
      fix_hint: "Commence par optimiser ta bio Instagram ou créer une page simple.",
    });
  }

  if (profile?.blocker === "invisible") {
    weaknesses.push({
      title: "Manque de visibilité",
      detail: "Tu te sens invisible — c'est le blocage principal que tu as identifié. Souvent, c'est une question de régularité et de clarté dans le message.",
      source: "profile",
      fix_hint: "Définis tes 3 piliers de contenu et publie 2-3 fois par semaine.",
    });
  }

  const totalScore = Math.min(100, Math.max(10, 
    (profile?.activity ? 15 : 0) +
    (freeformAnswers?.uniqueness ? 15 : 0) +
    (hasWebPresence ? 20 : 0) +
    (profile?.objective ? 10 : 0) +
    10 // base
  ));

  return {
    summary: `Tu es ${profile?.activityType || "entrepreneure"} dans le domaine "${profile?.activity || "ton activité"}". ${profile?.blocker === "invisible" ? "Tu te sens invisible et cherches à gagner en visibilité." : "Tu veux développer ta communication."} Ce diagnostic est basé sur tes réponses — pour un résultat plus précis, ajoute tes liens (site, Instagram, LinkedIn).`,
    strengths,
    weaknesses,
    scores: {
      total: totalScore,
      branding: totalScore,
      instagram: null,
      website: null,
      linkedin: null,
    },
    priorities: [
      {
        title: "Complète ton identité de marque",
        why: "Sans fondations claires, ta communication manque de cohérence",
        time: "30 min",
        route: "/storytelling",
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
    ],
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
