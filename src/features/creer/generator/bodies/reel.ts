// Corps de la demande « reel » (creative-flow, step generate). Sorti de
// src/hooks/use-content-generator.ts à l'identique (fiche 17 de
// docs/robustesse/gros-fichiers.md, lot 3). L'appel (invokeWithTimeout) et les
// vérifications d'époque restent dans le hook. Un format n'importe jamais le
// fichier d'un autre format.
import type { GenerateParams } from "@/features/creer/generator/types";
import type { BodyContext } from "@/features/creer/generator/bodies/context";

// Budget serveur (audit latences 17/08) : génération bornée à 90s
// + passe qualité reel bornée à 45s = 135s pire cas par tentative,
// marge incluse pour rester au-dessus du filet serveur.
export const REEL_GENERATE_TIMEOUT_MS = 180000;

export async function buildReelGenerateBody(params: GenerateParams, ctx: BodyContext) {
  const { objective, editorialAngle, answers, faceCam, timeAvailable, selectedHook, preGenAnswers, newsContext } = params;
  const { effectiveSubject, existingContent, structurePrompt, effectiveWorkspaceId } = ctx;
  // Mapper les answers des questions vers le format pre_gen_answers attendu par reels-ai
  let effectivePreGenAnswers = preGenAnswers || null;
  if (!effectivePreGenAnswers && answers && Object.keys(answers).length > 0) {
    const vals = Object.values(answers);
    effectivePreGenAnswers = {
      anecdote: vals[0] || undefined,
      emotion: vals[1] || undefined,
      conviction: vals[2] || undefined,
    };
  }

  return {
    step: "generate",
    contentType: "reel",
    context: effectiveSubject + (existingContent ? `\n\n[Contenu existant à approfondir]\n${existingContent}` : ""),
    objective: objective || null,
    face_cam: faceCam || "oui",
    time_available: timeAvailable || "flexible",
    pre_gen_answers: effectivePreGenAnswers,
    // Le mapping positionnel ci-dessus perd le TEXTE des questions (et
    // étiquette « émotion » une réponse factuelle) : on envoie aussi les
    // paires question → réponse, comme pour le post et les stories.
    answers: answers
      ? Object.entries(answers).map(([k, v]) => ({ question: k, answer: v }))
      : [],
    selected_hook: selectedHook || null,
    editorial_angle: editorialAngle || null,
    content_structure: structurePrompt || null,
    workspace_id: effectiveWorkspaceId || null,
    ...(newsContext && newsContext.trim() ? { news_context: newsContext.slice(0, 3800) } : {}),
  };
}
