import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Loader2, ArrowRight, ArrowLeft, Check, Lightbulb, Sparkles, RotateCcw, Copy } from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNavigate } from "react-router-dom";

type ModuleKey = "bio" | "feed" | "epingles" | "alaune" | "nom_edito";

interface ModuleDef {
  key: ModuleKey;
  emoji: string;
  label: string;
  scoreField: string;
}

const MODULES: ModuleDef[] = [
  { key: "bio", emoji: "📝", label: "Bio", scoreField: "score_bio" },
  { key: "feed", emoji: "🎨", label: "Feed", scoreField: "score_feed" },
  { key: "epingles", emoji: "📌", label: "Épinglés", scoreField: "score_epingles" },
  { key: "alaune", emoji: "⭐", label: "À la une", scoreField: "score_stories" },
  { key: "nom_edito", emoji: "✏️", label: "Nom & Édito", scoreField: "score_edito" },
];

interface Question {
  numero: number;
  question: string;
  placeholder: string;
}

interface Proposal {
  label: string;
  field: string;
  value: string;
}

interface DiagnosticResult {
  diagnostic: string;
  pourquoi: string;
  consequences: string[];
  proposals: Proposal[];
}

type Phase = "loading" | "intro" | "questions" | "generating" | "diagnostic" | "done";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialModule?: ModuleKey;
  auditScores?: Record<string, number | null>;
}

export default function InstagramProfileCoaching({ open, onOpenChange, initialModule, auditScores }: Props) {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [activeModule, setActiveModule] = useState<ModuleKey>(initialModule || "bio");
  const [phase, setPhase] = useState<Phase>("loading");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [intro, setIntro] = useState("");
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [diagnostic, setDiagnostic] = useState<DiagnosticResult | null>(null);
  const [editedProposals, setEditedProposals] = useState<Record<string, string>>({});

  // Find weakest module for "Recommandé" badge
  const weakestModule = auditScores
    ? MODULES.reduce((best, m) => {
        const score = auditScores[m.scoreField];
        const bestScore = auditScores[best.scoreField];
        if (score == null) return best;
        if (bestScore == null) return m;
        return score < bestScore ? m : best;
      }, MODULES[0]).key
    : null;

  useEffect(() => {
    if (open) {
      setActiveModule(initialModule || "bio");
      resetAndLoad(initialModule || "bio");
    }
  }, [open]);

  const resetAndLoad = (mod: ModuleKey) => {
    setPhase("loading");
    setCurrentQ(0);
    setAnswers([]);
    setDiagnostic(null);
    setEditedProposals({});
    loadQuestions(mod);
  };

  const handleModuleSwitch = (mod: ModuleKey) => {
    setActiveModule(mod);
    resetAndLoad(mod);
  };

  const loadQuestions = async (mod: ModuleKey) => {
    try {
      const { data, error } = await supabase.functions.invoke("instagram-profile-coaching", {
        body: { phase: "questions", module: mod },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setQuestions(data.questions || []);
      setIntro(data.intro || "");
      setAnswers(new Array(data.questions?.length || 3).fill(""));
      setPhase("intro");
    } catch (e: any) {
      toast.error(e.message || "Erreur de chargement");
      setPhase("intro");
    }
  };

  const handleNextQuestion = () => {
    if (currentQ < questions.length - 1) {
      setCurrentQ(currentQ + 1);
    } else {
      generateDiagnostic();
    }
  };

  const generateDiagnostic = async () => {
    setPhase("generating");
    try {
      const answersPayload = questions.map((q, i) => ({
        question: q.question,
        answer: answers[i] || "",
      }));
      const { data, error } = await supabase.functions.invoke("instagram-profile-coaching", {
        body: { phase: "diagnostic", module: activeModule, answers: answersPayload },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setDiagnostic(data);
      const edited: Record<string, string> = {};
      (data.proposals || []).forEach((p: Proposal) => { edited[p.field] = p.value; });
      setEditedProposals(edited);
      setPhase("diagnostic");
    } catch (e: any) {
      toast.error(e.message || "Erreur lors de l'analyse");
      setPhase("questions");
    }
  };

  const handleApplyBio = async (bioText: string) => {
    if (!user) return;
    try {
      const { data: existing } = await (supabase.from("profiles") as any)
        .select("id").eq("user_id", user.id).maybeSingle();
      if (existing) {
        await (supabase.from("profiles") as any).update({ validated_bio: bioText }).eq("user_id", user.id);
      }
      toast.success("Bio sauvegardée ! Retrouve-la dans ton espace Bio.");
      onOpenChange(false);
      navigate("/instagram/profil/bio");
    } catch {
      toast.error("Erreur lors de la sauvegarde");
    }
  };

  const handleCopyProposal = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copié !");
  };

  const handleRestart = () => {
    resetAndLoad(activeModule);
  };

  const currentModuleDef = MODULES.find(m => m.key === activeModule) || MODULES[0];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={`${isMobile ? "h-[95vh] rounded-t-2xl" : "w-[500px] sm:w-[540px] sm:max-w-[50vw]"} overflow-y-auto p-0`}
      >
        {/* Header with module tabs */}
        <div className="sticky top-0 z-10 bg-[hsl(var(--rose-pale))] border-b border-primary/10">
          <SheetHeader className="px-6 pt-4 pb-2 space-y-1">
            <SheetTitle className="flex items-center gap-2 text-base font-display">
              <Lightbulb className="h-5 w-5 text-primary" />
              Coaching profil Instagram
            </SheetTitle>
            <SheetDescription className="sr-only">Coaching IA pour optimiser ton profil Instagram</SheetDescription>
          </SheetHeader>

          {/* Module tabs */}
          <div className="flex gap-1 px-4 pb-3 overflow-x-auto">
            {MODULES.map((m) => {
              const score = auditScores?.[m.scoreField];
              const isActive = activeModule === m.key;
              const isWeakest = weakestModule === m.key;
              return (
                <button
                  key={m.key}
                  onClick={() => phase !== "generating" && handleModuleSwitch(m.key)}
                  className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "bg-card border border-border text-muted-foreground hover:border-primary hover:text-foreground"
                  }`}
                >
                  <span>{m.emoji}</span>
                  <span>{m.label}</span>
                  {score != null && (
                    <span className={`text-[10px] font-mono ${isActive ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                      {score}/20
                    </span>
                  )}
                  {isWeakest && !isActive && (
                    <span className="absolute -top-1.5 -right-1 text-[9px] bg-primary text-primary-foreground px-1 rounded-full">
                      ✨
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Progress bar in questions phase */}
          {phase === "questions" && questions.length > 0 && (
            <div className="flex items-center gap-2 px-6 pb-3">
              <div className="flex gap-1 flex-1">
                {questions.map((_, i) => (
                  <div key={i} className={`h-1.5 rounded-full flex-1 transition-colors ${
                    i < currentQ ? "bg-primary" : i === currentQ ? "bg-primary/60" : "bg-muted"
                  }`} />
                ))}
              </div>
              <span className="text-xs text-muted-foreground font-mono">
                {currentQ + 1}/{questions.length}
              </span>
            </div>
          )}
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Loading */}
          {phase === "loading" && (
            <div className="py-12 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Préparation du coaching {currentModuleDef.emoji} {currentModuleDef.label}…</p>
            </div>
          )}

          {/* Intro */}
          {phase === "intro" && (
            <div className="space-y-5 animate-fade-in">
              <div className="rounded-xl border border-primary/20 bg-[hsl(var(--rose-pale))] p-4">
                <p className="text-sm font-medium text-foreground mb-1">{currentModuleDef.emoji} {currentModuleDef.label}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {intro || `On va optimiser ensemble ta section ${currentModuleDef.label}. Quelques questions pour comprendre ta situation, puis l'IA te fait des propositions concrètes.`}
                </p>
              </div>
              <Button onClick={() => setPhase("questions")} className="w-full gap-2">
                C'est parti <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Questions */}
          {phase === "questions" && questions.length > 0 && (
            <div className="space-y-5 animate-fade-in" key={`${activeModule}-${currentQ}`}>
              <div>
                <p className="text-sm font-medium text-foreground leading-relaxed mb-4">
                  🤔 {questions[currentQ].question}
                </p>
                <Textarea
                  value={answers[currentQ]}
                  onChange={(e) => {
                    const newAnswers = [...answers];
                    newAnswers[currentQ] = e.target.value;
                    setAnswers(newAnswers);
                  }}
                  placeholder={questions[currentQ].placeholder || "Ta réponse…"}
                  className="min-h-[120px]"
                />
              </div>
              <div className="flex justify-between">
                <Button variant="ghost" size="sm" onClick={() => setCurrentQ(Math.max(0, currentQ - 1))} disabled={currentQ === 0} className="gap-1">
                  <ArrowLeft className="h-3.5 w-3.5" /> Précédent
                </Button>
                <Button size="sm" onClick={handleNextQuestion} disabled={!answers[currentQ]?.trim()} className="gap-1">
                  {currentQ < questions.length - 1 ? (
                    <>Suivant <ArrowRight className="h-3.5 w-3.5" /></>
                  ) : (
                    <>Analyser <Sparkles className="h-3.5 w-3.5" /></>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Generating */}
          {phase === "generating" && (
            <div className="py-12 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground">L'IA analyse tes réponses…</p>
              <p className="text-xs text-muted-foreground mt-1">Ça prend quelques secondes.</p>
            </div>
          )}

          {/* Diagnostic */}
          {phase === "diagnostic" && diagnostic && (
            <div className="space-y-5 animate-fade-in">
              <div className="rounded-xl border border-primary/20 bg-[hsl(var(--rose-pale))] p-5 space-y-3">
                <h3 className="font-display font-bold text-foreground flex items-center gap-2 text-sm">
                  <Lightbulb className="h-4 w-4 text-primary" />
                  Voilà ce que je te propose
                </h3>
                <p className="text-sm text-foreground leading-relaxed">{diagnostic.diagnostic}</p>
                {diagnostic.pourquoi && (
                  <p className="text-sm text-muted-foreground italic leading-relaxed">{diagnostic.pourquoi}</p>
                )}
                {diagnostic.consequences?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-foreground mb-1.5">Ce que ça change :</p>
                    <ul className="space-y-1">
                      {diagnostic.consequences.map((c, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                          <span className="text-primary mt-0.5">·</span> {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Proposals */}
              <div className="space-y-4">
                <h4 className="font-display font-bold text-sm text-foreground">Propositions</h4>
                {diagnostic.proposals.map((p) => (
                  <div key={p.field} className="rounded-xl border border-border bg-card p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-foreground">{p.label}</label>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs gap-1"
                          onClick={() => handleCopyProposal(editedProposals[p.field] || p.value)}
                        >
                          <Copy className="h-3 w-3" /> Copier
                        </Button>
                        {activeModule === "bio" && p.field.startsWith("bio_option") && (
                          <Button
                            size="sm"
                            className="h-7 px-2 text-xs gap-1"
                            onClick={() => handleApplyBio(editedProposals[p.field] || p.value)}
                          >
                            <Check className="h-3 w-3" /> Appliquer
                          </Button>
                        )}
                      </div>
                    </div>
                    <Textarea
                      value={editedProposals[p.field] || p.value}
                      onChange={(e) => setEditedProposals(prev => ({ ...prev, [p.field]: e.target.value }))}
                      className="min-h-[70px] text-sm"
                    />
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="space-y-2 pt-2">
                <Button variant="outline" onClick={handleRestart} className="w-full gap-1.5 text-xs">
                  <RotateCcw className="h-3.5 w-3.5" /> Recommencer ce module
                </Button>
                <Button onClick={() => { setPhase("done"); }} className="w-full gap-2">
                  <Check className="h-4 w-4" /> Terminé
                </Button>
              </div>
            </div>
          )}

          {/* Done */}
          {phase === "done" && (
            <div className="py-12 text-center animate-fade-in">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                <Check className="h-8 w-8 text-emerald-600" />
              </div>
              <p className="text-base font-display font-bold text-foreground">
                {currentModuleDef.emoji} {currentModuleDef.label} terminé !
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Copie les propositions qui te parlent et applique-les sur ton profil.
              </p>
              <div className="flex gap-2 mt-6">
                {MODULES.filter(m => m.key !== activeModule).slice(0, 2).map(m => (
                  <Button key={m.key} variant="outline" size="sm" onClick={() => handleModuleSwitch(m.key)} className="flex-1 text-xs gap-1">
                    {m.emoji} {m.label}
                  </Button>
                ))}
              </div>
              <Button variant="ghost" className="mt-3 text-xs" onClick={() => onOpenChange(false)}>
                Fermer
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
