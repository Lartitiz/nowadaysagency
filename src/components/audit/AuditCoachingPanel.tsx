import { collectCoachingProposals, proposalEditKey } from "@/lib/coaching-proposals";
import CoachingTarget from "@/components/branding/CoachingTarget";
import { saveOfferInsights } from "@/lib/offer-coaching-persistence";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceReady, useWorkspaceFilter, useWorkspaceId, useProfileUserId } from "@/hooks/use-workspace-query";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  Loader2, ArrowRight, ArrowLeft, Check, Lightbulb, Sparkles, RotateCcw, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNavigate } from "react-router-dom";
import { friendlyError } from "@/lib/error-messages";

interface AuditCoachingPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  module: string;
  pillarKey: string;
  pillarLabel: string;
  pillarEmoji: string;
  recId?: string;
  offerId?: string;
  personaId?: string;
  conseil?: string;
  onComplete: () => void;
  onSkipToModule: (route: string) => void;
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

type Phase = "loading" | "intro" | "questions" | "generating" | "diagnostic" | "saving" | "done";

const MODULE_SKIP_ROUTES: Record<string, string> = {
  persona: "/branding#cible",
  offers: "/branding#offres",
  bio: "/instagram",
  story: "/branding#storytelling",
  tone: "/branding#ton",
  editorial: "/branding#strategie",
  branding: "/branding",
};

const ACTION_ROUTES: Record<string, { label: string; route: string; emoji: string }> = {
  bio: { label: "Réécrire ma bio maintenant", route: "/instagram/profil/bio", emoji: "✍️" },
  story: { label: "Retravailler mon storytelling", route: "/branding/section?section=story", emoji: "📖" },
  persona: { label: "Affiner ma cible", route: "/branding/section?section=persona", emoji: "👩‍💻" },
  tone: { label: "Redéfinir mon ton", route: "/branding/section?section=tone_style", emoji: "🎨" },
  editorial: { label: "Revoir ma ligne éditoriale", route: "/branding/section?section=content_strategy", emoji: "🍒" },
  offers: { label: "Reformuler mes offres", route: "/branding/offres", emoji: "🎁" },
  branding: { label: "Compléter mon branding", route: "/branding", emoji: "💎" },
};

export default function AuditCoachingPanel(props: AuditCoachingPanelProps) {
  const { column, value } = useWorkspaceFilter();
  const ready = useWorkspaceReady();
  if (!ready) return <p className="p-6 text-sm">Chargement de l'espace…</p>;
  const scope = `${column}:${value}:${props.module}:${props.recId || ""}`;
  if (!props.open) return null;
  if (props.module === "offers" || props.module === "persona") {
    return <CoachingTarget kind={props.module} id={props.module === "offers" ? props.offerId : props.personaId}
      renderChoice={choice => <Sheet open={props.open} onOpenChange={props.onOpenChange}>
        <SheetContent><SheetHeader><SheetTitle>Choisir une fiche</SheetTitle><SheetDescription>Choisis la fiche à travailler dans cet espace.</SheetDescription></SheetHeader>{choice}</SheetContent>
      </Sheet>}>
      {id => <AuditCoachingPanelInner key={`${scope}:${id}`} {...props} {...(props.module === "offers" ? { offerId: id } : { personaId: id })} />}
    </CoachingTarget>;
  }
  return <AuditCoachingPanelInner key={scope} {...props} />;
}

function AuditCoachingPanelInner({
  open, onOpenChange, module, pillarKey, pillarLabel, pillarEmoji,
  offerId, personaId, recId, conseil, onComplete, onSkipToModule,
}: AuditCoachingPanelProps) {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const profileUserId = useProfileUserId();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("loading");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [intro, setIntro] = useState("");
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [diagnostic, setDiagnostic] = useState<DiagnosticResult | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, number>>({});
  const [editedProposals, setEditedProposals] = useState<Record<string, string>>({});

  // Reset state when panel opens
  useEffect(() => {
    if (open) {
      setPhase("loading");
      setCurrentQ(0);
      setAnswers([]);
      setDiagnostic(null);
      setEditedProposals({});
      loadQuestions();
    }
  }, [open, module]);

  const loadQuestions = async () => {
    try {
      const { data, error } = await invokeWithTimeout("coaching-module", {
        body: { phase: "questions", module, rec_id: recId, offer_id: offerId, persona_id: personaId, workspace_id: column === "workspace_id" ? workspaceId : undefined },
      }, 60000);
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setQuestions(data.questions || []);
      setIntro(data.intro || conseil || "");
      setAnswers(new Array(data.questions?.length || 4).fill(""));
      setPhase("intro");
    } catch (e: any) {
      toast.error(friendlyError(e));
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
      const { data, error } = await invokeWithTimeout("coaching-module", {
        body: { phase: "diagnostic", module, answers: answersPayload, rec_id: recId, offer_id: offerId, persona_id: personaId, workspace_id: column === "workspace_id" ? workspaceId : undefined },
      }, 90000);
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setDiagnostic(data);
      const edited: Record<string, string> = {};
      (data.proposals || []).forEach((p: Proposal, i: number) => { edited[proposalEditKey(p, i)] = p.value; });
      setEditedProposals(edited);
      setSelectedVariants({});
      setPhase("diagnostic");
    } catch (e: any) {
      toast.error(friendlyError(e));
      setPhase("questions");
    }
  };

  const handleValidate = async () => {
    if (!user || !diagnostic) return;
    setPhase("saving");
    try {
      const updates = collectCoachingProposals(diagnostic.proposals, editedProposals, selectedVariants);

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
      if (module === "offers") {
        await saveOfferInsights(updates, { column, value }, offerId);
      } else if (table) {
        const { data: existing, error: readError } = await (supabase.from(table as any) as any)
          .select("id")
          .eq(column, value)
          .match(module === "persona" ? { id: personaId } : {})
          .maybeSingle();
        if (readError) throw readError;
        if (module === "persona" && !existing) throw new Error("Public introuvable");

        if (existing) {
          const { error } = await (supabase.from(table as any) as any).update(updates).eq("id", existing.id).eq(column, value);
          if (error) throw error;
        } else {
          const { error } = await supabase.from(table as any).insert({ ...updates, user_id: profileUserId, workspace_id: workspaceId !== profileUserId ? workspaceId : undefined });
          if (error) throw error;
        }
      }

      // Mark recommendation as completed
      if (!alive.current) return;
      if (recId) {
        const { error: recError } = await supabase
          .from("audit_recommendations")
          .update({ completed: true, completed_at: new Date().toISOString() })
          .eq("id", recId);
        if (recError) throw recError;
      }

      if (!alive.current) return;
      setPhase("done");
      toast.success("✅ Mis à jour !");
      setTimeout(() => {
        if (!alive.current) return;
        onOpenChange(false);
        onComplete();
      }, 1500);
    } catch (e: any) {
      toast.error(friendlyError(e));
      setPhase("diagnostic");
    }
  };

  const handleRegenerate = () => {
    setDiagnostic(null);
    setPhase("questions");
    setCurrentQ(0);
    setAnswers(new Array(questions.length).fill(""));
  };

  const skipRoute = MODULE_SKIP_ROUTES[module] || "/branding";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={`${isMobile ? "h-[95vh] rounded-t-2xl" : "w-[480px] sm:w-[520px] sm:max-w-[50vw]"} overflow-y-auto p-0`}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[hsl(var(--rose-pale))] border-b border-primary/10 px-6 py-4">
          <SheetHeader className="space-y-1">
            <SheetTitle className="flex items-center gap-2 text-base font-body font-semibold">
              <Lightbulb className="h-5 w-5 text-primary" />
              Coaching · {pillarEmoji} {pillarLabel}
            </SheetTitle>
            <SheetDescription className="sr-only">Session de coaching interactif sur ce pilier</SheetDescription>
            {phase === "questions" && questions.length > 0 && (
              <div className="flex items-center gap-2 mt-2">
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
          </SheetHeader>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Loading */}
          {phase === "loading" && (
            <div className="py-12 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Préparation du coaching…</p>
            </div>
          )}

          {/* Intro */}
          {phase === "intro" && (
            <div className="space-y-5 animate-fade-in">
              <p className="text-sm text-muted-foreground leading-relaxed">
                {intro || "Avant de modifier quoi que ce soit, on va creuser ensemble pour trouver la meilleure approche."}
              </p>
              <Button onClick={() => setPhase("questions")} className="w-full gap-2">
                C'est parti <ArrowRight className="h-4 w-4" />
              </Button>
              <button
                onClick={() => { onOpenChange(false); onSkipToModule(skipRoute); }}
                className="w-full text-xs text-muted-foreground hover:text-foreground underline text-center"
              >
                Je préfère modifier moi-même →
              </button>
            </div>
          )}

          {/* Questions */}
          {phase === "questions" && questions.length > 0 && (
            <div className="space-y-5 animate-fade-in" key={currentQ}>
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
              <p className="text-sm font-medium text-foreground">L'assistant analyse tes réponses…</p>
              <p className="text-xs text-muted-foreground mt-1">Ça prend quelques secondes.</p>
            </div>
          )}

          {/* Diagnostic */}
          {phase === "diagnostic" && diagnostic && (
            <div className="space-y-5 animate-fade-in">
              <div className="rounded-xl border border-primary/20 bg-[hsl(var(--rose-pale))] p-5 space-y-3">
                <h3 className="font-body font-bold text-foreground flex items-center gap-2 text-sm">
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

              {/* Editable proposals */}
              <div className="space-y-4">
                <h4 className="font-body font-bold text-sm text-foreground">Proposition de textes</h4>
                <p className="text-xs text-muted-foreground">Tu peux modifier avant de valider.</p>
                {diagnostic.proposals.map((p, i) => (
                  <div key={proposalEditKey(p, i)}>
                    <label className="text-xs font-semibold text-foreground mb-1.5 block">{p.label}</label>
                    {diagnostic.proposals.filter(other => other.field === p.field).length > 1 && <label className="block text-xs my-2">
                      <input type="radio" name={`variant-${p.field}`} checked={selectedVariants[p.field] === i} onChange={() => setSelectedVariants(prev => ({ ...prev, [p.field]: i }))} /> Utiliser cette version
                    </label>}
                    <Textarea
                      value={editedProposals[proposalEditKey(p, i)] ?? p.value}
                      onChange={(e) => setEditedProposals(prev => ({ ...prev, [proposalEditKey(p, i)]: e.target.value }))}
                      className="min-h-[80px] text-sm"
                    />
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="space-y-2 pt-2">
                <Button onClick={handleValidate} className="w-full gap-2" size="lg">
                  <Check className="h-4 w-4" />
                  Valider et mettre à jour
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleRegenerate} className="flex-1 gap-1.5 text-xs">
                    <RotateCcw className="h-3.5 w-3.5" /> Reproposer
                  </Button>
                  <Button variant="ghost" onClick={() => { onOpenChange(false); onSkipToModule(skipRoute); }} className="flex-1 text-xs">
                    Modifier moi-même
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Saving */}
          {phase === "saving" && (
            <div className="py-12 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground">Mise à jour en cours…</p>
            </div>
          )}

          {/* Done */}
          {phase === "done" && (
            <div className="py-12 text-center animate-fade-in">
              <div className="w-16 h-16 rounded-full bg-success-bg flex items-center justify-center mx-auto mb-4">
                <Check className="h-8 w-8 text-success" />
              </div>
              <p className="text-base font-body font-bold text-foreground">
                {pillarEmoji} {pillarLabel} mis à jour !
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                L'IA s'en souviendra pour tes prochains contenus.
              </p>
              {ACTION_ROUTES[module] && (
                <Button
                  onClick={() => {
                    onOpenChange(false);
                    navigate(ACTION_ROUTES[module].route);
                  }}
                  className="w-full gap-2 mt-6"
                  size="lg"
                >
                  {ACTION_ROUTES[module].emoji} {ACTION_ROUTES[module].label} →
                </Button>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
