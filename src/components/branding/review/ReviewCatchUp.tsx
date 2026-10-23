// Carte vide de la relecture : ce qui manque, une question courte avec le
// micro, « Enregistrer ma réponse » et « Plus tard ». Jamais « C'est bon » sur
// du vide (avant le 23/10/2026, la carte vide proposait de valider rien).
import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { TextareaWithVoice } from "@/components/ui/textarea-with-voice";
import { CATCH_UP } from "./catch-up";
import type { SectionKey } from "./types";

interface ReviewCatchUpProps {
  sectionKey: SectionKey;
  saving: boolean;
  onSubmit: (answer: string) => void;
  onLater: () => void;
}

export function ReviewCatchUp({ sectionKey, saving, onSubmit, onLater }: ReviewCatchUpProps) {
  const [answer, setAnswer] = useState("");
  const q = CATCH_UP[sectionKey];
  const ready = answer.trim().length > 0;
  return (
    <div>
      <p className="text-sm text-muted-foreground mb-1">{q.missing}</p>
      <label htmlFor={`rattrapage-${sectionKey}`} className="block text-base text-foreground font-medium mb-3">{q.question}</label>
      <TextareaWithVoice
        id={`rattrapage-${sectionKey}`}
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        onValueChange={setAnswer}
        placeholder={q.placeholder}
        className="min-h-[88px] text-sm mb-4"
      />
      <div className="flex flex-col sm:flex-row gap-2">
        <button onClick={() => onSubmit(answer)} disabled={!ready || saving} className="inline-flex items-center justify-center gap-2 bg-primary text-white rounded-[12px] px-5 py-2 text-sm font-semibold transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-50 disabled:hover:scale-100">
          {saving ? <Spinner className="h-4 w-4 text-white" /> : <CheckCircle2 className="h-4 w-4" />}
          Enregistrer ma réponse
        </button>
        <button onClick={onLater} disabled={saving} className="inline-flex items-center justify-center gap-2 border-[1.5px] border-border text-muted-foreground rounded-[12px] px-5 py-2 text-sm font-semibold hover:border-foreground/40 hover:text-foreground transition-all disabled:opacity-50">
          Plus tard
        </button>
      </div>
    </div>
  );
}
