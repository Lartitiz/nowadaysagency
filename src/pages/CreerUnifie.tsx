import { useState, useEffect, useCallback, useRef } from "react";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { useSearchParams, useLocation, useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, CalendarDays, Palette } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import CreerStepIdea from "@/components/creer/CreerStepIdea";
import CreerStepFormat from "@/components/creer/CreerStepFormat";
import CreerStepQuestions from "@/components/creer/CreerStepQuestions";
import CreerStepResult from "@/components/creer/CreerStepResult";
import CreerStepEdit from "@/components/creer/CreerStepEdit";
import CreerTransformTab from "@/components/creer/CreerTransformTab";
import { useContentGenerator } from "@/hooks/use-content-generator";
import { CONTENT_STRUCTURES, EDITORIAL_ANGLES, LINKEDIN_EDITORIAL_ANGLES, PINTEREST_EDITORIAL_ANGLES, PINTEREST_VISUAL_ANGLES, getStructureForCombo } from "@/lib/content-structures";
import { exportPinterestVisualPptx, exportPinterestVisualPng } from "@/lib/export-pinterest-visual-pptx";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";
import { DEMO_DATA } from "@/lib/demo-data";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { useBrandCharter } from "@/hooks/use-branding";
import { exportCarouselPptx } from "@/lib/export-carousel-pptx";
import { exportCarouselVisualPptx } from "@/lib/export-carousel-visual-pptx";
import { supabase } from "@/integrations/supabase/client";
import { loadFlowState, saveFlowState, clearFlowState } from "@/hooks/use-flow-persistence";
import { useFormPersist } from "@/hooks/use-form-persist";
import { useStreamingInvoke } from "@/hooks/use-streaming-invoke";
import { useUserPlan } from "@/hooks/use-user-plan";

type Step = "idea" | "format" | "questions" | "result" | "edit";
type Mode = "create" | "transform";

export default function CreerUnifie() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = useAuth();
  const { isDemoMode, demoData } = useDemoContext();
  const workspaceId = useWorkspaceId();
  const { data: charterData } = useBrandCharter();
  const { remainingTotal, loading: planLoading } = useUserPlan();

  // URL params
  const paramFormat = searchParams.get("format");
  const paramSujet = searchParams.get("sujet") || searchParams.get("subject") || "";
  const paramObjectif = searchParams.get("objectif") || searchParams.get("objective") || "";
  const paramMode = searchParams.get("mode");
  const paramFrom = searchParams.get("from");

  // Location state (from calendar, etc.)
  const locState = (location.state as any) || {};

  // Check if we have URL params that should override persisted state
  const paramCanal = searchParams.get("canal");
  const hasUrlParams = !!(paramFormat || paramCanal || paramSujet || paramObjectif || locState.fromCalendar);

  // Only restore persisted state if we have URL params or location state (coming back to an in-progress flow)
  // Fresh navigation (/creer with nothing) should start clean
  const hasSomeContext = hasUrlParams || !!location.state;
  const persistedState = useRef(hasSomeContext ? loadFlowState() : null);

  // Core state — restore from sessionStorage if available
  const ps = persistedState.current;
  const [mode, setMode] = useState<Mode>(paramMode === "transform" ? "transform" : "create");
  // Restore step — allow "result" and "edit" if their data is available
  const safeStep = (() => {
    if (!ps?.step) return "idea";
    if (ps.step === "result" && ps.result) return "result";
    if (ps.step === "edit" && ps.editContent) return "edit";
    if (["result", "edit"].includes(ps.step)) return "idea";
    return ps.step as Step;
  })();
  const [step, setStep] = useState<Step>(safeStep);
  const [restoredQuestions] = useState(ps?.questions || []);
  const [ideaText, setIdeaText] = useState(ps?.ideaText || paramSujet || locState.sujet || locState.subject || "");
  const [objective, setObjective] = useState<string | null>(
    ps?.objective || paramObjectif || locState.objectif || locState.objective || null
  );
  const [selectedFormat, setSelectedFormat] = useState<string | null>(ps?.selectedFormat || paramFormat || null);
  const [editorialAngle, setEditorialAngle] = useState<string | null>(ps?.editorialAngle || null);
  const [answers, setAnswers] = useState<Record<string, string>>(ps?.answers || {});
  const [editContent, setEditContent] = useState(ps?.editContent || "");
  const [existingCalendarContent, setExistingCalendarContent] = useState<string | null>(null);
  const [calendarPostId] = useState<string | null>(locState?.calendarPostId || null);
  const [calendarPostDate] = useState<string | null>(locState?.postDate || null);
  const fromCalendar = !!(locState?.fromCalendar && calendarPostId);

  // Photo states (carousel photo + post photo)
  const [carouselSubMode, setCarouselSubMode] = useState<"text" | "photo" | "mix" | null>(null);
  const [uploadedPhotos, setUploadedPhotos] = useState<any[]>([]);
  const [photoDescription, setPhotoDescription] = useState("");
  const [photoMode, setPhotoMode] = useState(false);
  const [demoGenerating, setDemoGenerating] = useState(false);
  const [pinterestData, setPinterestData] = useState<{ link?: string; boardId?: string; boardName?: string } | null>(null);
  const [isLinkedInCarousel, setIsLinkedInCarousel] = useState(false);
  const [pinterestPinHtml, setPinterestPinHtml] = useState<string | null>(null);
  const [pinterestVisualGenerating, setPinterestVisualGenerating] = useState(false);

  const { restored: draftRestored, clearDraft } = useFormPersist(
    "creer-unifie-form",
    { step, ideaText, objective, selectedFormat, editorialAngle, answers },
    (saved) => {
      if (!hasSomeContext) return; // Fresh navigation — don't restore
      if (location.state || searchParams.get("format") || searchParams.get("sujet")) return;
      if (saved.step && saved.step !== "idea") setStep(saved.step as Step);
      if (saved.ideaText) setIdeaText(saved.ideaText);
      if (saved.objective) setObjective(saved.objective);
      if (saved.selectedFormat) setSelectedFormat(saved.selectedFormat);
      if (saved.editorialAngle) setEditorialAngle(saved.editorialAngle);
      if (saved.answers && Object.keys(saved.answers).length) setAnswers(saved.answers);
    }
  );

  // When arriving at /creer without params (fresh navigation), clear persisted state
  useEffect(() => {
    if (!hasSomeContext) {
      clearFlowState();
      clearDraft();
      sessionStorage.removeItem("creer_unifie_result");
      setStep("idea");
      setSelectedFormat(null);
      setEditorialAngle(null);
      setIdeaText("");
      setObjective(null);
      setAnswers({});
      setEditContent("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If canal param is set, pre-select the format
  useEffect(() => {
    if (paramCanal && !selectedFormat) {
      if (paramCanal === "linkedin" || paramCanal === "pinterest" || paramCanal === "newsletter") {
        setSelectedFormat(paramCanal);
      }
    }
  }, [paramCanal]);

  const [launchResults, setLaunchResults] = useState<any[]>([]);
  const [launchIndex, setLaunchIndex] = useState(0);
  const [launchGenerating, setLaunchGenerating] = useState(false);

  // Post-generation states
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(ps?.savedId || null);
  const [calendarDialogOpen, setCalendarDialogOpen] = useState(false);
  const [calendarDate, setCalendarDate] = useState("");
  const [savingToCalendar, setSavingToCalendar] = useState(false);

  // Visual states (carousel only)
  const [visualSlides, setVisualSlides] = useState<{ slide_number: number; html: string }[]>(ps?.visualSlides || []);
  const [visualLoading, setVisualLoading] = useState(false);

  // ── Persist generated result to sessionStorage ──
  const CREER_RESULT_KEY = "creer_unifie_result";
  const resultRestoredRef = useRef(false);

  useEffect(() => {
    if (resultRestoredRef.current) return;
    if (location.state || searchParams.get("format") || searchParams.get("sujet")) return;
    resultRestoredRef.current = true;
    try {
      const raw = sessionStorage.getItem(CREER_RESULT_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.visualSlides?.length) setVisualSlides(saved.visualSlides);
      if (saved.launchResults?.length) setLaunchResults(saved.launchResults);
    } catch { /* corrupt — ignore */ }
  }, []);

  useEffect(() => {
    if (step === "idea" || step === "format") return;
    try {
      sessionStorage.setItem(CREER_RESULT_KEY, JSON.stringify({
        visualSlides,
        launchResults,
      }));
    } catch { /* quota — ignore */ }
  }, [step, visualSlides, launchResults]);

  const {
    generate,
    generating,
    result,
    setResult,
    error,
    reset: resetGenerator,
    generateQuestions,
    loadingQuestions,
    questions,
  } = useContentGenerator();

  const { content: streamingContent, streaming, done: streamDone, invoke: streamInvoke, reset: streamReset } = useStreamingInvoke();

  // Restore result from persisted state
  useEffect(() => {
    if (ps?.result && !result) {
      setResult(ps.result);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Demo mode: pre-fill with carousel photo example
  useEffect(() => {
    if (!isDemoMode || !demoData) return;
    const demo = (DEMO_DATA as any).carousel_photo_demo;
    if (!demo) return;
    if (!ideaText && !selectedFormat) {
      setIdeaText(demo.subject);
      setSelectedFormat("carousel");
      setCarouselSubMode("photo");
      setObjective(demo.objective);
      setStep("format");
    }
  }, [isDemoMode, demoData, ideaText, selectedFormat]);

  // Auto-persist state on changes
  useEffect(() => {
    // Only persist when we're past the idea step or have meaningful state
    if (step !== "idea" || ideaText) {
      saveFlowState({
        step,
        ideaText,
        objective,
        selectedFormat,
        editorialAngle,
        answers,
        editContent,
        result: result || undefined,
        visualSlides,
        savedId,
        questions: questions || [],
      });
    }
  }, [step, ideaText, objective, selectedFormat, editorialAngle, editContent, result, visualSlides?.length, savedId, questions]);

  // Pre-fill from URL/state & auto-advance (only when URL params are present)
  const initDone = useRef(false);
  useEffect(() => {
    // If we restored from persistence, skip URL-based init
    if (ps && !hasUrlParams) {
      initDone.current = true;
      return;
    }
    // Prevent re-running on subsequent location.search changes after first init
    if (initDone.current && !hasUrlParams) return;
    initDone.current = true;

    const subject = paramSujet || locState.sujet || locState.subject || "";
    const obj = paramObjectif || locState.objectif || locState.objective || null;

    if (subject) setIdeaText(subject);
    if (obj) setObjective(obj);
    if (locState?.existingContent) setExistingCalendarContent(locState.existingContent);

    const fmt = paramFormat || locState?.format;
    const paramCarouselSubMode = searchParams.get("carouselSubMode") as "text" | "photo" | "mix" | null;
    if (fmt) setSelectedFormat(fmt);
    if (paramCarouselSubMode) setCarouselSubMode(paramCarouselSubMode);

    if (fmt && subject.trim()) {
      // Build enriched subject directly from locState to avoid race condition
      // (setExistingCalendarContent is async and not yet available)
      const calendarContent = locState?.existingContent || null;
      const enrichedSubject = calendarContent
        ? subject + "\n\n[Contenu existant à approfondir]\n" + calendarContent
        : subject;
      const calendarAngle = locState?.angle || undefined;
      if (calendarAngle) setEditorialAngle(calendarAngle);
      
      // Si le format est "carousel" ou "post", passer par l'étape format
      // pour permettre le sous-choix (carrousel texte/photo, toggle photo)
      // SAUF si on vient du calendrier avec un angle déjà choisi (flow calendrier = direct)
      if ((fmt === "carousel" || fmt === "post") && !locState?.fromCalendar) {
        setStep("format");
      } else {
        handleFormatNext(fmt, calendarAngle, { overrideSubject: enrichedSubject });
      }
    } else if (locState?.fromCalendar && subject) {
      // Map calendar formats to CreerUnifie formats
      const FORMAT_MAP: Record<string, string> = {
        "post_photo": "post",
        "post_texte": "post",
        "post_carrousel": "carousel",
        "story_serie": "story",
      };
      const mappedFormat = locState.format ? (FORMAT_MAP[locState.format] || locState.format) : null;
      if (mappedFormat) setSelectedFormat(mappedFormat);
      if (locState.angle) setEditorialAngle(locState.angle);
      setStep("format");
    } else if (fmt) {
      setStep("format");
    } else if (!ps) {
      setStep("idea");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  // Show error
  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  // ── Step handlers ──

  const handleCoachingSelect = useCallback((data: { subject: string; format: string; objective: string; carouselSubMode?: "text" | "photo" | "mix" }) => {
    setAnswers({});
    setEditorialAngle(null);
    setEditContent("");
    setLaunchResults([]);

    setIdeaText(data.subject);
    if (data.objective) setObjective(data.objective);
    setSelectedFormat(data.format);
    if (data.carouselSubMode) setCarouselSubMode(data.carouselSubMode);

    // Coaching dialog already handles sub-mode choice, go directly to questions
    setStep("questions");
    generateQuestions({ 
      format: data.format, 
      subject: data.subject, 
      editorialAngle: undefined, 
      objective: data.objective || undefined 
    });
  }, [generateQuestions]);

  const handleIdeaNext = (idea: string, obj?: string) => {
    setIdeaText(idea);
    setObjective(obj || null);
    // Reset format-related state so the user starts fresh at channel selection
    setSelectedFormat(null);
    setEditorialAngle(null);
    setCarouselSubMode(null);
    setUploadedPhotos([]);
    setPhotoDescription("");
    setPhotoMode(false);
    setPinterestData(null);
    setStep("format");
  };

  const handleFormatNext = async (format: string, angle?: string, options?: { carouselSubMode?: "text" | "photo" | "mix"; photos?: any[]; photoDescription?: string; photoMode?: boolean; overrideSubject?: string }) => {
    const { carouselSubMode: sub, photos, photoDescription: desc, photoMode: pm, overrideSubject } = options || {};

    // Demo mode: skip questions step, go directly to generation
    if (isDemoMode) {
      setSelectedFormat(format);
      setEditorialAngle(angle || null);
      if (sub) setCarouselSubMode(sub);
      if (photos) setUploadedPhotos(photos);
      if (desc) setPhotoDescription(desc);
      if (pm !== undefined) setPhotoMode(pm);
      setStep("result");
      // Trigger demo generation directly
      const demo = (DEMO_DATA as any).carousel_photo_demo;
      if (demo?.result) {
        setDemoGenerating(true);
        setTimeout(() => {
          setResult({ type: "carousel", raw: demo.result, ...demo.result });
          setDemoGenerating(false);
        }, 2500);
      }
      return;
    }

    setSelectedFormat(format);
    setEditorialAngle(angle || null);
    if (format !== "pinterest") setPinterestData(null);
    if (sub) setCarouselSubMode(sub);
    if (photos) setUploadedPhotos(photos);
    if (desc) setPhotoDescription(desc);
    if (pm !== undefined) setPhotoMode(pm);

    const subjectToUse = overrideSubject || ideaText;
    const enrichedSubject = existingCalendarContent
      ? subjectToUse + "\n\n[Contenu existant à approfondir]\n" + existingCalendarContent
      : subjectToUse;

    if (angle === "lancement") {
      setStep("result");
      await handleLaunchSequence(format, angle);
      return;
    }

    setStep("questions");
    await generateQuestions({ format, subject: enrichedSubject, editorialAngle: angle, objective: objective || undefined, channel: isLinkedInCarousel ? "linkedin" : undefined });
  };

  const handleQuestionsNext = async (ans: Record<string, string>) => {
    setAnswers(ans);
    setStep("result");
    await doGenerate(ans);
  };

  const handleSkipQuestions = async () => {
    setAnswers({});
    setStep("result");
    await doGenerate({});
  };

  const doGenerate = async (ans: Record<string, string>) => {
    if (!selectedFormat) return;
    // Demo mode: simulate generation with pre-built result
    if (isDemoMode) {
      const demo = (DEMO_DATA as any).carousel_photo_demo;
      if (demo?.result) {
        setDemoGenerating(true);
        setStep("result");
        setTimeout(() => {
          setResult({ type: "carousel", raw: demo.result, ...demo.result });
          setDemoGenerating(false);
        }, 2500);
        return;
      }
    }
    // Reset post-generation state on new generation
    setSavedId(null);
    setVisualSlides([]);
    setPinterestPinHtml(null);
    const enrichedSubject = existingCalendarContent
      ? ideaText + "\n\n[Contenu existant à approfondir]\n" + existingCalendarContent
      : ideaText;

    // Formats texte : utiliser le streaming SSE
    const textFormats = ["post", "linkedin", "newsletter", "pinterest"];
    const isTextFormat = textFormats.includes(selectedFormat);

    if (isTextFormat) {
      streamReset();
      const contentTypeMap: Record<string, string> = {
        post: "post_instagram",
        linkedin: "post_linkedin",
        newsletter: "post_newsletter",
        pinterest: "post_pinterest",
      };
      // Build angle object matching classic path
      const angleObj = editorialAngle
        ? (() => {
            const found = EDITORIAL_ANGLES.find((a) => a.id === editorialAngle) || LINKEDIN_EDITORIAL_ANGLES.find((a) => a.id === editorialAngle) || PINTEREST_EDITORIAL_ANGLES.find((a) => a.id === editorialAngle) || PINTEREST_VISUAL_ANGLES.find((a) => a.id === editorialAngle);
            const structureId = getStructureForCombo(selectedFormat, editorialAngle);
            const structure = structureId ? CONTENT_STRUCTURES[structureId] : undefined;
            return found
              ? { title: found.label, structure: structure?.steps.map((s) => s.label), tone: "direct, chaleureux, oral assumé" }
              : undefined;
          })()
        : undefined;

      const streamBody: any = {
        step: "generate",
        contentType: contentTypeMap[selectedFormat] || "post_instagram",
        context: enrichedSubject,
        angle: angleObj,
        answers: Object.keys(ans).length > 0
          ? Object.entries(ans).map(([q, a]) => ({ question: q, answer: a }))
          : undefined,
        preGenAnswers: Object.keys(ans).length > 0
          ? { anecdote: ans.anecdote || ans.q_0 || undefined, emotion: ans.emotion || ans.q_1 || undefined, conviction: ans.conviction || ans.q_2 || undefined }
          : undefined,
        workspace_id: workspaceId || undefined,
        objective: objective || undefined,
        editorialFormat: editorialAngle || undefined,
        editorialFormatLabel: editorialAngle || undefined,
        ...(photoMode ? { photo_mode: true, photo_description: photoDescription } : {}),
        ...(selectedFormat === "pinterest" && pinterestData ? {
          pinterest_link: pinterestData.link,
          pinterest_board: pinterestData.boardName,
        } : {}),
      };

      const fullText = await streamInvoke("creative-flow", streamBody);

      if (fullText) {
        try {
          const jsonMatch = fullText.match(/\{[\s\S]*\}/);
          const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { content: fullText };
          setResult({ type: selectedFormat as any, raw: parsed });
        } catch {
          setResult({ type: selectedFormat as any, raw: { content: fullText } });
        }
      }
      return;
    }

    // Épingle visuelle Pinterest : appel direct (comme carousel mais une seule slide)
    if (selectedFormat === "pinterest_visual") {
      setStep("result");
      setPinterestPinHtml(null);
      setPinterestVisualGenerating(true);
      try {
        const pinType = editorialAngle || "infographie";
        const { data, error: fnError } = await invokeWithTimeout("pinterest-visual", {
          body: {
            subject: enrichedSubject,
            pin_type: pinType,
            pinterest_link: pinterestData?.link,
            pinterest_board: pinterestData?.boardName,
            workspace_id: workspaceId || undefined,
          },
        }, 120000);
        if (fnError) throw fnError;
        if (data?.error) throw new Error(data.error);
        const r = data?.result;
        setPinterestPinHtml(r?.pin_html || null);
        setResult({
          type: "pinterest_visual" as any,
          raw: {
            pin_html: r?.pin_html,
            title: r?.title,
            description: r?.description,
            pin_data: r?.pin_data,
          },
        });
      } catch (e: any) {
        toast.error(e?.message || "Erreur lors de la génération du visuel Pinterest");
      } finally {
        setPinterestVisualGenerating(false);
      }
      return;
    }

    // Formats structurés : appel classique (pas de streaming)
    await generate({
      format: selectedFormat as any,
      subject: enrichedSubject,
      objective: objective || undefined,
      editorialAngle: editorialAngle || undefined,
      answers: Object.keys(ans).length > 0 ? ans : undefined,
      channel: isLinkedInCarousel ? "linkedin" : undefined,
      ...(carouselSubMode === "photo" ? { carouselType: "photo", photos: uploadedPhotos.map(p => ({ base64: p.base64 })), photoDescription } : {}),
      ...(carouselSubMode === "mix" ? { carouselType: "mix", photos: uploadedPhotos.map(p => ({ base64: p.base64 })), photoDescription } : {}),
      ...(photoMode ? { photoMode: true, photos: uploadedPhotos.length > 0 ? [{ base64: uploadedPhotos[0]?.base64 }] : undefined, photoDescription } : {}),
    });
  };

  const handleRegenerate = async () => {
    await doGenerate(answers);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copié !");
  };

  const handleEdit = () => {
    const r = result?.raw || result;
    let text = "";

    if (!r) {
      // Pas de résultat IA — utiliser le contenu existant du calendrier ou le brouillon
      text = existingCalendarContent || "";
    } else if (selectedFormat === "carousel" && r?.slides) {
      const slidesText = (r.slides as any[])
        .map((s: any) => {
          const header = `--- SLIDE ${s.slide_number} (${s.role || ""}) ---`;
          const parts = [s.title, s.body].filter(Boolean);
          return `${header}\n${parts.join("\n")}`;
        })
        .join("\n\n");
      const captionParts: string[] = [];
      if (r.caption?.hook) captionParts.push(r.caption.hook);
      if (r.caption?.body) captionParts.push(r.caption.body);
      if (r.caption?.cta) captionParts.push(r.caption.cta);
      const captionText = captionParts.length > 0
        ? `\n\n--- CAPTION ---\n${captionParts.join("\n\n")}`
        : "";
      const hashtagsText = r.caption?.hashtags?.length > 0
        ? `\n\n${(r.caption.hashtags as string[]).map((h: string) => `#${h.replace(/^#/, "")}`).join(" ")}`
        : "";
      text = slidesText + captionText + hashtagsText;

    } else if (selectedFormat === "reel" && r?.sections) {
      text = (r.sections as any[])
        .map((s: any) => {
          const header = `--- ${s.label || s.section_label || `Section ${s.section_number || ""}`} (${s.timing || ""}) ---`;
          const parts = [s.texte_parle, s.texte_overlay, s.action].filter(Boolean);
          return `${header}\n${parts.join("\n")}`;
        })
        .join("\n\n");

    } else if (selectedFormat === "story" && (r?.stories || r?.sequences || r?.slides)) {
      const stories = r.stories || r.sequences || r.slides || [];
      text = (stories as any[])
        .map((s: any, i: number) => {
          const header = `--- STORY ${s.number || i + 1} (${s.type || s.format || ""}) ---`;
          const content = s.text || s.texte || s.content || s.instruction || "";
          const sticker = s.sticker ? `\n🏷️ Sticker : ${s.sticker}` : "";
          return `${header}\n${content}${sticker}`;
        })
        .join("\n\n");

    } else if (selectedFormat === "linkedin" && (r?.hook || r?.full_text)) {
      if (r.full_text) {
        text = r.full_text;
      } else {
        text = [r.hook, r.body, r.cta].filter(Boolean).join("\n\n");
      }
      if (r.hashtags?.length > 0) {
        text += `\n\n${(r.hashtags as string[]).join(" ")}`;
      }

    } else if (selectedFormat === "pinterest_visual" && (r?.title || r?.description)) {
      text = `📌 TITRE :\n${r.title || ""}\n\n📝 DESCRIPTION :\n${r.description || ""}`;

    } else if (r?.content) {
      text = r.content;
    } else if (r?.post) {
      text = r.post;
    } else if (r?.text) {
      text = r.text;
    } else if (r?.hook && r?.body) {
      text = [r.hook, r.body, r.cta].filter(Boolean).join("\n\n");
    } else if (typeof r === "string") {
      text = r;
    } else {
      text = JSON.stringify(r, null, 2);
    }

    // Fallback: si texte vide ou juste "null", utiliser le contenu existant
    if ((!text || text === "null" || !text.trim()) && existingCalendarContent) {
      text = existingCalendarContent;
    }

    setEditContent(text);
    setStep("edit");
  };

  const handleReset = () => {
    resetGenerator();
    streamReset();
    setStep("idea");
    setIdeaText("");
    setObjective(null);
    setSelectedFormat(null);
    setEditorialAngle(null);
    setAnswers({});
    setEditContent("");
    setLaunchResults([]);
    setLaunchIndex(0);
    setSavedId(null);
    setVisualSlides([]);
    setPinterestPinHtml(null);
    setCarouselSubMode(null);
    setIsLinkedInCarousel(false);
    setUploadedPhotos([]);
    setPhotoDescription("");
    setPhotoMode(false);
    setIsLinkedInCarousel(false);
    clearFlowState();
    clearDraft();
    sessionStorage.removeItem(CREER_RESULT_KEY);
  };


  const handleTransformToLinkedInCarousel = async () => {
    const r = result?.raw;
    if (!r) return;
    const linkedinText = r.full_text || r.content || [r.hook, r.body, r.cta].filter(Boolean).join("\n\n");
    if (!linkedinText) return;

    setIsLinkedInCarousel(true);
    setSelectedFormat("carousel");
    setCarouselSubMode("text");
    setResult(null);
    setVisualSlides([]);
    setSavedId(null);

    await generate({
      format: "carousel" as any,
      subject: linkedinText,
      objective: objective || undefined,
      editorialAngle: editorialAngle || undefined,
      channel: "linkedin",
    });
  };

  // ── Post-generation handlers ──

  const handleSave = async () => {
    if (!session?.user?.id || !result?.raw || saving) return;
    setSaving(true);
    try {
      const r = result.raw;
      if (selectedFormat === "carousel" && r?.slides) {
        const hookText = r.slides?.[0]?.title || "";
        const captionText = [r.caption?.hook, r.caption?.body, r.caption?.cta].filter(Boolean).join("\n\n");
        const { data } = await supabase.from("generated_carousels" as any).insert({
          user_id: session.user.id,
          carousel_type: r.carousel_type || "tips",
          subject: ideaText,
          objective: objective || null,
          hook_text: hookText,
          slide_count: r.slides?.length || 7,
          slides: r.slides,
          caption: captionText,
          hashtags: r.caption?.hashtags || [],
          quality_score: r.quality_check?.score || null,
        }).select("id").single();
        if (data) setSavedId((data as any).id);
      }
      toast.success("Contenu sauvegardé !");
    } catch (e: any) {
      toast.error(e?.message || "Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  // Extract content draft from result for calendar save
  const extractContentForCalendar = () => {
    const r = result?.raw;
    if (!r) return { contentDraft: "", accroche: "", storyDetail: null as any };
    let contentDraft = "";
    let accroche = "";
    const fmt = selectedFormat || "post";

    if (selectedFormat === "carousel" && r?.carousel_type === "photo") {
      accroche = r.caption?.hook || "";
      contentDraft = (r.slides || []).map((s: any) => s.overlay_text ? `SLIDE ${s.slide_number}: ${s.overlay_text}` : `SLIDE ${s.slide_number}: (photo seule)`).join("\n") + "\n\n" + [r.caption?.hook, r.caption?.body, r.caption?.cta].filter(Boolean).join("\n");
      const storyDetail: any = { type: "carousel_photo", slides: r.slides, caption: r.caption, quality_check: r.quality_check };
      return { contentDraft, accroche, storyDetail };
    }

    if (selectedFormat === "carousel" && r?.carousel_type === "mix") {
      accroche = r.caption?.hook || "";
      contentDraft = (r.slides || []).map((s: any) => {
        const type = s.slide_type || "text_only";
        if (type === "photo_full") return `SLIDE ${s.slide_number} [📸]: ${s.overlay_text || "(photo seule)"}`;
        if (type === "photo_integrated") return `SLIDE ${s.slide_number} [📷+📝]: ${s.title || ""} — ${s.body || ""}`;
        return `SLIDE ${s.slide_number} [📝]: ${s.title || ""} — ${s.body || ""}`;
      }).join("\n") + "\n\n" + [r.caption?.hook, r.caption?.body, r.caption?.cta].filter(Boolean).join("\n");
      const storyDetail: any = { type: "carousel_mix", slides: r.slides, caption: r.caption, quality_check: r.quality_check };
      return { contentDraft, accroche, storyDetail };
    }

    if (selectedFormat === "carousel" && r?.slides) {
      accroche = r.caption?.hook || r.slides?.[0]?.title || "";
      const slidesText = r.slides?.map((s: any) => `${s.title}\n${s.body || ""}`).join("\n\n");
      const captionText = r.caption ? [r.caption.hook, r.caption.body, r.caption.cta].filter(Boolean).join("\n") : "";
      contentDraft = captionText ? `${captionText}\n\n───── SLIDES ─────\n\n${slidesText}` : slidesText;
    } else if (selectedFormat === "linkedin" && (r?.hook || r?.full_text)) {
      accroche = (r.hook || r.full_text?.split(/[.\n]/)[0] || "").trim().slice(0, 200);
      contentDraft = r.full_text || [r.hook, r.body, r.cta].filter(Boolean).join("\n\n");
    } else if (selectedFormat === "reel" && r?.script) {
      accroche = r.script?.[0]?.texte_parle || "";
      contentDraft = r.script?.map((s: any) => `[${s.timing || ""}] ${(s.section || "").toUpperCase()}\n${s.texte_parle || ""}${s.texte_overlay ? `\n📝 ${s.texte_overlay}` : ""}`).join("\n\n");
    } else if (selectedFormat === "story" && r?.stories) {
      accroche = r.stories?.[0]?.text || "";
      contentDraft = r.stories?.map((s: any) => `STORY ${s.number || ""} (${s.timing || ""})\n${s.format_label || s.format || ""}\n${s.text || ""}${s.sticker ? `\n🎯 ${s.sticker.label || s.sticker.type || ""}` : ""}`).join("\n\n───\n\n");
    } else if (selectedFormat === "pinterest_visual" && (r?.title || r?.description)) {
      accroche = r.title || "";
      contentDraft = `📌 ${r.title || ""}\n\n${r.description || ""}`;
    } else {
      contentDraft = r.content || r.post || r.text || "";
      accroche = contentDraft.split("\n")[0] || "";
    }

    let storyDetail: any = null;
    if (selectedFormat === "carousel" && r?.slides) {
      storyDetail = {
        type: "carousel",
        carousel_type: r.carousel_type || "tips",
        slides: r.slides,
        caption: r.caption,
        quality_check: r.quality_check,
      };
    } else if (selectedFormat === "reel" && r?.script) {
      storyDetail = {
        type: "reel",
        format_type: r.format_type,
        format_label: r.format_label,
        duree_cible: r.duree_cible,
        script: r.script,
        caption: r.caption,
        hashtags: r.hashtags,
        cover_text: r.cover_text,
        alt_text: r.alt_text,
        amplification_stories: r.amplification_stories,
      };
    } else if (selectedFormat === "story" && (r?.stories || r?.sequences)) {
      storyDetail = {
        type: "stories",
        stories: r.stories || r.sequences,
        structure_type: r.structure_type,
        structure_label: r.structure_label,
        stickers_used: r.stickers_used,
        garde_fou_alerte: r.garde_fou_alerte,
        personal_tip: r.personal_tip,
      };
    }

    return { contentDraft, accroche, storyDetail };
  };

  // Save back to existing calendar post (when coming from calendar)
  const handleSaveBackToCalendar = async () => {
    if (!session?.user?.id || !calendarPostId || !result?.raw) return;
    setSavingToCalendar(true);
    try {
      if (selectedFormat === "carousel" && !savedId && result?.raw?.slides) {
        await handleSave();
      }
      const { contentDraft, accroche, storyDetail } = extractContentForCalendar();
      const r = result?.raw;
      const { error } = await supabase.from("calendar_posts").update({
        content_draft: contentDraft,
        accroche: accroche || null,
        status: "drafting",
        format: selectedFormat === "story" ? "story_serie" : (selectedFormat || "post"),
        objectif: objective || null,
        angle: editorialAngle || null,
        ...(storyDetail ? { story_sequence_detail: storyDetail } : {}),
        ...(selectedFormat === "story" && r?.stories ? {
          stories_count: r.total_stories || r.stories?.length || null,
          stories_structure: r.structure_label || r.structure_type || null,
          stories_objective: objective || null,
        } : {}),
        ...(savedId ? { generated_content_id: savedId, generated_content_type: "carousel" } : {}),
        updated_at: new Date().toISOString(),
      }).eq("id", calendarPostId);
      if (error) throw error;

      // Upload visuels et photos dans Storage
      if (calendarPostId) {
        const storageUpdates: any = {};
        
        if ((carouselSubMode === "photo" || carouselSubMode === "mix") && uploadedPhotos.length > 0) {
          try {
            const photoUrls = await uploadPhotosToStorage(calendarPostId);
            if (photoUrls.length > 0) storageUpdates.photo_urls = photoUrls;
          } catch (err) {
            console.warn("Photo upload failed:", err);
          }
        }
        
        if (visualSlides.length > 0) {
          try {
            toast.info("Upload des visuels...");
            const visualUrls = await uploadVisualsToStorage(calendarPostId);
            if (visualUrls.length > 0) storageUpdates.visual_urls = visualUrls;
          } catch (err) {
            console.warn("Visual upload failed:", err);
          }
        }
        
        if (Object.keys(storageUpdates).length > 0) {
          const currentDetail = storyDetail || {};
          await supabase.from("calendar_posts").update({
            story_sequence_detail: { ...currentDetail, ...storageUpdates },
          }).eq("id", calendarPostId);
        }
      }

      toast.success("Contenu sauvegardé dans ton calendrier !");
      clearFlowState();
      navigate(`/calendrier?date=${calendarPostDate || ""}&post=${calendarPostId}`);
    } catch (e: any) {
      toast.error(e?.message || "Erreur de sauvegarde");
    } finally {
      setSavingToCalendar(false);
    }
  };

  const handleAddToCalendar = async () => {
    if (!session?.user?.id || !result?.raw) return;
    // Auto-save carousel if not already saved
    if (selectedFormat === "carousel" && !savedId && result?.raw?.slides) {
      await handleSave();
    }
    // If coming from calendar, save directly back
    if (fromCalendar) {
      await handleSaveBackToCalendar();
      return;
    }
    setCalendarDialogOpen(true);
  };

  const uploadPhotosToStorage = async (postId: string): Promise<string[]> => {
    if (!session?.user?.id || uploadedPhotos.length === 0) return [];
    
    const urls: string[] = [];
    for (let i = 0; i < uploadedPhotos.length; i++) {
      const photo = uploadedPhotos[i];
      if (!photo.base64) continue;
      
      const raw = photo.base64.startsWith("data:") 
        ? photo.base64 
        : `data:image/jpeg;base64,${photo.base64}`;
      const response = await fetch(raw);
      const blob = await response.blob();
      
      const path = `${session.user.id}/${postId}/photos/photo-${i + 1}.jpg`;
      const { error } = await supabase.storage
        .from("calendar-visuals")
        .upload(path, blob, { contentType: "image/jpeg", upsert: true });
      
      if (error) {
        console.error(`Failed to upload photo ${i + 1}:`, error);
        continue;
      }
      
      const { data: urlData } = supabase.storage
        .from("calendar-visuals")
        .getPublicUrl(path);
      
      urls.push(urlData.publicUrl);
    }
    return urls;
  };

  const uploadVisualsToStorage = async (postId: string): Promise<string[]> => {
    if (!session?.user?.id || visualSlides.length === 0) return [];
    
    const container = document.createElement("div");
    container.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1080px;height:1350px;overflow:hidden;z-index:-1;";
    document.body.appendChild(container);
    
    const urls: string[] = [];
    try {
      for (const vs of visualSlides) {
        container.innerHTML = vs.html;
        await document.fonts.ready;
        await new Promise(r => setTimeout(r, 400));
        
        const canvas = await (await import("html2canvas")).default(container, {
          width: 1080,
          height: 1350,
          scale: 1,
          useCORS: true,
          allowTaint: true,
          backgroundColor: null,
          logging: false,
        });
        
        const blob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((b) => resolve(b!), "image/png");
        });
        
        const path = `${session.user.id}/${postId}/slides/slide-${vs.slide_number}.png`;
        const { error } = await supabase.storage
          .from("calendar-visuals")
          .upload(path, blob, { contentType: "image/png", upsert: true });
        
        if (error) {
          console.error(`Failed to upload slide ${vs.slide_number}:`, error);
          continue;
        }
        
        const { data: urlData } = supabase.storage
          .from("calendar-visuals")
          .getPublicUrl(path);
        
        urls.push(urlData.publicUrl);
      }
    } finally {
      document.body.removeChild(container);
    }
    return urls;
  };

  const handleConfirmCalendar = async () => {
    if (!session?.user?.id || !calendarDate || savingToCalendar) return;
    setSavingToCalendar(true);
    try {
      const { contentDraft, accroche, storyDetail } = extractContentForCalendar();
      const r = result?.raw;
      const fmt = selectedFormat === "story" ? "story_serie" : (selectedFormat || "post");
      const canal = selectedFormat === "linkedin" || isLinkedInCarousel ? "linkedin" : selectedFormat === "pinterest" || selectedFormat === "pinterest_visual" ? "pinterest" : selectedFormat === "newsletter" ? "newsletter" : "instagram";

      const { data: insertedPost, error: insertError } = await supabase.from("calendar_posts").insert({
        user_id: session.user.id,
        ...(workspaceId && workspaceId !== session.user.id ? { workspace_id: workspaceId } : {}),
        date: calendarDate,
        theme: ideaText,
        status: "drafting",
        canal,
        format: fmt,
        objectif: objective || null,
        angle: editorialAngle || null,
        content_draft: contentDraft,
        accroche,
        ...(storyDetail ? { story_sequence_detail: storyDetail } : {}),
        ...(selectedFormat === "story" && r?.stories ? {
          stories_count: r.total_stories || r.stories?.length || null,
          stories_structure: r.structure_label || r.structure_type || null,
          stories_objective: objective || null,
        } : {}),
        ...(savedId ? { generated_content_id: savedId, generated_content_type: "carousel" } : {}),
      }).select("id").single();

      if (insertError) throw insertError;

      const postId = insertedPost?.id;

      if (postId) {
        const updates: any = {};
        
        // Upload photos originales dans Storage
        if ((carouselSubMode === "photo" || carouselSubMode === "mix") && uploadedPhotos.length > 0) {
          try {
            const photoUrls = await uploadPhotosToStorage(postId);
            if (photoUrls.length > 0) {
              updates.photo_urls = photoUrls;
            }
          } catch (err) {
            console.warn("Photo upload failed (non-blocking):", err);
          }
        }
        
        // Upload visuels PNG dans Storage
        if (visualSlides.length > 0) {
          try {
            toast.info("Upload des visuels...");
            const visualUrls = await uploadVisualsToStorage(postId);
            if (visualUrls.length > 0) {
              updates.visual_urls = visualUrls;
            }
          } catch (err) {
            console.warn("Visual upload failed (non-blocking):", err);
          }
        }
        
        // Mettre à jour le post avec les URLs
        if (Object.keys(updates).length > 0) {
          const currentDetail = storyDetail || {};
          await supabase.from("calendar_posts").update({
            story_sequence_detail: {
              ...currentDetail,
              ...updates,
            },
          }).eq("id", postId);
        }
      }

      toast.success("Ajouté au calendrier !");
      setCalendarDialogOpen(false);
      clearFlowState();

      if (postId) {
        navigate(`/calendrier?date=${calendarDate}&post=${postId}`);
      } else {
        navigate(`/calendrier?date=${calendarDate}`);
      }
    } catch (e: any) {
      toast.error(e?.message || "Erreur");
    } finally {
      setSavingToCalendar(false);
    }
  };

  const handleGenerateVisuals = async () => {
    if (!result?.raw?.slides || visualLoading) return;
    setVisualLoading(true);
    try {
      const isPhotoCarousel = result.raw.carousel_type === "photo";
      const isMixCarousel = result.raw.carousel_type === "mix";
      const hasPhotos = isPhotoCarousel || isMixCarousel;

      const { data, error: fnError } = await invokeWithTimeout("carousel-visual", {
        body: {
          slides: result.raw.slides.map((s: any) => ({
            slide_number: s.slide_number,
            role: s.role,
            slide_type: s.slide_type || (isPhotoCarousel ? "photo_full" : "text_only"),
            ...(s.slide_type === "photo_full" || (isPhotoCarousel && !s.slide_type) ? {
              overlay_text: s.overlay_text,
              overlay_position: s.overlay_position || "bottom_center",
              overlay_style: s.overlay_style || "sensoriel",
              note: s.note,
              photo_index: s.photo_index,
            } : {}),
            ...(s.slide_type === "photo_integrated" ? {
              photo_index: s.photo_index,
              photo_layout: s.photo_layout || "top_photo",
              title: s.title || "",
              body: s.body || "",
              note: s.note,
            } : {}),
            ...(s.slide_type === "text_only" || (!hasPhotos && !s.slide_type) ? {
              title: s.title || "",
              body: s.body || "",
              visual_suggestion: s.visual_suggestion,
              ...(s.visual_schema ? { visual_schema: s.visual_schema } : {}),
            } : {}),
          })),
          ...(hasPhotos && uploadedPhotos.length > 0 ? {
            photos: uploadedPhotos.map(p => ({ base64: p.base64 })),
            carousel_type: isMixCarousel ? "mix" : "photo",
          } : {
            template_style: null,
          }),
        },
      }, 120000);
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setVisualSlides(data.result?.slides_html || []);
      toast.success("Visuels générés !");
    } catch (e: any) {
      toast.error(e?.message || "Erreur lors de la génération des visuels");
    } finally {
      setVisualLoading(false);
    }
  };

  const handleExportPptx = async () => {
    if (!result?.raw?.slides) return;
    try {
      await exportCarouselPptx(
        result.raw.slides,
        ideaText || "carrousel",
        visualSlides.length > 0 ? visualSlides : undefined,
        charterData,
      );
      toast.success("PPTX éditable téléchargé !");
    } catch (e: any) {
      toast.error(e?.message || "Erreur lors de l'export");
    }
  };

  const handleExportVisualPptx = async () => {
    if (visualSlides.length === 0) return;
    try {
      toast.info("Export visuels en cours (capture des slides)…");
      await exportCarouselVisualPptx(visualSlides, ideaText || "carrousel-visuels");
      toast.success("PPTX visuels téléchargé !");
    } catch (e: any) {
      toast.error(e?.message || "Erreur lors de l'export");
    }
  };

  const handleExportPinterestPptx = async () => {
    if (!pinterestPinHtml) return;
    try {
      toast.info("Export PPTX en cours...");
      await exportPinterestVisualPptx(pinterestPinHtml, ideaText || "epingle-pinterest");
      toast.success("PPTX téléchargé !");
    } catch (e: any) {
      toast.error(e?.message || "Erreur lors de l'export");
    }
  };

  const handleExportPinterestPng = async () => {
    if (!pinterestPinHtml) return;
    try {
      toast.info("Export PNG en cours...");
      await exportPinterestVisualPng(pinterestPinHtml, ideaText || "epingle-pinterest");
      toast.success("PNG téléchargé !");
    } catch (e: any) {
      toast.error(e?.message || "Erreur lors de l'export");
    }
  };

  // ── Launch sequence (5 chapters) ──

  const handleLaunchSequence = async (format: string, angle: string) => {
    const structureId = getStructureForCombo(format, angle);
    const structure = CONTENT_STRUCTURES[structureId];
    if (!structure) return;

    setLaunchGenerating(true);
    setLaunchResults([]);
    const chapters = 5;
    const results: any[] = [];

    for (let i = 0; i < chapters; i++) {
      setLaunchIndex(i);
      const chapterSubject = `${ideaText} — Chapitre ${i + 1}/${chapters}`;
      const res = await generate({
        format: format as any,
        subject: chapterSubject,
        objective: objective || undefined,
        editorialAngle: angle,
      });
      results.push(res);
    }

    setLaunchResults(results);
    setLaunchGenerating(false);
  };

  // ── Progress bar ──

  const stepOrder: Step[] = ["idea", "format", "questions", "result", "edit"];
  const stepIndex = stepOrder.indexOf(step);

  // ── Launch mode rendering ──

  const isLaunchMode = editorialAngle === "lancement" && step === "result";

  // Demo mode: replace action handlers with toast notifications
  const demoToast = () => toast("Cette action est disponible dans l'outil complet. Crée ton compte gratuit !");
  const effectiveHandleSave = isDemoMode ? demoToast : handleSave;
  const effectiveHandleAddToCalendar = isDemoMode ? demoToast : handleAddToCalendar;
  const effectiveHandleExportPptx = isDemoMode ? demoToast : handleExportPptx;
  const effectiveHandleExportVisualPptx = isDemoMode ? demoToast : handleExportVisualPptx;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
        {/* Sub-page header */}
        {paramFrom && (
          <SubPageHeader
            parentLabel="Retour"
            parentTo={paramFrom}
            currentLabel="Créer un contenu"
            useFromParam
          />
        )}

        {/* Tabs */}
        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)} className="mb-6">
          <TabsList className="w-full">
            <TabsTrigger value="create" className="flex-1 gap-1.5">✨ Créer</TabsTrigger>
            <TabsTrigger value="transform" className="flex-1 gap-1.5">🔄 Transformer</TabsTrigger>
          </TabsList>

          <TabsContent value="create" className="mt-4">
            {/* Progress bar (from step 2+) */}
            {step !== "idea" && (
              <div className="flex gap-1 mb-5">
                {stepOrder.map((s, i) => (
                  <div
                    key={s}
                    className={`h-1.5 rounded-full flex-1 transition-colors ${
                      i < stepIndex
                        ? "bg-primary"
                        : i === stepIndex
                        ? "bg-primary/60"
                        : "bg-muted"
                    }`}
                  />
                ))}
              </div>
            )}

            {/* Steps */}
            {step === "idea" && (
              <>
                {!planLoading && remainingTotal() < 9000 && (
                  <p className="text-xs text-muted-foreground text-right mb-2">
                    ✨ {remainingTotal()} générations restantes ce mois
                  </p>
                )}
                <CreerStepIdea onNext={handleIdeaNext} onCoachingSelect={handleCoachingSelect} />
              </>
            )}

            {step === "format" && (
              <CreerStepFormat
                idea={ideaText}
                objective={objective || undefined}
                initialFormat={selectedFormat || undefined}
                onNext={(fmt, angle, sub, photos, desc, pm, pintData, linkedinCar) => {
                  if (pintData) setPinterestData(pintData);
                  if (linkedinCar) setIsLinkedInCarousel(true);
                  else setIsLinkedInCarousel(false);
                  handleFormatNext(fmt, angle, { carouselSubMode: sub || (linkedinCar ? "text" : undefined), photos, photoDescription: desc, photoMode: pm });
                }}
                onBack={() => setStep("idea")}
              />
            )}

            {step === "questions" && (
              <CreerStepQuestions
                format={selectedFormat || ""}
                subject={ideaText}
                editorialAngle={editorialAngle || undefined}
                questions={questions.length > 0 ? questions : restoredQuestions}
                loadingQuestions={loadingQuestions}
                onNext={handleQuestionsNext}
                onSkip={handleSkipQuestions}
                onBack={() => setStep("format")}
              />
            )}

            {step === "result" && !isLaunchMode && !generating && !demoGenerating && !streaming && !pinterestVisualGenerating && !result && (
              <div className="py-12 text-center space-y-4 animate-fade-in">
                {error ? (
                  <p className="text-destructive font-medium">{error}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">Session expirée ou contenu indisponible.</p>
                )}
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={handleRegenerate}
                    className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition"
                  >
                    🔄 Réessayer
                  </button>
                  <button
                    onClick={handleReset}
                    className="px-4 py-2 rounded-lg bg-muted text-muted-foreground text-sm font-medium hover:opacity-90 transition"
                  >
                    ← Recommencer
                  </button>
                </div>
              </div>
            )}

            {step === "result" && !isLaunchMode && (generating || demoGenerating || streaming || pinterestVisualGenerating || result) && (
              <CreerStepResult
                result={result?.raw || result}
                format={selectedFormat || "post"}
                generating={generating || demoGenerating || streaming || pinterestVisualGenerating}
                streamingContent={streaming ? streamingContent : undefined}
                photos={(carouselSubMode === "photo" || carouselSubMode === "mix") ? uploadedPhotos : undefined}
                onEdit={handleEdit}
                onReset={handleReset}
                onRegenerate={handleRegenerate}
                onCopy={handleCopy}
                onSave={effectiveHandleSave}
                onCalendar={effectiveHandleAddToCalendar}
                calendarLabel={fromCalendar ? "Sauvegarder dans le calendrier" : undefined}
                onGenerateVisuals={selectedFormat === "carousel" ? handleGenerateVisuals : undefined}
                visualLoading={visualLoading}
                visualSlides={visualSlides.length > 0 ? visualSlides : undefined}
                onExportPptx={selectedFormat === "carousel" ? effectiveHandleExportPptx : undefined}
                onExportVisualPptx={selectedFormat === "carousel" && visualSlides.length > 0 ? effectiveHandleExportVisualPptx : undefined}
                pinterestPinHtml={pinterestPinHtml}
                onExportPinterestPng={selectedFormat === "pinterest_visual" ? handleExportPinterestPng : undefined}
                onExportPinterestPptx={selectedFormat === "pinterest_visual" ? handleExportPinterestPptx : undefined}
                onSlidesUpdate={selectedFormat === "carousel" ? (slides, caption) => {
                  if (result?.raw) {
                    result.raw.slides = slides;
                    if (result.raw.caption) result.raw.caption = caption;
                    else if (result.raw.carousel?.caption) result.raw.carousel.caption = caption;
                  }
                } : undefined}
                onStoriesUpdate={selectedFormat === "story" ? (stories) => {
                  if (result?.raw) {
                    if (result.raw.stories) result.raw.stories = stories;
                    else if (result.raw.sequences) result.raw.sequences = stories;
                    else if (result.raw.slides) result.raw.slides = stories;
                  }
                } : undefined}
              />
            )}

            {/* Transform LinkedIn text to carousel */}
            {step === "result" && selectedFormat === "linkedin" && result?.raw && (result.raw.content || result.raw.full_text || result.raw.hook) && !generating && !streaming && !demoGenerating && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-center justify-between gap-4 animate-fade-in">
                <div>
                  <p className="text-sm font-semibold text-foreground">Transformer en carrousel LinkedIn ?</p>
                  <p className="text-xs text-muted-foreground">L'IA structure ton post en slides visuelles téléchargeables en PDF.</p>
                </div>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleTransformToLinkedInCarousel}
                  className="gap-1.5 shrink-0"
                >
                  <Palette className="h-3.5 w-3.5" /> Créer le carrousel
                </Button>
              </div>
            )}

            {/* Launch mode: multi-chapter results */}
            {isLaunchMode && (
              <div className="space-y-4 animate-fade-in">
                {launchGenerating ? (
                  <div className="py-12 text-center space-y-3">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
                    <p className="text-sm font-medium text-foreground">
                      Génération du chapitre {launchIndex + 1}/5…
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Ce format génère une séquence de 5 posts (un par chapitre).
                    </p>
                  </div>
                ) : (
                  <Tabs defaultValue="0">
                    <TabsList className="w-full flex-wrap h-auto gap-1">
                      {launchResults.map((_, i) => (
                        <TabsTrigger key={i} value={String(i)} className="text-xs">
                          Chapitre {i + 1}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    {launchResults.map((res, i) => (
                      <TabsContent key={i} value={String(i)}>
                        <CreerStepResult
                          result={res?.raw || res}
                          format={selectedFormat || "post"}
                          generating={false}
                          onEdit={handleEdit}
                          onReset={handleReset}
                          onRegenerate={handleRegenerate}
                          onCopy={handleCopy}
                        />
                      </TabsContent>
                    ))}
                  </Tabs>
                )}
              </div>
            )}

            {step === "edit" && (
              <CreerStepEdit
                content={editContent}
                format={selectedFormat || "post"}
                onSave={(edited) => {
                  toast.success("Contenu sauvegardé !");
                  setEditContent(edited);
                }}
                onBack={() => setStep("result")}
                onCopy={() => {
                  navigator.clipboard.writeText(editContent);
                  toast.success("Copié !");
                }}
              />
            )}
          </TabsContent>

          <TabsContent value="transform" className="mt-4">
            <CreerTransformTab />
          </TabsContent>
        </Tabs>
      </div>

      {/* Calendar date dialog */}
      <Dialog open={calendarDialogOpen} onOpenChange={setCalendarDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              Planifier la publication
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Date de publication</label>
              <Input
                type="date"
                value={calendarDate}
                onChange={(e) => setCalendarDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
              />
            </div>
            <Button
              onClick={handleConfirmCalendar}
              disabled={!calendarDate || savingToCalendar}
              className="w-full gap-2"
            >
              {savingToCalendar ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CalendarDays className="h-4 w-4" />
              )}
              {savingToCalendar ? "Ajout en cours..." : "Ajouter au calendrier"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
