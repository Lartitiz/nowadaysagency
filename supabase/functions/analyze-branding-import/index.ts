import { callAnthropicSimple } from "../_shared/anthropic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── HTML to text helper ──
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Fetch a URL and extract text ──
async function fetchPageText(url: string): Promise<string> {
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BrandingImporter/1.0)" },
      redirect: "follow",
    });
    if (!resp.ok) return "";
    const html = await resp.text();
    return htmlToText(html);
  } catch {
    return "";
  }
}

// ── Find key sub-pages from homepage HTML ──
function findKeyPageLinks(html: string, baseUrl: string): string[] {
  const keywords = [
    "a-propos", "about", "qui-suis-je", "qui-je-suis", "mon-histoire",
    "services", "offres", "prestations", "accompagnement", "coaching",
    "tarifs", "prix", "pricing",
  ];

  const linkRegex = /href=["']([^"']+)["']/gi;
  const found = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    if (keywords.some((kw) => href.toLowerCase().includes(kw))) {
      try {
        const full = new URL(href, baseUrl).href;
        if (full.startsWith(new URL(baseUrl).origin)) {
          found.add(full);
        }
      } catch { /* skip invalid URLs */ }
    }
  }

  return Array.from(found).slice(0, 5);
}

// ── Main handler ──
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, url } = await req.json();

    let documentText = "";

    if (url) {
      // Fetch homepage
      const homepageResp = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; BrandingImporter/1.0)" },
        redirect: "follow",
      });

      if (!homepageResp.ok) {
        return new Response(
          JSON.stringify({ error: "On n'arrive pas à accéder à ce site. Essaie de coller le texte directement." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const homepageHtml = await homepageResp.text();
      documentText = htmlToText(homepageHtml);

      // Find and fetch key pages
      const keyLinks = findKeyPageLinks(homepageHtml, url);
      console.log("Key pages found:", keyLinks);

      const subTexts = await Promise.all(keyLinks.map(fetchPageText));
      for (const st of subTexts) {
        if (st.length > 50) documentText += "\n\n---\n\n" + st;
      }

      if (documentText.length < 200) {
        return new Response(
          JSON.stringify({ error: "Ton site n'a pas assez de texte pour qu'on puisse extraire des infos. Essaie avec un document ou du texte collé." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else if (text) {
      documentText = text;
    } else {
      return new Response(
        JSON.stringify({ error: "Fournis un texte ou une URL à analyser." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Truncate to ~15000 chars to stay within token limits
    if (documentText.length > 15000) {
      documentText = documentText.slice(0, 15000) + "\n\n[... texte tronqué]";
    }

    const systemPrompt = `Tu es une experte en communication et branding pour solopreneuses et freelances.
L'utilisatrice t'envoie un document stratégique existant (plan de com, brief, notes, ou contenu de son site web).

Analyse le texte et extrais TOUTES les informations que tu peux trouver.

Pour chaque champ, retourne :
- "value": la valeur extraite (reformulée proprement si nécessaire, en français)
- "confidence": "high" (clairement dans le texte), "medium" (déduit), ou "low" (hypothèse)
- Si tu ne trouves rien, retourne "value": null

RETOURNE UNIQUEMENT un objet JSON valide avec ces champs :
{
  "positioning": { "value": "...", "confidence": "..." },
  "mission": { "value": "...", "confidence": "..." },
  "voice_description": { "value": "description de son ton de communication", "confidence": "..." },
  "values": { "value": "ses valeurs (liste séparée par des virgules)", "confidence": "..." },
  "unique_proposition": { "value": "sa proposition de valeur unique", "confidence": "..." },
  "for_whom": { "value": "pour qui elle travaille", "confidence": "..." },
  "target_description": { "value": "description de sa cible", "confidence": "..." },
  "target_frustrations": { "value": "frustrations de sa cible", "confidence": "..." },
  "target_desires": { "value": "désirs et transformation souhaitée de sa cible", "confidence": "..." },
  "story": { "value": "son histoire / storytelling de marque", "confidence": "..." },
  "content_pillars": { "value": "ses piliers de contenu (liste)", "confidence": "..." },
  "key_expressions": { "value": "expressions ou mots qu'elle utilise souvent", "confidence": "..." },
  "things_to_avoid": { "value": "mots ou choses à éviter", "confidence": "..." },
  "combat_cause": { "value": "sa cause ou son combat", "confidence": "..." },
  "channels": { "value": "ses canaux de communication (liste)", "confidence": "..." },
  "offers": { "value": "description de ses offres", "confidence": "..." }
}

IMPORTANT : retourne UNIQUEMENT le JSON, sans texte avant ni après. Pas de markdown.`;

    const userPrompt = `Voici le document à analyser :\n\n${documentText}`;

    const raw = await callAnthropicSimple(
      "claude-sonnet-4-5-20250929",
      systemPrompt,
      userPrompt,
      0.3,
      4096
    );

    // Parse JSON from response
    let extraction: Record<string, any>;
    try {
      // Try to find JSON in the response
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found");
      extraction = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error("Failed to parse AI response:", raw);
      return new Response(
        JSON.stringify({ error: "Erreur lors de l'analyse. Réessaie." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ extraction }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("analyze-branding-import error:", e);
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
