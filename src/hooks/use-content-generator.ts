import { useState, useCallback, useRef, useEffect } from "react";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { invokeWithHeartbeat } from "@/lib/invoke-with-heartbeat";
import { posthog } from "@/lib/posthog-lazy";
import { handleQuotaError } from "@/lib/quota-error-handler";
import { readableError } from "@/lib/error-messages";
import { downscalePhotosForVision } from "@/lib/image-vision";
import { useStreamingInvoke } from "@/hooks/use-streaming-invoke";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { useAuth } from "@/contexts/AuthContext";
import {
  EDITORIAL_ANGLES,
  CONTENT_STRUCTURES,
  LINKEDIN_EDITORIAL_ANGLES,
  PINTEREST_EDITORIAL_ANGLES,
  PINTEREST_VISUAL_ANGLES,
  getStructureForCombo,
  getStructurePromptForCombo,
} from "@/lib/content-structures";
import type { DraftSlide } from "@/components/creer/CarouselDraftPreview";

// Types, lecture tolérante du JSON et messages d'erreur : src/features/creer/generator/
// (fiche 17 de docs/robustesse/gros-fichiers.md, lot 1). Types réexportés ici.
import type { GenerateParams, GenerateQuestionsParams, Question, ContentResult, GenerateStreamParams } from "@/features/creer/generator/types";
import { parseAIJson } from "@/features/creer/generator/tolerant-json";
import { cleanErrorMessage, quotaInlineMessage } from "@/features/creer/generator/error-messages";
import { buildCarouselGenerateBody, CAROUSEL_GENERATE_TIMEOUT_MS } from "@/features/creer/generator/bodies/carousel";
import { buildReelGenerateBody, REEL_GENERATE_TIMEOUT_MS } from "@/features/creer/generator/bodies/reel";
import { buildStoryGenerateBody, STORY_GENERATE_TIMEOUT_MS } from "@/features/creer/generator/bodies/story";
import { buildPostGenerateBody, POST_GENERATE_TIMEOUT_MS } from "@/features/creer/generator/bodies/post";
import { buildLinkedinGenerateBody, LINKEDIN_GENERATE_TIMEOUT_MS } from "@/features/creer/generator/bodies/linkedin";
import { readGenerateResponse } from "@/features/creer/generator/read-generate-response";
import { fetchRecentBriefsContext, buildCarouselQuestionsRequest, buildQuestionsRequest, parseQuestions } from "@/features/creer/generator/questions-request";
export type { GenerateParams, GenerateQuestionsParams, Question, ContentResult, GenerateStreamParams } from "@/features/creer/generator/types";

// ── Hook ──

export function useContentGenerator() {
  // Filet workspace (10/07/2026) : plusieurs appelants (CreerUnifie…) omettaient
  // params.workspaceId → les lignes ai_usage partaient avec workspace_id NULL et
  // échappaient au comptage par workspace du quota (checkQuota/check-subscription).
  // Le hook résout lui-même le workspace actif ; un params.workspaceId explicite
  // garde la priorité (manager sur l'espace d'une cliente). useWorkspaceId retombe
  // sur user.id quand le contexte n'est pas prêt → on le neutralise (ce n'est pas
  // un id de workspace), le serveur retombera alors sur le workspace propre.
  const { user } = useAuth();
  const activeWorkspaceId = useWorkspaceId();
  const defaultWorkspaceId =
    activeWorkspaceId && activeWorkspaceId !== user?.id ? activeWorkspaceId : undefined;

  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<ContentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  // Erreur propre à la préparation des questions (quota, réseau…) — distincte de
  // `error` (partagé avec la génération) pour que l'écran questions puisse dire
  // la vérité au lieu de « Pas de questions pour ce format ».
  const [questionsError, setQuestionsError] = useState<string | null>(null);
  // Quota épuisé pendant la génération : état distinct de `error`. Le QuotaWallModal
  // s'ouvre par-dessus, mais l'étape résultat reste affichée derrière (et réapparaît
  // à la fermeture du modal) — sans cet état elle retombait sur « Session expirée ou
  // contenu indisponible » avec un Réessayer qui ne peut que re-échouer.
  const [quotaExhausted, setQuotaExhausted] = useState<string | null>(null);
  // Étape réelle de la génération en cours (events SSE `status` du serveur :
  // "writing" → rédaction, "correcting" → relecture anti-patterns IA). Permet
  // à l'écran d'attente d'afficher la vraie étape au lieu de messages simulés.
  const [generationStage, setGenerationStage] = useState<string | null>(null);
  // Slides du carrousel en BROUILLON pendant l'écriture (07/10/2026, évènement
  // SSE `draft`) : affichées grisées, non modifiables, remplacées par le texte relu.
  const [draftSlides, setDraftSlides] = useState<DraftSlide[]>([]);
  // Titres PRÉVUS (08/10/2026, évènement `outline`) : repère affiché pendant
  // que le rédacteur réfléchit, remplacé par les vraies slides dès la 1re.
  const [outlineTitles, setOutlineTitles] = useState<string[]>([]);

  // Internal streaming wrapper — proxied to consumers via the hook's return.
  // Kept inside the hook so all callers share the same SSE state.
  const {
    content: streamingContent,
    streaming,
    done: streamDone,
    stage: streamStage,
    error: streamError,
    invoke: streamInvoke,
    reset: streamReset,
  } = useStreamingInvoke();

  const generationEpoch = useRef(0);
  const questionsEpoch = useRef(0);
  useEffect(() => () => { generationEpoch.current++; questionsEpoch.current++; }, [defaultWorkspaceId]);

  const reset = useCallback(() => {
    generationEpoch.current++;
    questionsEpoch.current++;
    streamReset();
    setQuestionsError(null);
    setGenerationStage(null);
    setDraftSlides([]);
    setOutlineTitles([]);
    setGenerating(false);
    setResult(null);
    setError(null);
    setQuotaExhausted(null);
    setLoadingQuestions(false);
    setQuestions([]);
  }, [streamReset]);

  // Pour les générations qui n'empruntent PAS generate()/generateStream()
  // (structure proposal carrousel, visuels/briefs Pinterest : appels directs
  // dans CreerUnifie) : marquer/effacer l'état quota pour que l'étape résultat
  // dise la vérité aussi sur ces chemins.
  const markQuotaExhausted = useCallback((e?: unknown) => {
    const raw = typeof e === "string" ? e : (e as any)?.data?.message || (e as any)?.message || "";
    setQuotaExhausted(quotaInlineMessage(e, cleanErrorMessage(raw)));
  }, []);

  const clearQuotaExhausted = useCallback(() => setQuotaExhausted(null), []);

  const generate = useCallback(async (params: GenerateParams) => {
    const epoch = ++generationEpoch.current;
    const {
      format,
      subject,
      objective,
      editorialAngle,
      answers,
      workspaceId,
      faceCam,
      timeAvailable,
      selectedHook,
      preGenAnswers,
      slideCount,
      carouselType,
      newsContext,
    } = params;
    const effectiveWorkspaceId = workspaceId || defaultWorkspaceId;

    setGenerating(true);
    setError(null);
    setQuotaExhausted(null);
    setResult(null);
    setGenerationStage(null);
    setDraftSlides([]);
    setOutlineTitles([]);
    const generationStartedAt = performance.now();

    // Defensive: bail early on non-canonical formats (e.g. "auto") so the user
    // gets a clear toast instead of a half-broken request.
    const SUPPORTED = ["carousel", "reel", "story", "post", "linkedin"] as const;
    if (!format || !(SUPPORTED as readonly string[]).includes(format)) {
      setGenerating(false);
      setError("Choisis un format valide pour générer ton contenu.");
      return null;
    }

    // Compute structure if editorial angle provided
    let structurePrompt: string | null = null;
    let structureId: string | null = null;

    if (editorialAngle) {
      structureId = getStructureForCombo(format, editorialAngle);
      structurePrompt = getStructurePromptForCombo(format, editorialAngle);
    }

    try {
      // Split enriched subject: if it contains calendar content, separate it out
      // to avoid exceeding the 500-char subject validation limit on edge functions
      const CALENDAR_MARKER = "\n\n[Contenu existant à approfondir]\n";
      let effectiveSubject = subject;
      let existingContent: string | null = null;
      if (subject.includes(CALENDAR_MARKER)) {
        const idx = subject.indexOf(CALENDAR_MARKER);
        effectiveSubject = subject.slice(0, idx);
        existingContent = subject.slice(idx + CALENDAR_MARKER.length);
      }

      let data: any;
      let invokeError: any;

      switch (format) {
        case "carousel": {
          const res = await invokeWithHeartbeat("carousel-ai", {
            body: await buildCarouselGenerateBody(params, { effectiveSubject, existingContent, structurePrompt, effectiveWorkspaceId }),
            onStatus: (stage, event) => {
              if (epoch !== generationEpoch.current) return;
              if (stage === "draft") { if (Array.isArray(event?.slides)) setDraftSlides(event.slides as DraftSlide[]); }
              else if (stage === "outline") { if (Array.isArray(event?.titles)) setOutlineTitles((event.titles as unknown[]).filter((t): t is string => typeof t === "string")); }
              else setGenerationStage(stage);
            },
          }, CAROUSEL_GENERATE_TIMEOUT_MS);
          data = res.data;
          invokeError = res.error;
          break;
        }

        case "reel": {
          const res = await invokeWithTimeout("creative-flow", {
            body: await buildReelGenerateBody(params, { effectiveSubject, existingContent, structurePrompt, structureId, effectiveWorkspaceId }),
          }, REEL_GENERATE_TIMEOUT_MS);
          data = res.data;
          invokeError = res.error;
          break;
        }

        case "story": {
          const res = await invokeWithTimeout("creative-flow", {
            body: await buildStoryGenerateBody(params, { effectiveSubject, existingContent, structurePrompt, structureId, effectiveWorkspaceId }),
          }, STORY_GENERATE_TIMEOUT_MS);
          data = res.data;
          invokeError = res.error;
          break;
        }

        case "post": {
          const res = await invokeWithTimeout("creative-flow", {
            body: await buildPostGenerateBody(params, { effectiveSubject, existingContent, structurePrompt, structureId, effectiveWorkspaceId }),
          }, POST_GENERATE_TIMEOUT_MS);
          data = res.data;
          invokeError = res.error;
          break;
        }

        case "linkedin": {
          const res = await invokeWithTimeout("creative-flow", {
            body: await buildLinkedinGenerateBody(params, { effectiveSubject, existingContent, structurePrompt, structureId, effectiveWorkspaceId }),
          }, LINKEDIN_GENERATE_TIMEOUT_MS);
          data = res.data;
          invokeError = res.error;
          break;
        }


        default:
          throw new Error(`Format non supporté : ${format}`);
      }

      if (epoch !== generationEpoch.current) return null;

      const parsed = readGenerateResponse(format, data, invokeError);
      const p: any = parsed;

      // Photos d'ambiance libres de droit proposées par carousel-ai : téléchargées
      // et posées ici, AVANT l'affichage, pour que le rendu des visuels parte
      // directement des bonnes photos (photo d'origine gardée si l'import échoue).
      let shown: any = parsed;
      let stockAdded: import("@/components/creer/PhotoUploadZone").PhotoItem[] = [];
      if (format === "carousel" && Array.isArray(p.slides) && p.slides.some((s: any) => s?.stock_ambient)) {
        const { applyStockAmbientPhotos } = await import("@/lib/stock-ambient-photos");
        const applied = params.onStockAmbientPhotos && params.carouselType === "photo"
          ? await applyStockAmbientPhotos(p, Math.min(params.photos?.length || 0, 10))
          : await applyStockAmbientPhotos(p, 10);
        if (epoch !== generationEpoch.current) return null;
        shown = applied.raw;
        stockAdded = applied.added;
      }

      const normalized: ContentResult = {
        type: format,
        raw: shown,
        ...shown,
      };

      // Télémétrie de latence (PostHog, jamais ai_usage) : la lenteur de
      // génération était invisible dans les stats — aucune durée loguée nulle part.
      posthog.capture("content_generation_timing", {
        format,
        duration_ms: Math.round(performance.now() - generationStartedAt),
        quality_max: !!params.qualityMax,
      });

      // Même tick que setResult : photos et carrousel arrivent ensemble à l'écran.
      // Appelé même sans ajout : les photos d'ambiance d'une génération précédente sont retirées.
      if (format === "carousel" && params.carouselType === "photo") params.onStockAmbientPhotos?.(stockAdded);
      setResult(normalized);
      return normalized;
    } catch (e: any) {
      if (epoch !== generationEpoch.current) return null;
      // Erreurs quota/premium → toast convivial (jamais le JSON brut affiché).
      const cleaned = cleanErrorMessage(e?.message);
      if (handleQuotaError(e?._isQuota ? e : { message: cleaned, data: e?.data })) {
        setQuotaExhausted(quotaInlineMessage(e, cleaned));
        setError(null);
        return null;
      }
      setError(readableError(cleaned, "La création n'a pas abouti. Réessaie dans un instant."));
      return null;
    } finally {
      if (epoch === generationEpoch.current) {
        setGenerating(false);
        setGenerationStage(null);
    setDraftSlides([]);
    setOutlineTitles([]);
      }
    }
  }, [defaultWorkspaceId]);

  const generateQuestions = useCallback(
    async (params: GenerateQuestionsParams) => {
      const epoch = ++questionsEpoch.current;
      const { format, subject, workspaceId } = params;
      const effectiveWorkspaceId = workspaceId || defaultWorkspaceId;
      setQuestionsError(null);

      setLoadingQuestions(true);
      setQuestions([]);

      try {
        let data: any;
        let invokeError: any;

        // Split enriched subject for questions too
        const CALENDAR_MARKER_Q = "\n\n[Contenu existant à approfondir]\n";
        let effectiveSubjectQ = subject;
        let existingContentQ: string | null = null;
        if (subject.includes(CALENDAR_MARKER_Q)) {
          const idx = subject.indexOf(CALENDAR_MARKER_Q);
          effectiveSubjectQ = subject.slice(0, idx);
          existingContentQ = subject.slice(idx + CALENDAR_MARKER_Q.length);
        }

        const recentBriefsContext = await fetchRecentBriefsContext(effectiveWorkspaceId);
        const requestCtx = { effectiveSubjectQ, existingContentQ, effectiveWorkspaceId, recentBriefsContext };

        if (format === "carousel") {
          const { body, timeoutMs } = await buildCarouselQuestionsRequest(params, requestCtx);
          const res = await invokeWithTimeout("carousel-ai", { body }, timeoutMs);
          data = res.data;
          invokeError = res.error;
        } else {
          const { body, timeoutMs } = await buildQuestionsRequest(params, requestCtx);
          const res = await invokeWithTimeout("creative-flow", { body }, timeoutMs);
          data = res.data;
          invokeError = res.error;
        }

        if (epoch !== questionsEpoch.current) return [];
        if (invokeError) throw new Error(invokeError.message || "Erreur edge function");
        if (data?.error) throw new Error(data.message || data.error);

        // carousel-ai wraps its response in { content: "..." } — unwrap before parsing
        const rawContent = data?.content || data;
        const parsedQuestions = parseQuestions(rawContent);

        setQuestions(parsedQuestions);
        return parsedQuestions;
      } catch (e: any) {
        if (epoch !== questionsEpoch.current) return [];
        const cleaned = readableError(cleanErrorMessage(e?.message), "Les questions n'ont pas pu être préparées. Réessaie dans un instant.");
        setError(cleaned);
        setQuestionsError(cleaned);
        return [];
      } finally {
        if (epoch === questionsEpoch.current) setLoadingQuestions(false);
      }
    },
    [defaultWorkspaceId]
  );

  // ── Streaming generation (text formats: post / linkedin / newsletter / pinterest) ──
  // Encapsulates the SSE flow that used to live inline in CreerUnifie.tsx.
  // Mirrors EXACTLY the previous behavior: contentType mapping, body shape,
  // angle resolution across all 4 angle catalogs, JSON parsing, quota handling.
  const generateStream = useCallback(
    async (params: GenerateStreamParams): Promise<ContentResult | null> => {
      const epoch = ++generationEpoch.current;
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

      streamReset();
      setError(null);
      setQuotaExhausted(null);
      setResult(null);

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

      let fullText = "";
      try {
        fullText = await streamInvoke("creative-flow", streamBody);
        if (epoch !== generationEpoch.current) return null;
      } catch (e: any) {
        if (epoch !== generationEpoch.current) return null;
        const cleaned = cleanErrorMessage(e?.message);
        if (handleQuotaError(e?._isQuota ? e : { message: cleaned, data: e?.data })) {
          setQuotaExhausted(quotaInlineMessage(e, cleaned));
          setError(null);
          return null;
        }
        setError(readableError(cleaned, "La création n'a pas abouti. Réessaie dans un instant."));
        return null;
      }

      if (!fullText) {
        // Résultat vide = échec. On pose l'erreur ici pour que l'effet global
        // (toast unique) l'affiche, au lieu d'un toast manuel côté appelant qui
        // doublait l'affichage avec l'erreur du hook.
        setError("La génération a échoué. Réessaie.");
        return null;
      }

      // Parse tolérant via parseAIJson : gère les fences ```json, le texte
      // après le `}`, virgules traînantes, etc. Le parse inline précédent
      // (match(/\{[\s\S]*\}/) + JSON.parse nu) échouait dès qu'un fence
      // markdown ou du texte de queue entourait l'objet → le JSON brut fuyait
      // dans le rendu du post. Sonnet 5 (thinking off) enveloppe désormais
      // ~systématiquement sa sortie en ```json {"content": …} → il FAUT le
      // parseur robuste ici. Si ce n'est pas du JSON (texte pur), fallback.
      const parsedJson = parseAIJson(fullText);
      const parsed: any = parsedJson ?? { content: fullText };

      const normalized: ContentResult = {
        type: format as ContentResult["type"],
        raw: parsed,
      };
      setResult(normalized);
      return normalized;
    },
    [streamInvoke, streamReset, defaultWorkspaceId]
  );

  return {
    generate,
    generating,
    generationStage,
    draftSlides,
    outlineTitles,
    result,
    setResult,
    error,
    quotaExhausted,
    markQuotaExhausted,
    clearQuotaExhausted,
    reset,
    generateQuestions,
    loadingQuestions,
    questions,
    setQuestions,
    questionsError,
    // Streaming API (Phase 4 — proxy of internal useStreamingInvoke)
    generateStream,
    streamingContent,
    streaming,
    streamDone,
    streamStage,
    streamError,
    streamReset,
  };
}
