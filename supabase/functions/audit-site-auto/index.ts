import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { corsHeaders } from "../_shared/cors.ts";
import { callAnthropicSimple, getModelForAction } from "../_shared/anthropic.ts";
import { ANTI_SLOP } from "../_shared/copywriting-prompts.ts";
import { getUserContext, formatContextForAI } from "../_shared/user-context.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";

/* ─── Constants ─── */
const GLOBAL_TIMEOUT_MS = 60_000;
const PAGE_TIMEOUT_MS = 10_000;
const MAX_TEXT_PER_PAGE = 3000; // ~tokens
const USER_AGENT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

const BLOCKED_HOSTS = ["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"];

/* ─── HTML Parsing helpers (regex-based, no external lib) ─── */

function stripTags(html: string, tag: string): string {
  return html.replace(new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, "gi"), "");
}

function extractTag(html: string, tag: string): string | null {
  const m = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1].trim() : null;
}

function extractMetaContent(html: string, name: string): string | null {
  const m = html.match(new RegExp(`<meta[^>]*name=["']${name}["'][^>]*content=["']([^"']*)["']`, "i"))
    || html.match(new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*name=["']${name}["']`, "i"));
  return m ? m[1].trim() : null;
}

function extractAllTags(html: string, tag: string): string[] {
  const results: string[] = [];
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  let m;
  while ((m = re.exec(html)) !== null) {
    const text = m[1].replace(/<[^>]+>/g, "").trim();
    if (text) results.push(text);
  }
  return results;
}

function extractImages(html: string): { count: number; alts: string[] } {
  const alts: string[] = [];
  const re = /<img[^>]*>/gi;
  let m;
  let count = 0;
  while ((m = re.exec(html)) !== null) {
    count++;
    const altMatch = m[0].match(/alt=["']([^"']*)["']/i);
    if (altMatch && altMatch[1].trim()) alts.push(altMatch[1].trim());
  }
  return { count, alts };
}

function extractCTAs(html: string): string[] {
  const ctas: string[] = [];
  // buttons
  const btnRe = /<button[^>]*>([\s\S]*?)<\/button>/gi;
  let m;
  while ((m = btnRe.exec(html)) !== null) {
    const text = m[1].replace(/<[^>]+>/g, "").trim();
    if (text && text.length < 100) ctas.push(text);
  }
  // links with cta/btn/button class
  const linkRe = /<a[^>]*class=["'][^"']*(btn|button|cta)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = linkRe.exec(html)) !== null) {
    const text = m[2].replace(/<[^>]+>/g, "").trim();
    if (text && text.length < 100) ctas.push(text);
  }
  return [...new Set(ctas)];
}

function extractNavLinks(html: string): string[] {
  const navMatch = html.match(/<nav[^>]*>([\s\S]*?)<\/nav>/i);
  if (!navMatch) return [];
  const links: string[] = [];
  const linkRe = /<a[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = linkRe.exec(navMatch[1])) !== null) {
    const text = m[1].replace(/<[^>]+>/g, "").trim();
    if (text && text.length < 60) links.push(text);
  }
  return links;
}

function extractSocialLinks(html: string): string[] {
  const socials: string[] = [];
  const re = /href=["'](https?:\/\/(?:www\.)?(instagram|facebook|linkedin|twitter|x|tiktok|youtube|pinterest)\.[^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    socials.push(m[1]);
  }
  return [...new Set(socials)];
}

function hasForms(html: string): boolean {
  return /<form[\s>]/i.test(html);
}

function extractVisibleText(html: string): string {
  let cleaned = stripTags(html, "script");
  cleaned = stripTags(cleaned, "style");
  cleaned = stripTags(cleaned, "noscript");
  cleaned = stripTags(cleaned, "svg");
  // Remove all tags
  cleaned = cleaned.replace(/<[^>]+>/g, " ");
  // Decode common entities
  cleaned = cleaned.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&#\d+;/g, "").replace(/&[a-z]+;/gi, "");
  // Collapse whitespace
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned;
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "…";
}

/* ─── Page fetcher ─── */

interface PageData {
  path: string;
  error?: string;
  title?: string;
  metaDescription?: string;
  headings: { h1: string[]; h2: string[]; h3: string[] };
  visibleText: string;
  navLinks: string[];
  images: { count: number; alts: string[] };
  ctas: string[];
  hasForms: boolean;
  socialLinks: string[];
}

async function fetchPage(url: string, path: string): Promise<PageData> {
  const fullUrl = path === "/" || path === "" ? url : new URL(path, url).href;
  const result: PageData = {
    path: path || "/",
    headings: { h1: [], h2: [], h3: [] },
    visibleText: "",
    navLinks: [],
    images: { count: 0, alts: [] },
    ctas: [],
    hasForms: false,
    socialLinks: [],
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);

    const resp = await fetch(fullUrl, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      result.error = `HTTP ${resp.status}`;
      // Still try to parse if we got some HTML
      if (resp.status >= 500) return result;
    }

    const html = await resp.text();

    result.title = extractTag(html, "title") || undefined;
    result.metaDescription = extractMetaContent(html, "description") || undefined;
    result.headings.h1 = extractAllTags(html, "h1");
    result.headings.h2 = extractAllTags(html, "h2").slice(0, 15);
    result.headings.h3 = extractAllTags(html, "h3").slice(0, 15);
    result.visibleText = truncateText(extractVisibleText(html), MAX_TEXT_PER_PAGE * 4); // ~4 chars/token
    result.navLinks = extractNavLinks(html);
    result.images = extractImages(html);
    result.ctas = extractCTAs(html);
    result.hasForms = hasForms(html);
    result.socialLinks = extractSocialLinks(html);
  } catch (e: any) {
    result.error = e.name === "AbortError" ? "Timeout (10s)" : (e.message || "Erreur inconnue");
  }

  return result;
}

/* ─── URL validation ─── */

function validateUrl(raw: string): { valid: boolean; url?: string; error?: string } {
  let url = raw.trim();
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }
  try {
    const parsed = new URL(url);
    if (BLOCKED_HOSTS.includes(parsed.hostname)) {
      return { valid: false, error: "URLs internes non autorisées" };
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { valid: false, error: "Protocole non supporté" };
    }
    return { valid: true, url };
  } catch {
    return { valid: false, error: "URL invalide" };
  }
}

/* ─── Main ─── */

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const globalTimeout = setTimeout(() => {}, GLOBAL_TIMEOUT_MS);

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentification requise" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Non authentifié·e" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    // Rate limit check
    const rateCheck = checkRateLimit(userId);
    if (!rateCheck.allowed) return rateLimitResponse(rateCheck.retryAfterMs!, corsHeaders);

    // Parse body
    const body = await req.json();
    const { site_url, pages_to_audit, workspace_id } = body;

    if (!site_url || typeof site_url !== "string") {
      return new Response(JSON.stringify({ error: "site_url est obligatoire" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate URL
    const urlCheck = validateUrl(site_url);
    if (!urlCheck.valid) {
      return new Response(JSON.stringify({ error: urlCheck.error }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const baseUrl = urlCheck.url!;

    // Quota check
    const quota = await checkQuota(userId, "audit", workspace_id);
    if (!quota.allowed) {
      return new Response(JSON.stringify({ error: quota.message, quota: true }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build pages list
    const pages: string[] = ["/"];
    if (Array.isArray(pages_to_audit)) {
      for (const p of pages_to_audit.slice(0, 5)) {
        if (typeof p === "string" && p.startsWith("/")) pages.push(p);
      }
    }

    // Fetch all pages in parallel
    console.log(`[audit-site-auto] Fetching ${pages.length} pages for ${baseUrl}`);
    const pageResults = await Promise.all(pages.map(p => fetchPage(baseUrl, p)));

    const pagesOk = pageResults.filter(p => !p.error || p.visibleText);
    const pagesError = pageResults.filter(p => p.error && !p.visibleText).map(p => `${p.path} (${p.error})`);

    if (pagesOk.length === 0) {
      return new Response(JSON.stringify({
        error: "site_inaccessible",
        message: `Impossible d'accéder à ${baseUrl}. Vérifie que l'URL est correcte et que ton site est en ligne.`,
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user branding context
    const ctx = await getUserContext(supabase, userId, workspace_id);
    const brandingContext = formatContextForAI(ctx, {
      includeVoice: true,
      includeProfile: true,
      includeStory: false,
      includePersona: true,
      includeOffers: true,
      includeEditorial: false,
      includeAudit: false,
      includeCharter: true,
      includeMirror: false,
    });

    // Format page data for AI
    const pagesDataText = pagesOk.map(p => {
      const lines = [`\n--- PAGE : ${p.path} ---`];
      if (p.title) lines.push(`Title : ${p.title}`);
      if (p.metaDescription) lines.push(`Meta description : ${p.metaDescription}`);
      if (p.headings.h1.length) lines.push(`H1 : ${p.headings.h1.join(" | ")}`);
      if (p.headings.h2.length) lines.push(`H2 : ${p.headings.h2.join(" | ")}`);
      if (p.headings.h3.length) lines.push(`H3 : ${p.headings.h3.join(" | ")}`);
      if (p.navLinks.length) lines.push(`Navigation : ${p.navLinks.join(" | ")}`);
      lines.push(`Images : ${p.images.count} (alt renseignés : ${p.images.alts.length})`);
      if (p.ctas.length) lines.push(`CTA détectés : ${p.ctas.join(" | ")}`);
      lines.push(`Formulaires : ${p.hasForms ? "oui" : "non"}`);
      if (p.socialLinks.length) lines.push(`Réseaux sociaux : ${p.socialLinks.join(", ")}`);
      lines.push(`\nContenu visible :\n${p.visibleText}`);
      return lines.join("\n");
    }).join("\n");

    // Build AI prompt
    const systemPrompt = `Tu es une experte en conversion web et UX pour les solopreneuses créatives.

DONNÉES DU SITE :
${pagesDataText}

${pagesError.length ? `PAGES EN ERREUR : ${pagesError.join(", ")}` : ""}

PROFIL BRANDING DE L'UTILISATRICE :
${brandingContext || "(Aucun profil branding renseigné)"}

Analyse ce site et produis un audit complet en évaluant ces 8 piliers :

1. CLARTÉ DU MESSAGE (score /100)
- Le titre principal communique-t-il un bénéfice concret ?
- Comprend-on ce que fait la personne + pour qui en 10 secondes ?
- Y a-t-il un positionnement différenciant ?

2. COPYWRITING (score /100)
- Les titres parlent-ils de la cliente ou de la prestataire ?
- Le ton correspond-il à la cible ?
- Y a-t-il du micro-texte rassurant ?

3. PARCOURS UTILISATEUR·ICE (score /100)
- Le menu est-il simple (< 6 éléments) ?
- Chaque page a-t-elle un objectif clair ?
- Le CTA est-il visible sans scroller ?

4. CONFIANCE (score /100)
- Y a-t-il des témoignages ?
- Les prix ou le process sont-ils transparents ?
- Y a-t-il une page À propos avec photo/histoire ?

5. SEO BASIQUE (score /100)
- Le title et la meta description sont-ils optimisés ?
- Les titres (h1, h2) sont-ils structurés ?
- Les images ont-elles des alt text ?

6. COHÉRENCE AVEC LE BRANDING (score /100)
- Le ton du site correspond-il au profil de voix ?
- Les valeurs sont-elles visibles ?
- Le positionnement est-il cohérent avec le branding déclaré ?

7. APPELS À L'ACTION (score /100)
- Le CTA principal est-il clair et visible ?
- Y a-t-il plusieurs CTA répartis dans la page ?
- Le texte du CTA est-il orienté bénéfice ?

8. STRUCTURE & HIÉRARCHIE (score /100)
- Les sections sont-elles dans un ordre logique ?
- Y a-t-il une progression narrative (problème → solution → preuve → action) ?
- Le contenu est-il aéré ou c'est un mur de texte ?

Pour chaque pilier, donne :
- Un score sur 100
- Un statut : "absent", "flou", "bon", "excellent"
- Ce qui existe (points forts observés)
- Ce qui manque (lacunes identifiées)
- Une recommandation concrète et actionnable
- Si possible, un lien vers le module de l'outil qui peut aider

En plus des 8 piliers, produis :
- Un score global (moyenne pondérée ; clarté et CTA comptent double)
- Une synthèse en 3 phrases (ton direct, pas corporate)
- Les 3 points forts principaux
- Les 3 priorités d'action (classées par impact)
- Un plan d'action avec les modules de l'outil à utiliser
- Une analyse par page avec score, résumé et problèmes

ROUTES DES MODULES DISPONIBLES :
/site/textes : Générateur de textes site web
/site/sections : Générateur de sections
/site/inspirations : Inspirations visuelles
/seo : Hub SEO
/branding : Hub branding
/branding/charte : Charte graphique
/branding/storytelling : Storytelling
/branding/voix : Profil de voix

RÈGLES :
- Écriture inclusive point médian
- JAMAIS de tiret cadratin (remplace par : ou ;)
- Ton direct et chaleureux, comme une amie experte
- Suggestions concrètes (pas "améliorez votre SEO" mais "ajoute un h1 avec le bénéfice principal de ton offre")
- Si le profil branding est disponible, compare le site avec le branding déclaré et signale les incohérences

Réponds UNIQUEMENT en JSON (sans backticks) avec cette structure :
{
  "score_global": 58,
  "synthese": "...",
  "pages_analysees": ["/", "/a-propos"],
  "pages_en_erreur": [],
  "piliers": {
    "clarte": { "score": 65, "statut": "flou", "ce_qui_existe": "...", "ce_qui_manque": "...", "recommandation": "...", "module_route": "/site/textes" },
    "copywriting": { "score": 0, "statut": "absent", "ce_qui_existe": "...", "ce_qui_manque": "...", "recommandation": "...", "module_route": null },
    "parcours": { "score": 0, "statut": "absent", "ce_qui_existe": "...", "ce_qui_manque": "...", "recommandation": "...", "module_route": null },
    "confiance": { "score": 0, "statut": "absent", "ce_qui_existe": "...", "ce_qui_manque": "...", "recommandation": "...", "module_route": null },
    "seo": { "score": 0, "statut": "absent", "ce_qui_existe": "...", "ce_qui_manque": "...", "recommandation": "...", "module_route": "/seo" },
    "coherence_branding": { "score": 0, "statut": "absent", "ce_qui_existe": "...", "ce_qui_manque": "...", "recommandation": "...", "module_route": "/branding" },
    "cta": { "score": 0, "statut": "absent", "ce_qui_existe": "...", "ce_qui_manque": "...", "recommandation": "...", "module_route": null },
    "structure": { "score": 0, "statut": "absent", "ce_qui_existe": "...", "ce_qui_manque": "...", "recommandation": "...", "module_route": null }
  },
  "points_forts": [{ "titre": "...", "detail": "...", "pilier": "confiance" }],
  "priorites": [{ "titre": "...", "detail": "...", "impact": "fort", "pilier": "clarte", "module_route": "/site/textes", "module_label": "Générateur de textes" }],
  "plan_action": [{ "priorite": 1, "action": "...", "module": "...", "route": "...", "temps_estime": "10 min" }],
  "analyse_par_page": {
    "/": { "score": 62, "resume": "...", "problemes": ["..."] }
  }
}`;

    const rawResponse = await callAnthropicSimple(
      getModelForAction("audit"),
      systemPrompt + "\n\n" + ANTI_SLOP,
      "Analyse ce site et produis l'audit complet en JSON.",
      0.5,
      8192
    );

    // Parse JSON response
    let parsed;
    try {
      parsed = JSON.parse(rawResponse);
    } catch {
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try { parsed = JSON.parse(jsonMatch[0]); } catch { parsed = { raw: rawResponse }; }
      } else {
        parsed = { raw: rawResponse };
      }
    }

    // Inject metadata
    parsed.pages_analysees = pagesOk.map(p => p.path);
    parsed.pages_en_erreur = pagesError;

    // Log usage
    await logUsage(userId, "audit", "audit_site_auto", undefined, "claude-sonnet", workspace_id);

    clearTimeout(globalTimeout);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    clearTimeout(globalTimeout);
    console.error("[audit-site-auto] Error:", e);
    return new Response(JSON.stringify({ error: e.message || "Erreur inattendue" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
