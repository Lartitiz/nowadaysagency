// Pièces communes de l'étape « questions » (chantier 3 de la carte des doublons,
// 27/11/2026) : l'attente, le compteur « Question X sur N » et le champ de réponse
// sont les mêmes dans /creer (CreerStepQuestions) et dans la fenêtre « Je te pose des
// questions » (StoryQuestionsDialog). Chaque parcours garde SES questions, son nombre
// de questions et son appel serveur ; ici on ne règle que COMMENT ça s'affiche.
import type { ReactNode } from "react";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import WaitingScreen, { type WaitingNote } from "@/components/creer/WaitingScreen";

/** Attente des questions : barre honnête, phrases qui tournent, « Déjà X s », réassurance. */
const QUESTIONS_NOTES: WaitingNote[] = [
  { afterSeconds: 15, text: "Je creuse pour des questions vraiment pertinentes, ça arrive…" },
  { afterSeconds: 30, text: "C'est un peu plus long que d'habitude : ça arrive. Encore un instant…" },
];

export function QuestionsWaiting({ messages, className = "py-10 max-w-md mx-auto text-center animate-fade-in space-y-5", testId }: {
  messages: string[];
  className?: string;
  testId?: string;
}) {
  return (
    <div role="status" data-testid={testId}>
      <WaitingScreen
        className={className}
        rotation={{ messages, everyMs: 3500 }}
        tauSeconds={25}
        ceiling={90}
        notes={QUESTIONS_NOTES}
      />
    </div>
  );
}

/** « Question 2 sur 4 » (ou « Une question »), avec un suffixe facultatif et les petites barres. */
export function QuestionCounter({ index, total, suffix = "", showBars = false, testId }: {
  index: number; total: number; suffix?: string; showBars?: boolean; testId?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground" data-testid={testId}>
        {total > 1 ? `Question ${index + 1} sur ${total}` : "Une question"}{suffix}
      </p>
      {showBars && total > 1 && (
        <div className="flex gap-1.5" aria-hidden="true">
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={`h-1.5 w-6 rounded-full ${i <= index ? "bg-primary" : "bg-primary/15"}`} />
          ))}
        </div>
      )}
    </div>
  );
}

/** La question (label), son exemple lisible pendant la saisie, et la zone de texte avec micro. */
export function QuestionField({ id, question, example, value, onChange, placeholder, labelClassName, children, testId, autoFocus, textareaClassName = "resize-none", fieldKey }: {
  id: string;
  question: string;
  example?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  labelClassName: string;
  /** Contenu à insérer entre le label et la zone (ex. l'exemple propre à l'écran). */
  children?: ReactNode;
  testId?: string;
  autoFocus?: boolean;
  textareaClassName?: string;
  /** Change à chaque question pour repartir d'une zone neuve (curseur reposé, dictée arrêtée). Absent : la même zone sert à toutes les questions. */
  fieldKey?: string | number;
}) {
  return (
    <>
      <label htmlFor={id} className={labelClassName}>{question}</label>
      {example && <p id={`${id}-example`} className="text-sm text-muted-foreground" data-testid="creer-question-example">Par exemple : {example}</p>}
      {children}
      <Textarea
        key={fieldKey}
        id={id}
        data-testid={testId}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-describedby={example ? `${id}-example` : undefined}
        rows={4}
        className={textareaClassName}
      />
    </>
  );
}
