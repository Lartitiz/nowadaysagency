import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sparkles, Zap, Target, RefreshCw, Copy, Save, CalendarPlus,
  Mic, MicOff, ChevronDown, ChevronUp, MessageSquarePlus, PenLine,
} from "lucide-react";

/* ─── Types ─── */
interface Angle {
  title: string;
  pitch: string;
  structure: string[];
  tone: string;
}

interface Question {
  question: string;
  placeholder: string;
}

interface FollowUpQuestion extends Question {
  why: string;
}

interface GeneratedContent {
  content: string;
  accroche?: string;
  format?: string;
  pillar?: string;
  objectif?: string;
}

interface CalendarContext {
  calendarPostId?: string;
  theme?: string;
  objectif?: string;
  angle?: string;
  format?: string;
  notes?: string;
  postDate?: string;
  existingContent?: string;
  launchId?: string;
  contentType?: string;
  contentTypeEmoji?: string;
  category?: string;
  objective?: string;
  angleSuggestion?: string;
  chapter?: number;
  chapterLabel?: string;
  audiencePhase?: string;
}

interface CreativeFlowProps {
  contentType: string;
  context: string;
  profile?: any;
  calendarContext?: CalendarContext;
  skipToQuestions?: boolean;
  onContentGenerated?: (content: string, meta: GeneratedContent) => void;
  onSaveToIdeas?: (content: string, meta: GeneratedContent) => void;
  onSaveToCalendar?: (content: string, meta: GeneratedContent) => void;
  onAddToCalendar?: (content: string, meta: GeneratedContent) => void;
  showQuickMode?: boolean;
  quickModeLabel?: string;
  quickModeAction?: () => void;
  quickModeLoading?: boolean;
}

type FlowStep = "choose-mode" | "angles" | "questions" | "follow-up" | "result";

/* ─── Micro button helper ─── */
function MicButton({ onResult, fieldId }: { onResult: (text: string) => void; fieldId: string }) {
  const { isListening, isSupported, toggle } = useSpeechRecognition(onResult);
  if (!isSupported) return null;
  return (
    <button
      type="button"
      onClick={toggle}
      className={`absolute right-3 top-3 p-1.5 rounded-lg transition-colors ${
        isListening ? "bg-primary text-primary-foreground animate-pulse" : "text-muted-foreground hover:text-foreground hover:bg-muted"
      }`}
      title={isListening ? "Arrêter l'écoute" : "Dicter"}
    >
      {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
    </button>
  );
}

/* ─── Progress indicator ─── */
function StepIndicator({ current }: { current: FlowStep }) {
  const steps: { key: FlowStep; label: string }[] = [
    { key: "angles", label: "Choisis ton angle" },
    { key: "questions", label: "Donne ta matière" },
    { key: "result", label: "Ton contenu" },
  ];
  const currentIdx = steps.findIndex((s) => s.key === current || (current === "follow-up" && s.key === "questions"));

  return (
    <div className="flex items-center gap-2 mb-6">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <div className={`h-2.5 w-2.5 rounded-full transition-colors ${
              i <= currentIdx ? "bg-primary" : "bg-border"
            }`} />
            <span className={`text-xs font-medium ${
              i <= currentIdx ? "text-foreground" : "text-muted-foreground"
            }`}>
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={`h-px w-6 ${i < currentIdx ? "bg-primary" : "bg-border"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

/* ─── Main component ─── */
export default function CreativeFlow({
  contentType,
  context,
  profile,
  calendarContext,
  skipToQuestions,
  onContentGenerated,
  onSaveToIdeas,
  onSaveToCalendar,
  onAddToCalendar,
  showQuickMode = true,
  quickModeLabel,
  quickModeAction,
  quickModeLoading,
}: CreativeFlowProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<FlowStep>(skipToQuestions ? "angles" : "choose-mode");
  const [autoStarted, setAutoStarted] = useState(false);
  const [loading, setLoading] = useState(false);

  // Angles
  const [angles, setAngles] = useState<Angle[]>([]);
  const [selectedAngle, setSelectedAngle] = useState<Angle | null>(null);

  // Questions
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});

  // Follow-up
  const [followUpQuestions, setFollowUpQuestions] = useState<FollowUpQuestion[]>([]);
  const [followUpAnswers, setFollowUpAnswers] = useState<Record<number, string>>({});
  const [hasRequestedFollowUp, setHasRequestedFollowUp] = useState(false);

  // Result
  const [result, setResult] = useState<GeneratedContent | null>(null);
  const [editedContent, setEditedContent] = useState("");
  const [adjusting, setAdjusting] = useState(false);

  // Collapsed sections
  const [anglesCollapsed, setAnglesCollapsed] = useState(false);
  const [questionsCollapsed, setQuestionsCollapsed] = useState(false);

  const callCreativeFlow = useCallback(async (stepName: string, extra: any = {}) => {
    const res = await supabase.functions.invoke("creative-flow", {
      body: {
        step: stepName,
        contentType,
        context,
        profile: profile || {},
        calendarContext: calendarContext || undefined,
        ...extra,
      },
    });
    if (res.error) throw new Error(res.error.message);
    return res.data;
  }, [contentType, context, profile, calendarContext]);

  // Auto-start creative flow when coming from calendar
  useEffect(() => {
    if (skipToQuestions && !autoStarted) {
      setAutoStarted(true);
      generateAngles();
    }
  }, [skipToQuestions, autoStarted]);

  /* ── Step handlers ── */
  const generateAngles = async () => {
    setLoading(true);
    setStep("angles");
    try {
      const data = await callCreativeFlow("angles");
      setAngles(data.angles || []);
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
      setStep("choose-mode");
    } finally {
      setLoading(false);
    }
  };

  const regenerateAngles = async () => {
    setLoading(true);
    try {
      const data = await callCreativeFlow("angles");
      setAngles(data.angles || []);
      setSelectedAngle(null);
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const selectAngleAndGetQuestions = async (angle: Angle) => {
    setSelectedAngle(angle);
    setAnglesCollapsed(true);
    setLoading(true);
    setStep("questions");
    try {
      const data = await callCreativeFlow("questions", { angle });
      setQuestions(data.questions || []);
      setAnswers({});
      setFollowUpQuestions([]);
      setFollowUpAnswers({});
      setHasRequestedFollowUp(false);
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
      setStep("angles");
      setAnglesCollapsed(false);
    } finally {
      setLoading(false);
    }
  };

  const requestFollowUp = async () => {
    setLoading(true);
    try {
      const answersArr = questions.map((q, i) => ({ question: q.question, answer: answers[i] || "" }));
      const data = await callCreativeFlow("follow-up", { angle: selectedAngle, answers: answersArr });
      setFollowUpQuestions(data.follow_up_questions || []);
      setHasRequestedFollowUp(true);
      setStep("follow-up");
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const generateContent = async () => {
    setLoading(true);
    setQuestionsCollapsed(true);
    setStep("result");
    try {
      const answersArr = questions.map((q, i) => ({ question: q.question, answer: answers[i] || "" }));
      const followUpArr = followUpQuestions.length
        ? followUpQuestions.map((q, i) => ({ question: q.question, answer: followUpAnswers[i] || "" }))
        : undefined;
      const data = await callCreativeFlow("generate", {
        angle: selectedAngle,
        answers: answersArr,
        followUpAnswers: followUpArr,
      });
      const gen: GeneratedContent = {
        content: data.content || data.raw || "",
        accroche: data.accroche,
        format: data.format,
        pillar: data.pillar,
        objectif: data.objectif,
      };
      setResult(gen);
      setEditedContent(gen.content);
      onContentGenerated?.(gen.content, gen);
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
      setStep("questions");
      setQuestionsCollapsed(false);
    } finally {
      setLoading(false);
    }
  };

  const adjustTone = async (adjustment: string) => {
    setAdjusting(true);
    try {
      const data = await callCreativeFlow("adjust", {
        angle: selectedAngle,
        content: editedContent,
        adjustment,
      });
      if (data.content) {
        setEditedContent(data.content);
        setResult((prev) => prev ? { ...prev, content: data.content } : prev);
      }
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setAdjusting(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(editedContent);
    toast({ title: "Copié !" });
  };

  const hasAnswers = Object.values(answers).some((a) => a.trim().length > 0);

  /* ─── RENDER ─── */
  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Mode selector ── */}
      {step === "choose-mode" && (
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={generateAngles}
            className="flex-1 rounded-2xl border-2 border-primary bg-card p-5 text-left hover:shadow-md transition-all group"
          >
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="font-display text-base font-bold text-foreground">Créer ensemble</span>
            </div>
            <p className="text-sm text-muted-foreground">
              L'IA te propose des angles et te pose des questions pour créer un contenu qui te ressemble vraiment.
            </p>
            <div className="mt-3">
              <span className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-pill text-sm font-semibold group-hover:-translate-y-px transition-transform">
                <Sparkles className="h-4 w-4" />
                Créer ensemble
              </span>
            </div>
          </button>

          {showQuickMode && (
            <button
              onClick={quickModeAction}
              disabled={quickModeLoading}
              className="flex-1 rounded-2xl border border-border bg-card p-5 text-left hover:border-primary/40 transition-all group"
            >
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-5 w-5 text-muted-foreground" />
                <span className="font-display text-base font-bold text-foreground">
                  {quickModeLabel || "Générer direct"}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                L'IA génère directement à partir de ton branding. Pour quand tu es pressée.
              </p>
              <div className="mt-3">
                <span className="inline-flex items-center gap-1.5 border border-border text-foreground px-4 py-2 rounded-pill text-sm font-medium">
                  <Zap className="h-4 w-4" />
                  {quickModeLoading ? "Génération..." : "Générer direct"}
                </span>
              </div>
            </button>
          )}
        </div>
      )}

      {/* ── Step indicator ── */}
      {step !== "choose-mode" && <StepIndicator current={step} />}

      {/* ── Loading dots ── */}
      {loading && (
        <div className="flex items-center gap-3 py-6 justify-center animate-fade-in">
          <div className="flex gap-1">
            <div className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce-dot" />
            <div className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.16s" }} />
            <div className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.32s" }} />
          </div>
          <span className="text-sm italic text-muted-foreground">
            {step === "angles" && "L'IA cherche des angles créatifs..."}
            {step === "questions" && "L'IA prépare les questions..."}
            {(step === "follow-up") && "L'IA approfondit..."}
            {step === "result" && "L'IA rédige ton contenu..."}
          </span>
        </div>
      )}

      {/* ── Angles ── */}
      {(step === "angles" || (selectedAngle && step !== "choose-mode")) && angles.length > 0 && !loading && (
        <div className={anglesCollapsed ? "opacity-60" : ""}>
          <div
            className="flex items-center justify-between cursor-pointer mb-3"
            onClick={() => anglesCollapsed && setAnglesCollapsed(false)}
          >
            <h3 className="font-display text-lg font-bold flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Choisis ton angle
            </h3>
            {anglesCollapsed && (
              <button onClick={() => setAnglesCollapsed(false)} className="text-xs text-primary hover:underline flex items-center gap-1">
                <ChevronDown className="h-3 w-3" /> Modifier
              </button>
            )}
          </div>

          {!anglesCollapsed && (
            <div className="space-y-3">
              {angles.map((angle, i) => (
                <button
                  key={i}
                  onClick={() => selectAngleAndGetQuestions(angle)}
                  className={`w-full text-left rounded-2xl border-2 p-5 transition-all ${
                    selectedAngle?.title === angle.title
                      ? "border-primary bg-rose-pale"
                      : "border-border bg-card hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-lg">🎯</span>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-display text-base font-bold text-foreground mb-1">
                        {angle.title}
                      </h4>
                      <p className="text-sm text-muted-foreground mb-3">{angle.pitch}</p>
                      <div className="mb-2">
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Structure</p>
                        <p className="text-xs text-foreground">{angle.structure.join(" → ")}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Ton</p>
                        <p className="text-xs text-foreground italic">{angle.tone}</p>
                      </div>
                    </div>
                  </div>
                </button>
              ))}

              <button
                onClick={regenerateAngles}
                disabled={loading}
                className="flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Proposer d'autres angles
              </button>
            </div>
          )}

          {anglesCollapsed && selectedAngle && (
            <div className="rounded-xl bg-rose-pale border border-primary/20 p-3 mt-2">
              <p className="text-sm font-medium text-foreground">🎯 {selectedAngle.title}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Questions ── */}
      {(step === "questions" || step === "follow-up" || (step === "result" && questionsCollapsed)) && questions.length > 0 && !loading && (
        <div className={questionsCollapsed ? "opacity-60" : ""}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display text-lg font-bold flex items-center gap-2">
              <MessageSquarePlus className="h-5 w-5 text-primary" />
              Donne ta matière
            </h3>
            {questionsCollapsed && (
              <button
                onClick={() => { setQuestionsCollapsed(false); setStep("questions"); }}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <ChevronDown className="h-3 w-3" /> Modifier
              </button>
            )}
          </div>

          {!questionsCollapsed && (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                ✨ Super choix. Pour que ce contenu te ressemble vraiment, j'ai besoin de ta matière.
              </p>

              <div className="space-y-4">
                {questions.map((q, i) => (
                  <div key={i}>
                    <label className="text-sm font-medium text-foreground block mb-1.5">{q.question}</label>
                    <div className="relative">
                      <Textarea
                        value={answers[i] || ""}
                        onChange={(e) => setAnswers((prev) => ({ ...prev, [i]: e.target.value }))}
                        placeholder={q.placeholder}
                        className="pr-12 min-h-[100px]"
                      />
                      <MicButton
                        fieldId={`q-${i}`}
                        onResult={(text) => setAnswers((prev) => ({
                          ...prev,
                          [i]: (prev[i] || "") + (prev[i] ? " " : "") + text,
                        }))}
                      />
                    </div>
                  </div>
                ))}

                {/* Follow-up questions */}
                {followUpQuestions.length > 0 && (
                  <div className="border-t border-border pt-4 space-y-4">
                    <p className="text-sm text-muted-foreground italic">
                      💡 Quelques questions pour creuser un peu plus...
                    </p>
                    {followUpQuestions.map((q, i) => (
                      <div key={`fu-${i}`}>
                        <label className="text-sm font-medium text-foreground block mb-1">{q.question}</label>
                        {q.why && <p className="text-xs text-muted-foreground italic mb-1.5">{q.why}</p>}
                        <div className="relative">
                          <Textarea
                            value={followUpAnswers[i] || ""}
                            onChange={(e) => setFollowUpAnswers((prev) => ({ ...prev, [i]: e.target.value }))}
                            placeholder={q.placeholder}
                            className="pr-12 min-h-[80px]"
                          />
                          <MicButton
                            fieldId={`fu-${i}`}
                            onResult={(text) => setFollowUpAnswers((prev) => ({
                              ...prev,
                              [i]: (prev[i] || "") + (prev[i] ? " " : "") + text,
                            }))}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-2">
                  {hasAnswers && !hasRequestedFollowUp && (
                    <Button variant="ghost" size="sm" onClick={requestFollowUp} disabled={loading} className="rounded-pill gap-1.5">
                      <MessageSquarePlus className="h-3.5 w-3.5" /> Approfondir
                    </Button>
                  )}
                  {hasAnswers && (
                    <Button onClick={generateContent} disabled={loading} className="rounded-pill gap-1.5">
                      <Sparkles className="h-4 w-4" /> Rédiger mon contenu
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}

          {questionsCollapsed && (
            <p className="text-xs text-muted-foreground mt-1">
              {Object.values(answers).filter(Boolean).length} réponse(s) données
            </p>
          )}
        </div>
      )}

      {/* ── Result ── */}
      {step === "result" && result && !loading && (
        <div className="space-y-4 animate-fade-in">
          <h3 className="font-display text-lg font-bold flex items-center gap-2">
            <PenLine className="h-5 w-5 text-primary" />
            Ton contenu
          </h3>

          <Textarea
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            className="min-h-[200px] text-sm"
          />

          {/* Meta */}
          <div className="flex flex-wrap gap-2">
            {result.format && (
              <span className="text-[11px] font-semibold bg-rose-pale text-primary px-2 py-0.5 rounded-md">
                Format : {result.format}
              </span>
            )}
            {result.pillar && (
              <span className="text-[11px] font-semibold bg-muted text-foreground px-2 py-0.5 rounded-md">
                Pilier : {result.pillar}
              </span>
            )}
          </div>

          {/* Tone adjustment chips */}
          <div className="flex flex-wrap gap-1.5">
            <span className="text-xs text-muted-foreground mr-1">✏️ Ajuster :</span>
            {["Plus punchy", "Plus doux", "Plus court", "Plus long", "Plus perso", "Plus pro"].map((adj) => (
              <button
                key={adj}
                onClick={() => adjustTone(adj.toLowerCase())}
                disabled={adjusting}
                className="text-xs px-2.5 py-1 rounded-pill border border-border bg-card text-foreground hover:border-primary/40 transition-colors disabled:opacity-50"
              >
                {adj}
              </button>
            ))}
          </div>

          {adjusting && (
            <p className="text-xs text-muted-foreground italic animate-pulse">Ajustement en cours...</p>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={copyToClipboard} className="rounded-pill gap-1.5">
              <Copy className="h-3.5 w-3.5" /> Copier
            </Button>
            {onSaveToIdeas && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSaveToIdeas(editedContent, result)}
                className="rounded-pill gap-1.5"
              >
                <Save className="h-3.5 w-3.5" /> Sauvegarder
              </Button>
            )}
            {onSaveToCalendar && (
              <Button
                size="sm"
                onClick={() => onSaveToCalendar(editedContent, result)}
                className="rounded-pill gap-1.5 bg-primary text-primary-foreground hover:bg-bordeaux"
              >
                <Save className="h-3.5 w-3.5" /> Sauvegarder dans le calendrier
              </Button>
            )}
            {onAddToCalendar && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onAddToCalendar(editedContent, result)}
                className="rounded-pill gap-1.5"
              >
                <CalendarPlus className="h-3.5 w-3.5" /> Ajouter au calendrier
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={generateContent}
              disabled={loading}
              className="rounded-pill gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Réécrire
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
