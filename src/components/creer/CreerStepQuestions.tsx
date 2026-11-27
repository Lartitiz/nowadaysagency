import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { ArrowLeft, ArrowRight, Sparkles, Loader2 } from "lucide-react";
import type { Question } from "@/hooks/use-content-generator";
import StickyStepBar from "./StickyStepBar";
import { QuestionsWaiting, QuestionCounter, QuestionField } from "./QuestionParts";

// Attente des questions : brique commune (QuestionParts → WaitingScreen). La latence de
// l'edge varie de ~4 s à plus d'une minute : barre honnête, phrases qui tournent,
// réassurance progressive, sans jamais promettre une durée.
const QUESTIONS_LOADING_MESSAGES = [
  "Je prépare des questions sur-mesure pour ton sujet…",
  "Je m'imprègne de ton univers de marque…",
  "Je cherche les angles qui rendront ton contenu unique…",
  "J'affine pour ne te poser que l'essentiel…",
];

/** « Ex. : la lumière… » → « la lumière… » (l'écran écrit lui-même « Par exemple : »). */
export function questionExample(placeholder?: string): string {
  const clean = (placeholder || "").trim().replace(/^(ex(emple)?\.?|par exemple)\s*:\s*/i, "").replace(/…$|\.{3}$/, "").trim();
  return clean.length >= 3 ? clean : "";
}

interface Props {
  format: string;
  subject: string;
  editorialAngle?: string;
  questions: Question[];
  loadingQuestions: boolean;
  /** Erreur remontée par la préparation des questions (quota, réseau…) — affichée honnêtement. */
  loadError?: string | null;
  previousBriefsCount?: number;
  initialAnswers?: Record<string, string>;
  onAnswersChange?: (answers: Record<string, string>) => void;
  onNext: (answers: Record<string, string>) => void;
  onSkip: () => void;
  onBack: () => void;
  /** auto=1 (1er contenu post-diagnostic) : récap + « Générer » direct au lieu du
   *  mur de 3 questions. L'affinage reste dispo en secondaire (levier activation). */
  autoFirstContent?: boolean;
  allowNarrative?: boolean;
  /** Newsjacking : question unique posée quand on passe les questions sans répondre.
   *  C'est la seule source possible du vécu de terrain (l'IA n'en invente pas). */
  fieldQuestion?: string;
}

export default function CreerStepQuestions({
  format,
  subject,
  editorialAngle,
  questions,
  loadingQuestions,
  loadError,
  initialAnswers,
  onAnswersChange,
  onNext,
  onSkip,
  onBack,
  autoFirstContent,
  allowNarrative,
  fieldQuestion,
}: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers || {});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [refine, setRefine] = useState(false);
  const [askingField, setAskingField] = useState(false);

  // Remonte chaque réponse pendant la saisie afin que le flux la persiste avant
  // même le clic sur « Générer » (reload mobile, retour de veille, HMR…).
  useEffect(() => {
    onAnswersChange?.(answers);
  }, [answers, onAnswersChange]);

  const handleSkip = () => {
    const answered = Object.values(answers).some((value) => value.trim());
    if (!answered && fieldQuestion && !askingField) {
      setAskingField(true);
      return;
    }
    setIsSubmitting(true);
    if (answered) onNext(answers);
    else onSkip();
  };

  const hasAnswers = Object.values(answers).some((value) => value.trim());
  // 26/11/2026 (retour de Laetitia : « ça charge l'écran ») : un simple lien, plus un
  // encadré sous chaque question. L'écran des questions ne le montre qu'à la dernière.
  const narrativeField = allowNarrative ? (
    <details className="text-left" data-testid="creer-narrative">
      <summary className="cursor-pointer text-sm text-muted-foreground underline underline-offset-2 hover:text-primary">Un autre récit à raconter ?</summary>
      <label htmlFor="creation-narrative" className="block text-sm mt-3 mb-2">
        Ce que tu veux raconter (optionnel)
      </label>
      <Textarea
        id="creation-narrative"
        value={answers["Le récit que je souhaite raconter"] || ""}
        onChange={(event) => setAnswers((previous) => ({ ...previous, "Le récit que je souhaite raconter": event.target.value }))}
        placeholder="Tu peux préciser ou changer l’histoire de départ. Raconte ce qui s’est passé, ce que tu veux expliquer ou faire comprendre."
        rows={4}
      />
    </details>
  ) : null;

  // Levier A — 1er contenu (auto=1) : au lieu du mur de 3 questions juste après le
  // diagnostic, on récapitule l'idée déjà préparée et on GÉNÈRE direct (récompense
  // immédiate). L'affinage reste accessible en lien secondaire pour qui veut creuser.
  if (autoFirstContent && !refine && subject) {
    return (
      <div className="animate-fade-in space-y-5 py-2">
        <div>
          <h2 className="font-display text-xl font-bold text-foreground">Ton premier contenu est prêt à écrire</h2>
          <p className="text-sm text-muted-foreground mt-1">À partir de ton diagnostic : on l'a déjà préparé pour toi.</p>
        </div>
        <div className="rounded-xl bg-rose-pale border border-primary/20 p-4">
          <p className="text-2xs font-semibold uppercase tracking-wide text-primary-text mb-1">Ton idée</p>
          <p className="text-sm font-medium text-foreground leading-snug">{subject}</p>
        </div>
        {narrativeField}
        <Button onClick={handleSkip} disabled={isSubmitting} data-testid="creer-generate-direct" className="w-full rounded-pill gap-2 bg-primary text-primary-foreground hover:bg-primary/90 h-12 text-base">
          {isSubmitting ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> On rédige ton contenu…</>
          ) : (
            <><Sparkles className="h-4 w-4" /> Générer mon premier contenu</>
          )}
        </Button>
        <div className="text-center">
          <button type="button" onClick={() => setRefine(true)} className="text-sm text-primary-text underline underline-offset-2 hover:opacity-80">
            Je préfère répondre à quelques questions d'abord
          </button>
        </div>
      </div>
    );
  }

  if (askingField && fieldQuestion) {
    const fieldAnswer = answers[fieldQuestion] || "";
    return (
      <div className="space-y-5 animate-fade-in" data-testid="creer-field-question">
        <div>
          <h2 className="font-display text-3xl text-primary">Une seule question</h2>
          <p className="mt-2 text-sm text-muted-foreground">C'est ce qui donne ta voix au contenu : l'IA n'invente jamais ce que tu vis sur le terrain.</p>
        </div>
        <div className="space-y-3">
          <label htmlFor="creation-field-question" className="block text-sm font-semibold text-foreground">{fieldQuestion}</label>
          <Textarea
            id="creation-field-question"
            value={fieldAnswer}
            onChange={(e) => setAnswers((prev) => ({ ...prev, [fieldQuestion]: e.target.value }))}
            placeholder="Ex. : on me répond direct « non, je ne veux pas me montrer ». Derrière, je sens souvent la peur d'être jugée."
            rows={4}
            className="resize-none"
            autoFocus
          />
        </div>
        <StickyStepBar>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setAskingField(false)} disabled={isSubmitting} aria-label="Revenir aux questions" className="gap-1 text-muted-foreground shrink-0">
              <ArrowLeft className="h-3.5 w-3.5" /> Retour
            </Button>
            <Button size="lg" onClick={handleSkip} disabled={isSubmitting} className="flex-1 gap-2" data-testid="creer-field-question-generate">
              {isSubmitting ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Lancement…</>
              ) : (
                <><Sparkles className="h-4 w-4" /> {fieldAnswer.trim() ? "Générer avec ma réponse" : "Générer sans répondre"}</>
              )}
            </Button>
          </div>
        </StickyStepBar>
      </div>
    );
  }

  if (loadingQuestions) {
    return <QuestionsWaiting messages={QUESTIONS_LOADING_MESSAGES} />;
  }

  if (questions.length === 0) {
    return (
      <div className="py-8 text-center animate-fade-in space-y-4">
        {loadError && (
          <p className="text-sm text-destructive">
            ⚠️ Les questions n'ont pas pu être préparées : {loadError}
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          {loadError
            ? "Tu peux ajouter tes précisions ou générer avec les informations déjà disponibles."
            : "La matière disponible suffit pour commencer. Tu peux générer directement ou ajouter une précision."}
        </p>
        {narrativeField}
        <Button onClick={handleSkip} disabled={isSubmitting} className="gap-2" data-testid="creer-generate-direct">
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
  const example = questionExample(q.placeholder);

  const handleNext = () => {
    if (!isLast) {
      setCurrentIndex((i) => i + 1);
      return;
    }
    // Dernière question : seul bouton pour lancer, il passe par le même chemin
    // que l'ancien lien « Passer les questions » (question de terrain du
    // newsjacking quand rien n'est rempli).
    handleSkip();
  };

  const handlePrev = () => {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
    else onBack();
  };

  // Écran volontairement dépouillé (12/11/2026) : la question est la seule chose
  // à lire. Plus de grand titre, de paragraphe d'explication ni d'encadré : le
  // fil d'étapes dit déjà « Précisions », et « facultatif » suffit à dire qu'on
  // peut passer.
  return (
    <div className="space-y-4 animate-fade-in">
      <QuestionCounter index={currentIndex} total={questions.length} suffix=" · facultatif" showBars testId="creer-questions-counter" />

      {/* Question */}
      <div className="space-y-3">
        <QuestionField
          id={`creation-question-${q.id}`}
          question={q.question}
          example={example}
          value={answers[q.id] || ""}
          onChange={(value) => setAnswers((prev) => ({ ...prev, [q.id]: value }))}
          placeholder="Ta réponse…"
          labelClassName="block text-lg sm:text-xl font-semibold leading-snug text-foreground"
        />
      </div>

      {(isLast || !!answers["Le récit que je souhaite raconter"]) && narrativeField}

      {/* Navigation — collée en bas pour que « Générer » reste visible sans défiler sur
          téléphone, au-dessus de la barre du menu du bas (chantier I, comme l'écran Format). */}
      <StickyStepBar testId="creer-questions-bar">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handlePrev} disabled={isSubmitting} className="gap-1 text-muted-foreground shrink-0">
            <ArrowLeft className="h-3.5 w-3.5" /> {currentIndex > 0 ? "Précédent" : "Retour"}
          </Button>
          <Button size="lg" onClick={handleNext} disabled={isSubmitting} className="flex-1 gap-2" data-testid="creer-questions-next">
            {isSubmitting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Lancement…</>
            ) : isLast ? (
              <>Générer <Sparkles className="h-4 w-4" /></>
            ) : (
              <>Suivant <ArrowRight className="h-4 w-4" /></>
            )}
          </Button>
        </div>

        {/* Passer les questions : pas à la dernière, où le gros bouton « Générer »
            fait déjà la même chose (27/11/2026, deux « Générer » l'un sous l'autre).
            Gardé pour une question unique laissée vide : il dit alors « passer »,
            pas « générer » une deuxième fois. */}
        {(!isLast || (questions.length === 1 && !hasAnswers)) && <Button
          variant="link"
          size="sm"
          className="w-full gap-1.5 text-muted-foreground underline underline-offset-2 hover:text-primary"
          onClick={handleSkip}
          disabled={isSubmitting}
          data-testid="creer-generate-direct"
        >
          {isSubmitting ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Lancement…</>
          ) : (
            <>{hasAnswers ? "Générer avec mes précisions" : "Passer les questions, générer directement"}</>
          )}
        </Button>}
        {isSubmitting && (
          <p className="text-xs text-center text-muted-foreground animate-fade-in">
            ⚡ Préparation de la génération…
          </p>
        )}
      </StickyStepBar>
    </div>
  );
}
