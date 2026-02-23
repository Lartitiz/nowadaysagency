import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { TextareaWithVoice } from "@/components/ui/textarea-with-voice";
import { InputWithVoice } from "@/components/ui/input-with-voice";
import { ArrowLeft, Loader2, Check, Sparkles, PartyPopper } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { DEMO_COACHING_DATA, type DemoCoachingQuestion } from "@/lib/demo-coaching-data";
import Confetti from "@/components/Confetti";

type Section = "story" | "persona" | "value_proposition" | "tone_style" | "content_strategy" | "offers";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AIResponse {
  question: string;
  question_type: "text" | "textarea" | "select" | "multi_select";
  options?: string[];
  placeholder?: string;
  field_hint?: string;
  extracted_insights?: Record<string, any>;
  is_complete: boolean;
  completion_percentage: number;
  recap_update?: string;
  final_summary?: string;
}

const SECTION_META: Record<Section, { emoji: string; title: string; description: string; duration: string }> = {
  story: { emoji: "📖", title: "Mon histoire", description: "On va écrire ton histoire ensemble. Je te pose des questions, tu me racontes.", duration: "~5 min" },
  persona: { emoji: "👩‍💻", title: "Mon client·e idéal·e", description: "On va dresser le portrait de ta cliente idéale ensemble. Je te pose des questions, tu me racontes.", duration: "~5 min" },
  value_proposition: { emoji: "❤️", title: "Ma proposition de valeur", description: "On va formuler ce qui te rend unique. Des phrases claires, réutilisables partout.", duration: "~4 min" },
  tone_style: { emoji: "🎨", title: "Mon ton, mon style & mes combats", description: "On va définir ta voix. Comment tu parles, ce que tu défends, tes limites.", duration: "~5 min" },
  content_strategy: { emoji: "🍒", title: "Ma stratégie de contenu", description: "On va poser tes piliers de contenu et ta ligne éditoriale.", duration: "~4 min" },
  offers: { emoji: "🎁", title: "Mes offres", description: "On va formuler tes offres de manière désirable.", duration: "~5 min" },
};

const LOADING_PHRASES = [
  "Je réfléchis à ma prochaine question...",
  "Intéressant, laisse-moi creuser...",
  "Ok, j'ai une idée...",
  "Je cherche le bon angle...",
  "Hmm, voyons ce qu'on peut explorer...",
];

interface BrandingCoachingFlowProps {
  section: Section;
  onComplete?: () => void;
  onBack?: () => void;
}

export default function BrandingCoachingFlow({ section, onComplete, onBack }: BrandingCoachingFlowProps) {
  const { user } = useAuth();
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
  const [showConfetti, setShowConfetti] = useState(false);
  const [hasExistingSession, setHasExistingSession] = useState(false);
  const [hasPrefilledData, setHasPrefilledData] = useState(false);

  const meta = SECTION_META[section];
  const demoQuestions = isDemoMode ? DEMO_COACHING_DATA[section]?.questions : null;

  // Load existing session
  useEffect(() => {
    if (isDemoMode) return;
    if (!user) return;

    const loadSession = async () => {
      const { data } = await supabase
        .from("branding_coaching_sessions")
        .select("*")
        .eq("user_id", user.id)
        .eq("section", section)
        .maybeSingle();

      if (data && data.messages && (data.messages as any[]).length > 0) {
        setHasExistingSession(true);
        if (data.is_complete) {
          // Already completed, show recap
          setFinalSummary((data.extracted_data as any)?.final_summary || "");
          setCompletionPct(100);
          setPhase("complete");
        } else {
          // Resume: restore messages and ask next question
          setMessages(data.messages as unknown as Message[]);
          setQuestionIndex(data.question_count || 0);
          setCompletionPct((data.extracted_data as any)?.completion_percentage || 5);
        }
      }

      // Check if branding data exists (prefilled from onboarding)
      const { data: bp } = await supabase
        .from("brand_profile")
        .select("positioning, mission, values")
        .eq("user_id", user.id)
        .maybeSingle();
      if (bp?.positioning || bp?.mission) {
        setHasPrefilledData(true);
      }
    };
    loadSession();
  }, [user?.id, section, isDemoMode]);

  const fetchContext = useCallback(async () => {
    if (!user) return {};
    const [profileRes, brandRes, auditRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("brand_profile").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("branding_audits").select("score_global, points_forts, points_faibles").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    return {
      profile: profileRes.data,
      branding: brandRes.data,
      audit: auditRes.data,
      existing_data: brandRes.data || {},
    };
  }, [user?.id]);

  const askAI = useCallback(async (msgs: Message[]) => {
    setLoading(true);
    setLoadingPhrase(LOADING_PHRASES[Math.floor(Math.random() * LOADING_PHRASES.length)]);

    try {
      const context = await fetchContext();
      const { data, error } = await supabase.functions.invoke("branding-coaching", {
        body: { user_id: user!.id, section, messages: msgs, context },
      });
      if (error) throw error;
      return data.response as AIResponse;
    } finally {
      setLoading(false);
    }
  }, [user?.id, section, fetchContext]);

  const saveDemoAnswer = useCallback((q: DemoCoachingQuestion) => {
    setCompletionPct(q.completion_percentage);
  }, []);

  const handleStart = useCallback(async () => {
    setPhase("coaching");

    if (isDemoMode && demoQuestions) {
      // Demo mode: show first question
      const first = demoQuestions[0];
      setCurrentQuestion({
        question: first.question,
        question_type: first.question_type,
        options: first.options,
        placeholder: first.placeholder,
        is_complete: false,
        completion_percentage: first.completion_percentage,
      });
      setAnswer(first.demo_answer);
      setCompletionPct(5);
      return;
    }

    // Real mode: if we have an existing session with messages, ask AI for next question
    if (hasExistingSession && messages.length > 0) {
      const response = await askAI(messages);
      if (response) {
        setCurrentQuestion(response);
        setCompletionPct(response.completion_percentage || 5);
      }
      return;
    }

    // New session: ask first question
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
      saveDemoAnswer(demoQuestions[questionIndex]);

      if (nextIndex >= demoQuestions.length) {
        // Complete
        setFinalSummary(DEMO_COACHING_DATA[section]?.final_summary || "");
        setCompletionPct(100);
        setShowConfetti(true);
        setPhase("complete");
        return;
      }

      // Simulate loading delay
      setLoading(true);
      setLoadingPhrase(LOADING_PHRASES[Math.floor(Math.random() * LOADING_PHRASES.length)]);
      await new Promise(r => setTimeout(r, 500));
      setLoading(false);

      const next = demoQuestions[nextIndex];
      setCurrentQuestion({
        question: next.question,
        question_type: next.question_type,
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
    const newMessages: Message[] = [
      ...messages,
      { role: "user", content: userAnswer },
    ];
    setMessages(newMessages);

    const response = await askAI(newMessages);
    if (!response) return;

    const updatedMessages: Message[] = [
      ...newMessages,
      { role: "assistant", content: response.question || response.final_summary || "" },
    ];
    setMessages(updatedMessages);
    setCompletionPct(response.completion_percentage || completionPct);

    // Save session
    await supabase.from("branding_coaching_sessions").upsert({
      user_id: user!.id,
      section,
      messages: updatedMessages as any,
      extracted_data: {
        ...response.extracted_insights,
        completion_percentage: response.completion_percentage,
        final_summary: response.final_summary,
      },
      question_count: nextIndex,
      is_complete: response.is_complete,
      completed_at: response.is_complete ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    } as any, { onConflict: "user_id,section" });

    // Save extracted insights to the right table
    if (response.extracted_insights && Object.keys(response.extracted_insights).length > 0) {
      await saveInsights(section, response.extracted_insights);
    }

    if (response.is_complete) {
      setFinalSummary(response.final_summary || "");
      setCompletionPct(100);
      setShowConfetti(true);
      setPhase("complete");
      return;
    }

    setCurrentQuestion(response);
  }, [answer, selectedOptions, questionIndex, currentQuestion, isDemoMode, demoQuestions, messages, askAI, section, user?.id, completionPct]);

  const saveInsights = async (sec: string, insights: Record<string, any>) => {
    if (!user) return;
    try {
      if (sec === "persona") {
        await supabase.from("persona").upsert({
          user_id: user.id,
          ...insights,
          updated_at: new Date().toISOString(),
        } as any, { onConflict: "user_id" });
      } else {
        // Everything else goes to brand_profile
        await supabase.from("brand_profile").upsert({
          user_id: user.id,
          ...insights,
          updated_at: new Date().toISOString(),
        } as any, { onConflict: "user_id" });
      }
    } catch (e) {
      console.error("Error saving insights:", e);
    }
  };

  const estimatedTotal = Math.max(8, Math.round((questionIndex + 1) / (completionPct / 100 || 0.1)));
  const estimatedRemaining = Math.max(1, estimatedTotal - questionIndex);
  const timeRemaining = estimatedRemaining <= 2 ? "Presque fini !" : `Encore ~${Math.ceil(estimatedRemaining * 0.5)} min`;

  // Intro screen
  if (phase === "intro") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        {isDemoMode && (
          <div className="absolute top-4 right-4">
            <button onClick={() => navigate("/dashboard")} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Skip → Voir l'outil rempli
            </button>
          </div>
        )}

        <div className="flex-1 flex flex-col items-center justify-center px-6 max-w-lg mx-auto text-center">
          <span className="text-5xl mb-6">{meta.emoji}</span>
          <h1 className="font-display text-2xl font-bold text-foreground mb-3">{meta.title}</h1>
          <p className="text-muted-foreground text-[15px] mb-6 leading-relaxed">{meta.description}</p>

          {hasExistingSession && (
            <p className="text-sm text-primary mb-4">On avait commencé la dernière fois. On reprend ? 🌸</p>
          )}

          {hasPrefilledData && !hasExistingSession && (
            <p className="text-sm text-muted-foreground mb-4">
              ✨ J'ai déjà quelques infos grâce à ce que tu m'as partagé. On va creuser.
            </p>
          )}

          <Button size="lg" className="rounded-pill gap-2" onClick={handleStart} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {hasExistingSession ? "On reprend →" : "C'est parti →"}
          </Button>

          <p className="text-xs text-muted-foreground mt-6">{meta.duration}</p>
        </div>
      </div>
    );
  }

  // Complete screen
  if (phase === "complete") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        {showConfetti && <Confetti />}
        <div className="flex-1 flex flex-col items-center justify-center px-6 max-w-lg mx-auto text-center">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 15 }}>
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-6">
              <Check className="h-8 w-8 text-primary" />
            </div>
          </motion.div>

          <h1 className="font-display text-2xl font-bold text-foreground mb-4">✅ Section complète !</h1>

          {finalSummary && (
            <div className="rounded-xl bg-muted/50 border border-border p-5 mb-6 text-left">
              <p className="text-sm text-foreground leading-relaxed">{finalSummary}</p>
            </div>
          )}

          <div className="flex gap-3">
            <Button onClick={() => navigate("/branding")} variant="outline" className="rounded-pill">
              Retour au branding
            </Button>
            {onComplete && (
              <Button onClick={onComplete} className="rounded-pill">
                Voir ma fiche récap
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground mt-6">Tu pourras revenir creuser à tout moment.</p>
        </div>
      </div>
    );
  }

  // Coaching screen
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between mb-3">
          <button onClick={onBack || (() => navigate("/branding"))} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Retour
          </button>
          <span className="text-xs text-muted-foreground font-mono-ui">
            Question {questionIndex + 1}/{estimatedTotal}
          </span>
          {isDemoMode && (
            <button onClick={() => navigate("/dashboard")} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Skip →
            </button>
          )}
        </div>
        <Progress value={completionPct} className="h-1.5" />
      </div>

      {/* Question */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 max-w-lg mx-auto w-full">
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto mb-3" />
              <p className="text-sm text-muted-foreground italic">{loadingPhrase}</p>
            </motion.div>
          ) : currentQuestion ? (
            <motion.div
              key={`q-${questionIndex}`}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.3 }}
              className="w-full"
            >
              <p className="font-display text-lg md:text-xl font-bold text-foreground mb-6 leading-relaxed text-center">
                {currentQuestion.question}
              </p>

              {/* Input based on type */}
              {currentQuestion.question_type === "textarea" && (
                <TextareaWithVoice
                  value={answer}
                  onValueChange={setAnswer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder={currentQuestion.placeholder}
                  className="min-h-[120px]"
                />
              )}

              {currentQuestion.question_type === "text" && (
                <InputWithVoice
                  value={answer}
                  onValueChange={setAnswer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder={currentQuestion.placeholder}
                />
              )}

              {currentQuestion.question_type === "select" && currentQuestion.options && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {currentQuestion.options.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => { setSelectedOptions([opt]); setAnswer(opt); }}
                      className={cn(
                        "rounded-xl border-2 p-4 text-left text-sm transition-all",
                        selectedOptions.includes(opt)
                          ? "border-primary bg-primary/5 text-foreground"
                          : "border-border bg-card text-muted-foreground hover:border-primary/30"
                      )}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}

              {currentQuestion.question_type === "multi_select" && currentQuestion.options && (
                <div className="grid grid-cols-2 gap-3">
                  {currentQuestion.options.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => {
                        setSelectedOptions(prev =>
                          prev.includes(opt)
                            ? prev.filter(o => o !== opt)
                            : [...prev, opt]
                        );
                      }}
                      className={cn(
                        "rounded-xl border-2 p-3 text-sm transition-all",
                        selectedOptions.includes(opt)
                          ? "border-primary bg-primary/5 text-foreground"
                          : "border-border bg-card text-muted-foreground hover:border-primary/30"
                      )}
                    >
                      {selectedOptions.includes(opt) && <Check className="h-3 w-3 inline mr-1" />}
                      {opt}
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-6 flex justify-center">
                <Button
                  size="lg"
                  className="rounded-pill min-w-[200px]"
                  onClick={handleNext}
                  disabled={!answer.trim() && selectedOptions.length === 0}
                >
                  Suivant →
                </Button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="pb-6 text-center">
        <p className="text-xs text-muted-foreground">{timeRemaining}</p>
      </div>
    </div>
  );
}
