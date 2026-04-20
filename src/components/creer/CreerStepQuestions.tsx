import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, ArrowRight, Sparkles, SkipForward, Loader2, Plus } from "lucide-react";
import type { Question } from "@/hooks/use-content-generator";

interface Props {
  format: string;
  subject: string;
  editorialAngle?: string;
  questions: Question[];
  loadingQuestions: boolean;
  previousBriefsCount?: number;
  initialAnswers?: Record<string, string>;
  onNext: (answers: Record<string, string>) => void;
  onSkip: () => void;
  onBack: () => void;
  // Optional: enables the "+1-2 questions ciblées" follow-up flow.
  // Returns the additional follow-up questions (empty array if none).
  onRequestFollowUp?: (answers: Record<string, string>) => Promise<Question[]>;
}

export default function CreerStepQuestions({
  format,
  subject,
  editorialAngle,
  questions,
  loadingQuestions,
  previousBriefsCount,
  initialAnswers,
  onNext,
  onSkip,
  onBack,
  onRequestFollowUp,
}: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers || {});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Follow-up state (Levier 2 — opt-in)
  const [followUpQuestions, setFollowUpQuestions] = useState<Question[]>([]);
  const [loadingFollowUp, setLoadingFollowUp] = useState(false);
  const [followUpRequested, setFollowUpRequested] = useState(false);
  const [inFollowUp, setInFollowUp] = useState(false);
  const [followUpIndex, setFollowUpIndex] = useState(0);

  const handleSkip = () => {
    setIsSubmitting(true);
    onSkip();
  };

  const handleFinalize = (finalAnswers: Record<string, string>) => {
    setIsSubmitting(true);
    onNext(finalAnswers);
  };

  if (loadingQuestions) {
    return (
      <div className="py-12 text-center animate-fade-in space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
        <p className="text-sm font-medium text-foreground">Préparation des questions…</p>
        <p className="text-xs text-muted-foreground">Quelques secondes.</p>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="py-8 text-center animate-fade-in space-y-4">
        <p className="text-sm text-muted-foreground">Pas de questions pour ce format.</p>
        <Button onClick={onSkip} className="gap-2">
          <Sparkles className="h-4 w-4" /> Générer directement
        </Button>
        <div>
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Retour
          </Button>
        </div>
      </div>
    );
  }

  // Active list of questions = main questions OR follow-up questions
  const activeList = inFollowUp ? followUpQuestions : questions;
  const activeIndex = inFollowUp ? followUpIndex : currentIndex;
  const q = activeList[activeIndex];
  const isLast = activeIndex === activeList.length - 1;
  const progress = ((activeIndex + 1) / activeList.length) * 100;

  const handleNext = async () => {
    if (!isLast) {
      if (inFollowUp) setFollowUpIndex((i) => i + 1);
      else setCurrentIndex((i) => i + 1);
      return;
    }

    // Last question of main set → propose opt-in follow-up if available
    if (!inFollowUp && onRequestFollowUp && !followUpRequested) {
      // Show opt-in card by setting "requested" flag (rendered below)
      setFollowUpRequested(true);
      return;
    }

    // Last follow-up answered, or no follow-up offered → done
    onNext(answers);
  };

  const handlePrev = () => {
    if (inFollowUp) {
      if (followUpIndex > 0) setFollowUpIndex((i) => i - 1);
      else {
        setInFollowUp(false);
        setFollowUpRequested(true); // back to opt-in card
      }
      return;
    }
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
    else onBack();
  };

  const handleAcceptFollowUp = async () => {
    if (!onRequestFollowUp) return;
    setLoadingFollowUp(true);
    try {
      const fu = await onRequestFollowUp(answers);
      if (fu.length === 0) {
        // No follow-up generated → just finish
        onNext(answers);
        return;
      }
      setFollowUpQuestions(fu);
      setInFollowUp(true);
      setFollowUpIndex(0);
      setFollowUpRequested(false);
    } finally {
      setLoadingFollowUp(false);
    }
  };

  const handleDeclineFollowUp = () => {
    onNext(answers);
  };

  // ── RENDER : opt-in card (after last main question) ──
  if (followUpRequested && !inFollowUp) {
    return (
      <div className="space-y-5 animate-fade-in">
        <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-5 space-y-3">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">Creuser un détail ?</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                L'IA peut te poser 1 à 2 questions ciblées sur le détail le plus singulier de tes réponses.
                Le contenu n'en sera que plus unique. Compte 10 secondes.
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <Button
              size="sm"
              onClick={handleAcceptFollowUp}
              disabled={loadingFollowUp}
              className="gap-1.5 flex-1"
            >
              {loadingFollowUp ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Préparation…
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" /> Oui, creuser un détail
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDeclineFollowUp}
              disabled={loadingFollowUp}
              className="gap-1.5 flex-1"
            >
              <Sparkles className="h-3.5 w-3.5" /> Non, générer maintenant
            </Button>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => { setFollowUpRequested(false); setCurrentIndex(questions.length - 1); }} className="gap-1">
          <ArrowLeft className="h-3.5 w-3.5" /> Revoir mes réponses
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {previousBriefsCount && previousBriefsCount > 0 ? (
        <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
          <p className="text-xs text-primary font-medium">
            💡 Tes réponses sont sauvegardées et enrichissent tes futures créations.
          </p>
        </div>
      ) : null}
      {/* Progress */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {inFollowUp ? "Approfondissement " : "Question "}
            {activeIndex + 1} / {activeList.length}
          </p>
          {inFollowUp && (
            <span className="text-[10px] uppercase tracking-wide text-primary font-semibold">+ Bonus</span>
          )}
        </div>
        <Progress value={progress} className="h-1.5" />
      </div>

      {/* Question */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-foreground">{q.question}</p>
        <Textarea
          value={answers[q.id] || ""}
          onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
          placeholder={q.placeholder || "Ta réponse…"}
          rows={3}
          className="resize-none"
        />
      </div>

      {/* Navigation */}
      <div className="flex justify-between items-center">
        <Button variant="ghost" size="sm" onClick={handlePrev} className="gap-1">
          <ArrowLeft className="h-3.5 w-3.5" /> {activeIndex > 0 || inFollowUp ? "Précédent" : "Retour"}
        </Button>
        <Button size="sm" onClick={handleNext} className="gap-1">
          {isLast ? (
            inFollowUp ? (
              <>Générer <Sparkles className="h-3.5 w-3.5" /></>
            ) : onRequestFollowUp ? (
              <>Suivant <ArrowRight className="h-3.5 w-3.5" /></>
            ) : (
              <>Générer <Sparkles className="h-3.5 w-3.5" /></>
            )
          ) : (
            <>Suivant <ArrowRight className="h-3.5 w-3.5" /></>
          )}
        </Button>
      </div>

      {/* Skip */}
      <Button
        variant="ghost"
        size="sm"
        className="w-full gap-1.5 text-muted-foreground"
        onClick={onSkip}
      >
        <SkipForward className="h-3.5 w-3.5" /> Passer les questions, générer directement
      </Button>
    </div>
  );
}
