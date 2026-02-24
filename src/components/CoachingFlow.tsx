import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Loader2, ArrowRight, ArrowLeft, Check, Lightbulb, X, Sparkles, RotateCcw, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/error-messages";

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

const MAX_ADJUSTMENTS = 3;

type Phase = "intro" | "questions" | "diagnostic" | "adjust" | "done";

export default function CoachingFlow({ module, recId, conseil, onComplete, onSkip }: CoachingFlowProps) {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const [phase, setPhase] = useState<Phase>("intro");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [intro, setIntro] = useState("");
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<string[]>(["", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [diagnostic, setDiagnostic] = useState<DiagnosticResult | null>(null);
  const [editedProposals, setEditedProposals] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Iterative refinement state
  const [adjustmentFeedback, setAdjustmentFeedback] = useState("");
  const [iterationCount, setIterationCount] = useState(0);
  const [previousDiagnostics, setPreviousDiagnostics] = useState<Array<{ diagnostic: DiagnosticResult; feedback: string | null }>>([]);

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
      console.error("Erreur technique:", e);
      toast.error(friendlyError(e));
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
      setIterationCount(0);
      setPreviousDiagnostics([]);
      const edited: Record<string, string> = {};
      (data.proposals || []).forEach((p: Proposal) => { edited[p.field] = p.value; });
      setEditedProposals(edited);
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toast.error(friendlyError(e));
      setPhase("questions");
    } finally {
      setLoading(false);
    }
  };

  const handleAdjust = async () => {
    if (!adjustmentFeedback.trim() || !diagnostic) return;
    setLoading(true);
    setPhase("diagnostic");
    try {
      const answersPayload = questions.map((q, i) => ({
        question: q.question,
        answer: answers[i] || "",
      }));

      // Build history of previous iterations
      const history = previousDiagnostics.map(d => ({
        diagnostic: d.diagnostic.diagnostic,
        proposals: d.diagnostic.proposals,
        feedback: d.feedback,
      }));

      const { data, error } = await supabase.functions.invoke("coaching-module", {
        body: {
          phase: "adjust",
          module,
          answers: answersPayload,
          rec_id: recId,
          previous_diagnostic: {
            diagnostic: diagnostic.diagnostic,
            pourquoi: diagnostic.pourquoi,
            proposals: diagnostic.proposals,
          },
          adjustment_feedback: adjustmentFeedback,
          iteration_history: history,
          iteration: iterationCount + 1,
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      // Store previous diagnostic with feedback
      setPreviousDiagnostics(prev => [...prev, { diagnostic, feedback: adjustmentFeedback }]);
      setDiagnostic(data);
      setIterationCount(prev => prev + 1);
      setAdjustmentFeedback("");

      const edited: Record<string, string> = {};
      (data.proposals || []).forEach((p: Proposal) => { edited[p.field] = p.value; });
      setEditedProposals(edited);
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toast.error(friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = () => {
    if (iterationCount >= MAX_ADJUSTMENTS) {
      // Max reached — show message handled in UI
      return;
    }
    setPhase("adjust");
  };

  const handleRestartFresh = () => {
    setDiagnostic(null);
    setPreviousDiagnostics([]);
    setIterationCount(0);
    setAdjustmentFeedback("");
    setPhase("questions");
    setCurrentQ(0);
    setAnswers(new Array(questions.length).fill(""));
  };

  const handleValidate = async () => {
    if (!user || !diagnostic) return;
    setSaving(true);
    try {
      const updates: Record<string, string> = {};
      diagnostic.proposals.forEach(p => {
        updates[p.field] = editedProposals[p.field] || p.value;
      });

      if (module === "persona") {
        const { data: personaRow } = await (supabase.from("persona") as any)
          .select("id, portrait, portrait_prenom")
          .eq(column, value)
          .maybeSingle();

        const existingPortrait = (personaRow?.portrait as Record<string, any>) || {};
        const portraitUpdates: Record<string, any> = { ...existingPortrait };

        if (updates.prenom) portraitUpdates.prenom = updates.prenom;
        if (updates.phrase_signature) portraitUpdates.phrase_signature = updates.phrase_signature;
        if (updates.description) portraitUpdates.description = updates.description;

        if (updates.age || updates.metier || updates.situation || updates.ca || updates.temps_com) {
          portraitUpdates.qui_elle_est = { ...(existingPortrait.qui_elle_est || {}) };
          if (updates.age) portraitUpdates.qui_elle_est.age = updates.age;
          if (updates.metier) portraitUpdates.qui_elle_est.metier = updates.metier;
          if (updates.situation) portraitUpdates.qui_elle_est.situation = updates.situation;
          if (updates.ca) portraitUpdates.qui_elle_est.ca = updates.ca;
          if (updates.temps_com) portraitUpdates.qui_elle_est.temps_com = updates.temps_com;
        }

        if (updates.frustrations) {
          portraitUpdates.frustrations = updates.frustrations.split(/\n|·|•|-/).map((s: string) => s.trim()).filter(Boolean);
        }
        if (updates.desires || updates.objectifs) {
          const raw = updates.desires || updates.objectifs;
          portraitUpdates.objectifs = raw.split(/\n|·|•|-/).map((s: string) => s.trim()).filter(Boolean);
        }
        if (updates.ce_quelle_dit || updates.ses_mots) {
          const raw = updates.ce_quelle_dit || updates.ses_mots;
          portraitUpdates.ses_mots = raw.split(/\n|·|•|-|"/).map((s: string) => s.trim()).filter(Boolean);
        }
        if (updates.mots_resonnent) {
          portraitUpdates.ses_mots = updates.mots_resonnent.split(/,|·|•/).map((s: string) => s.trim()).filter(Boolean);
        }
        if (updates.mots_eviter) {
          portraitUpdates.comment_parler = { ...(existingPortrait.comment_parler || {}) };
          portraitUpdates.comment_parler.fuir = updates.mots_eviter.split(/,|·|•/).map((s: string) => s.trim()).filter(Boolean);
        }
        if (updates.blocages) {
          portraitUpdates.blocages = updates.blocages.split(/\n|·|•|-/).map((s: string) => s.trim()).filter(Boolean);
        }

        const portraitPrenom = updates.prenom || portraitUpdates.prenom || personaRow?.portrait_prenom || "";

        if (personaRow) {
          const { error } = await supabase
            .from("persona")
            .update({ portrait: portraitUpdates as any, portrait_prenom: portraitPrenom })
            .eq("id", personaRow.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("persona")
            .insert({ user_id: user.id, portrait: portraitUpdates as any, portrait_prenom: portraitPrenom } as any);
          if (error) throw error;
        }
      } else {
        const tableMap: Record<string, string> = {
          offers: "offers",
          bio: "brand_profile",
          story: "storytelling",
          tone: "brand_profile",
          editorial: "brand_strategy",
          branding: "brand_profile",
        };
        const table = tableMap[module];
        if (table) {
          const { data: existing } = await supabase
            .from(table as any)
            .select("id")
            .eq(column, value)
            .maybeSingle();

          if (existing) {
            const { error } = await supabase.from(table as any).update(updates).eq(column, value);
            if (error) throw error;
          } else {
            const { error } = await supabase.from(table as any).insert({ ...updates, user_id: user.id });
            if (error) throw error;
          }
        }
      }

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
      console.error("COACHING SAVE ERROR:", e);
      toast.error(friendlyError(e));
    } finally {
      setSaving(false);
    }
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

      {/* Diagnostic loading */}
      {phase === "diagnostic" && loading && (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">
            {iterationCount > 0 ? "L'IA ajuste sa proposition…" : "L'IA analyse tes réponses…"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Ça prend quelques secondes.</p>
        </div>
      )}

      {/* Diagnostic result */}
      {phase === "diagnostic" && !loading && diagnostic && (
        <div className="space-y-4 animate-fade-in">
          {/* Iteration badge */}
          {iterationCount > 0 && (
            <div className="text-xs text-muted-foreground text-right">
              Ajustement {iterationCount}/{MAX_ADJUSTMENTS} · 1 crédit
            </div>
          )}

          {/* Diagnostic text */}
          <div className="rounded-2xl border border-primary/20 bg-card p-6 space-y-4">
            <h3 className="font-display font-bold text-foreground flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-primary" />
              {iterationCount > 0 ? "Proposition ajustée" : "Voilà ce que je te propose"}
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
            <p className="text-xs text-muted-foreground">Tu peux modifier directement avant de valider.</p>
            
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

            {iterationCount < MAX_ADJUSTMENTS ? (
              <Button variant="outline" onClick={handleRegenerate} className="w-full gap-1.5 text-xs">
                <RotateCcw className="h-3.5 w-3.5" /> Repropose-moi autre chose
              </Button>
            ) : (
              <div className="rounded-xl border border-border bg-muted/50 p-4 space-y-3 text-center">
                <p className="text-xs text-muted-foreground">
                  Tu as ajusté 3 fois. Tu peux modifier les textes directement ci-dessus, ou recommencer le coaching.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleRestartFresh} className="flex-1 text-xs gap-1.5">
                    <RotateCcw className="h-3.5 w-3.5" /> Recommencer depuis le début
                  </Button>
                  <Button variant="ghost" onClick={onSkip} className="flex-1 text-xs">
                    Mode formulaire
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Adjust phase — feedback input */}
      {phase === "adjust" && (
        <div className="space-y-4 animate-fade-in">
          {/* Show current diagnostic summary */}
          {diagnostic && (
            <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
              <h4 className="font-display font-bold text-sm text-foreground flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-primary" />
                Proposition actuelle
              </h4>
              <p className="text-sm text-muted-foreground leading-relaxed">{diagnostic.diagnostic}</p>
              <div className="space-y-1">
                {diagnostic.proposals.map(p => (
                  <div key={p.field} className="text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{p.label} :</span>{" "}
                    {(editedProposals[p.field] || p.value).slice(0, 80)}…
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Feedback input */}
          <div className="rounded-2xl border border-primary/20 bg-card p-6 space-y-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              <h4 className="font-display font-bold text-sm text-foreground">Tu veux ajuster ?</h4>
            </div>
            <p className="text-xs text-muted-foreground">
              Dis-moi ce qui ne va pas ou ce que tu veux changer :
            </p>
            <Textarea
              value={adjustmentFeedback}
              onChange={e => setAdjustmentFeedback(e.target.value)}
              placeholder={'Ex: "La cible est trop large" ou "Le ton est trop formel" ou "Ajoute un détail sur son quotidien"'}
              className="min-h-[100px] text-sm"
            />
            <div className="flex flex-col gap-2">
              <Button
                onClick={handleAdjust}
                disabled={!adjustmentFeedback.trim()}
                className="w-full gap-2"
              >
                <Sparkles className="h-4 w-4" />
                Ajuster la proposition
              </Button>
              <Button
                variant="ghost"
                onClick={() => setPhase("diagnostic")}
                className="w-full text-xs"
              >
                ✅ Finalement c'est bon, je valide
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
