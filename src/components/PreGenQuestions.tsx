import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, SkipForward, Mic, MicOff } from "lucide-react";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";

export interface PreGenAnswers {
  anecdote: string;
  emotion: string;
  conviction: string;
}

interface PreGenQuestionsProps {
  variant?: "atelier" | "stories" | "reels";
  onSubmit: (answers: PreGenAnswers) => void;
  onSkip: () => void;
}

const EMOTIONS = [
  { id: "declic", emoji: "💡", label: "Déclic" },
  { id: "soulagement", emoji: "😮‍💨", label: "Soulagement" },
  { id: "motivation", emoji: "💪", label: "Motivation" },
  { id: "identification", emoji: "🪞", label: "Identification" },
  { id: "curiosite", emoji: "🤔", label: "Curiosité" },
  { id: "rire", emoji: "😄", label: "Rire" },
  { id: "colere_douce", emoji: "😤", label: "Colère douce" },
];

const QUESTIONS: Record<string, { q1: string; q2Label: string; q3: string; q1Placeholder: string; q3Placeholder: string }> = {
  atelier: {
    q1: "T'as une anecdote perso liée à ce sujet ?",
    q2Label: "Quelle émotion tu veux que la personne ressente ?",
    q3: "Un truc que tu veux absolument dire ?",
    q1Placeholder: "Un truc qui t'est arrivé, un moment client, une galère...",
    q3Placeholder: "Une phrase, une conviction, un conseil...",
  },
  stories: {
    q1: "T'as vécu un truc aujourd'hui en lien avec ce sujet ?",
    q2Label: "Tu veux que ta séquence donne quelle énergie ?",
    q3: "Un message que tu veux faire passer ?",
    q1Placeholder: "Un moment de ta journée, une réflexion...",
    q3Placeholder: "Le message principal de ta séquence...",
  },
  reels: {
    q1: "T'as un moment perso qui illustre ce sujet ? (en 1 phrase)",
    q2Label: "Tu veux que les gens ressentent quoi ?",
    q3: "Ta punchline si t'en as une ?",
    q1Placeholder: "Une anecdote courte, un déclic...",
    q3Placeholder: "La phrase qui claque...",
  },
};

export default function PreGenQuestions({ variant = "atelier", onSubmit, onSkip }: PreGenQuestionsProps) {
  const config = QUESTIONS[variant] || QUESTIONS.atelier;
  const [anecdote, setAnecdote] = useState("");
  const [emotion, setEmotion] = useState("");
  const [conviction, setConviction] = useState("");
  const [activeMic, setActiveMic] = useState<string | null>(null);

  const { isListening, isSupported, toggle } = useSpeechRecognition((text) => {
    if (activeMic === "anecdote") setAnecdote(prev => prev + (prev ? " " : "") + text);
    if (activeMic === "conviction") setConviction(prev => prev + (prev ? " " : "") + text);
  });

  const handleMic = (field: string) => {
    setActiveMic(field);
    toggle();
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4 animate-fade-in">
      <div>
        <h3 className="font-display text-base font-bold text-foreground flex items-center gap-2">
          💬 Avant de rédiger, j'ai besoin de toi
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Tu peux passer cette étape, mais ton contenu sera plus authentique si tu réponds.
        </p>
      </div>

      {/* Q1: Anecdote */}
      <div>
        <label className="text-sm font-medium text-foreground block mb-1.5">
          1. {config.q1}
        </label>
        <div className="relative">
          <Textarea
            value={anecdote}
            onChange={(e) => setAnecdote(e.target.value)}
            placeholder={config.q1Placeholder}
            className="pr-12 min-h-[70px]"
          />
          {isSupported && (
            <button
              onClick={() => handleMic("anecdote")}
              className={`absolute right-3 top-3 p-1.5 rounded-lg transition-colors ${
                isListening && activeMic === "anecdote" ? "bg-primary text-primary-foreground animate-pulse" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {isListening && activeMic === "anecdote" ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Q2: Emotion */}
      <div>
        <label className="text-sm font-medium text-foreground block mb-2">
          2. {config.q2Label}
        </label>
        <div className="flex flex-wrap gap-2">
          {EMOTIONS.map((e) => (
            <button
              key={e.id}
              onClick={() => setEmotion(e.id)}
              className={`text-xs px-3 py-1.5 rounded-pill border transition-all ${
                emotion === e.id ? "border-primary bg-rose-pale text-foreground font-semibold" : "border-border bg-card text-muted-foreground hover:border-primary/40"
              }`}
            >
              {e.emoji} {e.label}
            </button>
          ))}
        </div>
      </div>

      {/* Q3: Conviction */}
      <div>
        <label className="text-sm font-medium text-foreground block mb-1.5">
          3. {config.q3}
        </label>
        <div className="relative">
          <Textarea
            value={conviction}
            onChange={(e) => setConviction(e.target.value)}
            placeholder={config.q3Placeholder}
            className="pr-12 min-h-[70px]"
          />
          {isSupported && (
            <button
              onClick={() => handleMic("conviction")}
              className={`absolute right-3 top-3 p-1.5 rounded-lg transition-colors ${
                isListening && activeMic === "conviction" ? "bg-primary text-primary-foreground animate-pulse" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {isListening && activeMic === "conviction" ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button onClick={() => onSubmit({ anecdote, emotion, conviction })} className="rounded-pill gap-1.5">
          <Sparkles className="h-4 w-4" /> Générer avec mes réponses
        </Button>
        <Button variant="ghost" size="sm" onClick={onSkip} className="rounded-pill gap-1.5 text-muted-foreground">
          <SkipForward className="h-3.5 w-3.5" /> Passer, générer direct
        </Button>
      </div>
    </div>
  );
}
