// Corps de la demande en streaming (creative-flow, step generate : post,
// LinkedIn, newsletter, Pinterest). Sorti de src/hooks/use-content-generator.ts
// à l'identique (fiche 17 de docs/robustesse/gros-fichiers.md, lot 5). L'appel
// (streamInvoke), la lecture du texte reçu et les vérifications d'époque restent
// dans le hook. ⚠️ Ici le sujet n'est PAS séparé du contenu du calendrier
// (différent de `generate`) : comportement d'origine, gardé tel quel.
import { downscalePhotosForVision } from "@/lib/image-vision";
import {
  EDITORIAL_ANGLES,
  CONTENT_STRUCTURES,
  LINKEDIN_EDITORIAL_ANGLES,
  PINTEREST_EDITORIAL_ANGLES,
  PINTEREST_VISUAL_ANGLES,
  getStructureForCombo,
} from "@/lib/content-structures";
import type { GenerateStreamParams } from "@/features/creer/generator/types";

export async function buildStreamBody(params: GenerateStreamParams, defaultWorkspaceId: string | undefined) {
  const {
    format,
    subject,
    objective,
    editorialAngle,
    answers,
    workspaceId,
    photoMode,
    photos,
    photoDescription,
    deepResearch,
    pinterestLink,
    pinterestBoard,
    newsContext,
  } = params;

  const contentTypeMap: Record<string, string> = {
    post: "post_instagram",
    linkedin: "post_linkedin",
    newsletter: "post_newsletter",
    pinterest: "post_pinterest",
  };

  // Resolve angle across all 4 catalogs (same lookup CreerUnifie used)
  const angleObj = editorialAngle
    ? (() => {
        const found =
          EDITORIAL_ANGLES.find((a) => a.id === editorialAngle) ||
          LINKEDIN_EDITORIAL_ANGLES.find((a) => a.id === editorialAngle) ||
          PINTEREST_EDITORIAL_ANGLES.find((a) => a.id === editorialAngle) ||
          PINTEREST_VISUAL_ANGLES.find((a) => a.id === editorialAngle);
        const structureId = getStructureForCombo(format, editorialAngle);
        const structure = structureId ? CONTENT_STRUCTURES[structureId] : undefined;
        return found
          ? {
              title: found.label,
              structure: structure?.steps.map((s) => s.label),
              tone: "direct, chaleureux, oral assumé",
            }
          : undefined;
      })()
    : undefined;

  const ans = answers || {};
  const hasAnswers = Object.keys(ans).length > 0;
  // `ans` est désormais indexé par le TEXTE de la question (ré-indexé en amont
  // dans CreerUnifie). Le bloc anecdote/émotion/conviction reste positionnel
  // (1re/2e/3e réponse) — comme avant, mais via les valeurs et non les clés `q_0`.
  const ansValues = Object.values(ans);

  const streamBody: any = {
    step: "generate",
    contentType: contentTypeMap[format] || "post_instagram",
    context: subject,
    angle: angleObj,
    answers: hasAnswers
      ? Object.entries(ans).map(([q, a]) => ({ question: q, answer: a }))
      : undefined,
    preGenAnswers: hasAnswers
      ? {
          anecdote: (ans as any).anecdote || ansValues[0] || undefined,
          emotion: (ans as any).emotion || ansValues[1] || undefined,
          conviction: (ans as any).conviction || ansValues[2] || undefined,
        }
      : undefined,
    workspace_id: workspaceId || defaultWorkspaceId || undefined,
    objective: objective || undefined,
    editorialFormat: editorialAngle || undefined,
    editorialFormatLabel: editorialAngle || undefined,
    ...(photoMode
      ? {
          photo_mode: true,
          photo_description: photoDescription,
          // Vision uniquement (stream post/LinkedIn/Pinterest) : photos
          // allégées, le master plein format reste côté client.
          ...(photos && photos.length > 0 && photos[0]?.base64
            ? {
                photos: (await downscalePhotosForVision(photos.slice(0, 10)))?.map((p) => ({
                  base64: p.base64,
                  mimeType: p.mimeType || "image/jpeg",
                  context: p.context, libraryContext: p.libraryContext,
                })),
              }
            : {}),
        }
      : {}),
    ...(deepResearch ? { deepResearch: true } : {}),
    ...(newsContext && newsContext.trim().length > 0 ? { news_context: newsContext.slice(0, 3800) } : {}),
    ...(format === "pinterest" && (pinterestLink || pinterestBoard)
      ? { pinterest_link: pinterestLink, pinterest_board: pinterestBoard }
      : {}),
  };

  return streamBody;
}
