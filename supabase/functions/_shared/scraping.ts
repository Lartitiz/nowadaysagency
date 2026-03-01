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

async function jinaFetch(targetUrl: string, signal: AbortSignal): Promise<string | null> {
  try {
    const resp = await fetch(`https://r.jina.ai/${targetUrl}`, {
      signal,
      headers: {
        "Accept": "application/json",
        "X-No-Cache": "true",
        "X-With-Links": "false",
        "X-With-Images": "false",
      },
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    const content = json?.data?.content;
    return typeof content === "string" && content.length > 20 ? content : null;
  } catch {
    return null;
  }
}

// Scoring keywords for URL relevance
const SCORE_HIGH: string[] = [
  "offre", "service", "tarif", "prix", "pricing", "accompagnement", "formation",
  "programme", "shop", "boutique", "prestation",
];
const SCORE_MEDIUM: string[] = [
  "about", "propos", "histoire", "mission", "qui", "manifeste", "equipe", "fondatrice",
];
const SCORE_LOW: string[] = [
  "blog", "article", "actualit", "ressource", "template", "guide",
];
const SCORE_NEGATIVE: string[] = [
  "mentions-legales", "confidentialite", "cgv", "cgu", "politique", "cart", "checkout",
  "login", "tag", "category", "author", "privacy", "legal", "wp-admin", "wp-login",
  "feed", "rss", "sitemap",
];

// Patterns to exclude from discovered links
const EXCLUDED_PATTERNS = [
  /^#/, /^mailto:/, /^tel:/, /^javascript:/,
  /wp-content/i, /wp-includes/i, /\/images\//i, /\/assets\//i, /\/static\//i,
  /instagram\.com/i, /facebook\.com/i, /twitter\.com/i, /x\.com/i, /linkedin\.com/i,
  /youtube\.com/i, /tiktok\.com/i, /pinterest\.com/i,
  /calendly\.com/i, /typeform\.com/i, /stripe\.com/i, /gumroad\.com/i,
  /\.(jpg|jpeg|png|gif|svg|webp|pdf|zip|mp4|mp3)$/i,
];

interface JinaLink {
  text?: string;
  href?: string;
}

const MAX_TEXT_PER_SOURCE = 8000;

function scoreUrl(href: string, baseHostname: string): number {
  try {
    const linkUrl = new URL(href);
    // Must be same domain
    if (linkUrl.hostname !== baseHostname) return -10;
    // Must not be the homepage itself
    if (linkUrl.pathname === "/" || linkUrl.pathname === "") return -10;
    // Check exclusion patterns
    for (const pattern of EXCLUDED_PATTERNS) {
      if (pattern.test(href) || pattern.test(linkUrl.pathname)) return -10;
    }
    const pathLower = decodeURIComponent(linkUrl.pathname).toLowerCase();
    let score = 0;
    if (SCORE_NEGATIVE.some(kw => pathLower.includes(kw))) return -5;
    if (SCORE_HIGH.some(kw => pathLower.includes(kw))) score += 3;
    if (SCORE_MEDIUM.some(kw => pathLower.includes(kw))) score += 2;
    if (SCORE_LOW.some(kw => pathLower.includes(kw))) score += 1;
    return score;
  } catch {
    return -10;
  }
}

async function fetchSitemapUrls(baseUrl: string, signal: AbortSignal): Promise<string[]> {
  try {
    const sitemapUrl = new URL("/sitemap.xml", baseUrl).href;
    const resp = await fetch(sitemapUrl, {
      signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BrandAnalyzer/1.0)" },
    });
    if (!resp.ok) return [];
    const xml = await resp.text();
    if (!xml.includes("<urlset") && !xml.includes("<sitemapindex")) return [];

    const baseHostname = new URL(baseUrl).hostname;
    const locRegex = /<loc>\s*(.*?)\s*<\/loc>/g;
    const scored: { url: string; score: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = locRegex.exec(xml)) !== null) {
      const loc = m[1].trim();
      const s = scoreUrl(loc, baseHostname);
      if (s > 0) scored.push({ url: loc, score: s });
    }
    // Sort by score descending, take top 3
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 3).map(s => s.url);
  } catch {
    return [];
  }
}

async function discoverLinksFromHomepage(
  formattedUrl: string,
  signal: AbortSignal
): Promise<{ links: string[]; homepageContent: string | null }> {
  try {
    const resp = await fetch(`https://r.jina.ai/${formattedUrl}`, {
      signal,
      headers: {
        "Accept": "application/json",
        "X-No-Cache": "true",
        "X-With-Links": "true",
        "X-With-Images": "false",
      },
    });
    if (!resp.ok) return { links: [], homepageContent: null };
    const json = await resp.json();

    // Extract homepage content from same call
    const content = json?.data?.content;
    const homepageContent = typeof content === "string" && content.length > 20 ? content : null;

    const links: JinaLink[] = json?.data?.links;
    if (!Array.isArray(links)) return { links: [], homepageContent };

    const baseHostname = new URL(formattedUrl).hostname;
    const seen = new Set<string>();
    const scored: { url: string; score: number }[] = [];

    for (const link of links) {
      if (!link.href) continue;
      let fullHref: string;
      try {
        fullHref = new URL(link.href, formattedUrl).href;
      } catch {
        continue;
      }
      const normalized = fullHref.replace(/\/$/, "");
      if (seen.has(normalized)) continue;
      seen.add(normalized);

      const s = scoreUrl(fullHref, baseHostname);
      if (s > 0) scored.push({ url: fullHref, score: s });
    }

    scored.sort((a, b) => b.score - a.score);
    return { links: scored.slice(0, 3).map(s => s.url), homepageContent };
  } catch {
    return { links: [], homepageContent: null };
  }
}

export async function scrapeWebsite(url: string, signal: AbortSignal): Promise<string | null> {
  let formattedUrl = url.trim();
  if (!formattedUrl.startsWith("http")) formattedUrl = `https://${formattedUrl}`;

  let mainText: string | null = null;
  let secondaryUrls: string[] = [];
  let jinaCallsUsed = 0;

  // ÉTAPE 1 : Try sitemap first (1 fetch, not a Jina call)
  const sitemapUrls = await fetchSitemapUrls(formattedUrl, signal);

  if (sitemapUrls.length > 0) {
    // Sitemap found! Scrape homepage via Jina (call 1)
    mainText = await jinaFetch(formattedUrl, signal);
    jinaCallsUsed++;
    secondaryUrls = sitemapUrls.slice(0, 2); // max 2 secondary
  } else {
    // ÉTAPE 2 : No sitemap → discover links from homepage via Jina with X-With-Links (call 1)
    const { links, homepageContent } = await discoverLinksFromHomepage(formattedUrl, signal);
    jinaCallsUsed++;
    mainText = homepageContent;
    secondaryUrls = links.slice(0, 2);
  }

  // Fallback for main text if Jina failed
  if (!mainText) {
    try {
      const resp = await fetch(formattedUrl, {
        signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; BrandAnalyzer/1.0)" },
      });
      if (resp.ok) {
        const html = await resp.text();
        mainText = extractTextFromHtml(html);
      }
    } catch {
      // ignore
    }
  }

  if (!mainText) return null;

  // Scrape secondary pages in parallel (calls 2-3)
  let secondaryPages: { title: string; content: string }[] = [];

  if (secondaryUrls.length > 0) {
    const maxPerPage = Math.floor(MAX_TEXT_PER_SOURCE / 2);
    const results = await Promise.all(
      secondaryUrls.map(async (link) => {
        const text = await jinaFetch(link, signal);
        if (!text) return null;
        try {
          const pathname = new URL(link).pathname;
          const pageName = decodeURIComponent(pathname)
            .replace(/^\//, "")
            .replace(/\/$/, "")
            .replace(/-/g, " ")
            .replace(/\//g, " > ");
          return { title: pageName.toUpperCase(), content: text.slice(0, maxPerPage) };
        } catch {
          return { title: "PAGE SECONDAIRE", content: text.slice(0, maxPerPage) };
        }
      })
    );
    secondaryPages = results.filter((r): r is { title: string; content: string } => r !== null);
  }

  // Fallback: if nothing found, try generic paths (max 2 calls)
  if (secondaryPages.length === 0 && secondaryUrls.length === 0) {
    const aboutPaths = ["/about", "/a-propos", "/qui-suis-je", "/qui-sommes-nous"];
    const offerPaths = ["/services", "/offres", "/prestations", "/tarifs"];

    const tryFirstValid = async (paths: string[]): Promise<{ title: string; content: string } | null> => {
      for (const path of paths) {
        try {
          const fullUrl = new URL(path, formattedUrl).href;
          const text = await jinaFetch(fullUrl, signal);
          if (text) {
            const name = path.replace(/^\//, "").toUpperCase();
            return { title: name, content: text.slice(0, Math.floor(MAX_TEXT_PER_SOURCE / 2)) };
          }
        } catch {
          // continue
        }
      }
      return null;
    };

    const [aboutResult, offersResult] = await Promise.all([
      tryFirstValid(aboutPaths),
      tryFirstValid(offerPaths),
    ]);
    if (aboutResult) secondaryPages.push(aboutResult);
    if (offersResult) secondaryPages.push(offersResult);
  }

  const sections = [`=== PAGE D'ACCUEIL ===\n${mainText}`];
  for (const page of secondaryPages) {
    sections.push(`=== ${page.title} ===\n${page.content}`);
  }

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

export function extractTextFromPdfRegex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let raw = "";
  for (let i = 0; i < bytes.length; i++) raw += String.fromCharCode(bytes[i]);

  const decodeEscapes = (s: string) =>
    s.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t")
      .replace(/\\\(/g, "(").replace(/\\\)/g, ")").replace(/\\\\/g, "\\");

  const lines: string[] = [];
  const btRegex = /BT\s([\s\S]*?)ET/g;
  let m: RegExpExecArray | null;
  while ((m = btRegex.exec(raw)) !== null) {
    const block = m[1];
    const tjRegex = /\(([^)]*)\)\s*Tj/g;
    let tj: RegExpExecArray | null;
    while ((tj = tjRegex.exec(block)) !== null) {
      const t = decodeEscapes(tj[1]).trim();
      if (t) lines.push(t);
    }
    const tjArrRegex = /\[(.*?)\]\s*TJ/g;
    let tja: RegExpExecArray | null;
    while ((tja = tjArrRegex.exec(block)) !== null) {
      const parts: string[] = [];
      const itemRegex = /\(([^)]*)\)/g;
      let item: RegExpExecArray | null;
      while ((item = itemRegex.exec(tja[1])) !== null) {
        parts.push(decodeEscapes(item[1]));
      }
      const joined = parts.join("").trim();
      if (joined) lines.push(joined);
    }
    const hexRegex = /<([0-9a-fA-F]+)>\s*Tj/g;
    let hx: RegExpExecArray | null;
    while ((hx = hexRegex.exec(block)) !== null) {
      let txt = "";
      for (let i = 0; i < hx[1].length; i += 2) {
        txt += String.fromCharCode(parseInt(hx[1].substring(i, i + 2), 16));
      }
      if (txt.trim()) lines.push(txt.trim());
    }
  }

  if (lines.join("").length < 50) {
    const streamRegex = /stream\r?\n([\s\S]*?)endstream/g;
    let sm: RegExpExecArray | null;
    while ((sm = streamRegex.exec(raw)) !== null) {
      const readable = sm[1].replace(/[^\x20-\x7E\xC0-\xFF\n]/g, " ")
        .replace(/ {3,}/g, "\n").trim();
      if (readable.length > 20) lines.push(readable);
    }
  }

  const deduped: string[] = [];
  for (const line of lines) {
    if (deduped.length === 0 || deduped[deduped.length - 1] !== line) {
      deduped.push(line);
    }
  }

  return deduped.join("\n");
}

export async function extractTextFromPdf(buffer: ArrayBuffer, signal?: AbortSignal): Promise<string> {
  // Try Jina Reader first (handles modern PDFs with compression, encoded fonts, etc.)
  try {
    const resp = await fetch("https://r.jina.ai/", {
      method: "POST",
      signal,
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/pdf",
        "X-No-Cache": "true",
        "X-With-Links": "false",
        "X-With-Images": "false",
      },
      body: new Uint8Array(buffer),
    });
    if (resp.ok) {
      const json = await resp.json();
      const content = json?.data?.content;
      if (typeof content === "string" && content.length > 50) {
        return content;
      }
    }
  } catch {
    // Jina failed, fall through to regex
  }

  // Fallback: regex-based extraction
  return extractTextFromPdfRegex(buffer);
}

function parseDocxXml(xmlText: string): string {
  const paragraphs: string[] = [];
  const pRegex = /<w:p[^>]*>([\s\S]*?)<\/w:p>/g;
  let pm: RegExpExecArray | null;
  while ((pm = pRegex.exec(xmlText)) !== null) {
    const tRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
    let tm: RegExpExecArray | null;
    const parts: string[] = [];
    while ((tm = tRegex.exec(pm[1])) !== null) {
      parts.push(tm[1]);
    }
    const line = parts.join("").trim();
    if (line) paragraphs.push(line);
  }

  if (paragraphs.length === 0) {
    const fallbackRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
    let fb: RegExpExecArray | null;
    while ((fb = fallbackRegex.exec(xmlText)) !== null) {
      const t = fb[1].trim();
      if (t) paragraphs.push(t);
    }
  }

  return paragraphs.join("\n");
}

async function decompressDeflateAsync(compressed: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("raw");
  const writer = ds.writable.getWriter();
  writer.write(compressed);
  writer.close();

  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  let totalLen = 0;
  for (const c of chunks) totalLen += c.length;
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result;
}

async function extractFileFromZipAsync(data: Uint8Array, targetFile: string): Promise<Uint8Array | null> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;

  while (offset + 30 <= data.length) {
    // Check PK\x03\x04 signature
    if (view.getUint32(offset, true) !== 0x04034b50) break;

    const compressionMethod = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const fileNameLength = view.getUint16(offset + 26, true);
    const extraFieldLength = view.getUint16(offset + 28, true);

    const fileNameBytes = data.subarray(offset + 30, offset + 30 + fileNameLength);
    const fileName = new TextDecoder().decode(fileNameBytes);

    const dataStart = offset + 30 + fileNameLength + extraFieldLength;

    if (fileName === targetFile) {
      const fileData = data.subarray(dataStart, dataStart + compressedSize);
      if (compressionMethod === 0) return fileData;
      if (compressionMethod === 8) return await decompressDeflateAsync(fileData);
      return null;
    }

    offset = dataStart + compressedSize;
  }

  return null;
}

export async function extractTextFromDocxAsync(buffer: ArrayBuffer): Promise<string> {
  try {
    const data = new Uint8Array(buffer);
    const xmlBytes = await extractFileFromZipAsync(data, "word/document.xml");
    if (!xmlBytes) return "";
    const xmlText = new TextDecoder("utf-8").decode(xmlBytes);
    return parseDocxXml(xmlText);
  } catch {
    return "";
  }
}

export async function extractFromBlob(blob: Blob, fileName: string, signal?: AbortSignal): Promise<string | null> {
  const ext = fileName.split(".").pop()?.toLowerCase();

  // Detect by magic bytes first (handles double extensions like .docx.pdf)
  const buffer = await blob.arrayBuffer();
  const header = new Uint8Array(buffer.slice(0, 5));

  const isPKZip = header[0] === 0x50 && header[1] === 0x4B && header[2] === 0x03 && header[3] === 0x04;
  const isPDF = header[0] === 0x25 && header[1] === 0x50 && header[2] === 0x44 && header[3] === 0x46;

  if (isPKZip) {
    // ZIP-based format (docx, xlsx, etc.)
    let text = await extractTextFromDocxAsync(buffer);
    if (text.length < 20) {
      const rawText = await blob.text();
      const words = rawText.match(/[a-zA-ZÀ-ÿ]{2,}/g);
      text = words ? words.join(" ") : "";
    }
    return text || null;
  }

  if (isPDF) {
    const text = await extractTextFromPdf(buffer, signal);
    if (text.length < 50) {
      return `[PDF scanné : le texte n'a pas pu être extrait. Seuls les PDF textuels sont pris en charge.]`;
    }
    return text;
  }

  // Fallback to extension-based detection
  if (ext === "txt" || ext === "md") {
    return await blob.text();
  }

  if (ext === "pdf") {
    const text = await extractTextFromPdf(buffer, signal);
    if (text.length < 50) {
      return `[PDF scanné : le texte n'a pas pu être extrait. Seuls les PDF textuels sont pris en charge.]`;
    }
    return text;
  }

  if (ext === "docx" || ext === "doc") {
    let text = await extractTextFromDocxAsync(buffer);
    if (text.length < 20) {
      const rawText = await blob.text();
      const words = rawText.match(/[a-zA-ZÀ-ÿ]{2,}/g);
      text = words ? words.join(" ") : "";
    }
    return text || null;
  }

  if (["png", "jpg", "jpeg", "webp"].includes(ext || "")) {
    return `[Image uploadée : contenu visuel, non extractible en texte]`;
  }

  return null;
}

export async function processDocuments(
  supabase: ReturnType<typeof createClient>,
  documentIds: string[],
  userId: string,
  maxTextLength = 5000,
  signal?: AbortSignal
): Promise<string | null> {
  const texts: string[] = [];

  const { data: docs, error: docsError } = await supabase
    .from("user_documents")
    .select("id, file_name, file_url, file_type")
    .in("id", documentIds.slice(0, 5))
    .eq("user_id", userId);

  if (docsError || !docs || docs.length === 0) {
    console.error("processDocuments: no docs found", docsError);
    return null;
  }

  for (const doc of docs) {
    try {
      // Build file path from file_url
      let filePath = doc.file_url;
      if (filePath && !filePath.startsWith(userId)) {
        filePath = `${userId}/${filePath}`;
      }

      let fileData: Blob | null = null;

      // First attempt
      const { data: dl1, error: err1 } = await supabase.storage
        .from("onboarding-uploads")
        .download(filePath);
      if (!err1 && dl1) {
        fileData = dl1;
      } else {
        // Fallback: try raw file_url
        const { data: dl2, error: err2 } = await supabase.storage
          .from("onboarding-uploads")
          .download(doc.file_url);
        if (!err2 && dl2) {
          fileData = dl2;
        } else {
          console.error(`processDocuments: download failed for ${doc.file_name}`, err1, err2);
          continue;
        }
      }

      const extracted = await extractFromBlob(fileData, doc.file_name || "file.txt", signal);
      if (extracted) {
        texts.push(`[Document: ${doc.file_name}]\n${extracted}`);
      }

      if (texts.join("\n").length > maxTextLength) break;
    } catch (e) {
      console.error(`processDocuments: error on ${doc.file_name}:`, e);
    }
  }

  return texts.length > 0 ? texts.join("\n\n") : null;
}
