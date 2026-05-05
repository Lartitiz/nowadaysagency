import { useState, useCallback } from "react";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { supabase } from "@/integrations/supabase/client";
import { handleQuotaError } from "@/lib/quota-error-handler";
import { useStreamingInvoke } from "@/hooks/use-streaming-invoke";
import {
  EDITORIAL_ANGLES,
  CONTENT_STRUCTURES,
  LINKEDIN_EDITORIAL_ANGLES,
  PINTEREST_EDITORIAL_ANGLES,
  PINTEREST_VISUAL_ANGLES,
  getStructureForCombo,
  getStructurePromptForCombo,
} from "@/lib/content-structures";

// ── Types ──

export interface GenerateParams {
  format: "carousel" | "reel" | "story" | "post" | "linkedin" | "newsletter";
  subject: string;
  objective?: string;
  editorialAngle?: string;
  answers?: Record<string, string>;
  workspaceId?: string;
  channel?: "instagram" | "linkedin";
  // Reel-specific
  faceCam?: string;
  timeAvailable?: string;
  selectedHook?: any;
  preGenAnswers?: any;
  // Carousel-specific
  slideCount?: number;
  carouselType?: string;
  // Photo-related
  photos?: { base64: string; context?: string; mimeType?: string }[];
  photoDescription?: string;
  photoMode?: boolean;
  slideStructure?: Array<{
    slide_number: number;
    type: "photo_full" | "photo_integrated" | "text_only";
    photo_index?: number;
    photo_layout?: string;
  }>;
  confirmedStructure?: Array<{
    slide_number: number;
    role: string;
    title_suggestion: string;
    strategic_note: string;
    photo_index?: number;
    slide_type?: "photo_full" | "photo_integrated" | "text_only";
  }>;
  // Newsjacking — separate field to avoid bloating `subject`
  newsContext?: string;
}

export interface GenerateQuestionsParams {
  format: string;
  subject: string;
  editorialAngle?: string;
  objective?: string;
  channel?: "instagram" | "linkedin";
  workspaceId?: string;
  // Photo-related — when present, ask vision-anchored questions
  photos?: Array<{ base64: string; context?: string; mimeType?: string }>;
  photoDescription?: string;
  carouselSubMode?: "text" | "photo" | "mix";
  photoMode?: boolean;
  // Newsjacking — anchors the questions in the actu instead of generic subject
  newsContext?: string;
}

export interface Question {
  id: string;
  question: string;
  placeholder?: string;
}

export interface ContentResult {
  type: "carousel" | "reel" | "story" | "post" | "linkedin" | "newsletter";
  raw: any;
  [key: string]: any;
}

// ── JSON parser (handles markdown-wrapped JSON) ──

function parseAIJson(raw: string | object): any {
  if (typeof raw === "object" && raw !== null) return raw;
  if (typeof raw !== "string") return null;

  let cleaned = raw.trim();

  // Remove markdown code fences (with or without language tag)
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-z]*\s*\n?/i, "").replace(/\n?\s*```\s*$/, "");
  }

  cleaned = cleaned.trim();

  // Direct parse attempt
  try {
    return JSON.parse(cleaned);
  } catch {
    // ignore
  }

  // Try to find a JSON object
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]);
    } catch {
      // ignore
    }
  }

  // Try to find a JSON array
  const arrMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try {
      return JSON.parse(arrMatch[0]);
    } catch {
      // ignore
    }
  }

  // Last resort: fix common issues (trailing commas, single quotes)
  try {
    const fixed = cleaned
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/'/g, '"');
    const obj2 = fixed.match(/\{[\s\S]*\}/);
    if (obj2) return JSON.parse(obj2[0]);
    const arr2 = fixed.match(/\[[\s\S]*\]/);
    if (arr2) return JSON.parse(arr2[0]);
  } catch {
    // ignore
  }

  return null;
}

// ── Hook ──

export function useContentGenerator() {
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<ContentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);

  // Internal streaming wrapper — proxied to consumers via the hook's return.
  // Kept inside the hook so all callers share the same SSE state.
  const {
    content: streamingContent,
    streaming,
    done: streamDone,
    error: streamError,
    invoke: streamInvoke,
    reset: streamReset,
  } = useStreamingInvoke();

  const reset = useCallback(() => {
    setGenerating(false);
    setResult(null);
    setError(null);
    setLoadingQuestions(false);
    setQuestions([]);
  }, []);

  const generate = useCallback(async (params: GenerateParams) => {
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

    setGenerating(true);
    setError(null);
    setResult(null);

    // Defensive: bail early on non-canonical formats (e.g. "auto") so the user
    // gets a clear toast instead of a half-broken request.
    const SUPPORTED = ["carousel", "reel", "story", "post", "linkedin", "newsletter"] as const;
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
          // If editorial angle is provided, don't impose a carousel_type
          let effectiveCarouselType = carouselType || null;
          if (!effectiveCarouselType && editorialAngle) {
            effectiveCarouselType = null;
          }

          const res = await invokeWithTimeout("carousel-ai", {
            body: {
              type: "express_full",
              channel: params.channel || "instagram",
              carousel_type: effectiveCarouselType,
              subject: effectiveSubject,
              subject_details: existingContent || undefined,
              objective: objective || null,
              slide_count: slideCount || 7,
              deepening_answers: answers || null,
              editorial_angle: editorialAngle || null,
              content_structure: structurePrompt || null,
              workspace_id: workspaceId || null,
              photos: (params.carouselType === "photo" || params.carouselType === "mix") ? params.photos : undefined,
              photo_description: (params.carouselType === "photo" || params.carouselType === "mix") ? params.photoDescription : undefined,
              slide_structure: params.slideStructure || null,
              confirmed_structure: params.confirmedStructure || null,
              ...(newsContext && newsContext.trim() ? { news_context: newsContext.slice(0, 3800) } : {}),
            },
          }, 120000);
          data = res.data;
          invokeError = res.error;
          break;
        }

        case "reel": {
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

          const res = await invokeWithTimeout("creative-flow", {
            body: {
              step: "generate",
              contentType: "reel",
              context: effectiveSubject + (existingContent ? `\n\n[Contenu existant à approfondir]\n${existingContent}` : ""),
              objective: objective || null,
              face_cam: faceCam || "oui",
              time_available: timeAvailable || "flexible",
              pre_gen_answers: effectivePreGenAnswers,
              selected_hook: selectedHook || null,
              editorial_angle: editorialAngle || null,
              content_structure: structurePrompt || null,
              workspace_id: workspaceId || null,
              ...(newsContext && newsContext.trim() ? { news_context: newsContext.slice(0, 3800) } : {}),
            },
          }, 120000);
          data = res.data;
          invokeError = res.error;
          break;
        }

        case "story": {
          const res = await invokeWithTimeout("creative-flow", {
            body: {
              step: "generate",
              contentType: "stories",
              context: effectiveSubject + (existingContent ? `\n\n[Contenu existant à approfondir]\n${existingContent}` : ""),
              objective: objective || null,
              face_cam: faceCam || "flexible",
              time_available: timeAvailable || "flexible",
              pre_gen_answers: preGenAnswers || null,
              workspace_id: workspaceId || null,
              ...(newsContext && newsContext.trim() ? { news_context: newsContext.slice(0, 3800) } : {}),
            },
          }, 120000);
          data = res.data;
          invokeError = res.error;
          break;
        }

        case "post": {
          const angle = editorialAngle
            ? EDITORIAL_ANGLES.find((a) => a.id === editorialAngle)
            : undefined;
          const structure = structureId ? CONTENT_STRUCTURES[structureId] : undefined;

          const res = await invokeWithTimeout("creative-flow", {
            body: {
              step: "generate",
              contentType: "instagram_post",
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
              workspace_id: workspaceId || null,
              photo_mode: params.photoMode || undefined,
              photos: params.photoMode && params.photos?.length ? [{ base64: params.photos[0].base64, mimeType: params.photos[0].mimeType || "image/jpeg", context: params.photos[0].context }] : undefined,
              photo_description: params.photoMode ? params.photoDescription : undefined,
              ...(newsContext && newsContext.trim() ? { news_context: newsContext.slice(0, 3800) } : {}),
            },
          }, 120000);
          data = res.data;
          invokeError = res.error;
          break;
        }

        case "linkedin": {
          // LinkedIn is now handled via creative-flow streaming in CreerUnifie.
          // This fallback exists for edge cases only.
          const angle = editorialAngle
            ? EDITORIAL_ANGLES.find((a) => a.id === editorialAngle)
            : undefined;
          const structure = structureId ? CONTENT_STRUCTURES[structureId] : undefined;
          const res = await invokeWithTimeout("creative-flow", {
            body: {
              step: "generate",
              contentType: "post_linkedin",
              context: effectiveSubject + (existingContent ? `\n\n[Contenu existant]\n${existingContent}` : ""),
              angle: angle
                ? { title: angle.label, structure: structure?.steps.map((s) => s.label), tone: "direct, chaleureux, professionnel" }
                : undefined,
              objective: objective || null,
              editorialFormat: editorialAngle || null,
              workspace_id: workspaceId || null,
              ...(newsContext && newsContext.trim() ? { news_context: newsContext.slice(0, 3800) } : {}),
            },
          }, 120000);
          data = res.data;
          invokeError = res.error;
          break;
        }

        case "newsletter": {
          const res = await invokeWithTimeout("newsletter-ai", {
            body: {
              topic: effectiveSubject + (existingContent ? `\n\n${existingContent}` : ""),
              preGenAnswers: answers
                ? {
                    anecdote: answers.anecdote || answers.q_0 || undefined,
                    emotion: answers.emotion || answers.q_1 || undefined,
                    conviction: answers.conviction || answers.q_2 || undefined,
                  }
                : preGenAnswers || null,
              template: editorialAngle || null,
              workspace_id: workspaceId || null,
            },
          }, 120000);
          data = res.data;
          invokeError = res.error;
          break;
        }

        default:
          throw new Error(`Format non supporté : ${format}`);
      }

      if (invokeError) throw new Error(invokeError.message || "Erreur edge function");
      if (data?.error) {
        if (data.error === "limit_reached" || data.message?.includes("ce mois")) {
          throw Object.assign(new Error(data.message || data.error), { _isQuota: true, data });
        }
        throw new Error(data.message || data.error);
      }

      // Edge functions wrap response in { content: "..." } — unwrap before parsing
      const rawContent = data?.content ?? data;
      const parsed = parseAIJson(rawContent);
      if (!parsed) throw new Error("La génération n'a pas fonctionné comme prévu. Réessaie, ça marche en général au deuxième essai 🌸");

      const normalized: ContentResult = {
        type: format,
        raw: parsed,
        ...parsed,
      };

      setResult(normalized);
      return normalized;
    } catch (e: any) {
      if (e?._isQuota && handleQuotaError(e)) {
        setError(null);
        return null;
      }
      const msg = e?.message || "Erreur lors de la génération";
      setError(msg);
      return null;
    } finally {
      setGenerating(false);
    }
  }, []);

  const generateQuestions = useCallback(
    async (params: GenerateQuestionsParams) => {
      const { format, subject, editorialAngle, objective, workspaceId } = params;

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
            if (workspaceId) q = q.eq("workspace_id", workspaceId);
            else q = q.eq("user_id", user.id);
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

        if (format === "carousel") {
          const structurePrompt = editorialAngle
            ? getStructurePromptForCombo(format, editorialAngle)
            : null;

          const hasPhotos = (params.photos?.length ?? 0) > 0;
          const visionMode = hasPhotos && (params.carouselSubMode === "photo" || params.carouselSubMode === "mix");

          const res = await invokeWithTimeout("carousel-ai", {
            body: {
              type: "deepening_questions",
              channel: params.channel || "instagram",
              subject: effectiveSubjectQ,
              subject_details: existingContentQ || undefined,
              objective: objective || null,
              editorial_angle: editorialAngle || null,
              content_structure: structurePrompt || null,
              recent_briefs_context: recentBriefsContext || undefined,
              carousel_type: visionMode ? params.carouselSubMode : undefined,
              photos: visionMode
                ? params.photos!.map((p) => ({ base64: p.base64, context: p.context }))
                : undefined,
              photo_description: visionMode ? params.photoDescription || undefined : undefined,
              ...(params.newsContext && params.newsContext.trim() ? { news_context: params.newsContext.slice(0, 3800) } : {}),
            },
          }, visionMode ? 90000 : 60000);
          data = res.data;
          invokeError = res.error;
        } else {
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
          const photoModeCF = hasPhotosCF && (params.photoMode === true || format === "post" || format === "linkedin");

          const res = await invokeWithTimeout("creative-flow", {
            body: {
              step: "questions",
              contentType:
                format === "linkedin"
                  ? "linkedin_post"
                  : format === "newsletter"
                  ? "newsletter"
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
              photos: photoModeCF
                ? [{ base64: params.photos![0].base64, mimeType: params.photos![0].mimeType || "image/jpeg", context: params.photos![0].context }]
                : undefined,
              photo_description: photoModeCF ? params.photoDescription || undefined : undefined,
              ...(params.newsContext && params.newsContext.trim() ? { news_context: params.newsContext.slice(0, 3800) } : {}),
            },
          }, photoModeCF ? 90000 : 60000);
          data = res.data;
          invokeError = res.error;
        }

        if (invokeError) throw new Error(invokeError.message || "Erreur edge function");
        if (data?.error) throw new Error(data.message || data.error);

        // carousel-ai wraps its response in { content: "..." } — unwrap before parsing
        const rawContent = data?.content || data;
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

        setQuestions(parsedQuestions);
        return parsedQuestions;
      } catch (e: any) {
        setError(e?.message || "Erreur lors de la génération des questions");
        return [];
      } finally {
        setLoadingQuestions(false);
      }
    },
    []
  );

  const generateFollowUp = useCallback(
    async (params: {
      subject: string;
      answers: Record<string, string>;
      questions: Question[];
      contentType?: string;
      objective?: string;
    }): Promise<Question[]> => {
      try {
        const answersArray = params.questions.map((q) => ({
          question: q.question,
          answer: params.answers[q.id] || "",
        })).filter((a) => a.answer.trim());

        if (answersArray.length === 0) return [];

        const res = await invokeWithTimeout("creative-flow", {
          body: {
            step: "follow-up",
            contentType: params.contentType || "instagram_post",
            context: params.subject,
            answers: answersArray,
            objective: params.objective || null,
          },
        }, 45000);

        if (res.error) throw new Error(res.error.message || "Erreur follow-up");
        const rawContent = res.data?.content ?? res.data;
        const parsed = parseAIJson(rawContent);
        const list = parsed?.follow_up_questions || parsed?.questions || [];
        if (!Array.isArray(list)) return [];

        return list.map((q: any, i: number) => ({
          id: q.id || `fu_${i}`,
          question: q.question || q.label || String(q),
          placeholder: q.placeholder || q.hint || "",
        }));
      } catch (e: any) {
        console.error("[generateFollowUp] error:", e);
        return [];
      }
    },
    []
  );

  // ── Streaming generation (text formats: post / linkedin / newsletter / pinterest) ──
  // Encapsulates the SSE flow that used to live inline in CreerUnifie.tsx.
  // Mirrors EXACTLY the previous behavior: contentType mapping, body shape,
  // angle resolution across all 4 angle catalogs, JSON parsing, quota handling.
  const generateStream = useCallback(
    async (params: GenerateStreamParams): Promise<ContentResult | null> => {
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
              anecdote: ans.anecdote || ans.q_0 || undefined,
              emotion: ans.emotion || ans.q_1 || undefined,
              conviction: ans.conviction || ans.q_2 || undefined,
            }
          : undefined,
        workspace_id: workspaceId || undefined,
        objective: objective || undefined,
        editorialFormat: editorialAngle || undefined,
        editorialFormatLabel: editorialAngle || undefined,
        ...(photoMode
          ? {
              photo_mode: true,
              photo_description: photoDescription,
              ...(photos && photos.length > 0 && photos[0]?.base64
                ? {
                    photos: [
                      {
                        base64: photos[0].base64,
                        mimeType: photos[0].mimeType || "image/jpeg",
                        context: photos[0].context,
                      },
                    ],
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
      } catch (e: any) {
        if (e?._isQuota && handleQuotaError(e)) {
          setError(null);
          return null;
        }
        const msg = e?.message || "Erreur lors de la génération";
        setError(msg);
        return null;
      }

      if (!fullText) {
        // Empty result — let the caller decide whether to surface a toast
        return null;
      }

      // Tolerant JSON parse (same logic as inline CreerUnifie)
      let parsed: any;
      try {
        const jsonMatch = fullText.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { content: fullText };
      } catch {
        parsed = { content: fullText };
      }

      const normalized: ContentResult = {
        type: format as ContentResult["type"],
        raw: parsed,
      };
      setResult(normalized);
      return normalized;
    },
    [streamInvoke, streamReset]
  );

  return {
    generate,
    generating,
    result,
    setResult,
    error,
    reset,
    generateQuestions,
    generateFollowUp,
    loadingQuestions,
    questions,
    setQuestions,
    // Streaming API (Phase 4 — proxy of internal useStreamingInvoke)
    generateStream,
    streamingContent,
    streaming,
    streamDone,
    streamError,
    streamReset,
  };
}

// ── Streaming params type ──
export interface GenerateStreamParams {
  format: "post" | "linkedin" | "newsletter" | "pinterest";
  subject: string;
  objective?: string;
  editorialAngle?: string;
  answers?: Record<string, string>;
  workspaceId?: string;
  photoMode?: boolean;
  photos?: { base64: string; mimeType?: string; context?: string }[];
  photoDescription?: string;
  deepResearch?: boolean;
  pinterestLink?: string;
  pinterestBoard?: string;
  // Newsjacking — separate field, not stuffed into `subject`
  newsContext?: string;
}
