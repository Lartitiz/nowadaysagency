// Shared scraping utilities for edge functions (analyze-brand, deep-diagnostic, etc.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

export function extractTextFromHtml(html: string): string {
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "");

  const titleMatch = text.match(/<title[^>]*>(.*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : "";

  const metaMatch = text.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i);
  const metaDesc = metaMatch ? metaMatch[1].trim() : "";

  const headings: string[] = [];
  const hRegex = /<h[1-3][^>]*>(.*?)<\/h[1-3]>/gi;
  let match;
  while ((match = hRegex.exec(text)) !== null) {
    headings.push(match[1].replace(/<[^>]+>/g, "").trim());
  }

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

export async function scrapeWebsite(url: string, signal: AbortSignal): Promise<string | null> {
  let formattedUrl = url.trim();
  if (!formattedUrl.startsWith("http")) formattedUrl = `https://${formattedUrl}`;

  const resp = await fetch(formattedUrl, {
    signal,
    headers: { "User-Agent": "Mozilla/5.0 (compatible; BrandAnalyzer/1.0)" },
  });
  if (!resp.ok) return null;

  const html = await resp.text();
  const mainText = extractTextFromHtml(html);

  // Try about page
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

  // Try offers/services page
  const offerPaths = ["/services", "/offres", "/shop", "/boutique", "/prestations", "/tarifs", "/pricing", "/nos-offres"];
  let offersText = "";
  for (const path of offerPaths) {
    try {
      const offersUrl = new URL(path, formattedUrl).href;
      const offersResp = await fetch(offersUrl, {
        signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; BrandAnalyzer/1.0)" },
      });
      if (offersResp.ok) {
        const offersHtml = await offersResp.text();
        offersText = extractTextFromHtml(offersHtml);
        break;
      }
    } catch {
      // continue
    }
  }

  const sections = [`=== PAGE D'ACCUEIL ===\n${mainText}`];
  if (aboutText) sections.push(`=== PAGE À PROPOS ===\n${aboutText}`);
  if (offersText) sections.push(`=== PAGE OFFRES/SERVICES ===\n${offersText}`);

  return sections.join("\n\n").trim();
}

export async function scrapeInstagram(handle: string, signal: AbortSignal): Promise<string | null> {
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
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "fr-FR,fr;q=0.9",
      },
    });

    if (!resp.ok) return null;
    const html = await resp.text();

    const descMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["']/i);
    const titleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["']/i);

    const parts = [`Profil Instagram: @${username}`];
    if (titleMatch) parts.push(`Nom: ${titleMatch[1]}`);
    if (descMatch) parts.push(`Bio/Description: ${descMatch[1]}`);

    if (parts.length <= 1) return null;
    return parts.join("\n");
  } catch {
    return null;
  }
}

export async function scrapeLinkedin(url: string, signal: AbortSignal): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      signal,
      headers: {
        "User-Agent": USER_AGENT,
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

export async function processDocuments(
  supabase: ReturnType<typeof createClient>,
  documentIds: string[],
  userId: string,
  maxTextLength = 5000
): Promise<string | null> {
  const texts: string[] = [];

  for (const _docId of documentIds.slice(0, 5)) {
    try {
      const { data: files } = await supabase.storage
        .from("onboarding-uploads")
        .list(userId);

      if (!files || files.length === 0) continue;

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
          texts.push(`[Document uploadé: ${file.name} - contenu binaire non extractible directement]`);
        } else if (["png", "jpg", "jpeg", "webp"].includes(ext || "")) {
          texts.push(`[Image uploadée: ${file.name}]`);
        }

        if (texts.join("\n").length > maxTextLength) break;
      }
    } catch (e) {
      console.error(`Error processing doc:`, e);
    }
  }

  return texts.length > 0 ? texts.join("\n\n") : null;
}
