import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useLocation, useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, CalendarDays } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import CreerStepIdea from "@/components/creer/CreerStepIdea";
import CreerStepFormat from "@/components/creer/CreerStepFormat";
import CreerStepQuestions from "@/components/creer/CreerStepQuestions";
import CreerStepResult from "@/components/creer/CreerStepResult";
import CreerStepEdit from "@/components/creer/CreerStepEdit";
import CreerTransformTab from "@/components/creer/CreerTransformTab";
import { useContentGenerator } from "@/hooks/use-content-generator";
import { CONTENT_STRUCTURES, getStructureForCombo } from "@/lib/content-structures";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { useBrandCharter } from "@/hooks/use-branding";
import { exportCarouselPptx } from "@/lib/export-carousel-pptx";
import { exportCarouselVisualPptx } from "@/lib/export-carousel-visual-pptx";
import { supabase } from "@/integrations/supabase/client";
import { loadFlowState, saveFlowState, clearFlowState } from "@/hooks/use-flow-persistence";
import { useFormPersist } from "@/hooks/use-form-persist";

type Step = "idea" | "format" | "questions" | "result" | "edit";
type Mode = "create" | "transform";

export default function CreerUnifie() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = useAuth();
  const workspaceId = useWorkspaceId();
  const { data: charterData } = useBrandCharter();

  // URL params
  const paramFormat = searchParams.get("format");
  const paramSujet = searchParams.get("sujet") || searchParams.get("subject") || "";
  const paramObjectif = searchParams.get("objectif") || searchParams.get("objective") || "";
  const paramMode = searchParams.get("mode");
  const paramFrom = searchParams.get("from");

  // Location state (from calendar, etc.)
  const locState = (location.state as any) || {};

  // Check if we have URL params that should override persisted state
  const hasUrlParams = !!(paramFormat || paramSujet || paramObjectif || locState.fromCalendar);

  // Load persisted state for restoration (only when no URL params)
  const persistedState = useRef(hasUrlParams ? null : loadFlowState());

  // Core state — restore from sessionStorage if available
  const ps = persistedState.current;
  const [mode, setMode] = useState<Mode>(paramMode === "transform" ? "transform" : "create");
  const [step, setStep] = useState<Step>(ps?.step as Step || "idea");
  const [ideaText, setIdeaText] = useState(ps?.ideaText || paramSujet || locState.sujet || locState.subject || "");
  const [objective, setObjective] = useState<string | null>(
    ps?.objective || paramObjectif || locState.objectif || locState.objective || null
  );
  const [selectedFormat, setSelectedFormat] = useState<string | null>(ps?.selectedFormat || paramFormat || null);
  const [editorialAngle, setEditorialAngle] = useState<string | null>(ps?.editorialAngle || null);
  const [answers, setAnswers] = useState<Record<string, string>>(ps?.answers || {});
  const [editContent, setEditContent] = useState(ps?.editContent || "");
  const [existingCalendarContent, setExistingCalendarContent] = useState<string | null>(null);

  const { restored: draftRestored, clearDraft } = useFormPersist(
    "creer-unifie-form",
    { step, ideaText, objective, selectedFormat, editorialAngle, answers },
    (saved) => {
      if (location.state || searchParams.get("format") || searchParams.get("sujet")) return;
      if (saved.step && saved.step !== "idea") setStep(saved.step as Step);
      if (saved.ideaText) setIdeaText(saved.ideaText);
      if (saved.objective) setObjective(saved.objective);
      if (saved.selectedFormat) setSelectedFormat(saved.selectedFormat);
      if (saved.editorialAngle) setEditorialAngle(saved.editorialAngle);
      if (saved.answers && Object.keys(saved.answers).length) setAnswers(saved.answers);
    }
  );

  // Launch sequence state
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

  // Restore result from persisted state
  useEffect(() => {
    if (ps?.result && !result) {
      setResult(ps.result);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      });
    }
  }, [step, ideaText, objective, selectedFormat, editorialAngle, editContent, result, visualSlides?.length, savedId]);

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
    if (fmt) setSelectedFormat(fmt);

    if (fmt && subject.trim()) {
      handleFormatNext(fmt, undefined, subject);
    } else if (locState?.fromCalendar && subject) {
      if (locState.format) setSelectedFormat(locState.format);
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

  const handleCoachingSelect = useCallback(async (data: { subject: string; format: string; objective: string }) => {
    setAnswers({});
    setEditorialAngle(null);
    setEditContent("");
    setLaunchResults([]);

    setIdeaText(data.subject);
    if (data.objective) setObjective(data.objective);
    setSelectedFormat(data.format);
    setStep("questions");

    await generateQuestions({ format: data.format, subject: data.subject, editorialAngle: undefined, objective: data.objective || undefined });
  }, [generateQuestions]);

  const handleIdeaNext = (idea: string, obj?: string) => {
    setIdeaText(idea);
    setObjective(obj || null);
    setStep("format");
  };

  const handleFormatNext = async (format: string, angle?: string, overrideSubject?: string) => {
    setSelectedFormat(format);
    setEditorialAngle(angle || null);

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
    await generateQuestions({ format, subject: enrichedSubject, editorialAngle: angle, objective: objective || undefined });
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
    // Reset post-generation state on new generation
    setSavedId(null);
    setVisualSlides([]);
    const enrichedSubject = existingCalendarContent
      ? ideaText + "\n\n[Contenu existant à approfondir]\n" + existingCalendarContent
      : ideaText;
    await generate({
      format: selectedFormat as any,
      subject: enrichedSubject,
      objective: objective || undefined,
      editorialAngle: editorialAngle || undefined,
      answers: Object.keys(ans).length > 0 ? ans : undefined,
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

    if (selectedFormat === "carousel" && r?.slides) {
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

    } else if (r?.content) {
      text = r.content;
    } else if (r?.post) {
      text = r.post;
    } else if (r?.text) {
      text = r.text;
    } else if (r?.hook && r?.body) {
      text = [r.hook, r.body, r.cta].filter(Boolean).join("\n\n");
    } else {
      text = JSON.stringify(r, null, 2);
    }

    setEditContent(text);
    setStep("edit");
  };

  const handleReset = () => {
    resetGenerator();
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
    clearFlowState();
    clearDraft();
    sessionStorage.removeItem(CREER_RESULT_KEY);
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

  const handleAddToCalendar = async () => {
    if (!session?.user?.id || !result?.raw) return;
    // Auto-save carousel if not already saved
    if (selectedFormat === "carousel" && !savedId && result?.raw?.slides) {
      await handleSave();
    }
    setCalendarDialogOpen(true);
  };

  const handleConfirmCalendar = async () => {
    if (!session?.user?.id || !calendarDate || savingToCalendar) return;
    setSavingToCalendar(true);
    try {
      const r = result.raw;
      let contentDraft = "";
      let accroche = "";
      const fmt = selectedFormat || "post";

      if (selectedFormat === "carousel" && r?.slides) {
        accroche = r.slides?.[0]?.title || "";
        contentDraft = r.slides?.map((s: any) => `${s.title}\n${s.body || ""}`).join("\n\n");
      } else if (selectedFormat === "linkedin" && (r?.hook || r?.full_text)) {
        accroche = r.hook || "";
        contentDraft = r.full_text || [r.hook, r.body, r.cta].filter(Boolean).join("\n\n");
      } else if (selectedFormat === "reel" && r?.sections) {
        accroche = r.sections?.[0]?.texte_parle || "";
        contentDraft = r.sections?.map((s: any) => s.texte_parle || "").join("\n\n");
      } else {
        contentDraft = r.content || r.post || r.text || "";
        accroche = contentDraft.split("\n")[0] || "";
      }

      const canal = selectedFormat === "linkedin" ? "linkedin" : "instagram";

      // Build story_sequence_detail for structured formats
      let storyDetail: any = null;
      if (selectedFormat === "carousel" && r?.slides) {
        storyDetail = {
          type: "carousel",
          carousel_type: r.carousel_type || "tips",
          slides: r.slides,
          caption: r.caption,
          quality_check: r.quality_check,
          ...(visualSlides.length > 0 ? {
            visual_html: visualSlides.map((vs: any) => ({ slide_number: vs.slide_number, html: vs.html })),
          } : {}),
        };
      } else if (selectedFormat === "reel" && r?.sections) {
        storyDetail = { type: "reel", sections: r.sections };
      } else if (selectedFormat === "story" && (r?.stories || r?.sequences)) {
        storyDetail = { type: "story", sequences: r.stories || r.sequences };
      }

      const { data: insertedPost, error: insertError } = await supabase.from("calendar_posts").insert({
        user_id: session.user.id,
        ...(workspaceId && workspaceId !== session.user.id ? { workspace_id: workspaceId } : {}),
        date: calendarDate,
        theme: ideaText,
        status: "ready",
        canal,
        format: fmt,
        objectif: objective || null,
        angle: editorialAngle || null,
        content_draft: contentDraft,
        accroche,
        ...(storyDetail ? { story_sequence_detail: storyDetail } : {}),
        ...(savedId ? { generated_content_id: savedId, generated_content_type: "carousel" } : {}),
      }).select("id").single();

      if (insertError) throw insertError;
      toast.success("Ajouté au calendrier !");
      setCalendarDialogOpen(false);
      clearFlowState();

      // Redirect to calendar at the right date, open the post
      const postId = insertedPost?.id;
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
      const { data, error: fnError } = await supabase.functions.invoke("carousel-visual", {
        body: {
          slides: result.raw.slides.map((s: any) => ({
            slide_number: s.slide_number,
            role: s.role,
            title: s.title,
            body: s.body,
            visual_suggestion: s.visual_suggestion,
            ...(s.visual_schema ? { visual_schema: s.visual_schema } : {}),
          })),
          template_style: null,
        },
      });
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
              <CreerStepIdea onNext={handleIdeaNext} onCoachingSelect={handleCoachingSelect} />
            )}

            {step === "format" && (
              <CreerStepFormat
                idea={ideaText}
                objective={objective || undefined}
                onNext={handleFormatNext}
                onBack={() => setStep("idea")}
              />
            )}

            {step === "questions" && (
              <CreerStepQuestions
                format={selectedFormat || ""}
                subject={ideaText}
                editorialAngle={editorialAngle || undefined}
                questions={questions}
                loadingQuestions={loadingQuestions}
                onNext={handleQuestionsNext}
                onSkip={handleSkipQuestions}
                onBack={() => setStep("format")}
              />
            )}

            {step === "result" && !isLaunchMode && (
              <CreerStepResult
                result={result?.raw || result}
                format={selectedFormat || "post"}
                generating={generating}
                onEdit={handleEdit}
                onReset={handleReset}
                onRegenerate={handleRegenerate}
                onCopy={handleCopy}
                onSave={handleSave}
                onCalendar={handleAddToCalendar}
                onGenerateVisuals={selectedFormat === "carousel" ? handleGenerateVisuals : undefined}
                visualLoading={visualLoading}
                visualSlides={visualSlides.length > 0 ? visualSlides : undefined}
                onExportPptx={selectedFormat === "carousel" ? handleExportPptx : undefined}
                onExportVisualPptx={selectedFormat === "carousel" && visualSlides.length > 0 ? handleExportVisualPptx : undefined}
                onSlidesUpdate={selectedFormat === "carousel" ? (slides, caption) => {
                  if (result?.raw) {
                    result.raw.slides = slides;
                    if (result.raw.caption) result.raw.caption = caption;
                    else if (result.raw.carousel?.caption) result.raw.carousel.caption = caption;
                  }
                } : undefined}
              />
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
