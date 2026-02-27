import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

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
    const { userId, websiteUrl, instagramHandle, linkedinUrl, documentIds } = await req.json();

    if (!userId) {
      return new Response(JSON.stringify({ error: "userId requis" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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

    // Check we have at least one source
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
    // Get user's workspace
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
    console.error("analyze-brand error:", e);
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ====== SCRAPING HELPERS ======

async function scrapeWebsite(url: string, signal: AbortSignal): Promise<string | null> {
  let formattedUrl = url.trim();
  if (!formattedUrl.startsWith("http")) formattedUrl = `https://${formattedUrl}`;

  const resp = await fetch(formattedUrl, {
    signal,
    headers: { "User-Agent": "Mozilla/5.0 (compatible; BrandAnalyzer/1.0)" },
  });
  if (!resp.ok) return null;

  const html = await resp.text();
  const mainText = extractTextFromHtml(html);

  // Try to find and scrape about page
  const aboutPaths = ["/about", "/a-propos", "/qui-suis-je", "/qui-sommes-nous", "/notre-histoire"];
  let aboutText = "";
  for (const path of aboutPaths) {
    try {
      const aboutUrl = new URL(path, formattedUrl).href;
      const aboutResp = await fetch(aboutUrl, {
        signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; BrandAnalyzer/1.0)" },
      });
      if (aboutResp.ok) {
        const aboutHtml = await aboutResp.text();
        aboutText = extractTextFromHtml(aboutHtml);
        break;
      }
    } catch {
      // continue
    }
  }

  return `=== PAGE D'ACCUEIL ===\n${mainText}\n\n=== PAGE À PROPOS ===\n${aboutText}`.trim();
}

function extractTextFromHtml(html: string): string {
  // Remove script and style tags
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "");

  // Extract title
  const titleMatch = text.match(/<title[^>]*>(.*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : "";

  // Extract meta description
  const metaMatch = text.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i);
  const metaDesc = metaMatch ? metaMatch[1].trim() : "";

  // Extract headings
  const headings: string[] = [];
  const hRegex = /<h[1-3][^>]*>(.*?)<\/h[1-3]>/gi;
  let match;
  while ((match = hRegex.exec(text)) !== null) {
    headings.push(match[1].replace(/<[^>]+>/g, "").trim());
  }

  // Extract paragraphs
  const paragraphs: string[] = [];
  const pRegex = /<p[^>]*>(.*?)<\/p>/gi;
  while ((match = pRegex.exec(text)) !== null) {
    const p = match[1].replace(/<[^>]+>/g, "").trim();
    if (p.length > 20) paragraphs.push(p);
  }

  const parts = [];
  if (title) parts.push(`Titre: ${title}`);
  if (metaDesc) parts.push(`Description: ${metaDesc}`);
  if (headings.length) parts.push(`Titres: ${headings.join(" | ")}`);
  if (paragraphs.length) parts.push(`Contenu:\n${paragraphs.join("\n")}`);

  return parts.join("\n\n");
}

async function scrapeInstagram(handle: string, signal: AbortSignal): Promise<string | null> {
  let username = handle.trim();
  if (username.startsWith("https://")) {
    const match = username.match(/instagram\.com\/([^/?]+)/);
    if (match) username = match[1];
  }
  username = username.replace(/^@/, "");

  try {
    const resp = await fetch(`https://www.instagram.com/${username}/`, {
      signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "fr-FR,fr;q=0.9",
      },
    });

    if (!resp.ok) return null;
    const html = await resp.text();

    // Try to extract from meta tags
    const descMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["']/i);
    const titleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["']/i);

    const parts = [`Profil Instagram: @${username}`];
    if (titleMatch) parts.push(`Nom: ${titleMatch[1]}`);
    if (descMatch) parts.push(`Bio/Description: ${descMatch[1]}`);

    if (parts.length <= 1) return null; // Only username, no useful data
    return parts.join("\n");
  } catch {
    return null;
  }
}

async function scrapeLinkedin(url: string, signal: AbortSignal): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
    });

    if (!resp.ok) return null;
    const html = await resp.text();

    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i);

    const parts = [`Profil LinkedIn: ${url}`];
    if (titleMatch) parts.push(`Titre: ${titleMatch[1].trim()}`);
    if (descMatch) parts.push(`Description: ${descMatch[1].trim()}`);

    if (parts.length <= 1) return null;
    return parts.join("\n");
  } catch {
    return null;
  }
}

async function processDocuments(
  supabase: ReturnType<typeof createClient>,
  documentIds: string[],
  userId: string
): Promise<string | null> {
  const texts: string[] = [];

  for (const docId of documentIds.slice(0, 5)) {
    try {
      // Documents are stored in onboarding-uploads bucket with path: {userId}/{filename}
      const { data: files } = await supabase.storage
        .from("onboarding-uploads")
        .list(userId);

      if (!files || files.length === 0) continue;

      // Try to find the file by docId or get all files
      for (const file of files) {
        const { data: fileData } = await supabase.storage
          .from("onboarding-uploads")
          .download(`${userId}/${file.name}`);

        if (!fileData) continue;

        const ext = file.name.split(".").pop()?.toLowerCase();

        if (ext === "txt" || ext === "md") {
          const text = await fileData.text();
          texts.push(`[Document: ${file.name}]\n${text}`);
        } else if (ext === "pdf" || ext === "docx") {
          // For PDF/DOCX, we'll pass the filename info and let Claude know
          texts.push(`[Document uploadé: ${file.name} - contenu binaire non extractible directement]`);
        } else if (["png", "jpg", "jpeg", "webp"].includes(ext || "")) {
          texts.push(`[Image uploadée: ${file.name}]`);
        }

        if (texts.join("\n").length > MAX_TEXT_PER_SOURCE) break;
      }
    } catch (e) {
      console.error(`Error processing doc ${docId}:`, e);
    }
  }

  return texts.length > 0 ? texts.join("\n\n") : null;
}

// ====== CLAUDE API ======

async function callClaude(
  content: Record<string, string>,
  sourcesUsed: string[]
): Promise<Record<string, unknown>> {
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY non configurée");

  const systemPrompt = `Tu es un·e expert·e en communication et branding. On te donne le contenu en ligne d'une entreprise ou d'un·e solopreneur·e. Ta mission : analyser tout ça et pré-remplir 6 sections de branding.

Pour chaque section, donne une réponse structurée en JSON. Sois concret·e, précis·e, et utilise les mots que la personne utilise elle-même sur ses supports. Ne sois pas générique.

Si tu n'as pas assez d'infos pour remplir une section, mets "confidence": "low" et explique ce qui manque. Si tu es confiant·e, mets "confidence": "high".

Réponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans backticks.

Structure attendue :
{
  "story": { "confidence": "high|medium|low", "origin": "", "trigger": "", "struggles": "", "uniqueness": "", "vision": "", "full_story": "" },
  "persona": { "confidence": "high|medium|low", "name": "", "age_range": "", "job": "", "goals": [], "frustrations": [], "desires": [], "channels": [], "brands_they_follow": [] },
  "value_proposition": { "confidence": "high|medium|low", "key_phrase": "", "problem": "", "solution": "", "differentiator": "", "proofs": [] },
  "tone_style": { "confidence": "high|medium|low", "tone_keywords": [], "i_do": [], "i_never_do": [], "fights": [], "visual_style": "" },
  "content_strategy": { "confidence": "high|medium|low", "pillars": [], "creative_twist": "", "formats": [], "rhythm": "", "editorial_line": "" },
  "offers": { "confidence": "high|medium|low", "offers": [{ "name": "", "price": "", "description": "", "target": "", "promise": "" }] },
  "sources_used": [],
  "sources_failed": [],
  "overall_confidence": "high|medium|low",
  "missing_info": ""
}`;

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
        max_tokens: 4096,
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
      // Try to extract JSON from response
      const jsonMatch = textContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error("Réponse Claude invalide (pas du JSON)");
    }
  };

  const result = await makeRequest();
  // Inject actual sources info
  result.sources_used = sourcesUsed;
  return result;
}
