// Corps de la demande « linkedin » (creative-flow, step generate). Sorti de
// src/hooks/use-content-generator.ts à l'identique (fiche 17 de
// docs/robustesse/gros-fichiers.md, lot 3). L'appel (invokeWithTimeout) et les
// vérifications d'époque restent dans le hook. Un format n'importe jamais le
// fichier d'un autre format.
import { downscalePhotosForVision } from "@/lib/image-vision";
import { EDITORIAL_ANGLES, CONTENT_STRUCTURES } from "@/lib/content-structures";
import type { GenerateParams } from "@/features/creer/generator/types";
import type { BodyContext } from "@/features/creer/generator/bodies/context";

// Budget serveur : génération bornée à 90s + passe de correction
// LinkedIn bornée à 45s (skip en photo_mode) = 135s pire cas,
// marge incluse.
export const LINKEDIN_GENERATE_TIMEOUT_MS = 180000;

export async function buildLinkedinGenerateBody(params: GenerateParams, ctx: BodyContext) {
  const { objective, editorialAngle, answers, newsContext } = params;
  const { effectiveSubject, existingContent, structureId, effectiveWorkspaceId } = ctx;
  // LinkedIn is now handled via creative-flow streaming in CreerUnifie.
  // This fallback exists for edge cases only.
  const angle = editorialAngle
    ? EDITORIAL_ANGLES.find((a) => a.id === editorialAngle)
    : undefined;
  const structure = structureId ? CONTENT_STRUCTURES[structureId] : undefined;

  return {
    step: "generate",
    contentType: "post_linkedin",
    context: effectiveSubject + (existingContent ? `\n\n[Contenu existant]\n${existingContent}` : ""),
    angle: angle
      ? { title: angle.label, structure: structure?.steps.map((s) => s.label), tone: "direct, chaleureux, professionnel" }
      : undefined,
    objective: objective || null,
    editorialFormat: editorialAngle || null,
    answers: answers
      ? Object.entries(answers).map(([k, v]) => ({ question: k, answer: v }))
      : [],
    workspace_id: effectiveWorkspaceId || null,
    photo_mode: params.photoMode || undefined,
    // Vision uniquement (cf. case "post") : photos allégées.
    photos: params.photoMode && params.photos?.length
      ? (await downscalePhotosForVision(params.photos.slice(0, 10)))?.map((p) => ({ base64: p.base64, mimeType: p.mimeType || "image/jpeg", context: p.context, libraryContext: p.libraryContext }))
      : undefined,
    photo_description: params.photoMode ? params.photoDescription : undefined,
    ...(newsContext && newsContext.trim() ? { news_context: newsContext.slice(0, 3800) } : {}),
  };
}
