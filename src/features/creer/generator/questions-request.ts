// Questions d'approfondissement : mémoire anti-répétition (content_briefs),
// corps des demandes (carousel-ai deepening_questions, creative-flow questions)
// avec leur délai, et lecture des questions reçues. Sorti de
// src/hooks/use-content-generator.ts à l'identique (fiche 17 de
// docs/robustesse/gros-fichiers.md, lot 4). Les appels (invokeWithTimeout), les
// vérifications d'époque et les états restent dans le hook. La table des
// contentType ci-dessous est figée côté serveur par
// creative-flow/prompts_snapshot_test.ts : ne pas l'« harmoniser » avec celle
// du streaming.
import { supabase } from "@/integrations/supabase/client";
import { workspaceScopeFilter } from "@/lib/workspace-scope";
import { downscalePhotosForVision } from "@/lib/image-vision";
import {
  EDITORIAL_ANGLES,
  CONTENT_STRUCTURES,
  getStructureForCombo,
  getStructurePromptForCombo,
} from "@/lib/content-structures";
import { parseAIJson } from "@/features/creer/generator/tolerant-json";
import type { GenerateQuestionsParams, Question } from "@/features/creer/generator/types";

export interface QuestionsRequestContext {
  effectiveSubjectQ: string;
  existingContentQ: string | null;
  effectiveWorkspaceId: string | undefined;
  recentBriefsContext: string;
}

/** Non bloquant : chaîne vide si rien à dire ou en cas d'échec de lecture. */
export async function fetchRecentBriefsContext(effectiveWorkspaceId: string | undefined): Promise<string> {
  // Fetch recent briefs (sujets uniquement) pour mémoire anti-répétition.
  // ⚠️ On NE PASSE PAS les "réponses marquantes" : elles polluent le prompt
  // et l'IA finit par mélanger un ancien vécu avec le sujet courant.
  let recentBriefsContext = "";
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) {
      let q = supabase
        .from("content_briefs")
        .select("subject, format, editorial_angle, created_at")
        .order("created_at", { ascending: false })
        .limit(8); // marge pour filtrer les sujets vides
      const { column, value } = workspaceScopeFilter(effectiveWorkspaceId, user.id);
      q = q.eq(column, value);
      const { data: briefs } = await q;
      const cleanBriefs = (briefs || [])
        .filter((b: any) => typeof b.subject === "string" && b.subject.trim().length > 0)
        .slice(0, 3);
      if (cleanBriefs.length > 0) {
        const lines = cleanBriefs.map((b: any, i: number) => {
          const subj = b.subject.trim();
          const safeSubj = subj.length > 120 ? subj.slice(0, 117) + "..." : subj;
          const parts = [`Brief #${i + 1} — sujet : "${safeSubj}"`];
          if (b.format) parts.push(`format : ${b.format}`);
          if (b.editorial_angle) parts.push(`angle : ${b.editorial_angle}`);
          return parts.join(" · ");
        });
        recentBriefsContext = `\n══ HISTORIQUE RÉCENT (${cleanBriefs.length} brief${cleanBriefs.length > 1 ? "s" : ""}, indicatif) ══\n${lines.join("\n")}\n\nUSAGE STRICT : ne re-pose pas une question déjà posée pour ces sujets passés. Ces briefs ne décrivent PAS le sujet courant — ne mélange jamais leur contenu avec le sujet courant.\n`;
        const RECENT_BRIEFS_MAX = 1500;
        if (recentBriefsContext.length > RECENT_BRIEFS_MAX) {
          recentBriefsContext = recentBriefsContext.slice(0, RECENT_BRIEFS_MAX - 20) + "\n... (tronqué)\n";
        }
      }
    }
  } catch (e) {
    // non-blocking
    console.warn("[generateQuestions] could not fetch recent briefs:", e);
  }
  return recentBriefsContext;
}

export async function buildCarouselQuestionsRequest(params: GenerateQuestionsParams, ctx: QuestionsRequestContext) {
  const { format, editorialAngle, objective } = params;
  const { effectiveSubjectQ, existingContentQ, effectiveWorkspaceId, recentBriefsContext } = ctx;
  const structurePrompt = editorialAngle
    ? getStructurePromptForCombo(format, editorialAngle)
    : null;

  const hasPhotos = (params.photos?.length ?? 0) > 0;
  const isPhotoLikeMode = params.carouselSubMode === "photo" || params.carouselSubMode === "mix" || params.carouselSubMode === "pure_photo";
  const visionMode = hasPhotos && isPhotoLikeMode;
  // pure_photo réutilise la pipeline "photo" côté backend (le post-process
  // côté client supprimera ensuite tout overlay_text/title/body).
  const effectiveSubMode = params.carouselSubMode === "pure_photo" ? "photo" : params.carouselSubMode;

  const body = {
    type: "deepening_questions",
    channel: params.channel || "instagram",
    // Sans ce champ, la ligne ai_usage (catégorie suggestion) partait
    // avec workspace_id NULL — hors du périmètre de comptage du quota.
    workspace_id: effectiveWorkspaceId || null,
    subject: effectiveSubjectQ,
    subject_details: existingContentQ || undefined,
    objective: objective || null,
    editorial_angle: editorialAngle || null,
    content_structure: structurePrompt || null,
    recent_briefs_context: recentBriefsContext || undefined,
    carousel_type: visionMode ? effectiveSubMode : undefined,
    // Vision uniquement (questions ancrées) : photos allégées + cap à 10
    // (le schéma zod de carousel-ai refuse au-delà de 10).
    photos: visionMode
      ? (await downscalePhotosForVision(params.photos!.slice(0, 10)))?.map((p) => ({ base64: p.base64, mimeType: p.mimeType, context: p.context, libraryContext: p.libraryContext }))
      : undefined,
    photo_description: visionMode ? params.photoDescription || undefined : undefined,
    ...(params.newsContext && params.newsContext.trim() ? { news_context: params.newsContext.slice(0, 3800) } : {}),
  };
  return { body, timeoutMs: visionMode ? 90000 : 60000 };
}

export async function buildQuestionsRequest(params: GenerateQuestionsParams, ctx: QuestionsRequestContext) {
  const { format, editorialAngle, objective } = params;
  const { effectiveSubjectQ, existingContentQ, effectiveWorkspaceId, recentBriefsContext } = ctx;
  // Build angle context for creative-flow questions
  let angleObj: { title: string; structure: string[]; tone: string };
  if (editorialAngle) {
    const found = EDITORIAL_ANGLES.find((a) => a.id === editorialAngle);
    const structId = getStructureForCombo(format, editorialAngle);
    const struct = structId ? CONTENT_STRUCTURES[structId] : null;
    angleObj = {
      title: found?.label || editorialAngle,
      structure: struct?.steps.map((s) => s.label) || [],
      tone: "direct, chaleureux, oral assumé",
    };
  } else {
    angleObj = {
      title: "libre",
      structure: [],
      tone: "direct, chaleureux, oral assumé",
    };
  }

  const hasPhotosCF = (params.photos?.length ?? 0) > 0 && !!params.photos?.[0]?.base64;
  // Aligné sur le déclenchement vision de la génération (qui exige photoMode).
  // `photoMode` est de toute façon auto-activé dès qu'une photo est présente
  // sur un format compatible (cf. CreerStepFormat), donc post/linkedin sont couverts.
  // Évite le cas "questions ancrées sur la photo" puis "génération sans la photo".
  const photoModeCF = hasPhotosCF && params.photoMode === true;

  const body = {
    step: "questions",
    // Étape gratuite, mais le workspace scope aussi le contexte branding
    // (getUserContext) et la mémoire anti-répétition côté serveur.
    workspace_id: effectiveWorkspaceId || undefined,
    // Le canal pilote le libellé des questions côté serveur
    // (« …sur LinkedIn / Pinterest… » et pas « Instagram »).
    contentType:
      format === "linkedin"
        ? "linkedin_post"
        : format === "newsletter"
        ? "newsletter"
        : format === "pinterest"
        ? "post_pinterest"
        : "instagram_post",
    context: (() => {
      const CONTEXT_MAX = 7800;
      const base = effectiveSubjectQ;
      if (!existingContentQ) {
        return base.length > CONTEXT_MAX ? base.slice(0, CONTEXT_MAX - 3) + "..." : base;
      }
      const suffix = `\n\n[Contenu existant à approfondir]\n`;
      const reservedForSubject = Math.min(base.length, Math.floor(CONTEXT_MAX * 0.4));
      const remaining = CONTEXT_MAX - reservedForSubject - suffix.length;
      const safeSubject = base.length > reservedForSubject ? base.slice(0, reservedForSubject - 3) + "..." : base;
      const safeExisting = existingContentQ.length > remaining
        ? existingContentQ.slice(0, remaining - 3) + "..."
        : existingContentQ;
      return safeSubject + suffix + safeExisting;
    })(),
    angle: angleObj,
    objective: objective || null,
    recent_briefs_context: recentBriefsContext || undefined,
    photo_mode: photoModeCF || undefined,
    // Vision uniquement (questions ancrées creative-flow) : photos allégées.
    photos: photoModeCF
      ? (await downscalePhotosForVision(params.photos!.slice(0, 10)))?.map(p => ({
          base64: p.base64,
          mimeType: p.mimeType || "image/jpeg",
          context: p.context, libraryContext: p.libraryContext,
        }))
      : undefined,
    photo_description: photoModeCF ? params.photoDescription || undefined : undefined,
    ...(params.newsContext && params.newsContext.trim() ? { news_context: params.newsContext.slice(0, 3800) } : {}),
  };
  return { body, timeoutMs: photoModeCF ? 180000 : 60000 };
}

export function parseQuestions(rawContent: any): Question[] {
  const parsed = parseAIJson(rawContent);
  let parsedQuestions: Question[] = [];

  if (Array.isArray(parsed)) {
    parsedQuestions = parsed.map((q: any, i: number) => ({
      id: q.id || `q_${i}`,
      question: q.question || q.label || q.text || String(q),
      placeholder: q.placeholder || q.hint || "",
    }));
  } else if (parsed?.questions && Array.isArray(parsed.questions)) {
    parsedQuestions = parsed.questions.map((q: any, i: number) => ({
      id: q.id || `q_${i}`,
      question: q.question || q.label || q.text || String(q),
      placeholder: q.placeholder || q.hint || "",
    }));
  }

  return parsedQuestions;
}
