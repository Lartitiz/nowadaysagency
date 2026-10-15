// Corps de la demande de carrousel (carousel-ai, type express_full). Sorti de
// src/hooks/use-content-generator.ts à l'identique (fiche 17 de
// docs/robustesse/gros-fichiers.md, lot 2). L'appel (invokeWithHeartbeat), le
// suivi d'avancement (onStatus) et les vérifications d'époque restent dans le hook.
import { downscalePhotosForVision } from "@/lib/image-vision";
import type { GenerateParams } from "@/features/creer/generator/types";

// 400s : pire cas serveur réel côté carousel-ai (mode photo) — appel
// principal (120s) + retry plancher slides (120s) + passe correction
// (60s) + re-passe redac-gate (60s) + relecture-gabarits (30s) = 390s,
// marge après (même logique que audit-branding #839, branding-coaching
// #862) : le client doit couper APRÈS l'edge, jamais avant.
export const CAROUSEL_GENERATE_TIMEOUT_MS = 400000;

export interface CarouselBodyContext {
  effectiveSubject: string;
  existingContent: string | null;
  structurePrompt: string | null;
  effectiveWorkspaceId: string | undefined;
}

export async function buildCarouselGenerateBody(params: GenerateParams, ctx: CarouselBodyContext) {
  const { objective, editorialAngle, answers, slideCount, carouselType, newsContext } = params;
  const { effectiveSubject, existingContent, structurePrompt, effectiveWorkspaceId } = ctx;
  // If editorial angle is provided, don't impose a carousel_type
  let effectiveCarouselType = carouselType || null;
  if (!effectiveCarouselType && editorialAngle) {
    effectiveCarouselType = null;
  }

  return {
    type: "express_full",
    channel: params.channel || "instagram",
    carousel_type: effectiveCarouselType,
    subject: effectiveSubject,
    subject_details: existingContent || undefined,
    objective: objective || null,
    // Longueur : envoyé SEULEMENT si l'utilisatrice a choisi (puces
    // « Longueur »). Absent = l'edge applique ses cibles adaptatives.
    slide_count: slideCount || undefined,
    deepening_answers: answers || null,
    editorial_angle: editorialAngle || null,
    content_structure: structurePrompt || null,
    workspace_id: effectiveWorkspaceId || null,
    // Automatic narratives may change the plan's text. Send pixels again
    // so final photo selection can follow the reviewed story, not old indexes.
    // Human-validated plans and raw photo dumps keep their existing path.
    photos: ((!params.confirmedStructure || params.scenarioOrigin === "automatic") && !params.textFirst && params.carouselSubMode !== "pure_photo" && (params.carouselType === "photo" || params.carouselType === "mix")) ? await downscalePhotosForVision(params.photos) : undefined,
    photo_contexts: (params.carouselType === "photo" || params.carouselType === "mix")
      ? params.photos?.slice(0, 10).map(p => ({ context: p.context, libraryContext: p.libraryContext })) : undefined,
    photo_description: (params.carouselType === "photo" || params.carouselType === "mix") ? params.photoDescription : undefined,
    slide_structure: params.slideStructure || null,
    confirmed_structure: params.confirmedStructure || null,
    ...(params.editorialIntent ? {editorial_intent:params.editorialIntent} : {}),
    scenario_origin: params.scenarioOrigin || (params.confirmedStructure ? "user_validated" : "automatic"),
    quality_max: params.qualityMax || undefined,
    ...(params.narrativeThread && params.narrativeThread.trim() ? { narrative_thread: params.narrativeThread } : {}),
    ...(newsContext && newsContext.trim() ? { news_context: newsContext.slice(0, 3800) } : {}),
    // « Photos brutes » : le texte des slides sera effacé, le serveur note la légende seule.
    ...(params.carouselSubMode === "pure_photo" ? { photos_only: true } : {}),
    ...(params.textFirst ? { text_first: true } : {}),
    ...(params.textFirst && params.photoCatalog && params.photoCatalog.length > 0
      ? { photo_catalog: params.photoCatalog.slice(0, 40) }
      : {}),
  };
}
