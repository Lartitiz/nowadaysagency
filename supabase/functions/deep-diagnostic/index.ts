import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { scrapeInstagram, scrapeLinkedin, processScreenshots, scrapeWebsite, extractVisualInfo, fetchExternalCss, isSafePublicUrl } from "../_shared/scraping.ts";
import { checkQuota } from "../_shared/plan-limiter.ts";
import { authenticateRequest, AuthError } from "../_shared/auth.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
import { assertWorkspaceMembership, workspaceDeniedResponse } from "../_shared/workspace-guard.ts";
import { readSocialDiagnosticEvidence } from "../_shared/diagnostic-social.ts";
import { finalizeDiagnosticEvidence } from "./evidence.ts";
import { runFastDiagnostic } from "./fast-diagnostic.ts";
import { DIAGNOSTIC_SYSTEM_PROMPT, buildDiagnosticUserPrompt } from "./prompts.ts";

// Réexports : index_test.ts importe ces fonctions depuis ./index.ts.
export { normalizeDiagnosticRoute } from "./routes.ts";
export { finalizeDiagnosticEvidence } from "./evidence.ts";
export { runFastDiagnostic } from "./fast-diagnostic.ts";

const MAX_TEXT_PER_SOURCE = 8000;
const GLOBAL_TIMEOUT_MS = 55000;

export async function handleDeepDiagnostic(req: Request): Promise<Response> {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GLOBAL_TIMEOUT_MS);

  try {
    const { userId } = await authenticateRequest(req);

    const rateCheck = checkRateLimit(userId);
    if (!rateCheck.allowed) return rateLimitResponse(rateCheck.retryAfterMs!, corsHeaders);

    const { websiteUrl, instagramHandle, linkedinUrl, documentIds, profile, freeformAnswers, isOnboarding, workspace_id: bodyWorkspaceId, allowOverwrite } = await req.json();

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const membership = await assertWorkspaceMembership(supabaseAdmin, userId, bodyWorkspaceId);
    if (!membership.ok) {
      console.warn("[workspace-guard] denied", { userId, workspaceId: bodyWorkspaceId });
      clearTimeout(timeout);
      return workspaceDeniedResponse(corsHeaders);
    }

    // Get workspace (owner). maybeSingle : 0 ligne est un état réel possible
    // (bug « membership owner manquante » 26/07) → on ne veut pas d'erreur
    // PGRST116 parasite, juste un fallback lisible.
    const { data: wsData } = await supabaseAdmin
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", userId)
      .eq("role", "owner")
      .limit(1)
      .maybeSingle();
    if (!wsData?.workspace_id) {
      console.warn(`[deep-diagnostic] Aucun espace owner pour ${userId} — le front devrait auto-réparer (ensure_owner_workspace).`);
    }

    // Défense en profondeur (étape 3) : en mode ONBOARDING, on FORCE l'espace
    // owner du caller et on ignore tout `workspace_id` ambiant envoyé par le
    // front. L'onboarding configure SON espace ; il ne doit jamais écrire dans
    // l'espace actif s'il s'agit d'un espace client (cause de la contamination
    // du 30/06). Hors onboarding (audits), on respecte l'espace ciblé — un·e
    // manager peut légitimement auditer l'espace d'une cliente.
    const workspaceId = isOnboarding
      ? (wsData?.workspace_id || null)
      : (bodyWorkspaceId || wsData?.workspace_id || null);

    // Resolve workspace owner for user_id-scoped tables (scrape_cache)
    let profileUserId = userId;
    if (workspaceId) {
      const { data: ownerRow } = await supabaseAdmin
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", workspaceId)
        .eq("role", "owner")
        .maybeSingle();
      if (ownerRow?.user_id) profileUserId = ownerRow.user_id;
    }

    // Check quota (diagnostic = 3 credits, category: audit) — skip during onboarding
    if (!isOnboarding) {
      const quota = await checkQuota(userId, "audit", workspaceId);
      if (!quota.allowed) {
        clearTimeout(timeout);
        return new Response(JSON.stringify({ error: quota.message, quota }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ====== RÉCUPÉRATION DES DONNÉES (cache only, pas de scraping) ======
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
          signal: controller.signal,
          headers: { "User-Agent": "Mozilla/5.0 (compatible; BrandAnalyzer/1.0)" },
          redirect: "manual",
        });
        if (!resp.ok) return "";
        const html = await resp.text();
        const externalCss = await fetchExternalCss(html, formattedUrl, controller.signal);
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
              const directContent = await scrapeWebsite(websiteUrl, controller.signal);
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

    // Profil Instagram public : le @ suffit (nom + description via og:tags), la
    // capture d'écran devient un complément et non plus le seul chemin.
    if (instagramHandle) {
      scrapePromises.push(
        scrapeInstagram(instagramHandle, controller.signal)
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
      supabaseAdmin, userId, workspaceId, controller.signal,
    ).then((social) => {
      if (social.text) scrapedContent.connected_social = social.text.slice(0, 12000);
      sourcesUsed.push(...social.sources);
      sourcesFailed.push(...social.failed);
      connectedImages = social.images;
    }).catch(() => { /* Connexion absente ou API indisponible : repli sur les autres sources. */ }));

    await Promise.allSettled(scrapePromises);

    // ====== BUILD PROMPT ======
    const systemPrompt = DIAGNOSTIC_SYSTEM_PROMPT;
    const userPrompt = buildDiagnosticUserPrompt({
      profile, freeformAnswers, scrapedContent, sourcesUsed, sourcesFailed, instagramScreenshots, instagramHandle, websiteUrl,
    });

    // ====== PHASE 2 EN PARALLÈLE : Enrichissement branding — fire-and-forget ======
    // Lancé AVANT l'appel diagnostic : l'enrichissement (Opus, 60-90 s) n'utilise
    // que les données sources — jamais le résultat du diagnostic — donc le faire
    // attendre la fin de la phase 1 (comme avant) ajoutait toute la durée du
    // diagnostic à l'attente de la fiche « à valider ». Mesuré le 13/08 : 79 s
    // bloquée sur « Je finis de préparer ta marque… » après le clic. En parallèle,
    // l'enrichissement court pendant le diagnostic ET pendant la lecture du
    // résultat. `savedDiagId` n'existe pas encore → null : l'edge retrouve la
    // dernière ligne diagnostic_results au moment d'écrire branding_prefill.
    try {
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
    } catch {
      // Ignorer
    }

    // ====== CALL CLAUDE — PHASE 1 : Diagnostic rapide (Sonnet) ======
    // Logique + décision de facturation extraites dans runFastDiagnostic
    // (exportée pour les tests de régression crédit, voir index_test.ts).
    const { analysisResult, usageLog } = await runFastDiagnostic({
      systemPrompt,
      userPrompt,
      instagramScreenshots,
      connectedImages,
      profile,
      freeformAnswers,
      sourcesUsed,
      userId,
      workspaceId,
      isOnboarding: !!isOnboarding,
    });
    finalizeDiagnosticEvidence(analysisResult, sourcesUsed, sourcesFailed, instagramScreenshots.length);

    // ====== SAVE TO DB (fast: only diagnostic essentials) ======
    // Non bloquant : le diagnostic vient d'être généré avec succès — un échec
    // de sauvegarde ne doit pas priver l'utilisatrice du résultat déjà obtenu
    // (savedDiag?.id reste undefined, la réponse est renvoyée quand même).
    const { data: savedDiag, error: diagInsertError } = await supabaseAdmin
      .from("diagnostic_results")
      .insert({
        user_id: userId,
        workspace_id: workspaceId,
        summary: (analysisResult as any).summary || null,
        strengths: (analysisResult as any).strengths || null,
        weaknesses: (analysisResult as any).weaknesses || null,
        scores: (analysisResult as any).scores || null,
        priorities: (analysisResult as any).priorities || null,
        branding_prefill: null, // sera rempli par phase 2
        sources_used: sourcesUsed,
        sources_failed: sourcesFailed,
        raw_analysis: analysisResult,
      })
      .select("id")
      .single();
    if (diagInsertError) console.error("deep-diagnostic: échec sauvegarde (non bloquant):", diagInsertError);

    // audit_recommendations + logUsage en parallèle
    const priorities = (analysisResult as any).priorities;
    const fastSaves: Promise<any>[] = [];

    if (priorities?.length > 0) {
      fastSaves.push(
        Promise.resolve(
          supabaseAdmin.from("audit_recommendations").insert(
            priorities.map((p: any, i: number) => ({
              user_id: userId, workspace_id: workspaceId,
              label: p.title, titre: p.title, module: "diagnostic",
              route: p.route || "/dashboard", detail: [p.why, p.first_step, p.example].filter(Boolean).join("\n") || null,
              temps_estime: p.time || null, priorite: p.impact || "medium",
              position: i + 1, completed: false,
            }))
          ).then(({ error }) => { if (error) console.error("Save recommendations failed:", error); })
        ).catch((e: unknown) => console.error("Save recommendations failed:", e))
      );
    }

    // Crédit débité UNIQUEMENT si l'IA a réellement répondu (usageLog est null
    // sur le chemin fallback et pendant l'onboarding — voir runFastDiagnostic).
    if (usageLog) {
      fastSaves.push(usageLog);
    }

    await Promise.allSettled(fastSaves);

    // (Phase 2 — enrichissement branding — désormais tirée AVANT la phase 1,
    // en parallèle du diagnostic : voir le bloc au-dessus de l'appel Sonnet.)

    clearTimeout(timeout);
    return new Response(
      JSON.stringify({
        success: true,
        id: savedDiag?.id,
        diagnostic: { ...analysisResult, branding_prefill: null },
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
    console.error("deep-diagnostic error:", e);
    return new Response(
      JSON.stringify({ error: "Erreur interne du serveur" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}
if (import.meta.main) serve(handleDeepDiagnostic); // runtime edge seulement : un test qui importe ce fichier n'ouvre aucun port
