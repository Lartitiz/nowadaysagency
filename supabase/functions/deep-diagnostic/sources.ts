import { scrapeInstagram, scrapeLinkedin, processScreenshots, scrapeWebsite, extractVisualInfo, fetchExternalCss, isSafePublicUrl } from "../_shared/scraping.ts";
import { readSocialDiagnosticEvidence } from "../_shared/diagnostic-social.ts";

// Collecte des sources du diagnostic (fiche 12, lot 4 : sorti d'index.ts à
// l'identique, `controller.signal` devenu `signal`).
// Piège n°1 : cachedStyleHints, instagramScreenshots et connectedImages sont
// réaffectés DANS les promesses : on ne les lit qu'après Promise.allSettled.
// Piège n°2 : `signal` est celui de la minuterie de 55 s du handler.
// `profileUserId` (propriétaire de l'espace) sert à scrape_cache ; `userId` sert
// à processScreenshots et readSocialDiagnosticEvidence.

export const MAX_TEXT_PER_SOURCE = 8000;

export async function collectDiagnosticSources({
  supabaseAdmin, userId, profileUserId, workspaceId, websiteUrl, linkedinUrl, instagramHandle, documentIds, freeformAnswers, signal,
}: {
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any;
  userId: string;
  profileUserId: string;
  workspaceId: string | null;
  // deno-lint-ignore no-explicit-any
  websiteUrl: any;
  // deno-lint-ignore no-explicit-any
  linkedinUrl: any;
  // deno-lint-ignore no-explicit-any
  instagramHandle: any;
  // deno-lint-ignore no-explicit-any
  documentIds: any;
  // deno-lint-ignore no-explicit-any
  freeformAnswers: any;
  signal: AbortSignal;
}) {
  const scrapedContent: Record<string, string> = {};
  const sourcesUsed: string[] = [];
  const sourcesFailed: string[] = [];

  const scrapePromises: Promise<void>[] = [];

  // Website : lire le cache du pre-scrape, avec fallback scrape direct
  let cachedStyleHints = "";
  const loadWebsiteStyleHints = async (): Promise<string> => {
    try {
      let formattedUrl = websiteUrl.trim();
      if (!formattedUrl.startsWith("http")) formattedUrl = `https://${formattedUrl}`;
      if (!isSafePublicUrl(formattedUrl)) return "";
      const resp = await fetch(formattedUrl, {
        signal: signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; BrandAnalyzer/1.0)" },
        redirect: "manual",
      });
      if (!resp.ok) return "";
      const html = await resp.text();
      const externalCss = await fetchExternalCss(html, formattedUrl, signal);
      return extractVisualInfo(html, externalCss);
    } catch {
      return "";
    }
  };
  if (websiteUrl) {
    scrapePromises.push((async () => {
      try {
        const { data: cached } = await supabaseAdmin
          .from("scrape_cache")
          .select("content, style_hints")
          .eq("user_id", profileUserId)
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
          } else {
            // Un cache texte ancien peut précéder l'extraction CSS : on retente
            // les styles au lieu de présenter ensuite une palette déduite du texte.
            cachedStyleHints = await loadWebsiteStyleHints();
          }
          console.log("Website content loaded from pre-scrape cache", cached.style_hints ? "(with style hints)" : "(no style hints)");
        } else {
          // Fallback: scrape directly if cache miss
          console.log("Cache miss for website, attempting direct scrape...");
          try {
            const directContent = await scrapeWebsite(websiteUrl, signal);
            if (directContent && directContent.length > 50) {
              scrapedContent.website = directContent.slice(0, MAX_TEXT_PER_SOURCE);
              sourcesUsed.push("website");
              console.log("Website scraped directly (fallback)");
              cachedStyleHints = await loadWebsiteStyleHints();
            } else {
              sourcesFailed.push("website");
            }
          } catch {
            sourcesFailed.push("website");
          }
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
      scrapeLinkedin(linkedinUrl, signal)
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

  // Profil Instagram public : le @ suffit (nom + description via og:tags), la
  // capture d'écran devient un complément et non plus le seul chemin.
  if (instagramHandle) {
    scrapePromises.push(
      scrapeInstagram(instagramHandle, signal)
        .then((text) => {
          if (text) {
            scrapedContent.instagram_public = text.slice(0, MAX_TEXT_PER_SOURCE);
            sourcesUsed.push("instagram_public");
          } else {
            sourcesFailed.push("instagram_public");
          }
        })
        .catch(() => { sourcesFailed.push("instagram_public"); })
    );
  }

  // Jusqu'à trois captures autorisées par l'interface. Une image illisible ou
  // non reçue ne devient jamais une source analysée.
  let instagramScreenshots: { base64: string; mediaType: string }[] = [];
  let connectedImages: { base64: string; mediaType: string }[] = [];
  if (documentIds && documentIds.length > 0) {
    scrapePromises.push(
      processScreenshots(supabaseAdmin, documentIds.slice(0, 3), userId)
        .then((screenshots) => {
          instagramScreenshots = screenshots.slice(0, 3);
          if (instagramScreenshots.length === 0) {
            sourcesFailed.push("social_screenshot");
          }
        })
        .catch(() => { sourcesFailed.push("social_screenshot"); })
    );
  }

  // Les connexions et les droits sont lus pour cet utilisateur ET son espace.
  // Le statut OAuth seul n'entre pas dans sourcesUsed : seule une réponse API
  // contenant des données exploitables y entre.
  scrapePromises.push(readSocialDiagnosticEvidence(
    supabaseAdmin, userId, workspaceId, signal,
  ).then((social) => {
    if (social.text) scrapedContent.connected_social = social.text.slice(0, 12000);
    sourcesUsed.push(...social.sources);
    sourcesFailed.push(...social.failed);
    connectedImages = social.images;
  }).catch(() => { /* Connexion absente ou API indisponible : repli sur les autres sources. */ }));

  await Promise.allSettled(scrapePromises);

  return { scrapedContent, sourcesUsed, sourcesFailed, instagramScreenshots, connectedImages, cachedStyleHints };
}
