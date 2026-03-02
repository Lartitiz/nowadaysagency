import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useLocation } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import CreerStepIdea from "@/components/creer/CreerStepIdea";
import CreerStepFormat from "@/components/creer/CreerStepFormat";
import CreerStepQuestions from "@/components/creer/CreerStepQuestions";
import CreerStepResult from "@/components/creer/CreerStepResult";
import CreerStepEdit from "@/components/creer/CreerStepEdit";
import CreerTransformTab from "@/components/creer/CreerTransformTab";
import { useContentGenerator } from "@/hooks/use-content-generator";
import { CONTENT_STRUCTURES, getStructureForCombo } from "@/lib/content-structures";
import { useAuth } from "@/contexts/AuthContext";

type Step = "idea" | "format" | "questions" | "result" | "edit";
type Mode = "create" | "transform";

export default function CreerUnifie() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const { session } = useAuth();

  // URL params
  const paramFormat = searchParams.get("format");
  const paramSujet = searchParams.get("sujet") || searchParams.get("subject") || "";
  const paramObjectif = searchParams.get("objectif") || searchParams.get("objective") || "";
  const paramMode = searchParams.get("mode");
  const paramFrom = searchParams.get("from");

  // Location state (from calendar, etc.)
  const locState = (location.state as any) || {};

  // Core state
  const [mode, setMode] = useState<Mode>(paramMode === "transform" ? "transform" : "create");
  const [step, setStep] = useState<Step>("idea");
  const [ideaText, setIdeaText] = useState(paramSujet || locState.sujet || locState.subject || "");
  const [objective, setObjective] = useState<string | null>(
    paramObjectif || locState.objectif || locState.objective || null
  );
  const [selectedFormat, setSelectedFormat] = useState<string | null>(paramFormat || null);
  const [editorialAngle, setEditorialAngle] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [editContent, setEditContent] = useState("");

  // Launch sequence state
  const [launchResults, setLaunchResults] = useState<any[]>([]);
  const [launchIndex, setLaunchIndex] = useState(0);
  const [launchGenerating, setLaunchGenerating] = useState(false);

  const {
    generate,
    generating,
    result,
    error,
    reset: resetGenerator,
    generateQuestions,
    loadingQuestions,
    questions,
  } = useContentGenerator();

  // Pre-fill from URL/state & auto-advance
  // Uses location.search so it re-runs when navigating to /creer with new params
  // (e.g. from coaching dialog while already on /creer)
  useEffect(() => {
    const subject = paramSujet || locState.sujet || locState.subject || "";
    const obj = paramObjectif || locState.objectif || locState.objective || null;

    // Sync state from URL params (needed when component doesn't remount)
    if (subject) setIdeaText(subject);
    if (obj) setObjective(obj);
    if (paramFormat) setSelectedFormat(paramFormat);

    if (paramFormat && subject.trim()) {
      // Both format AND subject provided — pass subject directly to avoid stale state
      handleFormatNext(paramFormat, undefined, subject);
    } else if (locState.fromCalendar && subject) {
      setStep("format");
    } else if (paramFormat) {
      setStep("format");
    } else {
      // No params — reset to step 1 (handles back-navigation)
      setStep("idea");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  // Show error
  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  // ── Step handlers ──

  // Callback from coaching dialog (when already on /creer)
  const handleCoachingSelect = useCallback(async (data: { subject: string; format: string; objective: string }) => {
    // Reset content state (but NOT the generator loading states)
    setAnswers({});
    setEditorialAngle(null);
    setEditContent("");
    setLaunchResults([]);
    
    // Set new values
    setIdeaText(data.subject);
    if (data.objective) setObjective(data.objective);
    setSelectedFormat(data.format);
    setStep("questions");
    
    // Generate questions with the subject directly (not from state which may not be updated yet)
    await generateQuestions({ format: data.format, subject: data.subject, editorialAngle: undefined });
  }, [generateQuestions]);

  const handleIdeaNext = (idea: string, obj?: string) => {
    setIdeaText(idea);
    setObjective(obj || null);
    setStep("format");
  };

  const handleFormatNext = async (format: string, angle?: string, overrideSubject?: string) => {
    setSelectedFormat(format);
    setEditorialAngle(angle || null);

    const subjectToUse = overrideSubject || ideaText;

    // Special launch mode
    if (angle === "lancement") {
      setStep("result");
      await handleLaunchSequence(format, angle);
      return;
    }

    // Load questions
    setStep("questions");
    await generateQuestions({ format, subject: subjectToUse, editorialAngle: angle });
  };

  const handleQuestionsNext = async (ans: Record<string, string>) => {
    setAnswers(ans);
    setStep("result");
    await doGenerate(ans);
  };

  const handleSkipQuestions = async () => {
    setAnswers({});
    setStep("result");
    await doGenerate({});
  };

  const doGenerate = async (ans: Record<string, string>) => {
    if (!selectedFormat) return;
    await generate({
      format: selectedFormat as any,
      subject: ideaText,
      objective: objective || undefined,
      editorialAngle: editorialAngle || undefined,
      answers: Object.keys(ans).length > 0 ? ans : undefined,
    });
  };

  const handleRegenerate = async () => {
    await doGenerate(answers);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copié !");
  };

  const handleEdit = () => {
    // Extract text content from result for editing
    const r = result?.raw || result;
    let text = "";
    if (r?.content) text = r.content;
    else if (r?.post) text = r.post;
    else if (r?.text) text = r.text;
    else if (r?.hook && r?.body) text = [r.hook, r.body, r.cta].filter(Boolean).join("\n\n");
    else text = JSON.stringify(r, null, 2);
    setEditContent(text);
    setStep("edit");
  };

  const handleReset = () => {
    resetGenerator();
    setStep("idea");
    setIdeaText("");
    setObjective(null);
    setSelectedFormat(null);
    setEditorialAngle(null);
    setAnswers({});
    setEditContent("");
    setLaunchResults([]);
    setLaunchIndex(0);
  };

  // ── Launch sequence (5 chapters) ──

  const handleLaunchSequence = async (format: string, angle: string) => {
    const structureId = getStructureForCombo(format, angle);
    const structure = CONTENT_STRUCTURES[structureId];
    if (!structure) return;

    setLaunchGenerating(true);
    setLaunchResults([]);
    const chapters = 5;
    const results: any[] = [];

    for (let i = 0; i < chapters; i++) {
      setLaunchIndex(i);
      const chapterSubject = `${ideaText} — Chapitre ${i + 1}/${chapters}`;
      const res = await generate({
        format: format as any,
        subject: chapterSubject,
        objective: objective || undefined,
        editorialAngle: angle,
      });
      results.push(res);
    }

    setLaunchResults(results);
    setLaunchGenerating(false);
  };

  // ── Progress bar ──

  const stepOrder: Step[] = ["idea", "format", "questions", "result", "edit"];
  const stepIndex = stepOrder.indexOf(step);
  const progressPercent = step === "idea" ? 0 : ((stepIndex) / (stepOrder.length - 1)) * 100;

  // ── Launch mode rendering ──

  const isLaunchMode = editorialAngle === "lancement" && step === "result";

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
        {/* Sub-page header */}
        {paramFrom && (
          <SubPageHeader
            parentLabel="Retour"
            parentTo={paramFrom}
            currentLabel="Créer un contenu"
            useFromParam
          />
        )}

        {/* Tabs */}
        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)} className="mb-6">
          <TabsList className="w-full">
            <TabsTrigger value="create" className="flex-1 gap-1.5">✨ Créer</TabsTrigger>
            <TabsTrigger value="transform" className="flex-1 gap-1.5">🔄 Transformer</TabsTrigger>
          </TabsList>

          <TabsContent value="create" className="mt-4">
            {/* Progress bar (from step 2+) */}
            {step !== "idea" && (
              <div className="flex gap-1 mb-5">
                {stepOrder.map((s, i) => (
                  <div
                    key={s}
                    className={`h-1.5 rounded-full flex-1 transition-colors ${
                      i < stepIndex
                        ? "bg-primary"
                        : i === stepIndex
                        ? "bg-primary/60"
                        : "bg-muted"
                    }`}
                  />
                ))}
              </div>
            )}

            {/* Steps */}
            {step === "idea" && (
              <CreerStepIdea onNext={handleIdeaNext} onCoachingSelect={handleCoachingSelect} />
            )}

            {step === "format" && (
              <CreerStepFormat
                idea={ideaText}
                objective={objective || undefined}
                onNext={handleFormatNext}
                onBack={() => setStep("idea")}
              />
            )}

            {step === "questions" && (
              <CreerStepQuestions
                format={selectedFormat || ""}
                subject={ideaText}
                editorialAngle={editorialAngle || undefined}
                questions={questions}
                loadingQuestions={loadingQuestions}
                onNext={handleQuestionsNext}
                onSkip={handleSkipQuestions}
                onBack={() => setStep("format")}
              />
            )}

            {step === "result" && !isLaunchMode && (
              <CreerStepResult
                result={result?.raw || result}
                format={selectedFormat || "post"}
                generating={generating}
                onEdit={handleEdit}
                onReset={handleReset}
                onRegenerate={handleRegenerate}
                onCopy={handleCopy}
              />
            )}

            {/* Launch mode: multi-chapter results */}
            {isLaunchMode && (
              <div className="space-y-4 animate-fade-in">
                {launchGenerating ? (
                  <div className="py-12 text-center space-y-3">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
                    <p className="text-sm font-medium text-foreground">
                      Génération du chapitre {launchIndex + 1}/5…
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Ce format génère une séquence de 5 posts (un par chapitre).
                    </p>
                  </div>
                ) : (
                  <Tabs defaultValue="0">
                    <TabsList className="w-full flex-wrap h-auto gap-1">
                      {launchResults.map((_, i) => (
                        <TabsTrigger key={i} value={String(i)} className="text-xs">
                          Chapitre {i + 1}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    {launchResults.map((res, i) => (
                      <TabsContent key={i} value={String(i)}>
                        <CreerStepResult
                          result={res?.raw || res}
                          format={selectedFormat || "post"}
                          generating={false}
                          onEdit={handleEdit}
                          onReset={handleReset}
                          onRegenerate={handleRegenerate}
                          onCopy={handleCopy}
                        />
                      </TabsContent>
                    ))}
                  </Tabs>
                )}
              </div>
            )}

            {step === "edit" && (
              <CreerStepEdit
                content={editContent}
                format={selectedFormat || "post"}
                onSave={(edited) => {
                  toast.success("Contenu sauvegardé !");
                  setEditContent(edited);
                }}
                onBack={() => setStep("result")}
                onCopy={() => {
                  navigator.clipboard.writeText(editContent);
                  toast.success("Copié !");
                }}
              />
            )}
          </TabsContent>

          <TabsContent value="transform" className="mt-4">
            <CreerTransformTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
