import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { scrapeWebsite, scrapeInstagram, scrapeLinkedin, processDocuments } from "../_shared/scraping.ts";
import { authenticateRequest, AuthError } from "../_shared/auth.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";

const MAX_TEXT_PER_SOURCE = 5000;
const GLOBAL_TIMEOUT_MS = 50000;

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GLOBAL_TIMEOUT_MS);

  try {
    const { userId } = await authenticateRequest(req);
    const { websiteUrl, instagramHandle, linkedinUrl, documentIds, documentText } = await req.json();

    const quota = await checkQuota(userId, "import");
    if (!quota.allowed) {
      clearTimeout(timeout);
      return new Response(JSON.stringify({ error: quota.message, quota }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const scrapedContent: Record<string, string> = {};
    const sourcesUsed: string[] = [];
    const sourcesFailed: string[] = [];

    // --- 1. SCRAPE WEBSITE ---
    if (websiteUrl) {
      try {
        const siteText = await scrapeWebsite(websiteUrl, controller.signal);
        if (siteText) {
          scrapedContent.website = siteText.slice(0, MAX_TEXT_PER_SOURCE);
          sourcesUsed.push("website");
        } else {
          sourcesFailed.push("website");
        }
      } catch (e) {
        console.error("Website scrape failed:", e);
        sourcesFailed.push("website");
      }
    }

    // --- 2. SCRAPE INSTAGRAM ---
    if (instagramHandle) {
      try {
        const igText = await scrapeInstagram(instagramHandle, controller.signal);
        if (igText) {
          scrapedContent.instagram = igText.slice(0, MAX_TEXT_PER_SOURCE);
          sourcesUsed.push("instagram");
        } else {
          sourcesFailed.push("instagram");
        }
      } catch (e) {
        console.error("Instagram scrape failed:", e);
        sourcesFailed.push("instagram");
      }
    }

    // --- 3. SCRAPE LINKEDIN ---
    if (linkedinUrl) {
      try {
        const liText = await scrapeLinkedin(linkedinUrl, controller.signal);
        if (liText) {
          scrapedContent.linkedin = liText.slice(0, MAX_TEXT_PER_SOURCE);
          sourcesUsed.push("linkedin");
        } else {
          sourcesFailed.push("linkedin");
        }
      } catch (e) {
        console.error("LinkedIn scrape failed:", e);
        sourcesFailed.push("linkedin");
      }
    }

    // --- 4. PROCESS DOCUMENTS ---
    if (documentIds && documentIds.length > 0) {
      try {
        const docsText = await processDocuments(supabaseAdmin, documentIds, userId);
        if (docsText) {
          scrapedContent.documents = docsText.slice(0, MAX_TEXT_PER_SOURCE);
          sourcesUsed.push("documents");
        } else {
          sourcesFailed.push("documents");
        }
      } catch (e) {
        console.error("Documents processing failed:", e);
        sourcesFailed.push("documents");
      }
    }

    // --- 5. PROCESS CLIENT-EXTRACTED TEXT ---
    if (documentText && typeof documentText === "string" && documentText.trim().length > 0) {
      scrapedContent.documents = documentText.slice(0, MAX_TEXT_PER_SOURCE * 2);
      if (!sourcesUsed.includes("documents")) sourcesUsed.push("documents");
    }


    if (sourcesUsed.length === 0) {
      clearTimeout(timeout);
      return new Response(
        JSON.stringify({
          error: "Aucune source n'a pu être analysée. Vérifie tes liens et réessaie.",
          sources_failed: sourcesFailed,
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- 5. CALL CLAUDE ---
    const analysisResult = await callClaude(scrapedContent, sourcesUsed);

    // --- 6. SAVE TO DB ---
    const { data: wsData } = await supabaseAdmin
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", userId)
      .eq("role", "owner")
      .limit(1)
      .single();

    const { data: savedData, error: saveError } = await supabaseAdmin
      .from("branding_autofill")
      .insert({
        user_id: userId,
        workspace_id: wsData?.workspace_id || null,
        website_url: websiteUrl || null,
        instagram_handle: instagramHandle || null,
        linkedin_url: linkedinUrl || null,
        document_ids: documentIds || null,
        analysis_result: analysisResult,
        sources_used: sourcesUsed,
        sources_failed: sourcesFailed,
        overall_confidence: analysisResult?.overall_confidence || "medium",
        autofill_pending_review: true,
      })
      .select("id")
      .single();

    if (saveError) {
      console.error("Save error:", saveError);
    }

    await logUsage(userId, "import", "analyze_brand");
    clearTimeout(timeout);
    return new Response(
      JSON.stringify({
        success: true,
        id: savedData?.id,
        analysis: analysisResult,
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
    console.error("analyze-brand error:", e);
    return new Response(
      JSON.stringify({ error: "Erreur interne du serveur" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ====== CLAUDE API ======

async function callClaude(
  content: Record<string, string>,
  sourcesUsed: string[]
): Promise<Record<string, unknown>> {
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY non configurée");

  const systemPrompt = `Tu es un·e expert·e en communication et branding. On te donne le contenu en ligne d'une entreprise ou d'un·e solopreneur·e. Ta mission : analyser tout ça et pré-remplir 7 sections de branding.

Pour chaque section, donne une réponse structurée en JSON. Sois concret·e, précis·e, et utilise les mots que la personne utilise elle-même sur ses supports. Ne sois pas générique.

Si tu n'as pas assez d'infos pour remplir une section, mets "confidence": "low" et explique ce qui manque. Si tu es confiant·e, mets "confidence": "high".

Réponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans backticks.

Structure attendue :
{
  "story": { "confidence": "high|medium|low", "origin": "", "trigger": "", "struggles": "", "uniqueness": "", "vision": "", "full_story": "" },
  "persona": { "confidence": "high|medium|low", "name": "", "age_range": "", "job": "", "description": "", "goals": [], "frustrations": [], "desires": [], "channels": [], "brands_they_follow": [], "beautiful_world": "", "first_actions": "" },
  "value_proposition": { "confidence": "high|medium|low", "key_phrase": "", "problem": "", "solution": "", "differentiator": "", "proofs": [] },
  "tone_style": { "confidence": "high|medium|low", "tone_keywords": [], "voice_description": "", "tone_register": "", "tone_level": "", "tone_style_chip": "", "tone_humor": "", "tone_engagement": "", "i_do": [], "i_never_do": [], "fights": [], "key_expressions": "", "things_to_avoid": "", "target_verbatims": "", "channels": [], "visual_style": "" },
  "content_strategy": { "confidence": "high|medium|low", "pillars": [], "creative_twist": "", "formats": [], "rhythm": "", "editorial_line": "" },
  "offers": { "confidence": "high|medium|low", "offers": [{ "name": "", "price": "", "description": "", "target": "", "promise": "" }] },
  "charter": { "confidence": "high|medium|low", "color_primary": "", "color_secondary": "", "color_accent": "", "color_background": "", "font_title": "", "font_body": "", "mood_keywords": [], "visual_style_description": "" },
  "sources_used": [],
  "sources_failed": [],
  "overall_confidence": "high|medium|low",
  "missing_info": ""
}

Précisions sur tone_style :
- voice_description : une phrase décrivant le ton global ("Direct et chaleureux, comme une amie experte")
- tone_register : "tutoiement" ou "vouvoiement"
- tone_level : "accessible", "expert", "technique" ou "vulgarisateur"
- tone_style_chip : "direct", "poétique", "storytelling", "factuel" ou autre
- tone_humor : "auto-dérision", "absurde", "pince-sans-rire", "pas d'humour" ou autre
- tone_engagement : "militant", "discret", "modéré"
- key_expressions : expressions ou mots récurrents sur le site (séparés par des virgules)
- things_to_avoid : mots ou formulations que cette marque évite visiblement
- target_verbatims : phrases que la cible pourrait dire (déduit du positionnement)
- channels : canaux de communication détectés (ex: ["instagram", "newsletter", "site web"])

Précisions sur persona :
- description : description courte du persona en une phrase (ex: "Solopreneuse créative, 30-40 ans, artisane ou prestataire de service")
- beautiful_world : dans un monde idéal, à quoi ressemblerait la situation de cette personne ?
- first_actions : quelles seraient les premières actions concrètes que cette personne ferait en travaillant avec cette marque ?

Précisions sur charter :
- Remplis les couleurs UNIQUEMENT si tu détectes des codes HEX ou des couleurs spécifiques dans les informations visuelles. Ne pas inventer de couleurs.
- font_title et font_body : les typographies détectées dans le CSS ou Google Fonts. font_title = la première typo détectée (souvent les titres), font_body = la deuxième (souvent le corps de texte).
- mood_keywords : 3 à 5 mots décrivant l'ambiance visuelle (ex: ["minimaliste", "coloré", "chaleureux", "pop"])
- visual_style_description : description courte du style visuel global
- Si aucune information visuelle n'est présente dans les sources, mets confidence: "low" et laisse les champs vides.`;

  const userPrompt = Object.entries(content)
    .map(([source, text]) => `=== SOURCE: ${source.toUpperCase()} ===\n${text}`)
    .join("\n\n");

  const makeRequest = async (retry = false): Promise<Record<string, unknown>> => {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (resp.status === 429 && !retry) {
      console.log("Rate limited, retrying in 2s...");
      await new Promise((r) => setTimeout(r, 2000));
      return makeRequest(true);
    }

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("Claude API error:", resp.status, errText);
      throw new Error(`Claude API error: ${resp.status}`);
    }

    const data = await resp.json();
    const textContent = data.content?.find((c: { type: string }) => c.type === "text")?.text || "{}";

    try {
      return JSON.parse(textContent);
    } catch {
      console.error("Failed to parse Claude response as JSON:", textContent.slice(0, 500));
      const jsonMatch = textContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error("Réponse Claude invalide (pas du JSON)");
    }
  };

  const result = await makeRequest();
  result.sources_used = sourcesUsed;
  return result;
}
