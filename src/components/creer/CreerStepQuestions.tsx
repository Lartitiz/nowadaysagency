import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, ArrowRight, Sparkles, SkipForward, Loader2 } from "lucide-react";
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
}: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers || {});
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        <Button onClick={handleSkip} disabled={isSubmitting} className="gap-2">
          {isSubmitting ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Lancement…</>
          ) : (
            <><Sparkles className="h-4 w-4" /> Générer directement</>
          )}
        </Button>
        <div>
          <Button variant="ghost" size="sm" onClick={onBack} disabled={isSubmitting} className="gap-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Retour
          </Button>
        </div>
      </div>
    );
  }

  const q = questions[currentIndex];
  const isLast = currentIndex === questions.length - 1;
  const progress = ((currentIndex + 1) / questions.length) * 100;

  const handleNext = () => {
    if (!isLast) {
      setCurrentIndex((i) => i + 1);
      return;
    }
    handleFinalize(answers);
  };

  const handlePrev = () => {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
    else onBack();
  };

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
            Question {currentIndex + 1} / {questions.length}
          </p>
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
        <Button variant="ghost" size="sm" onClick={handlePrev} disabled={isSubmitting} className="gap-1">
          <ArrowLeft className="h-3.5 w-3.5" /> {currentIndex > 0 ? "Précédent" : "Retour"}
        </Button>
        <Button size="sm" onClick={handleNext} disabled={isSubmitting} className="gap-1">
          {isSubmitting ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Lancement…</>
          ) : isLast ? (
            <>Générer <Sparkles className="h-3.5 w-3.5" /></>
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
        onClick={handleSkip}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Lancement…</>
        ) : (
          <><SkipForward className="h-3.5 w-3.5" /> Passer les questions, générer directement</>
        )}
      </Button>

      {isSubmitting && (
        <p className="text-xs text-center text-muted-foreground animate-fade-in">
          ⚡ Préparation de la génération…
        </p>
      )}
    </div>
  );
}
