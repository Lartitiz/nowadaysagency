// Ce que le hook calcule avant d'envoyer une demande, passé tel quel aux
// fichiers de corps (fiche 17 de docs/robustesse/gros-fichiers.md, lot 3).
export interface BodyContext {
  effectiveSubject: string;
  existingContent: string | null;
  structurePrompt: string | null;
  structureId: string | null;
  effectiveWorkspaceId: string | undefined;
}
