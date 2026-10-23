// « On affine ensemble » en une passe, pendant l'onboarding (23/10/2026) :
// 2 ou 3 questions sur un écran, « Réécrire ma carte » (1 crédit, un seul appel
// à l'IA), puis la carte proposée, à enregistrer ou non. Remplace, dans
// l'onboarding seulement, la conversation qui demandait ~5 questions, ~5 min et
// ~7 crédits par carte (mesuré le 22/10). Mon identité garde la conversation.
import { useState } from "react";
import { ArrowLeft, CheckCircle2, Sparkles } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { TextareaWithVoice } from "@/components/ui/textarea-with-voice";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { readableError } from "@/lib/error-messages";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { QUICK_REFINE_QUESTIONS, refineContext } from "./quick-refine";
import { RENDERERS } from "./SectionViews";
import { SECTIONS, type AnalysisResult, type SectionKey } from "./types";

interface ReviewQuickRefineProps {
  sectionKey: SectionKey;
  analysis: AnalysisResult;
  saving: boolean;
  onSave: (data: NonNullable<AnalysisResult[SectionKey]>) => void;
  onCancel: () => void;
}

export function ReviewQuickRefine({ sectionKey, analysis, saving, onSave, onCancel }: ReviewQuickRefineProps) {
  const workspaceId = useWorkspaceId();
  const sec = SECTIONS.find((s) => s.key === sectionKey)!;
  const questions = QUICK_REFINE_QUESTIONS[sectionKey];
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ""));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<NonNullable<AnalysisResult[SectionKey]> | null>(null);
  const ready = answers.some((a) => a.trim());

  const rewrite = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await invokeWithTimeout("branding-quick-refine", {
        body: {
          section: sectionKey,
          current: analysis[sectionKey] || null,
          context: refineContext(analysis, sectionKey),
          answers: questions.map((question, i) => ({ question, answer: answers[i] })),
          workspace_id: workspaceId || null,
        },
      }, 90000);
      if (fnError || !data?.section_data) throw fnError || new Error(data?.error || "");
      setProposal({ confidence: "high", ...data.section_data });
    } catch (e) {
      setError(readableError(e, "Je n'ai pas réussi à réécrire la carte. Réessaie."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-card rounded-[20px] shadow-card border border-border p-5 sm:p-6">
      <button onClick={onCancel} disabled={loading || saving} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground mb-4 transition-colors disabled:opacity-50">
        <ArrowLeft className="h-4 w-4" /> Revenir à mes cartes
      </button>
      <div className="flex items-center gap-3 mb-1">
        <span className="text-xl">{sec.emoji}</span>
        <h2 className="font-display text-lg text-foreground" style={{ fontWeight: 400 }}>{sec.title}</h2>
      </div>

      {!proposal ? (
        <>
          <p className="text-sm text-muted-foreground mb-4">Réponds à une, deux ou trois questions, puis je réécris ta carte avec tes mots.</p>
          <div className="space-y-4 mb-5">
            {questions.map((q, i) => (
              <div key={q}>
                <label htmlFor={`affiner-${sectionKey}-${i}`} className="block text-sm font-medium text-foreground mb-1.5">{q}</label>
                <TextareaWithVoice
                  id={`affiner-${sectionKey}-${i}`}
                  value={answers[i]}
                  onChange={(e) => setAnswers((prev) => prev.map((a, j) => (j === i ? e.target.value : a)))}
                  disabled={loading}
                  className="min-h-[64px] text-sm"
                />
              </div>
            ))}
          </div>
          {error && <p role="alert" className="text-sm text-destructive mb-3">{error}</p>}
          <button onClick={rewrite} disabled={!ready || loading} className="inline-flex items-center justify-center gap-2 bg-primary text-white rounded-[12px] px-5 py-2.5 text-sm font-semibold transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-50 disabled:hover:scale-100">
            {loading ? <Spinner className="h-4 w-4 text-white" /> : <Sparkles className="h-4 w-4" />}
            {loading ? "Je réécris ta carte…" : "Réécrire ma carte"}
          </button>
          <p className="text-xs text-muted-foreground mt-2">{loading ? "Une quinzaine de secondes." : "1 crédit, environ 15 secondes."}</p>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-4">Voici ta carte réécrite. Elle te va ?</p>
          <div className="mb-5">{RENDERERS[sectionKey]({ [sectionKey]: proposal } as AnalysisResult)}</div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button onClick={() => onSave(proposal)} disabled={saving} className="inline-flex items-center justify-center gap-2 bg-primary text-white rounded-[12px] px-5 py-2 text-sm font-semibold transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-50">
              {saving ? <Spinner className="h-4 w-4 text-white" /> : <CheckCircle2 className="h-4 w-4" />}
              Enregistrer cette version
            </button>
            <button onClick={() => setProposal(null)} disabled={saving} className="inline-flex items-center justify-center gap-2 border-[1.5px] border-border text-muted-foreground rounded-[12px] px-5 py-2 text-sm font-semibold hover:border-foreground/40 hover:text-foreground transition-all disabled:opacity-50">
              Modifier mes réponses
            </button>
          </div>
        </>
      )}
    </div>
  );
}
