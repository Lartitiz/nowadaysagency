import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkQuota } from "../_shared/plan-limiter.ts";
import { authenticateRequest, AuthError } from "../_shared/auth.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
import { assertWorkspaceMembership, workspaceDeniedResponse } from "../_shared/workspace-guard.ts";
import { finalizeDiagnosticEvidence } from "./evidence.ts";
import { runFastDiagnostic } from "./fast-diagnostic.ts";
import { DIAGNOSTIC_SYSTEM_PROMPT, buildDiagnosticUserPrompt } from "./prompts.ts";
import { collectDiagnosticSources } from "./sources.ts";
import { startBrandingEnrichment } from "./enrichment.ts";
import { saveDiagnostic } from "./save.ts";

// Réexports : index_test.ts importe ces fonctions depuis ./index.ts.
export { normalizeDiagnosticRoute } from "./routes.ts";
export { finalizeDiagnosticEvidence } from "./evidence.ts";
export { runFastDiagnostic } from "./fast-diagnostic.ts";

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
    const { scrapedContent, sourcesUsed, sourcesFailed, instagramScreenshots, connectedImages, cachedStyleHints } = await collectDiagnosticSources({
      supabaseAdmin, userId, profileUserId, workspaceId, websiteUrl, linkedinUrl, instagramHandle, documentIds, freeformAnswers,
      signal: controller.signal,
    });

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
      await startBrandingEnrichment({
        supabaseAdmin, userId, workspaceId, profileUserId, userPrompt, websiteUrl, cachedStyleHints, isOnboarding, allowOverwrite,
      });
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
    const { savedDiagId, fastSaves } = await saveDiagnostic(supabaseAdmin, {
      userId, workspaceId, analysisResult, sourcesUsed, sourcesFailed,
    });

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
        id: savedDiagId,
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
