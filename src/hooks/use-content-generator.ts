import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
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
  // Reel-specific
  faceCam?: string;
  timeAvailable?: string;
  selectedHook?: any;
  preGenAnswers?: any;
  // Carousel-specific
  slideCount?: number;
  carouselType?: string;
}

export interface GenerateQuestionsParams {
  format: string;
  subject: string;
  editorialAngle?: string;
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

  // Remove markdown code fences
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to extract JSON object or array
    const match = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    }
    return null;
  }
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
      let data: any;
      let invokeError: any;

      switch (format) {
        case "carousel": {
          const res = await supabase.functions.invoke("carousel-ai", {
            body: {
              type: "express_full",
              carousel_type: carouselType || "tips",
              subject,
              objective: objective || null,
              slide_count: slideCount || 7,
              deepening_answers: answers || null,
              editorial_angle: editorialAngle || null,
              content_structure: structurePrompt || null,
              workspace_id: workspaceId || null,
            },
          });
          data = res.data;
          invokeError = res.error;
          break;
        }

        case "reel": {
          const res = await supabase.functions.invoke("reels-ai", {
            body: {
              type: "script",
              subject,
              objective: objective || null,
              face_cam: faceCam || "oui",
              time_available: timeAvailable || "flexible",
              pre_gen_answers: preGenAnswers || null,
              selected_hook: selectedHook || null,
              editorial_angle: editorialAngle || null,
              content_structure: structurePrompt || null,
              workspace_id: workspaceId || null,
            },
          });
          data = res.data;
          invokeError = res.error;
          break;
        }

        case "story": {
          const res = await supabase.functions.invoke("stories-ai", {
            body: {
              type: "generate",
              subject,
              objective: objective || null,
              editorial_angle: editorialAngle || null,
              content_structure: structurePrompt || null,
              workspace_id: workspaceId || null,
            },
          });
          data = res.data;
          invokeError = res.error;
          break;
        }

        case "post": {
          const angle = editorialAngle
            ? EDITORIAL_ANGLES.find((a) => a.id === editorialAngle)
            : undefined;
          const structure = structureId ? CONTENT_STRUCTURES[structureId] : undefined;

          const res = await supabase.functions.invoke("creative-flow", {
            body: {
              step: "generate",
              contentType: "instagram_post",
              context: subject,
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
              workspace_id: workspaceId || null,
            },
          });
          data = res.data;
          invokeError = res.error;
          break;
        }

        case "linkedin": {
          const res = await supabase.functions.invoke("linkedin-ai", {
            body: {
              action: "generate-post",
              sujet: subject,
              template: "expert_insight",
              audience: "tu",
              editorial_angle: editorialAngle || null,
              content_structure: structurePrompt || null,
              workspace_id: workspaceId || null,
            },
          });
          data = res.data;
          invokeError = res.error;
          break;
        }

        case "newsletter": {
          const angle = editorialAngle
            ? EDITORIAL_ANGLES.find((a) => a.id === editorialAngle)
            : undefined;
          const structure = structureId ? CONTENT_STRUCTURES[structureId] : undefined;

          const res = await supabase.functions.invoke("creative-flow", {
            body: {
              step: "generate",
              contentType: "newsletter",
              context: subject,
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
              workspace_id: workspaceId || null,
            },
          });
          data = res.data;
          invokeError = res.error;
          break;
        }

        default:
          throw new Error(`Format non supporté : ${format}`);
      }

      if (invokeError) throw new Error(invokeError.message || "Erreur edge function");
      if (data?.error) throw new Error(data.error);

      // Edge functions wrap response in { content: "..." } — unwrap before parsing
      const rawContent = data?.content ?? data;
      const parsed = parseAIJson(rawContent);
      if (!parsed) throw new Error("Impossible de parser la réponse IA");

      const normalized: ContentResult = {
        type: format,
        raw: parsed,
        ...parsed,
      };

      setResult(normalized);
      return normalized;
    } catch (e: any) {
      const msg = e?.message || "Erreur lors de la génération";
      setError(msg);
      return null;
    } finally {
      setGenerating(false);
    }
  }, []);

  const generateQuestions = useCallback(
    async (params: GenerateQuestionsParams) => {
      const { format, subject, editorialAngle } = params;

      setLoadingQuestions(true);
      setQuestions([]);

      try {
        let data: any;
        let invokeError: any;

        if (format === "carousel") {
          const structurePrompt = editorialAngle
            ? getStructurePromptForCombo(format, editorialAngle)
            : null;

          const res = await supabase.functions.invoke("carousel-ai", {
            body: {
              type: "deepening_questions",
              subject,
              editorial_angle: editorialAngle || null,
              content_structure: structurePrompt || null,
            },
          });
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

          const res = await supabase.functions.invoke("creative-flow", {
            body: {
              step: "questions",
              contentType:
                format === "linkedin"
                  ? "linkedin_post"
                  : format === "newsletter"
                  ? "newsletter"
                  : "instagram_post",
              context: subject,
              angle: angleObj,
            },
          });
          data = res.data;
          invokeError = res.error;
        }

        if (invokeError) throw new Error(invokeError.message || "Erreur edge function");
        if (data?.error) throw new Error(data.error);

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

  return {
    generate,
    generating,
    result,
    error,
    reset,
    generateQuestions,
    loadingQuestions,
    questions,
  };
}
