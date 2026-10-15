// Corps de la demande « post » (creative-flow, step generate). Sorti de
// src/hooks/use-content-generator.ts à l'identique (fiche 17 de
// docs/robustesse/gros-fichiers.md, lot 3). L'appel (invokeWithTimeout) et les
// vérifications d'époque restent dans le hook. Un format n'importe jamais le
// fichier d'un autre format.
import { downscalePhotosForVision } from "@/lib/image-vision";
import { EDITORIAL_ANGLES, CONTENT_STRUCTURES } from "@/lib/content-structures";
import type { GenerateParams } from "@/features/creer/generator/types";
import type { BodyContext } from "@/features/creer/generator/bodies/context";

// Budget serveur : génération seule bornée à 90s (pas de passe de
// correction pour le post Instagram/Pinterest), marge incluse.
export const POST_GENERATE_TIMEOUT_MS = 150000;

export async function buildPostGenerateBody(params: GenerateParams, ctx: BodyContext) {
  const { objective, editorialAngle, answers, newsContext } = params;
  const { effectiveSubject, existingContent, structureId, effectiveWorkspaceId } = ctx;
  const angle = editorialAngle
    ? EDITORIAL_ANGLES.find((a) => a.id === editorialAngle)
    : undefined;
  const structure = structureId ? CONTENT_STRUCTURES[structureId] : undefined;

  return {
    step: "generate",
    contentType: "instagram_post",
    editorial_angle: editorialAngle || undefined,
    context: effectiveSubject + (existingContent ? `\n\n[Contenu existant à approfondir]\n${existingContent}` : ""),
    angle: angle
      ? {
          title: angle.label,
          structure: structure?.steps.map((s) => s.label),
          tone: "direct, chaleureux, oral assumé",
        }
      : undefined,
    answers: answers
      ? Object.entries(answers).map(([k, v]) => ({ question: k, answer: v }))
      : [],
    objective: objective || null,
    workspace_id: effectiveWorkspaceId || null,
    photo_mode: params.photoMode || undefined,
    // Vision uniquement côté edge (jamais de rendu) : versions allégées,
    // le master plein format reste côté client.
    photos: params.photoMode && params.photos?.length
      ? (await downscalePhotosForVision(params.photos.slice(0, 10)))?.map(p => ({ base64: p.base64, mimeType: p.mimeType || "image/jpeg", context: p.context, libraryContext: p.libraryContext }))
      : undefined,
    photo_description: params.photoMode ? params.photoDescription : undefined,
    ...(newsContext && newsContext.trim() ? { news_context: newsContext.slice(0, 3800) } : {}),
  };
}
