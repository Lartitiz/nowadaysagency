import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { corsHeaders } from "../_shared/cors.ts";
import { callAnthropicSimple, getModelForAction } from "../_shared/anthropic.ts";
import { ANTI_SLOP } from "../_shared/copywriting-prompts.ts";
import { getUserContext, formatContextForAI } from "../_shared/user-context.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";

/* ─── Constants ─── */
const PAGE_TIMEOUT_MS = 15_000;
const MAX_TEXT_CHARS = 14_000; // ~3500 tokens
const USER_AGENT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const BLOCKED_HOSTS = ["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"];

/* ─── HTML helpers ─── */

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

function extractCTAs(html: string): string[] {
  const ctas: string[] = [];
  const btnRe = /<button[^>]*>([\s\S]*?)<\/button>/gi;
  let m;
  while ((m = btnRe.exec(html)) !== null) {
    const text = m[1].replace(/<[^>]+>/g, "").trim();
    if (text && text.length < 100) ctas.push(text);
  }
  const linkRe = /<a[^>]*class=["'][^"']*(btn|button|cta)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = linkRe.exec(html)) !== null) {
    const text = m[2].replace(/<[^>]+>/g, "").trim();
    if (text && text.length < 100) ctas.push(text);
  }
  return [...new Set(ctas)];
}

function extractVisibleText(html: string): string {
  let cleaned = stripTags(html, "script");
  cleaned = stripTags(cleaned, "style");
  cleaned = stripTags(cleaned, "noscript");
  cleaned = stripTags(cleaned, "svg");
  cleaned = cleaned.replace(/<[^>]+>/g, " ");
  cleaned = cleaned.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&#\d+;/g, "").replace(/&[a-z]+;/gi, "");
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned;
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

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "…";
}

/* ─── Section detection helpers ─── */

function detectSectionsFromHTML(html: string): string {
  // Try to extract meaningful section-level blocks for the AI
  const sections: string[] = [];
  
  // Extract <section>, <article>, or large <div> blocks with ids/classes
  const sectionRe = /<(section|article)[^>]*(?:id=["']([^"']*)["'])?[^>]*(?:class=["']([^"']*)["'])?[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = sectionRe.exec(html)) !== null) {
    const id = m[2] || "";
    const cls = m[3] || "";
    const innerText = m[4].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (innerText.length > 30) {
      sections.push(`[section id="${id}" class="${cls}"] ${truncateText(innerText, 800)}`);
    }
  }

  if (sections.length > 0) {
    return sections.join("\n\n");
  }
  return "";
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

    // Parse body
    const body = await req.json();
    const { url: pageUrl, focus, workspace_id } = body;

    if (!pageUrl || typeof pageUrl !== "string") {
      return new Response(JSON.stringify({ error: "url est obligatoire" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate URL
    const urlCheck = validateUrl(pageUrl);
    if (!urlCheck.valid) {
      return new Response(JSON.stringify({ error: urlCheck.error }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const finalUrl = urlCheck.url!;

    // Quota check
    const quota = await checkQuota(userId, "generation", workspace_id);
    if (!quota.allowed) {
      return new Response(JSON.stringify({ error: quota.message, quota: true }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the page
    console.log(`[optimize-sales-page] Fetching ${finalUrl}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);

    let html: string;
    try {
      const resp = await fetch(finalUrl, {
        headers: { "User-Agent": USER_AGENT },
        signal: controller.signal,
        redirect: "follow",
      });
      clearTimeout(timeout);
      if (!resp.ok) {
        return new Response(JSON.stringify({
          error: "site_inaccessible",
          message: `Impossible d'accéder à ${finalUrl} (HTTP ${resp.status}). Vérifie que l'URL est correcte.`,
        }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      html = await resp.text();
    } catch (e: any) {
      clearTimeout(timeout);
      const msg = e.name === "AbortError" ? "Timeout (15s)" : (e.message || "Erreur réseau");
      return new Response(JSON.stringify({
        error: "site_inaccessible",
        message: `Impossible d'accéder à ${finalUrl} : ${msg}`,
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse page content
    const title = extractTag(html, "title") || "";
    const metaDesc = extractMetaContent(html, "description") || "";
    const h1s = extractAllTags(html, "h1");
    const h2s = extractAllTags(html, "h2").slice(0, 20);
    const h3s = extractAllTags(html, "h3").slice(0, 15);
    const ctas = extractCTAs(html);
    const images = extractImages(html);
    const visibleText = truncateText(extractVisibleText(html), MAX_TEXT_CHARS);
    const sectionBlocks = detectSectionsFromHTML(html);

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
      includeCharter: false,
      includeMirror: false,
    });

    // Build content block
    const contentBlock = [
      `URL : ${finalUrl}`,
      title ? `Title : ${title}` : null,
      metaDesc ? `Meta description : ${metaDesc}` : null,
      h1s.length ? `H1 : ${h1s.join(" | ")}` : null,
      h2s.length ? `H2 : ${h2s.join(" | ")}` : null,
      h3s.length ? `H3 : ${h3s.join(" | ")}` : null,
      `Images : ${images.count} (${images.alts.length} avec alt)`,
      ctas.length ? `CTA détectés : ${ctas.join(" | ")}` : "Aucun CTA détecté",
      sectionBlocks ? `\nSECTIONS HTML DÉTECTÉES :\n${sectionBlocks}` : null,
      `\nCONTENU VISIBLE COMPLET :\n${visibleText}`,
    ].filter(Boolean).join("\n");

    // Build AI prompt
    const systemPrompt = `Tu es une experte en copywriting de pages de vente pour les solopreneuses créatives.

CONTENU ACTUEL DE LA PAGE :
${contentBlock}

PROFIL BRANDING :
${brandingContext || "(Aucun profil branding renseigné)"}

FOCUS DE L'UTILISATRICE : ${focus || "Amélioration générale"}

Analyse cette page de vente et produis des recommandations d'amélioration :

POUR CHAQUE SECTION DÉTECTÉE, évalue et propose une amélioration :
- Score actuel (/100) et statut (absent / faible / correct / fort)
- Ce qui fonctionne (1-2 points forts, sois spécifique)
- Ce qui ne fonctionne pas (1-2 problèmes précis)
- Version améliorée du texte : réécris la section en mieux
  - Garde le sens et l'identité de l'utilisatrice
  - Améliore la conversion (bénéfice client, clarté, urgence positive)
  - Respecte le profil de voix si disponible
  - IMPORTANT : c'est une suggestion, pas un remplacement. Garde le ton de l'utilisatrice.
- Explique en 1-2 phrases POURQUOI ta version est meilleure (pédagogie)

Les sections à identifier et analyser :
- hero : Accroche / Hero (premier bloc avec h1 + CTA)
- probleme : Problème / Pain point (vocabulaire négatif/empathique)
- transformation : Transformation / Bénéfices (vocabulaire positif)
- offre : Offre / Prix (section avec prix, bouton achat)
- temoignages : Témoignages / Preuve sociale (citations, étoiles)
- faq : FAQ (accordéon ou Q/R)
- a_propos : À propos ("je", "mon parcours")
- cta_final : CTA final (dernier bouton d'action)
- garantie : Garantie / Réassurance

SECTIONS MANQUANTES : Si des sections clés manquent, signale-les et propose un texte complet à ajouter.

DIAGNOSTIC GLOBAL :
- Score global (/100)
- Les 3 changements qui auraient le plus d'impact
- Le "quick win" : le truc le plus simple à changer qui fera le plus de différence

RÈGLES :
- Écriture inclusive point médian
- JAMAIS de tiret cadratin (remplace par : ou ;)
- Ton direct et bienveillant
- Les réécritures doivent sonner comme l'utilisatrice, pas comme une IA
- Si le profil de voix est disponible, utilise ses expressions signature
- Ne fais pas de promesses exagérées ou de fausse urgence
- Sois concrète : pas "améliorez votre titre" mais "remplacez X par Y parce que Z"

Réponds UNIQUEMENT en JSON (sans backticks) avec cette structure :
{
  "score_global": 62,
  "diagnostic": "Ta page a du potentiel mais...",
  "quick_win": {
    "section": "hero",
    "changement": "...",
    "pourquoi": "..."
  },
  "top_3_changements": [
    { "section": "...", "changement": "...", "impact": "fort" }
  ],
  "sections_existantes": [
    {
      "section_id": "hero",
      "section_label": "Accroche / Hero",
      "score": 45,
      "statut": "faible",
      "texte_actuel": "...",
      "points_forts": ["..."],
      "problemes": ["..."],
      "texte_ameliore": "...",
      "explication": "..."
    }
  ],
  "sections_manquantes": [
    {
      "section_id": "garantie",
      "section_label": "Garantie / Réassurance",
      "importance": "forte",
      "texte_propose": "...",
      "explication": "..."
    }
  ]
}`;

    const rawResponse = await callAnthropicSimple(
      getModelForAction("generation"),
      systemPrompt + "\n\n" + ANTI_SLOP,
      "Analyse cette page de vente et produis les recommandations en JSON.",
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

    // Log usage
    await logUsage(userId, "generation", "optimize_sales_page", undefined, "claude-sonnet", workspace_id);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[optimize-sales-page] Error:", e);
    return new Response(JSON.stringify({ error: e.message || "Erreur inattendue" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
