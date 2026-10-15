// Textes calculés du Studio : relance après une image prête (mannequin, scène,
// intégration…) et libellé du bouton de génération. Fiche 4 de
// docs/robustesse/gros-fichiers.md, lot 1 : expressions déplacées à l'identique
// depuis src/pages/VisualStudioPage.tsx, devenues des fonctions pures.
import type { StudioProposal, StudioReference, StudioVersion } from "@/features/visual-studio/api";

/** Relance affichée sous une image prête, et ce qu'il faut pour les boutons du mannequin. */
export function readyFollowUpFor(version: StudioVersion | undefined, references: StudioReference[]) {
  const sceneReferenceNames = version?.proposal.planning_references
    ?.map((reference) => reference.name.trim())
    .filter(Boolean);
  const identitySheet = version?.status === "ready" && !!version.proposal.person_reference &&
    !["scene", "integration"].includes(version.proposal.scene_workflow?.phase as string);
  const productName = identitySheet
    ? (references.find((r: any) => r.role === "product")?.name?.trim() || "")
    : "";
  const readyFollowUp = identitySheet
    ? `Voilà ton mannequin. Prochaine étape : la photo portée, avec ${productName ? `« ${productName} »` : "ton produit"}. Tu veux que je prépare la scène ?`
    : version?.status === "ready"
    ? version.proposal.scene_workflow?.phase === "scene"
      ? `Voilà la scène. Qu’est-ce que tu veux faire maintenant ? Tu peux me demander de la modifier ou d’y intégrer ${sceneReferenceNames?.length ? sceneReferenceNames.join(" et ") : "tes références"}.`
      : version.proposal.scene_workflow?.phase === "integration"
      ? "Voilà l’intégration. Qu’est-ce que tu veux ajuster maintenant ? Réponds-moi directement ici."
      : version.proposal.operation === "background" || version.proposal.operation === "edit"
      ? "Voilà la nouvelle version. Qu’est-ce que tu veux ajuster maintenant ? Réponds-moi directement ici."
      : "Voilà l’image. Qu’est-ce que tu veux faire maintenant ? Réponds-moi directement ici."
    : null;
  return { identitySheet, productName, readyFollowUp };
}

/** Libellé du bouton principal de la proposition (« Générer la série · N images »…). */
export function proposalGenerateLabelFor(proposal: StudioProposal | null | undefined): string {
  return !proposal ? "" : proposal.cost > 1
    ? `Générer la série · ${proposal.cost} images`
    : proposal.scene_workflow?.phase === "scene" && proposal.operation === "create"
    ? "Créer la scène · 1 image"
    : proposal.scene_workflow?.phase === "integration" && !proposal.scene_workflow.approved_scene_id
    ? "Valider cette scène et intégrer mes références · 1 image"
    : "Générer cette image · 1 image";
}
