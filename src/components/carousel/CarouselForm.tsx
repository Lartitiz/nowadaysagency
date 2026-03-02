import { Button } from "@/components/ui/button";
import { TextareaWithVoice } from "@/components/ui/textarea-with-voice";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, ArrowRight, Loader2, Sparkles, SkipForward, RefreshCw } from "lucide-react";
import { DraftRestoredBanner } from "@/components/DraftRestoredBanner";

// ── Types ──
interface CarouselType {
  id: string; emoji: string; label: string; desc: string; difficulty: string; slides: string;
}

interface TopicSuggestion {
  subject: string; why_now: string; angle: string;
}

interface Hook {
  id: string; text: string; word_count: number; style: string;
}

// ── Constants ──
const CAROUSEL_TYPES: CarouselType[] = [
  { id: "tips", emoji: "💡", label: "Tips / Astuces", desc: "Conseils pratiques", difficulty: "Facile", slides: "5-7" },
  { id: "tutoriel", emoji: "📖", label: "Tutoriel pas-à-pas", desc: "Guide étape par étape", difficulty: "Facile", slides: "8-10" },
  { id: "prise_de_position", emoji: "🔥", label: "Prise de position", desc: "Opinion tranchée", difficulty: "Moyen", slides: "5-8" },
  { id: "mythe_realite", emoji: "❌", label: "Mythe vs Réalité", desc: "Déconstruire des idées reçues", difficulty: "Facile", slides: "6-10" },
  { id: "storytelling", emoji: "📝", label: "Storytelling personnel", desc: "Raconter ton histoire", difficulty: "Moyen", slides: "8-12" },
  { id: "etude_de_cas", emoji: "📊", label: "Étude de cas cliente", desc: "Résultats concrets", difficulty: "Moyen", slides: "8-10" },
  { id: "checklist", emoji: "✅", label: "Checklist sauvegardable", desc: "Liste actionnable", difficulty: "Facile", slides: "6-8" },
  { id: "comparatif", emoji: "⚖️", label: "Comparatif A vs B", desc: "Deux options face à face", difficulty: "Facile", slides: "6-8" },
  { id: "before_after", emoji: "↔️", label: "Before / After", desc: "Transformation visible", difficulty: "Moyen", slides: "6-10" },
  { id: "promo", emoji: "🎁", label: "Promo / Offre", desc: "Présenter une offre", difficulty: "Moyen", slides: "6-8" },
  { id: "coulisses", emoji: "🎬", label: "Coulisses", desc: "Behind the scenes", difficulty: "Facile", slides: "5-10" },
  { id: "photo_dump", emoji: "📸", label: "Photo dump", desc: "Vibes et ambiance", difficulty: "Facile", slides: "5-10" },
];

const OBJECTIVES = [
  { id: "saves", emoji: "💾", label: "Engagement (saves)" },
  { id: "shares", emoji: "🔄", label: "Portée (partages)" },
  { id: "conversion", emoji: "💰", label: "Conversion (DM/clics)" },
  { id: "community", emoji: "💛", label: "Communauté (lien)" },
];

export { CAROUSEL_TYPES, OBJECTIVES };

// ── Step 1: Type + Subject (merged) ──
interface TypeSubjectStepProps {
  carouselType: string;
  onSelectType: (id: string) => void;
  objective: string;
  setObjective: (v: string) => void;
  subject: string;
  setSubject: (v: string) => void;
  selectedOffer: string;
  setSelectedOffer: (v: string) => void;
  offers: any[];
  topics: TopicSuggestion[];
  loadingTopics: boolean;
  onSuggestTopics: () => void;
  onNext: () => void;
  subjectPlaceholder: string;
  draftRestored: boolean;
  onDiscardDraft: () => void;
}

export function CarouselTypeSubjectStep({
  carouselType, onSelectType, objective, setObjective, subject, setSubject,
  selectedOffer, setSelectedOffer, offers,
  topics, loadingTopics, onSuggestTopics,
  onNext, subjectPlaceholder, draftRestored, onDiscardDraft,
}: TypeSubjectStepProps) {
  const typeObj = CAROUSEL_TYPES.find(t => t.id === carouselType);

  return (
    <>
      {draftRestored && (
        <DraftRestoredBanner onContinue={() => {}} onDiscard={onDiscardDraft} />
      )}

      {/* Type selection */}
      <h2 className="font-display text-xl font-bold text-foreground mb-1">🎠 Crée ton carrousel</h2>
      <p className="text-sm text-muted-foreground mb-4">Choisis le format, puis décris ton sujet.</p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        {CAROUSEL_TYPES.map((t) => (
          <button
            key={t.id}
            onClick={() => onSelectType(t.id)}
            className={`rounded-2xl border-2 p-4 text-left transition-all hover:border-primary hover:shadow-md group ${carouselType === t.id ? "border-primary bg-primary/5" : "border-border bg-card"}`}
          >
            <span className="text-2xl block mb-2">{t.emoji}</span>
            <p className="font-display font-bold text-sm text-foreground group-hover:text-primary transition-colors">{t.label}</p>
            <p className="text-[11px] text-muted-foreground mt-1 leading-tight">{t.desc}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{t.difficulty}</span>
              <span className="text-[10px] text-muted-foreground">{t.slides} slides</span>
            </div>
          </button>
        ))}
      </div>

      {/* Subject + Objective (shown once type is selected) */}
      {carouselType && (
        <div className="space-y-5 animate-fade-in border-t border-border pt-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">{typeObj?.emoji}</span>
            <span className="font-display font-bold text-foreground">{typeObj?.label}</span>
          </div>

          <div>
            <p className="text-sm font-semibold text-foreground mb-3">🎯 Objectif de ce carrousel</p>
            <div className="grid grid-cols-2 gap-2">
              {OBJECTIVES.map((obj) => (
                <button
                  key={obj.id}
                  onClick={() => setObjective(obj.id)}
                  className={`rounded-xl border-2 p-3 text-left transition-all ${objective === obj.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
                >
                  <span className="text-lg">{obj.emoji}</span>
                  <p className="text-sm font-medium text-foreground mt-1">{obj.label}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-foreground mb-2">📝 C'est quoi le sujet ?</p>
            <TextareaWithVoice
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={subjectPlaceholder}
              rows={2}
              className="min-h-[60px]"
            />
          </div>

          <div>
            <p className="text-sm font-semibold text-foreground mb-2">🎁 Tu veux mentionner une offre ?</p>
            <Select value={selectedOffer} onValueChange={setSelectedOffer}>
              <SelectTrigger className="rounded-[10px]">
                <SelectValue placeholder="Pas d'offre" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Pas d'offre</SelectItem>
                {offers.map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.name} {o.price_text ? `(${o.price_text})` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Inspiration */}
          <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground mb-2">💡 Besoin d'inspiration ?</p>
            <Button variant="outline" size="sm" onClick={onSuggestTopics} disabled={loadingTopics || !objective} className="rounded-full gap-1.5 text-xs">
              {loadingTopics ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Suggère-moi 5 sujets
            </Button>
            {topics.length > 0 && (
              <div className="mt-3 space-y-2">
                {topics.map((t, i) => (
                  <button
                    key={i}
                    onClick={() => setSubject(t.subject)}
                    className="w-full rounded-xl border border-border bg-card p-3 text-left hover:border-primary transition-colors"
                  >
                    <p className="text-sm font-medium text-foreground">{t.subject}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t.why_now}</p>
                    <p className="text-xs text-primary mt-0.5">Angle : {t.angle}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end">
            <Button onClick={onNext} disabled={!subject.trim() || !objective} className="rounded-full gap-1.5">
              Suivant <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

// ── Step 2: Deepening Questions ──
interface QuestionsStepProps {
  typeObj: CarouselType | undefined;
  questions: { question: string; placeholder: string }[];
  currentQuestion: number;
  deepeningAnswers: Record<string, string>;
  onAnswerChange: (key: string, value: string) => void;
  onPrevQuestion: () => void;
  onNextQuestion: () => void;
  onSkip: () => void;
  loadingQuestions?: boolean;
}

export function CarouselQuestionsStep({
  typeObj, questions, currentQuestion, deepeningAnswers,
  onAnswerChange, onPrevQuestion, onNextQuestion, onSkip,
  loadingQuestions,
}: QuestionsStepProps) {
  const q = questions[currentQuestion];
  const fieldKey = `q${currentQuestion + 1}`;
  const currentAnswer = deepeningAnswers[fieldKey] || "";

  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-display text-lg font-bold text-foreground flex items-center gap-2">
            💬 Quelques questions pour personnaliser
          </h2>
          <span className="text-xs text-muted-foreground font-mono">Étape 2/4</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {typeObj?.emoji} {typeObj?.label} · Pour que le contenu soit vraiment à toi.
        </p>
      </div>

      {loadingQuestions ? (
        <div className="flex flex-col items-center justify-center py-10 gap-3 animate-fade-in">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Je prépare des questions adaptées à ton sujet...</p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-1.5">
            {questions.map((_, i) => (
              <div key={i} className={`h-1.5 rounded-full flex-1 transition-colors ${i <= currentQuestion ? "bg-primary" : "bg-muted"}`} />
            ))}
            <span className="text-xs text-muted-foreground ml-2">Question {currentQuestion + 1}/{questions.length}</span>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold text-foreground leading-relaxed">
              🤔 {q?.question}
            </p>
            <div className="relative">
              <TextareaWithVoice
                value={currentAnswer}
                onChange={(e) => onAnswerChange(fieldKey, e.target.value)}
                placeholder={q?.placeholder || "Ta réponse..."}
                className="min-h-[100px]"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button variant="ghost" size="sm" onClick={onPrevQuestion} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> {currentQuestion > 0 ? "Précédent" : "Retour"}
            </Button>
            <Button onClick={onNextQuestion} className="rounded-full gap-1.5">
              {currentQuestion < questions.length - 1 ? (
                <>Suivant <ArrowRight className="h-4 w-4" /></>
              ) : (
                <>Générer le carrousel <Sparkles className="h-4 w-4" /></>
              )}
            </Button>
          </div>

          <div className="text-center pt-1">
            <button onClick={onSkip} className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5">
              <SkipForward className="h-3 w-3" /> Passer les questions, générer directement
            </button>
          </div>
        </>
      )}
    </div>
  );
}
