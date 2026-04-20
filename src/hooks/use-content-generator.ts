import { useState, useCallback } from "react";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { supabase } from "@/integrations/supabase/client";
import { handleQuotaError } from "@/lib/quota-error-handler";
import {
  EDITORIAL_ANGLES,
  CONTENT_STRUCTURES,
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
}

export interface GenerateQuestionsParams {
  format: string;
  subject: string;
  editorialAngle?: string;
  objective?: string;
  channel?: "instagram" | "linkedin";
  workspaceId?: string;
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
    } = params;

    setGenerating(true);
    setError(null);
    setResult(null);

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

          const res = await invokeWithTimeout("reels-ai", {
            body: {
              type: "script",
              subject: effectiveSubject,
              subject_details: existingContent || undefined,
              objective: objective || null,
              face_cam: faceCam || "oui",
              time_available: timeAvailable || "flexible",
              pre_gen_answers: effectivePreGenAnswers,
              selected_hook: selectedHook || null,
              editorial_angle: editorialAngle || null,
              content_structure: structurePrompt || null,
              workspace_id: workspaceId || null,
            },
          }, 120000);
          data = res.data;
          invokeError = res.error;
          break;
        }

        case "story": {
          const res = await invokeWithTimeout("stories-ai", {
            body: {
              type: "generate",
              subject: effectiveSubject,
              subject_details: existingContent || undefined,
              objective: objective || null,
              editorial_angle: editorialAngle || null,
              content_structure: structurePrompt || null,
              workspace_id: workspaceId || null,
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

        // Fetch 3 most recent briefs to give the AI memory + avoid repetition.
        // Done client-side so the edge function doesn't need to repeat the work.
        let recentBriefsContext = "";
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user?.id) {
            let q = supabase
              .from("content_briefs")
              .select("subject, format, editorial_angle, answers, created_at")
              .order("created_at", { ascending: false })
              .limit(3);
            if (workspaceId) q = q.eq("workspace_id", workspaceId);
            else q = q.eq("user_id", user.id);
            const { data: briefs } = await q;
            if (briefs && briefs.length > 0) {
              const lines = briefs.map((b: any, i: number) => {
                const parts = [`Brief #${i + 1} — sujet : "${b.subject}"`];
                if (b.format) parts.push(`format : ${b.format}`);
                if (b.editorial_angle) parts.push(`angle : ${b.editorial_angle}`);
                let line = parts.join(" · ");
                if (b.answers && typeof b.answers === "object") {
                  const vals = Object.values(b.answers as Record<string, string>)
                    .filter((v): v is string => typeof v === "string" && v.trim().length > 20);
                  if (vals.length > 0) {
                    let key = vals.sort((a, b) => b.length - a.length)[0];
                    if (key.length > 180) key = key.slice(0, 177) + "...";
                    line += `\n  Réponse marquante : "${key}"`;
                  }
                }
                return line;
              });
              recentBriefsContext = `\n══ HISTORIQUE RÉCENT (${briefs.length} brief${briefs.length > 1 ? "s" : ""}) ══\n${lines.join("\n\n")}\n\nÉVITE les angles déjà couverts. Tu peux faire écho discrètement.\n`;
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
            },
          }, 60000);
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

          const res = await invokeWithTimeout("creative-flow", {
            body: {
              step: "questions",
              contentType:
                format === "linkedin"
                  ? "linkedin_post"
                  : format === "newsletter"
                  ? "newsletter"
                  : "instagram_post",
              context: effectiveSubjectQ + (existingContentQ ? `\n\n[Contenu existant à approfondir]\n${existingContentQ}` : ""),
              angle: angleObj,
              objective: objective || null,
              recent_briefs_context: recentBriefsContext || undefined,
            },
          }, 60000);
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
  };
}
