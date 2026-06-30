import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, ArrowRight, Sparkles, SkipForward, Loader2 } from "lucide-react";
import type { Question } from "@/hooks/use-content-generator";

// ─── Loader honnête pour la préparation des questions ───
// La latence de l'edge qui génère les questions varie fortement (cold-start
// d'isolate + backoff de retry IA) : de ~4s à parfois plus d'une minute. Un
// loader qui promet « quelques secondes » devient mensonger et casse la confiance
// sur le chemin critique d'activation. On affiche donc une progression honnête
// avec messages qui tournent + barre + réassurance progressive (modèle calqué
// sur DiagnosticLoading), sans jamais mentir sur la durée.
const QUESTIONS_LOADING_MESSAGES = [
  "Je prépare des questions sur-mesure pour ton sujet…",
  "Je m'imprègne de ton univers de marque…",
  "Je cherche les angles qui rendront ton contenu unique…",
  "J'affine pour ne te poser que l'essentiel…",
];

function QuestionsLoading() {
  const [elapsed, setElapsed] = useState(0);
  const [msgIdx, setMsgIdx] = useState(0);
  const [progress, setProgress] = useState(8);

  // Compteur de secondes écoulées (pour la réassurance à 15s / 30s).
  useEffect(() => {
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Rotation des messages de patience.
  useEffect(() => {
    const t = setInterval(
      () => setMsgIdx((i) => (i + 1) % QUESTIONS_LOADING_MESSAGES.length),
      3500
    );
    return () => clearInterval(t);
  }, []);

  // Barre de progression « honnête » : elle avance mais ralentit et plafonne
  // vers 90% pour ne jamais prétendre que c'est fini tant que les questions
  // ne sont pas là (le parent retire ce loader dès qu'elles arrivent).
  useEffect(() => {
    const t = setInterval(() => {
      setProgress((p) => {
        if (p >= 90) return 90;
        const step = p < 40 ? 3 : p < 70 ? 1.5 : 0.6;
        return Math.min(90, p + step);
      });
    }, 600);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="py-10 text-center animate-fade-in space-y-5">
      <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />

      <div className="max-w-xs mx-auto space-y-2">
        <Progress value={progress} className="h-1.5" />
      </div>

      <p
        key={msgIdx}
        className="text-sm font-medium text-foreground animate-fade-in min-h-[20px]"
      >
        {QUESTIONS_LOADING_MESSAGES[msgIdx]}
      </p>

      {elapsed >= 15 && (
        <p className="text-xs text-muted-foreground animate-fade-in">
          {elapsed >= 30
            ? "C'est un peu plus long que d'habitude — ça arrive. Encore un instant…"
            : "Je creuse pour des questions vraiment pertinentes, ça arrive…"}
        </p>
      )}
    </div>
  );
}

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
    return <QuestionsLoading />;
  }

  if (questions.length === 0) {
    return (
      <div className="py-8 text-center animate-fade-in space-y-4">
        <p className="text-sm text-muted-foreground">
          Pas de questions cette fois — on peut générer directement, ton contenu sera très bien quand même.
        </p>
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
