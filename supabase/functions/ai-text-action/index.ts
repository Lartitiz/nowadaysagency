import { callAnthropic, getModelForAction, type UsageSink } from "../_shared/anthropic.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest, AuthError } from "../_shared/auth.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
import { assertWorkspaceMembership, workspaceDeniedResponse } from "../_shared/workspace-guard.ts";
import { analyzeTextRedac, numbersIn } from "../_shared/redac-gate.ts";

// ── Gate rédactionnel de dérive (audit du 18/08/2026) ──
// callAnthropic réécrit ici une SÉLECTION de texte (raccourcir, reformuler…)
// sans jamais re-mesurer : un carrousel/post déjà validé par le gate ressortait
// dégradé (retournement par négation, chiffre inventé, formule moulée) après un
// simple "raccourcis ce passage". On ne compare QUE le texte sélectionné vs sa
// réécriture (pas le document entier, invisible ici) : les défauts déjà présents
// dans le texte choisi par l'utilisatrice ne sont jamais touchés — seuls ceux
// que la réécriture a elle-même introduits déclenchent une correction ciblée.
function buildDriftFixInstructions(
  newReversals: string[],
  newMoulded: string[],
  newFabricatedNumbers: string[],
): string {
  const lines: string[] = [];
  if (newReversals.length) {
    lines.push(
      `RETOURNEMENT PAR NÉGATION AJOUTÉ PAR TA RÉÉCRITURE (absent du texte original) :\n${newReversals.map((r) => `- « ${r} »`).join("\n")}\nRéécris ce(s) passage(s) en affirmation directe (même sens, sans « pas X, c'est Y »).`,
    );
  }
  if (newMoulded.length) {
    lines.push(
      `FORMULE MOULÉE AJOUTÉE PAR TA RÉÉCRITURE (absente du texte original) : ${newMoulded.map((m) => `« ${m} »`).join(", ")}. Signature IA récurrente : réécris-la autrement (ou supprime-la).`,
    );
  }
  if (newFabricatedNumbers.length) {
    lines.push(
      `CHIFFRE SANS SOURCE AJOUTÉ PAR TA RÉÉCRITURE (absent du texte original) :\n${newFabricatedNumbers.map((n) => `- ${n}`).join("\n")}\nRemplace CHACUN par une formulation qualitative honnête (« une bonne partie », « plusieurs semaines »…). N'invente JAMAIS de statistique, de prix, de durée ou de proportion.`,
    );
  }
  return lines.join("\n\n");
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId } = await authenticateRequest(req);

    const rateCheck = checkRateLimit(userId);
    if (!rateCheck.allowed) return rateLimitResponse(rateCheck.retryAfterMs!, corsHeaders);

    const { workspace_id, selected_text, action_prompt } = await req.json();
    if (!selected_text || !action_prompt) {
      return new Response(JSON.stringify({ error: "Missing selected_text or action_prompt" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    {
      const sbGuard = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const membership = await assertWorkspaceMembership(sbGuard, userId, workspace_id);
      if (!membership.ok) {
        console.warn("[workspace-guard] denied", { userId, workspaceId: workspace_id });
        return workspaceDeniedResponse(corsHeaders);
      }
    }

    const quota = await checkQuota(userId, "adaptation", workspace_id || undefined);
    if (!quota.allowed) {
      return new Response(JSON.stringify({ error: quota.message, quota }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch lightweight branding context using authenticated userId
    let brandContext = "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const filterCol = workspace_id ? "workspace_id" : "user_id";
    const filterVal = workspace_id || userId;
    const { data: bp } = await supabase
      .from("brand_profile")
      .select("positioning, tone_keywords, tone_description, tone_do, tone_dont")
      .eq(filterCol, filterVal)
      .maybeSingle();

    // Source de vérité du positionnement = brand_proposition.version_final (cf #207).
    // brand_profile.positioning est gelé à l'onboarding → fallback seulement.
    const { data: prop } = await supabase
      .from("brand_proposition")
      .select("version_final, version_complete")
      .eq(filterCol, filterVal)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (bp || prop) {
      const parts: string[] = [];
      const positioning = prop?.version_final || prop?.version_complete || bp?.positioning;
      if (positioning) parts.push(`Positionnement : ${positioning}`);
      if (bp?.tone_description) parts.push(`Ton : ${bp.tone_description}`);
      if (bp?.tone_keywords) parts.push(`Mots-clés de ton : ${JSON.stringify(bp.tone_keywords)}`);
      if (bp?.tone_do) parts.push(`À faire : ${bp.tone_do}`);
      if (bp?.tone_dont) parts.push(`À éviter : ${bp.tone_dont}`);
      if (parts.length > 0) brandContext = `\n\nCONTEXTE MARQUE :\n${parts.join("\n")}`;
    }

    const systemPrompt = `Tu es l'assistante communication de Nowadays. Tu aides une créatrice à améliorer son contenu.${brandContext}

RÈGLES :
- Retourne UNIQUEMENT le texte modifié, rien d'autre
- Pas de guillemets autour
- Pas d'explication, pas de commentaire
- Garde le ton de la cliente
- Même langue que le texte original`;

    const usage: UsageSink = {};
    const result = await callAnthropic({
      model: getModelForAction("text_action"),
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `TEXTE SÉLECTIONNÉ :\n"${selected_text}"\n\nINSTRUCTION : ${action_prompt}`,
        },
      ],
      max_tokens: 1024,
      abortTimeoutMs: 60_000,
      temperature: 0.7,
    }, usage);

    // Gate rédactionnel de dérive : ce que la réécriture a introduit par
    // rapport au texte sélectionné, pas les défauts déjà présents que
    // l'utilisatrice avait déjà acceptés (allowedNumbers = chiffres du texte
    // source, donc `before.fabricatedNumbers` est toujours vide par construction).
    const allowedNumbers = numbersIn(selected_text);
    const before = analyzeTextRedac(selected_text, allowedNumbers);
    const after = analyzeTextRedac(result, allowedNumbers);
    const newReversals = after.reversals.filter((r) => !before.reversals.includes(r));
    const newMoulded = after.moulded.filter((m) => !before.moulded.includes(m));
    const newFabricatedNumbers = after.fabricatedNumbers;

    let finalResult = result;
    const driftFixes = buildDriftFixInstructions(newReversals, newMoulded, newFabricatedNumbers);
    if (driftFixes) {
      try {
        const retryUsage: UsageSink = {};
        const corrected = await callAnthropic({
          model: getModelForAction("text_action"),
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content: `TEXTE SÉLECTIONNÉ ORIGINAL :\n"${selected_text}"\n\nINSTRUCTION : ${action_prompt}\n\nTA RÉÉCRITURE PRÉCÉDENTE À CORRIGER :\n"${result}"\n\nCORRECTIONS CIBLÉES À APPLIQUER (mesurées en code, ne touche à rien d'autre, garde le reste de ta réécriture) :\n${driftFixes}`,
            },
          ],
          max_tokens: 1024,
          abortTimeoutMs: 30_000,
          temperature: 0.4,
        }, retryUsage);
        if (corrected && corrected.trim()) {
          finalResult = corrected;
          if (retryUsage.total_tokens) {
            usage.total_tokens = (usage.total_tokens || 0) + retryUsage.total_tokens;
          }
        }
        console.log(`[ai-text-action] redac-gate: dérive corrigée (retournements +${newReversals.length}, moulés +${newMoulded.length}, chiffres +${newFabricatedNumbers.length})`);
      } catch (e) {
        console.error("[ai-text-action] redac-gate: re-passe ciblée échouée, résultat conservé:", e);
      }
    }

    await logUsage(userId, "adaptation", "text_action", usage.total_tokens, usage.model, workspace_id || undefined);

    return new Response(JSON.stringify({ result: finalResult }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: e.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("ai-text-action error:", e);
    return new Response(JSON.stringify({ error: "Erreur interne du serveur" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
