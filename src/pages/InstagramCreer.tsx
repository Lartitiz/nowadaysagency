import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice } from "@/components/ui/textarea-with-voice";
import { Loader2, Sparkles, RefreshCw, ArrowLeft, ArrowRight, SkipForward, Copy, Save, CalendarPlus, PenLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { useActiveChannels } from "@/hooks/use-active-channels";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import { useUserPlan } from "@/hooks/use-user-plan";
import { useMergedProfile } from "@/hooks/use-profile";
import CreditWarning from "@/components/CreditWarning";
import ContentCoachingDialog from "@/components/dashboard/ContentCoachingDialog";
import DictationInput from "@/components/DictationInput";
import AiGeneratedMention from "@/components/AiGeneratedMention";
import RedFlagsChecker from "@/components/RedFlagsChecker";
import ContentActions from "@/components/ContentActions";
import CreativeFlow from "@/components/CreativeFlow";
import ReturnToOrigin from "@/components/ReturnToOrigin";
import { isModuleVisible } from "@/config/feature-flags";

// ── Types ──
interface FormatSuggestion {
  format: string;
  format_label: string;
  suggested_angle: string;
  objective: string;
  objective_label: string;
  reason: string;
}

interface FormatOption {
  id: string;
  emoji: string;
  label: string;
  desc: string;
  channel: string;
  generatorType: "post" | "carousel" | "reel" | "story" | "linkedin" | "crosspost" | "coming_soon";
}

const FORMAT_OPTIONS: FormatOption[] = [
  { id: "post", emoji: "📝", label: "Post", desc: "Carrousel, image ou texte", channel: "instagram", generatorType: "post" },
  { id: "carousel", emoji: "🎠", label: "Carrousel", desc: "Slides visuelles", channel: "instagram", generatorType: "carousel" },
  { id: "reel", emoji: "🎬", label: "Reel", desc: "Script complet avec hook", channel: "instagram", generatorType: "reel" },
  { id: "story", emoji: "📱", label: "Story", desc: "Séquence avec stickers", channel: "instagram", generatorType: "story" },
  { id: "linkedin", emoji: "💼", label: "LinkedIn", desc: "Post LinkedIn", channel: "linkedin", generatorType: "linkedin" },
  { id: "crosspost", emoji: "🔄", label: "Crosspost", desc: "Adapter un contenu existant", channel: "instagram", generatorType: "crosspost" },
  { id: "pinterest", emoji: "📌", label: "Pinterest", desc: "Épingle optimisée", channel: "pinterest", generatorType: "coming_soon" },
  { id: "newsletter", emoji: "📧", label: "Newsletter", desc: "Email engageant", channel: "newsletter", generatorType: "coming_soon" },
];

// Unified 4-step flow
type FlowStep = "subject" | "questions" | "result" | "edit";

export default function InstagramCreer() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const { channels: activeChannels } = useActiveChannels();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const { canGenerate, remainingTotal } = useUserPlan();
  const quotaBlocked = !canGenerate("content");
  const { mergedProfile } = useMergedProfile();

  // URL params for pre-fill
  const urlFormat = searchParams.get("format");
  const urlSujet = searchParams.get("sujet");
  const urlCanal = searchParams.get("canal");
  const urlObjectif = searchParams.get("objectif");
  const fromParam = searchParams.get("from");

  // Calendar redirect context
  const calendarState = location.state as {
    fromCalendar?: boolean;
    fromSuggested?: boolean;
    theme?: string;
    notes?: string;
    objectif?: string;
    calendarPostId?: string;
    existingContent?: string;
  } | null;

  // ── Step 1: Subject & Format ──
  const [step, setStep] = useState<FlowStep>("subject");
  const [ideaText, setIdeaText] = useState("");
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null);
  const [selectedCanal, setSelectedCanal] = useState(urlCanal || "instagram");
  const [objective, setObjective] = useState(urlObjectif || "");

  // AI format suggestion
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<FormatSuggestion | null>(null);

  // ── Step 2: Questions ──
  const [questions, setQuestions] = useState<{ question: string; placeholder: string }[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  // ── Step 3: Generated result ──
  const [generatedResult, setGeneratedResult] = useState<any>(null);
  const [generating, setGenerating] = useState(false);

  // ── Misc ──
  const [contentCoachingOpen, setContentCoachingOpen] = useState(false);
  const [secondaryMode, setSecondaryMode] = useState<"none" | "dictate">("none");

  const visibleFormats = FORMAT_OPTIONS.filter(f => activeChannels.includes(f.channel as any));

  // Pre-fill from URL/calendar
  useEffect(() => {
    if (calendarState?.theme || calendarState?.notes) {
      setIdeaText(calendarState.theme || calendarState.notes || "");
    }
    if (urlSujet) setIdeaText(decodeURIComponent(urlSujet));
    if (urlFormat) {
      const matched = FORMAT_OPTIONS.find(f => f.id === urlFormat);
      if (matched) setSelectedFormat(matched.id);
    }
  }, []);

  // ── Step 1 Actions ──
  const handleSuggestFormat = async () => {
    if (!ideaText.trim() || suggesting) return;
    setSuggesting(true);
    setSuggestion(null);
    try {
      const { data: session } = await supabase.auth.getSession();
      const wsId = column === "workspace_id" ? value : undefined;
      const res = await supabase.functions.invoke("suggest-format", {
        body: { idea: ideaText, workspace_id: wsId },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      setSuggestion(res.data);
    } catch (e: any) {
      console.error("Suggest format error:", e);
      toast({ title: "Choisis directement un format ci-dessous 👇", variant: "default" });
    } finally {
      setSuggesting(false);
    }
  };

  const handleAcceptSuggestion = () => {
    if (!suggestion) return;
    const fmt = FORMAT_OPTIONS.find(f => f.id === suggestion.format);
    if (fmt && shouldRedirect(fmt)) {
      redirectToLegacy(fmt);
      return;
    }
    setSelectedFormat(suggestion.format);
    setObjective(suggestion.objective);
    goToQuestions(suggestion.format);
  };

  // Formats not yet integrated inline → redirect to legacy page
  const shouldRedirect = (format: FormatOption) => {
    return ["reel", "story", "linkedin", "post"].includes(format.generatorType);
  };

  const redirectToLegacy = (format: FormatOption) => {
    const params = new URLSearchParams({ from: "/creer" });
    if (ideaText.trim()) params.set("sujet", encodeURIComponent(ideaText));
    if (objective) params.set("objectif", objective);
    const routes: Record<string, string> = {
      reel: "/instagram/reels",
      story: "/instagram/stories",
      linkedin: "/linkedin/post",
      post: "/atelier",
    };
    const route = routes[format.generatorType];
    if (format.generatorType === "post") {
      params.set("canal", "instagram");
    }
    navigate(`${route}?${params.toString()}`);
  };

  const handleFormatClick = (format: FormatOption) => {
    if (format.generatorType === "coming_soon") return;
    if (format.generatorType === "crosspost") { navigate("/transformer"); return; }
    if (shouldRedirect(format)) { redirectToLegacy(format); return; }
    setSelectedFormat(format.id);
    goToQuestions(format.id);
  };

  // ── Transition to Step 2: Load personalized questions ──
  const goToQuestions = async (formatId: string) => {
    setStep("questions");
    setCurrentQuestion(0);
    setAnswers({});
    setQuestions([]);
    setLoadingQuestions(true);

    // Determine the right AI endpoint based on format
    const subject = ideaText.trim();
    if (!subject) {
      // No subject = skip questions, go straight to generation
      setLoadingQuestions(false);
      return;
    }

    try {
      // Always use carousel-ai for deepening questions (it supports all formats)
      const carouselType = formatId === "carousel" ? "tips" : formatId;
      const { data, error } = await supabase.functions.invoke("carousel-ai", {
        body: {
          type: "deepening_questions",
          carousel_type: carouselType,
          subject,
          objective: objective || "saves",
          workspace_id: workspaceId,
        },
      });

      if (!error && data?.content) {
        const parsed = typeof data.content === "string" ? JSON.parse(data.content) : data.content;
        if (parsed.questions?.length >= 2) {
          setQuestions(parsed.questions);
          setLoadingQuestions(false);
          return;
        }
      }
    } catch (e) {
      console.warn("Failed to load dynamic questions", e);
    }

    // Fallback: personalized questions based on subject
    setQuestions([
      { question: `Sur "${subject}", c'est quoi ton point de vue personnel ? Ce que tu as observé, vécu ou appris.`, placeholder: "Ton vécu, ton observation..." },
      { question: `Qu'est-ce que ta cible ne comprend pas ou se trompe sur "${subject}" ?`, placeholder: "L'erreur courante, le malentendu..." },
      { question: `Tu as un exemple concret ou une anecdote sur "${subject}" à partager ?`, placeholder: "Un cas client, une situation vécue..." },
    ]);
    setLoadingQuestions(false);
  };

  // ── Step 2→3: Generate content (carousel only for now) ──
  const handleGenerate = async () => {
    if (!user || quotaBlocked) return;
    setGenerating(true);
    setStep("result");

    try {
      const subject = ideaText.trim();
      const hasAnswers = Object.values(answers).some(v => v.trim());
      await generateCarousel(subject, hasAnswers ? answers : undefined);
    } catch (e: any) {
      console.error("Generation error:", e);
      sonnerToast.error("Erreur lors de la génération. Réessaie !");
      setStep("questions");
    } finally {
      setGenerating(false);
    }
  };

  const generateCarousel = async (subject: string, deepeningAnswers?: Record<string, string>) => {
    const { data, error } = await supabase.functions.invoke("carousel-ai", {
      body: {
        type: "express_full",
        carousel_type: "tips",
        subject,
        objective: objective || "saves",
        slide_count: 7,
        deepening_answers: deepeningAnswers,
        workspace_id: workspaceId,
      },
    });
    if (error) throw error;
    const parsed = parseAIJson(data?.content);
    setGeneratedResult({ type: "carousel", ...parsed });
  };


  const parseAIJson = (raw: string): any => {
    try {
      if (typeof raw === "object") return raw;
      const clean = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      return JSON.parse(clean);
    } catch {
      const match = raw?.match(/\{[\s\S]*\}/);
      if (match) try { return JSON.parse(match[0]); } catch { /* */ }
      return { content: raw };
    }
  };

  // ── Helpers ──
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    sonnerToast.success("Copié !");
  };

  const handleReset = () => {
    setStep("subject");
    setSelectedFormat(null);
    setSuggestion(null);
    setQuestions([]);
    setAnswers({});
    setGeneratedResult(null);
    setCurrentQuestion(0);
  };

  const getResultText = (): string => {
    if (!generatedResult) return "";
    if (generatedResult.type === "carousel") {
      const slides = generatedResult.slides || [];
      const caption = generatedResult.caption;
      let text = slides.map((s: any) => `${s.title}\n${s.body || ""}`).join("\n\n");
      if (caption) text += `\n\n---\n\n${caption.hook}\n\n${caption.body}\n\n${caption.cta}\n\n${(caption.hashtags || []).map((h: string) => `#${h}`).join(" ")}`;
      return text;
    }
    if (generatedResult.type === "reel") {
      const sections = generatedResult.script || generatedResult.sections || [];
      return sections.map((s: any) => `[${s.section || s.timing}] ${s.texte_parle || s.text || ""}`).join("\n\n");
    }
    if (generatedResult.type === "story") {
      const stories = generatedResult.stories || generatedResult.sequence || [];
      return stories.map((s: any, i: number) => `Story ${i + 1}: ${s.text || s.content || ""}`).join("\n\n");
    }
    return generatedResult.content || generatedResult.text || JSON.stringify(generatedResult, null, 2);
  };

  const formatLabel = FORMAT_OPTIONS.find(f => f.id === selectedFormat);

  const OBJ_EMOJI: Record<string, string> = {
    visibilite: "👀", confiance: "🤝", vente: "💰", credibilite: "🏆",
    saves: "💾", shares: "📤", conversion: "💰", community: "🤝",
  };

  // ── Step labels for progress bar ──
  const STEP_ORDER: FlowStep[] = ["subject", "questions", "result", "edit"];
  const STEP_LABELS: Record<FlowStep, string> = {
    subject: "Sujet & Format",
    questions: "Personnalisation",
    result: "Résultat",
    edit: "Édition",
  };
  const stepIdx = STEP_ORDER.indexOf(step);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-4 py-8 animate-fade-in">
        {fromParam && (
          <SubPageHeader parentLabel="Retour" parentTo={fromParam} currentLabel="Créer un contenu" useFromParam />
        )}

        <div className="mb-6">
          <h1 className="font-display text-[26px] sm:text-3xl font-bold text-foreground">✨ Créer un contenu</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {step === "subject" && "Décris ton idée ou choisis un format."}
            {step === "questions" && "Quelques questions pour personnaliser ton contenu."}
            {step === "result" && "Voici ton contenu généré."}
            {step === "edit" && "Peaufine et finalise ton contenu."}
          </p>
        </div>

        {/* Progress bar */}
        {step !== "subject" && (
          <div className="flex items-center gap-1.5 mb-6">
            {STEP_ORDER.map((s, i) => (
              <div key={s} className="flex-1 flex flex-col items-center gap-1">
                <div className={`h-1.5 w-full rounded-full transition-colors ${i <= stepIdx ? "bg-primary" : "bg-muted"}`} />
                <span className={`text-[10px] ${i <= stepIdx ? "text-primary font-medium" : "text-muted-foreground"}`}>
                  {STEP_LABELS[s]}
                </span>
              </div>
            ))}
          </div>
        )}

        <CreditWarning remaining={remainingTotal()} className="mb-4" />

        {/* ══════════════════════════════════════════════════
            STEP 1: Subject & Format
           ══════════════════════════════════════════════════ */}
        {step === "subject" && (
          <>
            {/* Smart input */}
            <div className="rounded-2xl border border-border bg-card p-5 mb-6">
              <TextareaWithVoice
                value={ideaText}
                onChange={(e) => { setIdeaText(e.target.value); setSuggestion(null); }}
                placeholder="Décris ton idée, ton sujet ou ce qui te trotte dans la tête..."
                rows={2}
                className="mb-3"
              />
              <div className="flex items-center justify-between">
                <Button onClick={handleSuggestFormat} disabled={!ideaText.trim() || suggesting} className="rounded-full gap-1.5" size="sm">
                  {suggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  L'outil me guide →
                </Button>
                <button onClick={() => setContentCoachingOpen(true)} className="text-xs text-muted-foreground hover:text-primary transition-colors">
                  🤔 Je sais pas quoi poster...
                </button>
              </div>

              {/* AI format suggestion */}
              {suggestion && (
                <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4 animate-fade-in">
                  <p className="text-xs text-muted-foreground mb-1">
                    💡 Pour ton idée "{ideaText.slice(0, 50)}{ideaText.length > 50 ? "…" : ""}"
                  </p>
                  <p className="text-sm font-bold text-foreground mb-1">
                    Je te recommande : {FORMAT_OPTIONS.find(f => f.id === suggestion.format)?.emoji} {suggestion.format_label}
                  </p>
                  <p className="text-xs text-muted-foreground mb-1">Angle : {suggestion.suggested_angle}</p>
                  <p className="text-xs text-muted-foreground mb-2">
                    Objectif : {OBJ_EMOJI[suggestion.objective] || "🎯"} {suggestion.objective_label}
                  </p>
                  <p className="text-xs text-muted-foreground italic mb-3">{suggestion.reason}</p>
                  <div className="flex gap-2">
                    <Button onClick={handleAcceptSuggestion} size="sm" className="rounded-full gap-1.5">
                      {FORMAT_OPTIONS.find(f => f.id === suggestion.format)?.emoji} Créer ce contenu →
                    </Button>
                    <Button onClick={() => { setSuggestion(null); handleSuggestFormat(); }} size="sm" variant="outline" className="rounded-full gap-1.5">
                      <RefreshCw className="h-3 w-3" /> Autre suggestion
                    </Button>
                  </div>
                </div>
              )}
            </div>


            {/* Dictation */}
            <div className="space-y-3 mt-4">
              <Button
                variant={secondaryMode === "dictate" ? "default" : "outline"}
                size="sm"
                onClick={() => setSecondaryMode(secondaryMode === "dictate" ? "none" : "dictate")}
                className="rounded-full gap-1.5 text-xs"
              >
                🎤 Dicter mon contenu
              </Button>
              {secondaryMode === "dictate" && (
                <div className="mt-4 animate-fade-in">
                  <DictationInput onTranscribed={(text) => {
                    setIdeaText(text);
                    setSecondaryMode("none");
                  }} />
                </div>
              )}
            </div>
          </>
        )}

        {/* ══════════════════════════════════════════════════
            STEP 2: Personalization Questions
           ══════════════════════════════════════════════════ */}
        {step === "questions" && (
          <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-display text-lg font-bold text-foreground flex items-center gap-2">
                  💬 Quelques questions pour personnaliser
                </h2>
                <span className="text-xs text-muted-foreground font-mono">Étape 2/4</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {formatLabel?.emoji} {formatLabel?.label} · Pour que le contenu soit vraiment à toi.
              </p>
            </div>

            {loadingQuestions ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3 animate-fade-in">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Je prépare des questions adaptées à ton sujet...</p>
              </div>
            ) : questions.length > 0 ? (
              <>
                <div className="flex items-center gap-1.5">
                  {questions.map((_, i) => (
                    <div key={i} className={`h-1.5 rounded-full flex-1 transition-colors ${i <= currentQuestion ? "bg-primary" : "bg-muted"}`} />
                  ))}
                  <span className="text-xs text-muted-foreground ml-2">Question {currentQuestion + 1}/{questions.length}</span>
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-semibold text-foreground leading-relaxed">
                    🤔 {questions[currentQuestion]?.question}
                  </p>
                  <TextareaWithVoice
                    value={answers[`q${currentQuestion + 1}`] || ""}
                    onChange={(e) => setAnswers(prev => ({ ...prev, [`q${currentQuestion + 1}`]: e.target.value }))}
                    placeholder={questions[currentQuestion]?.placeholder || "Ta réponse..."}
                    className="min-h-[100px]"
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (currentQuestion > 0) setCurrentQuestion(prev => prev - 1);
                      else { setStep("subject"); setSelectedFormat(null); }
                    }}
                    className="gap-1.5"
                  >
                    <ArrowLeft className="h-4 w-4" /> {currentQuestion > 0 ? "Précédent" : "Retour"}
                  </Button>
                  <Button
                    onClick={() => {
                      if (currentQuestion < questions.length - 1) setCurrentQuestion(prev => prev + 1);
                      else handleGenerate();
                    }}
                    className="rounded-full gap-1.5"
                  >
                    {currentQuestion < questions.length - 1 ? (
                      <>Suivant <ArrowRight className="h-4 w-4" /></>
                    ) : (
                      <>Générer <Sparkles className="h-4 w-4" /></>
                    )}
                  </Button>
                </div>

                <div className="text-center pt-1">
                  <button onClick={handleGenerate} className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5">
                    <SkipForward className="h-3 w-3" /> Passer les questions, générer directement
                  </button>
                </div>
              </>
            ) : (
              // No questions available, auto-generate
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <p className="text-sm text-muted-foreground">Pas de questions nécessaires pour ce format.</p>
                <Button onClick={handleGenerate} className="rounded-full gap-1.5">
                  Générer <Sparkles className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            STEP 3: Result
           ══════════════════════════════════════════════════ */}
        {step === "result" && (
          <div className="space-y-5">
            {generating ? (
              <div className="rounded-2xl border border-border bg-card p-8 flex flex-col items-center justify-center gap-3 animate-fade-in">
                <div className="flex gap-1">
                  <div className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce" />
                  <div className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0.16s" }} />
                  <div className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0.32s" }} />
                </div>
                <p className="text-sm italic text-muted-foreground">
                  {formatLabel?.emoji} L'IA génère ton {formatLabel?.label?.toLowerCase() || "contenu"}...
                </p>
              </div>
            ) : generatedResult ? (
              <>
                <AiGeneratedMention />
                <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="font-display text-lg font-bold text-foreground flex items-center gap-2">
                      {formatLabel?.emoji} Ton {formatLabel?.label?.toLowerCase() || "contenu"}
                    </h2>
                    <span className="text-xs text-muted-foreground font-mono">Étape 3/4</span>
                  </div>

                  {/* Carousel-specific display */}
                  {generatedResult.type === "carousel" && generatedResult.slides && (
                    <div className="space-y-3">
                      {generatedResult.chosen_angle && (
                        <p className="text-xs text-muted-foreground italic">
                          🎯 Angle : {generatedResult.chosen_angle.title} — {generatedResult.chosen_angle.description}
                        </p>
                      )}
                      {generatedResult.slides.map((slide: any, i: number) => (
                        <div key={i} className="rounded-xl border border-border bg-muted/30 p-4">
                          <p className="text-[10px] font-mono text-muted-foreground mb-1">Slide {slide.slide_number}</p>
                          <p className="font-display font-bold text-sm text-foreground">{slide.title}</p>
                          {slide.body && <p className="text-sm text-muted-foreground mt-1">{slide.body}</p>}
                        </div>
                      ))}
                      {generatedResult.caption && (
                        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
                          <p className="text-[10px] font-mono text-muted-foreground">Caption</p>
                          <p className="text-sm font-semibold text-foreground">{generatedResult.caption.hook}</p>
                          <p className="text-sm text-muted-foreground">{generatedResult.caption.body}</p>
                          <p className="text-sm text-primary font-medium">{generatedResult.caption.cta}</p>
                          {generatedResult.caption.hashtags && (
                            <p className="text-xs text-muted-foreground">{generatedResult.caption.hashtags.map((h: string) => `#${h}`).join(" ")}</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Reel-specific display */}
                  {generatedResult.type === "reel" && (generatedResult.script || generatedResult.sections) && (
                    <div className="space-y-3">
                      {(generatedResult.script || generatedResult.sections || []).map((section: any, i: number) => (
                        <div key={i} className="rounded-xl border border-border bg-muted/30 p-4">
                          <p className="text-[10px] font-mono text-muted-foreground mb-1">{section.section || section.timing}</p>
                          <p className="text-sm text-foreground">{section.texte_parle || section.text}</p>
                          {section.texte_overlay && <p className="text-xs text-primary mt-1">📝 {section.texte_overlay}</p>}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Story-specific display */}
                  {generatedResult.type === "story" && (generatedResult.stories || generatedResult.sequence) && (
                    <div className="space-y-3">
                      {(generatedResult.stories || generatedResult.sequence || []).map((story: any, i: number) => (
                        <div key={i} className="rounded-xl border border-border bg-muted/30 p-4">
                          <p className="text-[10px] font-mono text-muted-foreground mb-1">Story {i + 1}</p>
                          <p className="text-sm text-foreground">{story.text || story.content}</p>
                          {story.sticker && <p className="text-xs text-muted-foreground mt-1">🏷️ {story.sticker.type}: {story.sticker.label}</p>}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Post/generic display */}
                  {generatedResult.type === "post" && (
                    <div className="rounded-xl border border-border bg-muted/30 p-4">
                      <p className="text-sm text-foreground whitespace-pre-wrap">{generatedResult.content || generatedResult.text || getResultText()}</p>
                    </div>
                  )}

                  {/* Quality check */}
                  {generatedResult.quality_check && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${
                        generatedResult.quality_check.score >= 80 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                      }`}>
                        Score : {generatedResult.quality_check.score}/100
                      </span>
                    </div>
                  )}

                  {/* Publishing tip */}
                  {generatedResult.publishing_tip && (
                    <p className="text-xs text-muted-foreground italic">💡 {generatedResult.publishing_tip}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => handleCopy(getResultText())} variant="outline" size="sm" className="rounded-full gap-1.5">
                    <Copy className="h-3.5 w-3.5" /> Copier
                  </Button>
                  <Button onClick={handleGenerate} variant="outline" size="sm" className="rounded-full gap-1.5">
                    <RefreshCw className="h-3.5 w-3.5" /> Regénérer
                  </Button>
                  <Button onClick={handleReset} variant="ghost" size="sm" className="rounded-full gap-1.5">
                    <ArrowLeft className="h-3.5 w-3.5" /> Nouveau contenu
                  </Button>
                </div>

                <RedFlagsChecker content={getResultText()} onFix={(fixed) => {
                  if (generatedResult?.type === "post") {
                    setGeneratedResult((prev: any) => ({ ...prev, content: fixed }));
                  }
                }} />
              </>
            ) : null}
          </div>
        )}

        <ContentCoachingDialog open={contentCoachingOpen} onOpenChange={setContentCoachingOpen} />
      </main>
    </div>
  );
}
