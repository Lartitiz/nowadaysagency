import { exactReference, integrationInstructions, SCENE_PRESERVE, validTargets, type SceneWorkflow } from "./scene-workflow.ts";
import { imageModel, type Proposal, type Reference } from "./media.ts";
import { RULES_VERSION } from "./competencies.ts";

type SceneVersion = { id: string; result_path: string; status: string; proposal: Proposal & {
  planning_references?: Reference[]; reference_snapshot?: Reference[]; brief?: string;
} };

export function referenceSignature(refs: Reference[]) {
  return JSON.stringify(refs.map(r => [r.id, r.path, r.name, r.role, r.description || "", ...(r.subject_group ? [r.subject_group] : [])]).sort((a, b) => a[0].localeCompare(b[0])));
}

/** Read-only preview, reproducible from an immutable version. No interpreter or image call. */
export async function integrationProposal(version: SceneVersion, currentReferences?: Reference[]) {
  const scene = version.proposal;
  const workflow = scene.scene_workflow;
  if (currentReferences && scene.scene_reference_signature && referenceSignature(currentReferences) !== scene.scene_reference_signature) return null;
  if (version.status !== "ready" || workflow?.phase !== "scene") return null;
  const refs = (scene.planning_references || []).filter(exactReference);
  const targets = (workflow.targets || []).map(t => ({ ...t,
    instruction: t.role === "product"
      ? `Remplacer le produit provisoire par le produit exact des originaux, avec sa forme, ses matières et ses motifs observés. Adapter uniquement les raccords nécessaires. Consigne préparée : ${t.instruction}`
      : `Remplacer la personne provisoire par la personne exacte des originaux : visage, cheveux et morphologie. Conserver la pose et la tenue approuvées, adapter les raccords nécessaires. Consigne préparée : ${t.instruction}`,
  }));
  if (!refs.length || !validTargets(targets, refs)) return null;
  const references = [...refs]
    .sort((a, b) => Number(b.role === "product") - Number(a.role === "product"));
  // Include every displayed decision and original in the confirmation identity.
  const bytes = new TextEncoder().encode(JSON.stringify([version.id, version.result_path, scene, RULES_VERSION, imageModel("edit")]));
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(v => v.toString(16).padStart(2, "0")).join("");
  const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  const changes = targets.map(t => `${t.location} : ${t.instruction}`);
  const scene_workflow: SceneWorkflow = { phase: "integration", camera_match: workflow.camera_match,
    targets, accepted_changes: workflow.accepted_changes || scene.change || [], scene_version_id: version.id, scene_path: version.result_path };
  return {
    id, operation: "edit" as const, visual_kind: "photo" as const, scene_workflow,
    summary: `Je conserve cette scène et j'intègre tes références originales. ${changes.join(" ")} Le cadrage, le décor et le rendu photographique seront conservés au maximum.`,
    image_prompt: `Edit the supplied base photograph. Do not create a new scene.\n${integrationInstructions(targets)}\nKeep everything else unchanged.`,
    preserve: [SCENE_PRESERVE], change: changes, format: scene.format || "square",
    photo_treatment: scene.photo_treatment, product_placement: scene.product_placement,
    brief: scene.brief || scene.summary || "", exact_text: [], shots: [], cost: 1,
    references, reference_snapshot: references, planning_references: [], input_path: version.result_path,
    viewed_version_id: version.id, viewed_reference_id: null, original_path: references[0].path,
    provider: "default", model: imageModel("edit"), rules_version: RULES_VERSION,
    warning: "L'intégration peut modifier des détails. Compare le résultat à la scène et aux originaux.",
  };
}
