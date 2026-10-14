// Tour de conversation du Studio : proposition et enregistrement.
// Construit la proposition à confirmer (chemins, coût, séries, preset Soul,
// avertissement), applique le routage Soul 2 / Marketing Studio, ajoute les
// deux messages du tour, journalise [visual-studio:turn] et enregistre la
// session avec contrôle de `revision` (409 refresh_request si une autre
// demande l'a modifiée entre-temps).
// Déplacé tel quel depuis index.ts (fiche 5, lot 7, docs/robustesse/gros-fichiers.md).
import { SONNET_MODEL } from "../../_shared/anthropic.ts";
import { isIdentity, RULES_VERSION } from "../competencies.ts";
import { generative } from "../contract.ts";
import { higgsfieldImagesEnabled, MARKETING_MAX_IMAGES, marketingFidelityEligible, routeToMarketingStudio, SOUL2_MODEL, soul2Eligible, soul2Enabled } from "../higgsfield-image.ts";
import { imageModel, type Reference } from "../media.ts";
import { imageInputPaths, inheritedPhotoSource } from "../photo-preservation.ts";
import { resolveSoulStyle } from "../soul-direction.ts";
import type { ConversationContext } from "../conversation.ts";
import type { Memory } from "../memory.ts";
import type { SoulStyle } from "../soul-direction.ts";
import type { sceneInputs } from "../scene-workflow.ts";
import type { StudioContext, StudioSession } from "../actions/context.ts";
import type { loadBrandContext } from "./brand-context.ts";
import type { intentSchema } from "../contract.ts";

type BrandContext = Awaited<ReturnType<typeof loadBrandContext>>;
type Intent = ReturnType<typeof intentSchema.parse>;
export type ProposalInput = {
  session: StudioSession;
  parent: StudioSession | null;
  references: Reference[];
  requestReferences: Reference[];
  resolvedReferences: Reference[];
  addedMemoryReferences: Reference[];
  selectedReference: Reference | undefined;
  explicitSource: Reference | undefined;
  effectiveReference: Reference | undefined;
  finalInputPath: string | null;
  inputs: ReturnType<typeof sceneInputs>;
  intent: Intent;
  rawOperation: Intent["operation"];
  dialogueOnly: boolean;
  newPhoto: boolean;
  newRequest: boolean;
  person: Intent["person_reference"];
  phase: string | undefined;
  availableSoulStyles: SoulStyle[];
  memoryToSelect: Memory[];
  conversation: ConversationContext | undefined;
  brandContext: BrandContext["brandContext"];
  catalogue: BrandContext["catalogue"];
  /** La demande, déjà vérifiée non vide par index.ts. */
  message: string;
};

/** Réponse anticipée (503 / 409) ou session enregistrée. */
export async function saveProposal(ctx: StudioContext, input: ProposalInput): Promise<Response | StudioSession> {
  const { sb, p, json } = ctx;
  const { session, parent, references, requestReferences, resolvedReferences, addedMemoryReferences, message, selectedReference, explicitSource, effectiveReference, finalInputPath, inputs, intent, rawOperation, dialogueOnly, newPhoto, newRequest, person, phase, availableSoulStyles, memoryToSelect, conversation, brandContext, catalogue } = input;
  const editInput = inputs.input;
  const proposedRefs = inputs.references;
  const originalPath =
    ((intent.operation === "edit" || intent.operation === "background")
      ? effectiveReference?.path
      : resolvedReferences.find((r) => isIdentity(r.role))?.path) ||
    (parent && intent.operation !== "create"
      ? parent.proposal.original_path || null
      : ["background", "edit"].includes(intent.operation)
      ? effectiveReference?.path || null
      : null);

  const proposal = ["background", "create", "edit", "product"].includes(
      intent.operation,
    )
    ? {
      ...intent,
      ...(intent.scene_workflow ? { scene_workflow: { ...intent.scene_workflow,
        accepted_changes: [...new Set([
          ...(!newPhoto && parent && (!explicitSource || explicitSource.path === parent.result_path)
            ? parent.proposal.scene_workflow?.accepted_changes || parent.proposal.change || [] : []),
          ...intent.change,
        ])].slice(-48),
      } } : {}),
      ...(person?.mode === "sheet" ? { visual_kind: "photo" as const, exact_text: [] } : {}),
      id: crypto.randomUUID(),
      viewed_version_id: intent.operation === "create" && !intent.uses_selected_version ? null : parent?.id || null,
      viewed_reference_id: inputs.snapshot.find(ref => ref.id === effectiveReference?.id)?.id || null,
      cost: 1 + (p.studio_version && p.studio_version >= 3 && generative(intent.operation)
        ? intent.shots.length
        : 0),
      shots: p.studio_version && p.studio_version >= 3 && generative(intent.operation)
        ? intent.shots.map((shot) => ({
          ...shot,
          id: crypto.randomUUID(),
          image_prompt: shot.image_prompt,
        }))
        : [],
      references: proposedRefs,
      reference_snapshot: inputs.snapshot,
      planning_references: phase === "scene" ? inputs.planning : [],
      input_path: intent.operation === "background"
        ? finalInputPath
        : editInput,
      photo_source_path: inheritedPhotoSource({ ...intent, input_path: editInput }, parent),
      original_path: originalPath,
      subject_kind: resolvedReferences.find((r) => isIdentity(r.role))?.kind ||
        null,
      image_prompt: intent.image_prompt,
      ...(phase === "scene" && intent.operation === "create" ? { soul_style: resolveSoulStyle(intent.soul_style_id, availableSoulStyles), soul_style_options: availableSoulStyles } : {}),
      prompt_author: SONNET_MODEL,
      photo_treatment: intent.photo_treatment,
      composition: p.studio_version === 4 && generative(intent.operation)
        ? undefined
        : intent.composition,
      model: imageModel(intent.operation),
      provider: "default",
      rules_version: RULES_VERSION,
      brand_context: brandContext,
      warning: generative(intent.operation) &&
          (resolvedReferences.some((r) => isIdentity(r.role)) ||
            (parent && intent.operation !== "create"))
        ? "Cette transformation redessine l’image. Elle peut modifier des détails du produit ou du visage. Compare le résultat aux références avant de l’utiliser."
        : null,
    }
    : !newRequest && dialogueOnly && intent.operation === "advise" ? session.proposal : null;
  if (proposal?.scene_workflow?.phase === "scene" && proposal.operation === "create") {
    if (!soul2Enabled()) return json({ error: "La création de scène est momentanément indisponible. Tes références sont conservées ; aucune autre génération n’a été lancée." }, 503);
    if (!soul2Eligible(proposal)) return json({ error: "La scène doit être préparée séparément de ses références. Aucune image n’a été lancée." }, 409);
    proposal.provider = "higgsfield"; proposal.model = SOUL2_MODEL;
  }
  if (proposal && marketingFidelityEligible(proposal) && higgsfieldImagesEnabled() &&
    imageInputPaths(proposal).length <= MARKETING_MAX_IMAGES) {
    Object.assign(proposal, routeToMarketingStudio(proposal));
  }

  const suggestions = intent.suggested_photo_ids.filter((id) =>
    (catalogue.data || []).some((row) => row.id === id)
  );
  const messages = [
    ...session.messages,
    {
      id: p.request_id,
      role: "user",
      text: p.message,
      reference_ids: requestReferences.map((ref) => ref.id),
      viewed_version_id: parent?.id || null,
      request_scope: newRequest ? "new" : "continue",
      reference_snapshot: resolvedReferences.map(({ id, name, path, role }) => ({ id, name, path, role })),
    },
    {
      role: "assistant",
      existing_tool: intent.existing_tool,
      preparation: intent.operation === "existing_tool" && intent.existing_tool === "preparation"
        ? intent.preparation
        : undefined,
      viewed_version_id: parent?.id || null,
      viewed_reference_id: selectedReference?.id || null,
      composition: intent.operation === "compose"
        ? intent.composition
        : undefined,
      text: intent.summary,
      operation: intent.operation,
      suggestions: intent.suggestions,
      suggested_photo_ids: suggestions,
      suggested_memory_ids: memoryToSelect.map((m) => m.id),
    },
  ];
  console.info("[visual-studio:turn]", JSON.stringify({ request_id: p.request_id, revision: session.revision,
    operation: rawOperation, final_operation: intent.operation, references: requestReferences.map(ref => ({ id: ref.id, role: ref.role })),
    scope: newRequest ? "new" : "continue", dialogue: dialogueOnly }));
  const updated = await sb
    .from("visual_studio_sessions")
    .update({
      messages,
      proposal,
      references: [
        ...references.map(ref => { const resolved = resolvedReferences.find(r => r.id === ref.id); return resolved ? { ...ref, role: resolved.role, role_source: resolved.role_source, role_explicit: resolved.role_explicit, subject_group: resolved.subject_group } : ref; }),
        ...addedMemoryReferences.filter(ref => !references.some(old => old.path === ref.path)),
      ],
      source_metadata: { ...session.source_metadata, studio_context: {
        reference_ids: requestReferences.map(ref => ref.id), branch_id: parent?.id || null,
        start_index: newRequest ? session.messages.length : conversation?.start_index || 0,
        targets: intent.scene_workflow?.targets || (newRequest ? [] : conversation?.targets || []),
        decisions: { ...(newRequest ? {} : conversation?.decisions || {}), ...(intent.operation === "advise" ? {} : intent.decisions || {}) },
      } },
      brief: dialogueOnly && !newRequest ? session.brief : intent.brief ||
        (parent
          ? parent.proposal.brief || parent.proposal.summary || ""
          : newRequest ? "" : session.brief || ""),
      ...(session.name === "Nouvelle idée"
        ? { name: message.slice(0, 100) }
        : {}),
      revision: session.revision + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", session.id)
    .eq("revision", p.revision)
    .select("*")
    .maybeSingle();
  if (updated.error) throw updated.error;
  if (!updated.data) {
    return json(
      {
        code: "refresh_request",
        error: "Une autre demande a modifié cette session. Recharge-la.",
      },
      409,
    );
  }
  return updated.data;
}
