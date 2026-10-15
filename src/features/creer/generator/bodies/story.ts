// Corps de la demande « story » (creative-flow, step generate). Sorti de
// src/hooks/use-content-generator.ts à l'identique (fiche 17 de
// docs/robustesse/gros-fichiers.md, lot 3). L'appel (invokeWithTimeout) et les
// vérifications d'époque restent dans le hook. Un format n'importe jamais le
// fichier d'un autre format.
import type { GenerateParams } from "@/features/creer/generator/types";
import type { BodyContext } from "@/features/creer/generator/bodies/context";

// Budget serveur : génération seule bornée à 90s (pas de passe de
// correction pour les stories), marge incluse.
export const STORY_GENERATE_TIMEOUT_MS = 150000;

export async function buildStoryGenerateBody(params: GenerateParams, ctx: BodyContext) {
  const { objective, editorialAngle, answers, faceCam, timeAvailable, preGenAnswers, newsContext } = params;
  const { effectiveSubject, existingContent, effectiveWorkspaceId } = ctx;
  return {
    step: "generate",
    contentType: "stories",
    editorial_angle: editorialAngle || undefined,
    context: effectiveSubject + (existingContent ? `\n\n[Contenu existant à approfondir]\n${existingContent}` : ""),
    objective: objective || null,
    face_cam: faceCam || "flexible",
    time_available: timeAvailable || "flexible",
    pre_gen_answers: preGenAnswers || null,
    // Réponses aux questions de l'étape 3 : sans elles, le brief
    // arrivait vide côté edge (« RÉPONSES DE L'UTILISATRICE : »
    // suivi de rien) et la séquence s'écrivait sans sa matière.
    answers: answers
      ? Object.entries(answers).map(([k, v]) => ({ question: k, answer: v }))
      : [],
    workspace_id: effectiveWorkspaceId || null,
    // Photos de la bibliothèque choisies à l'étape format (lot D) :
    // le brief les traite en priorité absolue, une par story.
    ...(params.photoMode && params.photos?.length
      ? {
          preferred_photo_ids: params.photos
            .map((p) => p.userPhotoId)
            .filter((id): id is string => !!id)
            .slice(0, 10),
        }
      : {}),
    ...(newsContext && newsContext.trim() ? { news_context: newsContext.slice(0, 3800) } : {}),
  };
}
