import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Loader2, ArrowRight, ArrowLeft, Check, Lightbulb, X, Sparkles, RotateCcw } from "lucide-react";
import { toast } from "sonner";

interface CoachingFlowProps {
  module: string;
  recId?: string;
  conseil?: string;
  onComplete: () => void;
  onSkip: () => void;
}

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

type Phase = "intro" | "questions" | "diagnostic" | "done";

export default function CoachingFlow({ module, recId, conseil, onComplete, onSkip }: CoachingFlowProps) {
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>("intro");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [intro, setIntro] = useState("");
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<string[]>(["", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [diagnostic, setDiagnostic] = useState<DiagnosticResult | null>(null);
  const [editedProposals, setEditedProposals] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Load questions on mount
  useEffect(() => {
    loadQuestions();
  }, []);

  const loadQuestions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("coaching-module", {
        body: { phase: "questions", module, rec_id: recId },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setQuestions(data.questions || []);
      setIntro(data.intro || conseil || "");
      setAnswers(new Array(data.questions?.length || 4).fill(""));
    } catch (e: any) {
      toast.error(e.message || "Erreur de chargement");
    } finally {
      setLoading(false);
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
    setPhase("diagnostic");
    setLoading(true);
    try {
      const answersPayload = questions.map((q, i) => ({
        question: q.question,
        answer: answers[i] || "",
      }));
      const { data, error } = await supabase.functions.invoke("coaching-module", {
        body: { phase: "diagnostic", module, answers: answersPayload, rec_id: recId },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setDiagnostic(data);
      // Initialize edited proposals
      const edited: Record<string, string> = {};
      (data.proposals || []).forEach((p: Proposal) => { edited[p.field] = p.value; });
      setEditedProposals(edited);
    } catch (e: any) {
      toast.error(e.message || "Erreur lors de l'analyse");
      setPhase("questions");
    } finally {
      setLoading(false);
    }
  };

  const handleValidate = async () => {
    if (!user || !diagnostic) return;
    setSaving(true);
    try {
      // Save proposals to the appropriate branding table
      const updates: Record<string, string> = {};
      diagnostic.proposals.forEach(p => {
        updates[p.field] = editedProposals[p.field] || p.value;
      });

      // Determine which table to update based on module
      const tableMap: Record<string, string> = {
        persona: "persona",
        offers: "offers",
        bio: "brand_profile",
        story: "storytelling",
        tone: "brand_profile",
        editorial: "brand_strategy",
        branding: "brand_profile",
      };
      const table = tableMap[module];
      if (table) {
        // Check if record exists
        const { data: existing } = await supabase
          .from(table as any)
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (existing) {
          await supabase.from(table as any).update(updates).eq("user_id", user.id);
        } else {
          await supabase.from(table as any).insert({ ...updates, user_id: user.id });
        }
      }

      // Mark recommendation as completed
      if (recId) {
        await supabase
          .from("audit_recommendations")
          .update({ completed: true, completed_at: new Date().toISOString() })
          .eq("id", recId);
      }

      toast.success("✅ Mis à jour ! L'IA s'en souviendra pour tes prochains contenus.");
      setPhase("done");
      onComplete();
    } catch (e: any) {
      toast.error(e.message || "Erreur de sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerate = () => {
    setDiagnostic(null);
    setPhase("questions");
    setCurrentQ(0);
    setAnswers(new Array(questions.length).fill(""));
  };

  if (loading && phase === "intro") {
    return (
      <div className="rounded-2xl border border-primary/20 bg-[hsl(var(--rose-pale))] p-8 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Préparation du coaching…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header banner */}
      <div className="rounded-xl border border-primary/20 bg-[hsl(var(--rose-pale))] p-4 flex items-start gap-3">
        <Lightbulb className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">Coaching guidé · Recommandation de ton audit</p>
          <p className="text-xs text-muted-foreground mt-1">{conseil || intro}</p>
        </div>
        <button onClick={onSkip} className="text-muted-foreground hover:text-foreground shrink-0" title="Passer en mode formulaire">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Intro */}
      {phase === "intro" && questions.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-6 text-center space-y-4 animate-fade-in">
          <p className="text-sm text-muted-foreground leading-relaxed">
            {intro || "Avant de modifier quoi que ce soit, on va creuser ensemble pour trouver la meilleure approche."}
          </p>
          <Button onClick={() => setPhase("questions")} className="gap-2">
            C'est parti <ArrowRight className="h-4 w-4" />
          </Button>
          <div>
            <button onClick={onSkip} className="text-xs text-muted-foreground hover:text-foreground underline">
              Je préfère remplir moi-même
            </button>
          </div>
        </div>
      )}

      {/* Questions */}
      {phase === "questions" && questions.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-6 space-y-5 animate-fade-in" key={currentQ}>
          {/* Progress */}
          <div className="flex items-center gap-2">
            <div className="flex gap-1 flex-1">
              {questions.map((_, i) => (
                <div key={i} className={`h-1.5 rounded-full flex-1 transition-colors ${
                  i < currentQ ? "bg-primary" : i === currentQ ? "bg-primary/60" : "bg-muted"
                }`} />
              ))}
            </div>
            <span className="text-xs text-muted-foreground font-mono">
              Question {currentQ + 1}/{questions.length}
            </span>
          </div>

          {/* Question */}
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

          {/* Navigation */}
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

      {/* Diagnostic loading */}
      {phase === "diagnostic" && loading && (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">L'IA analyse tes réponses…</p>
          <p className="text-xs text-muted-foreground mt-1">Ça prend quelques secondes.</p>
        </div>
      )}

      {/* Diagnostic result */}
      {phase === "diagnostic" && !loading && diagnostic && (
        <div className="space-y-4 animate-fade-in">
          {/* Diagnostic text */}
          <div className="rounded-2xl border border-primary/20 bg-card p-6 space-y-4">
            <h3 className="font-display font-bold text-foreground flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-primary" />
              Voilà ce que je te propose
            </h3>
            <p className="text-sm text-foreground leading-relaxed">{diagnostic.diagnostic}</p>
            
            {diagnostic.pourquoi && (
              <div className="text-sm text-muted-foreground italic leading-relaxed">
                {diagnostic.pourquoi}
              </div>
            )}

            {diagnostic.consequences?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-foreground mb-2">Ce que ça change concrètement :</p>
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

          {/* Editable proposals */}
          <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
            <h4 className="font-display font-bold text-sm text-foreground">Proposition de textes</h4>
            <p className="text-xs text-muted-foreground">Tu peux modifier avant de valider.</p>
            
            {diagnostic.proposals.map((p) => (
              <div key={p.field}>
                <label className="text-xs font-semibold text-foreground mb-1.5 block">{p.label}</label>
                <Textarea
                  value={editedProposals[p.field] || p.value}
                  onChange={(e) => setEditedProposals(prev => ({ ...prev, [p.field]: e.target.value }))}
                  className="min-h-[80px] text-sm"
                />
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <Button onClick={handleValidate} disabled={saving} className="w-full gap-2" size="lg">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Valider et mettre à jour mon branding
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleRegenerate} className="flex-1 gap-1.5 text-xs">
                <RotateCcw className="h-3.5 w-3.5" /> Reproposer
              </Button>
              <Button variant="ghost" onClick={onSkip} className="flex-1 text-xs">
                Passer en mode formulaire
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
