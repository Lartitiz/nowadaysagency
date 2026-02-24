/**
 * Intake questionnaire for Now Pilot kick-off prep.
 * Reuses the same full-screen coaching pattern as BrandingCoachingFlow.
 */
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { useDemoContext } from "@/contexts/DemoContext";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice } from "@/components/ui/textarea-with-voice";
import { InputWithVoice } from "@/components/ui/input-with-voice";
import { ArrowLeft, ArrowRight, Loader2, Check, Sparkles, CalendarDays } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import Confetti from "@/components/Confetti";
import { DEMO_INTAKE_DATA, type DemoIntakeQuestion } from "@/lib/demo-intake-data";

interface Message { role: "user" | "assistant"; content: string; }

interface AIResponse {
  question: string;
  question_type: "text" | "textarea" | "select" | "multi_select" | "url_list";
  options?: string[];
  placeholder?: string;
  category?: "branding" | "kickoff_prep";
  field_to_update?: string | null;
  extracted_insights?: Record<string, any>;
  is_complete: boolean;
  completion_percentage: number;
  kickoff_summary?: string;
  suggested_agenda?: string[];
  missing_topics?: string[];
}

const LOADING_PHRASES = [
  "Je réfléchis à ma prochaine question...",
  "Intéressant, laisse-moi creuser...",
  "Ok, j'ai une idée...",
  "Voyons ce qui manque encore...",
];

interface IntakeQuestionnaireProps {
  programId: string;
  onComplete?: () => void;
  onBack?: () => void;
}

export default function IntakeQuestionnaire({ programId, onComplete, onBack }: IntakeQuestionnaireProps) {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const { isDemoMode } = useDemoContext();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<"intro" | "coaching" | "complete">("intro");
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<AIResponse | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingPhrase, setLoadingPhrase] = useState("");
  const [completionPct, setCompletionPct] = useState(5);
  const [finalSummary, setFinalSummary] = useState("");
  const [suggestedAgenda, setSuggestedAgenda] = useState<string[]>([]);
  const [showConfetti, setShowConfetti] = useState(false);
  const [hasExistingSession, setHasExistingSession] = useState(false);

  const demoQuestions = isDemoMode ? DEMO_INTAKE_DATA.questions : null;

  // Load existing questionnaire
  useEffect(() => {
    if (isDemoMode || !user) return;
    (async () => {
      const { data } = await (supabase.from("intake_questionnaires") as any)
        .select("*")
        .eq("program_id", programId)
        .eq(column, value)
        .maybeSingle();

      if (data) {
        if (data.is_complete) {
          setFinalSummary(data.kickoff_summary || "");
          setSuggestedAgenda((data.suggested_agenda as string[]) || []);
          setCompletionPct(100);
          setPhase("complete");
        } else if ((data.messages as any[])?.length > 0) {
          setHasExistingSession(true);
          setMessages(data.messages as unknown as Message[]);
          setQuestionIndex(data.question_count || 0);
          setCompletionPct((data.extracted_data as any)?.completion_percentage || 5);
        }
      }
    })();
  }, [user?.id, programId, isDemoMode]);

  const askAI = useCallback(async (msgs: Message[]) => {
    setLoading(true);
    setLoadingPhrase(LOADING_PHRASES[Math.floor(Math.random() * LOADING_PHRASES.length)]);
    try {
      const { data, error } = await supabase.functions.invoke("branding-coaching", {
        body: {
          user_id: user!.id,
          section: "intake",
          messages: msgs,
          context: { program_id: programId },
          intake_mode: true,
        },
      });
      if (error) throw error;
      return data.response as AIResponse;
    } finally {
      setLoading(false);
    }
  }, [user?.id, programId]);

  const handleStart = useCallback(async () => {
    setPhase("coaching");
    if (isDemoMode && demoQuestions) {
      const first = demoQuestions[0];
      setCurrentQuestion({
        question: first.question,
        question_type: first.question_type as any,
        options: first.options,
        placeholder: first.placeholder,
        is_complete: false,
        completion_percentage: first.completion_percentage,
      });
      setAnswer(first.demo_answer);
      setCompletionPct(5);
      return;
    }
    if (hasExistingSession && messages.length > 0) {
      const response = await askAI(messages);
      if (response) {
        setCurrentQuestion(response);
        setCompletionPct(response.completion_percentage || 5);
      }
      return;
    }
    const response = await askAI([]);
    if (response) {
      setCurrentQuestion(response);
      setMessages([{ role: "assistant", content: response.question }]);
      setCompletionPct(response.completion_percentage || 5);
    }
  }, [isDemoMode, demoQuestions, hasExistingSession, messages, askAI]);

  const handleNext = useCallback(async () => {
    const userAnswer = currentQuestion?.question_type === "select" || currentQuestion?.question_type === "multi_select"
      ? selectedOptions.join(", ")
      : answer;
    if (!userAnswer.trim()) return;

    const nextIndex = questionIndex + 1;
    setQuestionIndex(nextIndex);
    setAnswer("");
    setSelectedOptions([]);

    if (isDemoMode && demoQuestions) {
      if (nextIndex >= demoQuestions.length) {
        setFinalSummary(DEMO_INTAKE_DATA.kickoff_summary);
        setSuggestedAgenda(DEMO_INTAKE_DATA.suggested_agenda);
        setCompletionPct(100);
        setShowConfetti(true);
        setPhase("complete");
        return;
      }
      setLoading(true);
      setLoadingPhrase(LOADING_PHRASES[Math.floor(Math.random() * LOADING_PHRASES.length)]);
      await new Promise(r => setTimeout(r, 500));
      setLoading(false);
      const next = demoQuestions[nextIndex];
      setCurrentQuestion({
        question: next.question,
        question_type: next.question_type as any,
        options: next.options,
        placeholder: next.placeholder,
        is_complete: false,
        completion_percentage: next.completion_percentage,
      });
      setAnswer(next.demo_answer);
      setCompletionPct(next.completion_percentage);
      return;
    }

    // Real mode
    const newMessages: Message[] = [...messages, { role: "user", content: userAnswer }];
    setMessages(newMessages);
    const response = await askAI(newMessages);
    if (!response) return;

    const updatedMessages: Message[] = [...newMessages, { role: "assistant", content: response.question || response.kickoff_summary || "" }];
    setMessages(updatedMessages);
    setCompletionPct(response.completion_percentage || completionPct);

    // Save
    await supabase.from("intake_questionnaires").upsert({
      program_id: programId,
      user_id: user!.id,
      messages: updatedMessages as any,
      extracted_data: { ...response.extracted_insights, completion_percentage: response.completion_percentage },
      question_count: nextIndex,
      is_complete: response.is_complete,
      kickoff_summary: response.kickoff_summary || null,
      suggested_agenda: response.suggested_agenda || null,
      missing_topics: response.missing_topics || null,
      completed_at: response.is_complete ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    } as any, { onConflict: "program_id,user_id" });

    // Save branding insights
    if (response.field_to_update && response.extracted_insights) {
      const [table, field] = (response.field_to_update as string).split(".");
      if (table && field) {
        const tableName = table === "branding" ? "brand_profile" : table === "personas" ? "persona" : null;
        if (tableName) {
          await supabase.from(tableName).upsert({
            user_id: user!.id,
            [field]: Object.values(response.extracted_insights)[0],
            updated_at: new Date().toISOString(),
          } as any, { onConflict: "user_id" });
        }
      }
    }

    if (response.is_complete) {
      setFinalSummary(response.kickoff_summary || "");
      setSuggestedAgenda(response.suggested_agenda || []);
      setCompletionPct(100);
      setShowConfetti(true);
      setPhase("complete");
      return;
    }
    setCurrentQuestion(response);
  }, [answer, selectedOptions, questionIndex, currentQuestion, isDemoMode, demoQuestions, messages, askAI, programId, user?.id, completionPct]);

  const estimatedTotal = Math.max(6, Math.round((questionIndex + 1) / (completionPct / 100 || 0.1)));

  // Intro
  if (phase === "intro") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 max-w-lg mx-auto text-center">
        <span className="text-5xl mb-6">📋</span>
        <h1 className="font-display text-2xl font-bold text-foreground mb-3">Questionnaire de préparation</h1>
        <p className="text-muted-foreground text-[15px] mb-6 leading-relaxed">
          Avant notre premier appel, j'ai besoin de mieux te connaître.
          Plus tu es précise, plus notre kick-off sera utile. Ça prend ~10 minutes.
        </p>
        {hasExistingSession && (
          <p className="text-sm text-primary mb-4">On reprend où tu en étais 🌸</p>
        )}
        <Button size="lg" className="rounded-pill gap-2" onClick={handleStart} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {hasExistingSession ? "On reprend →" : "C'est parti →"}
        </Button>
        <p className="text-xs text-muted-foreground mt-6">~10 min</p>
      </div>
    );
  }

  // Complete
  if (phase === "complete") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 max-w-lg mx-auto text-center">
        {showConfetti && <Confetti />}
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 15 }}>
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-6">
            <Check className="h-8 w-8 text-primary" />
          </div>
        </motion.div>
        <h1 className="font-display text-2xl font-bold text-foreground mb-4">Merci ! 🌸</h1>
        <p className="text-muted-foreground text-sm mb-6">
          Laetitia a tout ce qu'il faut pour préparer votre kick-off. Elle va adorer bosser avec toi.
        </p>
        {finalSummary && (
          <div className="rounded-xl bg-muted/50 border border-border p-5 mb-6 text-left">
            <p className="text-sm text-foreground leading-relaxed">{finalSummary}</p>
          </div>
        )}
        {suggestedAgenda.length > 0 && (
          <div className="rounded-xl bg-card border border-border p-5 mb-6 text-left w-full">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Agenda suggéré</p>
            <ol className="space-y-2">
              {suggestedAgenda.map((item, i) => (
                <li key={i} className="text-sm text-foreground flex items-start gap-2">
                  <span className="text-primary font-bold">{i + 1}.</span> {item}
                </li>
              ))}
            </ol>
          </div>
        )}
        <div className="flex gap-3">
          <Button onClick={() => navigate("/dashboard")} variant="outline" className="rounded-pill">
            Voir mon dashboard
          </Button>
          <Button
            onClick={() => window.open("https://calendly.com/laetitia-mattioli/atelier-2h", "_blank")}
            className="rounded-pill gap-2"
          >
            <CalendarDays className="h-4 w-4" /> Réserver mon kick-off
          </Button>
        </div>
      </div>
    );
  }

  // Coaching
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between mb-3">
          <button onClick={onBack || (() => navigate("/dashboard"))} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Retour
          </button>
          <span className="text-xs text-muted-foreground font-mono-ui">
            Question {questionIndex + 1}/{estimatedTotal}
          </span>
        </div>
        <Progress value={completionPct} className="h-1.5" />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 max-w-lg mx-auto w-full">
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto mb-3" />
              <p className="text-sm text-muted-foreground italic">{loadingPhrase}</p>
            </motion.div>
          ) : currentQuestion ? (
            <motion.div key={`q-${questionIndex}`} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.3 }} className="w-full">
              <p className="font-display text-lg md:text-xl font-bold text-foreground mb-6 leading-relaxed text-center">
                {currentQuestion.question}
              </p>

              {currentQuestion.question_type === "textarea" && (
                <TextareaWithVoice value={answer} onValueChange={setAnswer} onChange={(e) => setAnswer(e.target.value)} placeholder={currentQuestion.placeholder} className="min-h-[120px]" />
              )}
              {(currentQuestion.question_type === "text" || currentQuestion.question_type === "url_list") && (
                <InputWithVoice value={answer} onValueChange={setAnswer} onChange={(e) => setAnswer(e.target.value)} placeholder={currentQuestion.placeholder} />
              )}
              {(currentQuestion.question_type === "select" || currentQuestion.question_type === "multi_select") && currentQuestion.options && (
                <div className="flex flex-wrap gap-2 justify-center">
                  {currentQuestion.options.map((opt) => {
                    const isSelected = selectedOptions.includes(opt);
                    return (
                      <button key={opt} onClick={() => {
                        if (currentQuestion.question_type === "select") setSelectedOptions([opt]);
                        else setSelectedOptions(prev => isSelected ? prev.filter(o => o !== opt) : [...prev, opt]);
                      }} className={cn("px-4 py-2.5 rounded-xl border text-sm font-medium transition-all", isSelected ? "border-primary bg-primary/10 text-foreground" : "border-border bg-card text-muted-foreground hover:border-primary/40")}>
                        {opt}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="mt-6 flex justify-center">
                <Button onClick={handleNext} className="rounded-pill gap-2 px-8" disabled={!(answer.trim() || selectedOptions.length > 0)}>
                  Suivant <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="pb-6 text-center">
        <p className="text-xs text-muted-foreground">
          {completionPct >= 80 ? "Presque fini !" : `Encore ~${Math.ceil((estimatedTotal - questionIndex) * 0.8)} min`}
        </p>
      </div>
    </div>
  );
}
