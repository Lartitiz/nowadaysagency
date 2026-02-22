import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles } from "lucide-react";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import MicButton from "@/components/MicButton";
import { supabase } from "@/integrations/supabase/client";

interface Direction {
  emoji: string;
  label: string;
  tone: string;
}

interface ClarifyResult {
  clarifying_question: string;
  directions: Direction[];
}

export interface SubjectPickerResult {
  subject: string;
  subject_details?: string;
  raw_idea?: string;
  clarify_context?: string;
  direction?: string;
}

interface SubjectPickerProps {
  onComplete: (result: SubjectPickerResult) => void;
  brandingContext?: string;
}

type Path = null | "fuzzy" | "precise" | "none";

export default function SubjectPicker({ onComplete, brandingContext }: SubjectPickerProps) {
  const [path, setPath] = useState<Path>(null);

  // Fuzzy path state
  const [fuzzyStep, setFuzzyStep] = useState<"input" | "clarify">("input");
  const [rawIdea, setRawIdea] = useState("");
  const [clarifyResult, setClarifyResult] = useState<ClarifyResult | null>(null);
  const [clarifyAnswer, setClarifyAnswer] = useState("");
  const [selectedDirection, setSelectedDirection] = useState("");
  const [clarifyLoading, setClarifyLoading] = useState(false);

  // Precise path state
  const [preciseSubject, setPreciseSubject] = useState("");
  const [preciseDetails, setPreciseDetails] = useState("");

  // No idea path state
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  // Mic
  const [activeMic, setActiveMic] = useState<string | null>(null);
  const { isListening, isSupported, toggle, error } = useSpeechRecognition((text) => {
    if (activeMic === "rawIdea") setRawIdea(prev => prev + (prev ? " " : "") + text);
    if (activeMic === "clarifyAnswer") setClarifyAnswer(prev => prev + (prev ? " " : "") + text);
    if (activeMic === "preciseSubject") setPreciseSubject(prev => prev + (prev ? " " : "") + text);
    if (activeMic === "preciseDetails") setPreciseDetails(prev => prev + (prev ? " " : "") + text);
  });

  const handleMic = (field: string) => {
    if (isListening && activeMic === field) {
      toggle();
      return;
    }
    if (isListening) toggle();
    setActiveMic(field);
    setTimeout(() => toggle(), 50);
  };

  // Fuzzy: call AI for clarifying question
  const handleFuzzySubmit = async () => {
    if (!rawIdea.trim()) return;
    setClarifyLoading(true);
    try {
      const { data } = await supabase.functions.invoke("stories-ai", {
        body: {
          type: "clarify_subject",
          raw_idea: rawIdea,
          branding_context: brandingContext || "",
        },
      });
      const raw = data?.content || "";
      const jsonStr = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const parsed: ClarifyResult = JSON.parse(jsonStr);
      setClarifyResult(parsed);
      setFuzzyStep("clarify");
    } catch (e) {
      console.error(e);
    }
    setClarifyLoading(false);
  };

  // No idea: call AI for suggestions
  const handleSuggest = async () => {
    setSuggestLoading(true);
    try {
      const { data } = await supabase.functions.invoke("stories-ai", {
        body: {
          type: "suggest_subjects",
          branding_context: brandingContext || "",
        },
      });
      const raw = data?.content || "";
      const jsonStr = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const parsed = JSON.parse(jsonStr);
      setSuggestions(parsed.suggestions || []);
    } catch (e) {
      console.error(e);
    }
    setSuggestLoading(false);
  };

  // Path selection
  if (!path) {
    return (
      <div className="space-y-3">
        <h2 className="font-display text-lg font-bold text-foreground">3. De quoi tu veux parler ?</h2>
        <button
          onClick={() => setPath("fuzzy")}
          className="w-full rounded-2xl border border-border bg-card p-4 text-left hover:border-primary/50 transition-all"
        >
          <p className="font-display text-sm font-bold text-foreground">💡 J'ai une idée mais c'est flou</p>
          <p className="text-xs text-muted-foreground mt-0.5">L'IA t'aide à préciser</p>
        </button>
        <button
          onClick={() => setPath("precise")}
          className="w-full rounded-2xl border border-border bg-card p-4 text-left hover:border-primary/50 transition-all"
        >
          <p className="font-display text-sm font-bold text-foreground">✍️ Je sais exactement ce que je veux dire</p>
          <p className="text-xs text-muted-foreground mt-0.5">Écris ton sujet ou ton idée directement</p>
        </button>
        <button
          onClick={() => { setPath("none"); handleSuggest(); }}
          className="w-full rounded-2xl border border-border bg-card p-4 text-left hover:border-primary/50 transition-all"
        >
          <p className="font-display text-sm font-bold text-foreground">🤷 Aucune idée, propose-moi des trucs</p>
          <p className="text-xs text-muted-foreground mt-0.5">L'IA suggère basé sur ta ligne éditoriale</p>
        </button>
      </div>
    );
  }

  // PATH A: Fuzzy
  if (path === "fuzzy") {
    if (fuzzyStep === "input") {
      return (
        <div className="space-y-4">
          <button onClick={() => setPath(null)} className="text-xs text-primary hover:underline">← Changer de parcours</button>
          <h2 className="font-display text-lg font-bold text-foreground">💡 OK, on va préciser ensemble.</h2>
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">
              C'est quoi le sujet en vrac ?
            </label>
            <p className="text-xs text-muted-foreground mb-2">(Dis-le comme tu veux, même en mode brouillon)</p>
            <div className="relative">
              <Textarea
                value={rawIdea}
                onChange={(e) => setRawIdea(e.target.value)}
                placeholder="Genre je voulais parler du fait que les gens se comparent trop sur Instagram..."
                className="pr-16 min-h-[80px]"
              />
              <div className="absolute right-2 top-2">
                <MicButton
                  isListening={isListening && activeMic === "rawIdea"}
                  isSupported={isSupported}
                  onClick={() => handleMic("rawIdea")}
                  error={activeMic === "rawIdea" ? error : null}
                />
              </div>
            </div>
          </div>
          <Button onClick={handleFuzzySubmit} disabled={!rawIdea.trim() || clarifyLoading} className="w-full">
            {clarifyLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> Analyse en cours...</> : "Suivant →"}
          </Button>
        </div>
      );
    }

    if (fuzzyStep === "clarify" && clarifyResult) {
      return (
        <div className="space-y-4">
          <button onClick={() => setFuzzyStep("input")} className="text-xs text-primary hover:underline">← Modifier mon idée</button>
          <div className="rounded-xl border border-primary/20 bg-rose-pale p-3 text-sm text-foreground">
            💡 <span className="font-medium">Ton idée :</span> "{rawIdea}"
          </div>

          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">
              {clarifyResult.clarifying_question}
            </label>
            <div className="relative">
              <Textarea
                value={clarifyAnswer}
                onChange={(e) => setClarifyAnswer(e.target.value)}
                placeholder="Une situation, un truc qu'une cliente t'a dit..."
                className="pr-16 min-h-[70px]"
              />
              <div className="absolute right-2 top-2">
                <MicButton
                  isListening={isListening && activeMic === "clarifyAnswer"}
                  isSupported={isSupported}
                  onClick={() => handleMic("clarifyAnswer")}
                  error={activeMic === "clarifyAnswer" ? error : null}
                />
              </div>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground block mb-2">
              Tu veux aller où avec ça ?
            </label>
            <div className="flex flex-wrap gap-2">
              {clarifyResult.directions.map((d) => (
                <button
                  key={d.label}
                  onClick={() => setSelectedDirection(d.label)}
                  className={`rounded-full border px-3 py-1.5 text-sm transition-all ${
                    selectedDirection === d.label
                      ? "border-primary bg-rose-pale font-bold"
                      : "border-border bg-background hover:border-primary/50"
                  }`}
                >
                  {d.emoji} {d.label}
                </button>
              ))}
            </div>
          </div>

          <Button onClick={() => onComplete({
            subject: rawIdea,
            raw_idea: rawIdea,
            clarify_context: clarifyAnswer || undefined,
            direction: selectedDirection || undefined,
          })} className="w-full gap-1.5">
            <Sparkles className="h-4 w-4" /> Générer la séquence avec ça
          </Button>
        </div>
      );
    }
  }

  // PATH B: Precise
  if (path === "precise") {
    return (
      <div className="space-y-4">
        <button onClick={() => setPath(null)} className="text-xs text-primary hover:underline">← Changer de parcours</button>
        <h2 className="font-display text-lg font-bold text-foreground">✍️ Dis-moi tout</h2>

        <div>
          <label className="text-sm font-medium text-foreground block mb-1.5">Ton sujet :</label>
          <div className="relative">
            <Textarea
              value={preciseSubject}
              onChange={(e) => setPreciseSubject(e.target.value)}
              placeholder="La comparaison sur Instagram"
              className="pr-16 min-h-[60px]"
            />
            <div className="absolute right-2 top-2">
              <MicButton
                isListening={isListening && activeMic === "preciseSubject"}
                isSupported={isSupported}
                onClick={() => handleMic("preciseSubject")}
                error={activeMic === "preciseSubject" ? error : null}
              />
            </div>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-foreground block mb-1.5">
            T'as déjà des trucs que tu veux dire ? <span className="text-muted-foreground font-normal">(optionnel)</span>
          </label>
          <div className="relative">
            <Textarea
              value={preciseDetails}
              onChange={(e) => setPreciseDetails(e.target.value)}
              placeholder="Je voulais dire que comparer son feed c'est comme comparer son brouillon au produit fini de quelqu'un d'autre..."
              className="pr-16 min-h-[100px]"
            />
            <div className="absolute right-2 top-2">
              <MicButton
                isListening={isListening && activeMic === "preciseDetails"}
                isSupported={isSupported}
                onClick={() => handleMic("preciseDetails")}
                error={activeMic === "preciseDetails" ? error : null}
              />
            </div>
          </div>
        </div>

        <Button
          onClick={() => onComplete({ subject: preciseSubject, subject_details: preciseDetails || undefined })}
          disabled={!preciseSubject.trim()}
          className="w-full gap-1.5"
        >
          <Sparkles className="h-4 w-4" /> Continuer
        </Button>
      </div>
    );
  }

  // PATH C: No idea
  if (path === "none") {
    return (
      <div className="space-y-4">
        <button onClick={() => setPath(null)} className="text-xs text-primary hover:underline">← Changer de parcours</button>
        <h2 className="font-display text-lg font-bold text-foreground">🤷 Voilà des idées pour toi</h2>

        {suggestLoading ? (
          <div className="text-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">L'IA cherche des sujets pour toi...</p>
          </div>
        ) : suggestions.length > 0 ? (
          <div className="space-y-2">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => onComplete({ subject: s })}
                className="w-full rounded-2xl border border-border bg-card p-4 text-left hover:border-primary/50 transition-all"
              >
                <p className="text-sm text-foreground">{s}</p>
              </button>
            ))}
            <Button variant="outline" size="sm" onClick={handleSuggest} className="mt-2">
              🔄 Proposer d'autres sujets
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Aucune suggestion pour le moment.</p>
        )}
      </div>
    );
  }

  return null;
}
