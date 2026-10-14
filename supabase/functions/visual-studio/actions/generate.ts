// Action generate du Studio : génération payante d'une proposition confirmée.
// ORDRE À GARDER (figé par handler_contract_test.ts) : contrôles de la
// proposition → checkQuota → contrôle Premium → prompt trop long →
// studio_confirm_generation (plafond images DUR) → tâche de fond
// (Higgsfield, ou executeStudioJob avec complete / fail / uncertain).
// Les crédits passent volontairement par les fonctions SQL
// studio_confirm_generation / studio_complete_generation, pas par logUsage.
// Déplacée telle quelle depuis index.ts (fiche 5, lot 3, docs/robustesse/gros-fichiers.md).
import { checkQuota, isQaTestAccount, PLAN_LIMITS, quotaDeniedResponse } from "../../_shared/plan-limiter.ts";
import { generative, premiumAllowed } from "../contract.ts";
import {
  failHiggsfieldImage, higgsfieldImagesEnabled, MARKETING_MAX_IMAGES, MARKETING_PROMPT_ERROR, marketingFidelityEligible,
  marketingPromptCandidate, marketingPromptTooLong, routeToMarketingStudio, SOUL2_MODEL, submitHiggsfieldImage,
} from "../higgsfield-image.ts";
import { prepareIntegration } from "../integration-direction.ts";
import { generateImage } from "../media.ts";
import { imageInputPaths } from "../photo-preservation.ts";
import { applyPreparedReferences } from "../product-fidelity-studio.ts";
import { resolveSoulStyle, soulStyles } from "../soul-direction.ts";
import { BUCKET, canWrite, download, store, unwrap, visionFromStorage } from "../storage.ts";
import { executeStudioJob } from "../worker.ts";
import type { StudioContext, StudioSession } from "./context.ts";

declare const EdgeRuntime: { waitUntil: (work: Promise<unknown>) => void };

/** Réponse anticipée (refus, quota…) ou session à jour (la réponse « read » suit). */
export async function generate(ctx: StudioContext, session: StudioSession): Promise<Response | StudioSession> {
  const { sb, actor, p, json, corsHeaders } = ctx;
  if (!p.proposal_id) {
    return json({ error: "Confirme une proposition." }, 400);
  }
  const existing = await sb
    .from("visual_studio_versions")
    .select("id")
    .eq("id", p.proposal_id)
    .eq("session_id", session.id)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data) {
    if (generative(session.proposal?.operation) && !p.studio_version) {
      return json(
        { error: "Recharge le Studio avant de confirmer cette création." },
        409,
      );
    }
    if (!session.proposal || session.proposal.id !== p.proposal_id) {
      return json(
        {
          error: "Cette proposition a changé. Vérifie la dernière demande.",
        },
        409,
      );
    }
    if (session.proposal.provider === "higgsfield" && session.proposal.soul_style) resolveSoulStyle(session.proposal.soul_style.id, await soulStyles());
    if (session.proposal.scene_workflow?.phase === "integration") {
      const workflow = session.proposal.scene_workflow;
      const baseId = session.proposal.viewed_version_id || session.proposal.viewed_reference_id;
      if (!workflow.approved_scene_id && (!baseId || p.approved_scene_id !== baseId || session.proposal.viewed_version_id && p.viewed_version_id !== baseId)) return json({ error: "Valide la scène affichée avant d’intégrer les références." }, 409);
      if (!workflow.approved_scene_id) {
        session = unwrap(await sb.from("visual_studio_sessions").update({ proposal: { ...session.proposal,
          scene_workflow: { ...workflow, scene_version_id: baseId, scene_path: session.proposal.input_path,
            approved_scene_id: baseId, approved_at: new Date().toISOString() } },
        }).eq("id", session.id).eq("revision", session.revision).select("*").single());
      }
    }
    // Pending proposals prepared before the temporary Higgsfield routing: reroute
    // BEFORE the atomic claim, so no OpenAI call and no resubmission can happen.
    if (marketingFidelityEligible(session.proposal) && higgsfieldImagesEnabled()) {
      if (imageInputPaths(session.proposal).length > MARKETING_MAX_IMAGES) {
        return json({ error: `Cette retouche utilise plus de ${MARKETING_MAX_IMAGES} images. Retire quelques références puis réessaie. Rien n’a été décompté.` }, 409);
      }
      session = unwrap(await sb.from("visual_studio_sessions").update({ proposal: routeToMarketingStudio(session.proposal) })
        .eq("id", session.id).eq("revision", session.revision).select("*").single());
    }
    // Old prepared direct-photo proposals must not bypass the new policy after reload.
    if (session.proposal.visual_kind === "photo" && session.proposal.person_reference?.mode !== "sheet" &&
      (session.proposal.operation === "create" || session.proposal.scene_workflow?.phase === "direct") &&
      (session.proposal.provider !== "higgsfield" || session.proposal.model !== SOUL2_MODEL)) {
      return json({ error: "Cette ancienne proposition doit être repréparée : une nouvelle photo commence par une scène à valider. Utilise Modifier ma demande." }, 409);
    }
    if (
      !Deno.env.get(
        generative(session.proposal.operation)
          ? (session.proposal.provider === "higgsfield"
            ? "HIGGSFIELD_API_KEY"
            : "OPENAI_API_KEY")
          : "PHOTOROOM_API_KEY",
      )
    ) {
      return json(
        { error: "Le service photo est momentanément indisponible." },
        503,
      );
    }
    const quota = await checkQuota(actor, "photo_retouch", p.workspace_id);
    if (quota.reason === "error") return quotaDeniedResponse(quota, corsHeaders);
    if (
      generative(session.proposal.operation) &&
      !premiumAllowed(quota.plan, isQaTestAccount(actor))
    ) {
      return json(
        {
          error:
            "Cette création est disponible en Premium. Rien n’a été décompté.",
        },
        403,
      );
    }
    if (!quota.allowed) return quotaDeniedResponse(quota, corsHeaders);
    const workflow = session.proposal.scene_workflow;
    if (workflow?.phase === "integration" && !session.proposal.integration_preparation &&
      session.proposal.input_path === workflow.scene_path) {
      const prepared = await prepareIntegration(session.proposal, path => visionFromStorage(sb, BUCKET, path));
      if (!(await canWrite(sb, actor, p.workspace_id))) return json({ error: "Les droits de cet espace ont changé." }, 403);
      session = unwrap(await sb.from("visual_studio_sessions").update({ proposal: prepared })
        .eq("id", session.id).eq("revision", session.revision).select("*").single());
    }
    // Check the final prepared prompt before creating a processing version or
    // reserving usage. Keep the proposal and originals available for editing.
    if (marketingPromptTooLong(session.proposal)) {
      // Lengths only (no user content) to see which confirmed field still overflows.
      const pr = session.proposal;
      console.warn("[visual-studio:prompt-too-long]", JSON.stringify({ request_id: p.request_id, operation: pr.operation,
        phase: pr.scene_workflow?.phase || null, prompt: marketingPromptCandidate(pr).length, summary: pr.summary?.length || 0,
        image_prompt: pr.image_prompt?.length || 0, preserve: (pr.preserve || []).join("; ").length, change: (pr.change || []).join("; ").length,
        accepted: (pr.scene_workflow?.accepted_changes || []).length, references: pr.references?.length || 0, shots: pr.shots?.length || 0 }));
      return json({ error: MARKETING_PROMPT_ERROR }, 409);
    }
    const exempt = isQaTestAccount(actor) || quota.plan === "admin";
    const limits = PLAN_LIMITS[quota.plan] || PLAN_LIMITS.free;
    const claim = unwrap(
      await sb.rpc("studio_confirm_generation", {
        p_actor: actor,
        p_session: session.id,
        p_proposal: p.proposal_id,
        p_total_limit: quota.usage ? quota.usage.total.used + (quota.available_total ?? 0) : 9999,
        // Plafond DUR (grille du 01/10/2026) : les crédits bonus ne lèvent
        // plus le plafond images (cf. HARD_CAP_CATEGORIES, plan-limiter).
        p_image_limit: limits.photo_retouch,
        p_charge: !exempt,
        p_base_total: limits.total,
      }),
    );
    if (claim.claimed) {
      const batch = async () => {
        for (const version of (claim.versions || [claim.version])) {
          const readInputs = async () => {
            const proposal = version.proposal;
            const paths = imageInputPaths(proposal);
            // Very old snapshots without an explicit source must still use the
            // stored source as pixels, with the same manifest and prompt roles.
            if (!paths.length && proposal.operation !== "create" && session.source_path) {
              proposal.input_path = session.source_path;
              paths.push(...imageInputPaths(proposal));
            }
            const inputs = await Promise.all(
              paths
                .filter(Boolean)
                .map((path: string) => download(sb, BUCKET, path)),
            );
            // Product references go out cropped and cut out, with their geometry
            // pinned in the shot instructions when the provider prompt still fits.
            await applyPreparedReferences(sb, proposal, paths.filter(Boolean), inputs,
              (candidate) => proposal.provider !== "higgsfield" || !marketingPromptTooLong(candidate));
            return inputs;
          };
          const work = version.proposal.provider === "higgsfield"
            ? (async () => {
              let inputs: Blob[];
              try {
                if (!(await canWrite(sb, actor, p.workspace_id))) throw new Error("Droits retirés");
                inputs = await readInputs();
              } catch {
                await failHiggsfieldImage(sb, version.id);
                return;
              }
              // Once submission starts, a lost receipt must never become a retryable failure.
              await submitHiggsfieldImage(sb, version, inputs);
            })().catch((error) => console.error("[studio:higgsfield-worker]", error instanceof Error ? error.message : "worker failed"))
            : executeStudioJob({
              readSource: readInputs,
              generate: async (inputs) => {
                if (!(await canWrite(sb, actor, p.workspace_id))) {
                  throw new Error("Droits retirés");
                }
                return generateImage(version.proposal, inputs);
              },
              store: (blob) => store(sb, BUCKET, version.result_path, blob),
              complete: async () => {
                unwrap(
                  await sb.rpc("studio_complete_generation", {
                    p_version: version.id,
                  }),
                );
              },
              fail: async () => {
                unwrap(
                  await sb
                    .from("visual_studio_versions")
                    .update({
                      status: "failed",
                      error_message:
                        "La création a échoué. Aucune image décomptée.",
                      completed_at: new Date().toISOString(),
                    })
                    .eq("id", version.id)
                    .eq("status", "processing")
                    .select("id")
                  .single(),
                );
              },
              uncertain: async () => {
                unwrap(
                  await sb.from("visual_studio_versions").update({
                    status: "uncertain",
                    error_message:
                      "La réponse du service photo a été perdue. Le résultat est incertain. Aucun crédit Studio n’a été décompté pour l’instant ; si l’image est retrouvée, elle comptera une fois. Recharge la session pour vérifier son état avant de relancer cette demande.",
                    completed_at: new Date().toISOString(),
                  }).eq("id", version.id).eq("status", "processing")
                    .select("id").single(),
                );
              },
            }).catch(() =>
              console.error(
                "[visual-studio] task state could not be persisted",
              )
            );
          await work;
        }
      };
      if (typeof EdgeRuntime !== "undefined") {
        EdgeRuntime.waitUntil(batch());
      } else await batch();
    }
  }
  return session;
}
