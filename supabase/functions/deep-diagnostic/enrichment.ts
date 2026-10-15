// Phase 2 du diagnostic : préparation de la fiche de marque par
// diagnostic-enrichment (fiche 12, lot 5 : sorti d'index.ts à l'identique).
// Le `fetch` part SANS être attendu (`.catch(() => {})`) : la fonction n'attend
// au plus que la relecture de scrape_cache. Le handler la lance AVANT
// runFastDiagnostic (#713) et garde le try/catch « Ignorer » autour.
import { MAX_TEXT_PER_SOURCE } from "./sources.ts";

export async function startBrandingEnrichment({
  supabaseAdmin, userId, workspaceId, profileUserId, userPrompt, websiteUrl, cachedStyleHints, isOnboarding, allowOverwrite,
}: {
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any;
  userId: string;
  workspaceId: string | null;
  profileUserId: string;
  userPrompt: string;
  // deno-lint-ignore no-explicit-any
  websiteUrl: any;
  cachedStyleHints: string;
  // deno-lint-ignore no-explicit-any
  isOnboarding: any;
  // deno-lint-ignore no-explicit-any
  allowOverwrite: any;
}): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Build enrichment prompt: include style hints + full cached website content
  let enrichmentPrompt = userPrompt.slice(0, 16000);

  // Add full cached content if available (the userPrompt already has a truncated version)
  if (websiteUrl) {
    try {
      const { data: fullCache } = await supabaseAdmin
        .from("scrape_cache")
        .select("content, style_hints")
        .eq("user_id", profileUserId)
        .eq("url", websiteUrl)
        .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fullCache?.content && fullCache.content.length > MAX_TEXT_PER_SOURCE) {
        enrichmentPrompt += `\n\n=== CONTENU COMPLET DU SITE (pour enrichissement approfondi) ===\n${fullCache.content}`;
      }
      // Repli si le cache n'a pas d'indices visuels (cache périmé > 1 h, ou
      // ligne écrite avant le fix CSS) : on a déjà pu les extraire nous-mêmes
      // au scrape direct plus haut. Sans ce `else if`, ces couleurs étaient
      // calculées puis PERDUES ici — l'IA recevait 0 couleur et inventait une
      // palette d'ambiance (cas 2 du prompt d'enrichissement).
      if (fullCache?.style_hints) {
        enrichmentPrompt += `\n\n${fullCache.style_hints}`;
      } else if (cachedStyleHints) {
        enrichmentPrompt += `\n\n${cachedStyleHints}`;
      }
    } catch {
      // Fallback: use cached style hints already extracted
      if (cachedStyleHints) {
        enrichmentPrompt += `\n\n${cachedStyleHints}`;
      }
    }
  } else if (cachedStyleHints) {
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
      websiteStyleHints: cachedStyleHints,
      savedDiagId: null,
      isOnboarding,
      // Remplacement explicitement confirmé à l'écran (espace déjà brandé).
      allowOverwrite: allowOverwrite === true,
    }),
  }).catch(() => {});
}
