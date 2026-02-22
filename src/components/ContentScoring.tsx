import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Search, Sparkles, Loader2 } from "lucide-react";

interface ScoreItem {
  criterion: string;
  score: number;
  comment: string;
}

interface Improvement {
  priority: number;
  criterion: string;
  suggestion: string;
}

interface ContentScoringProps {
  content: string;
  format?: string;
  objective?: string;
  onImprove?: (improvedContent: string) => void;
}

export default function ContentScoring({ content, format, objective, onImprove }: ContentScoringProps) {
  const [scores, setScores] = useState<ScoreItem[]>([]);
  const [globalScore, setGlobalScore] = useState<number | null>(null);
  const [improvements, setImprovements] = useState<Improvement[]>([]);
  const [loading, setLoading] = useState(false);
  const [improving, setImproving] = useState(false);
  const [open, setOpen] = useState(false);

  const handleScore = async () => {
    setLoading(true);
    setOpen(true);
    try {
      const { data, error } = await supabase.functions.invoke("score-content", {
        body: { content, format, objective, action: "score" },
      });
      if (error) throw error;
      setScores(data.scores || []);
      setGlobalScore(data.global_score ?? null);
      setImprovements(data.improvements || []);
    } catch {
      setScores([]);
    }
    setLoading(false);
  };

  const handleAutoImprove = async () => {
    if (!onImprove) return;
    setImproving(true);
    try {
      const { data, error } = await supabase.functions.invoke("score-content", {
        body: { content, format, objective, action: "improve", improvements },
      });
      if (error) throw error;
      if (data.content) onImprove(data.content);
    } catch {}
    setImproving(false);
  };

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={handleScore} disabled={loading} className="rounded-pill gap-1.5">
        <Search className="h-3.5 w-3.5" />
        {loading ? "Évaluation..." : "Évaluer mon contenu avant de publier"}
      </Button>
    );
  }

  const barColor = (score: number) => {
    if (score >= 8) return "bg-green-500";
    if (score >= 6) return "bg-yellow-500";
    return "bg-red-400";
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4 animate-fade-in">
      <h3 className="font-display text-base font-bold text-foreground flex items-center gap-2">
        🔍 Score de ton contenu
      </h3>

      {loading ? (
        <div className="flex items-center gap-2 py-4 justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Évaluation en cours...</span>
        </div>
      ) : (
        <>
          <div className="space-y-2.5">
            {scores.map((s) => (
              <div key={s.criterion}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-sm font-medium text-foreground">{s.criterion}</span>
                  <span className="text-sm font-bold text-foreground">{s.score}/10</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden mb-0.5">
                  <div className={`h-full rounded-full transition-all ${barColor(s.score)}`} style={{ width: `${s.score * 10}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">{s.comment}</p>
              </div>
            ))}
          </div>

          {globalScore !== null && (
            <div className="border-t border-border pt-3">
              <p className="text-sm font-bold text-foreground">Score global : {globalScore}/100</p>
            </div>
          )}

          {improvements.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">💡 Axes d'amélioration :</p>
              {improvements.map((imp, i) => (
                <p key={i} className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{imp.priority}. {imp.criterion} :</span> {imp.suggestion}
                </p>
              ))}

              <div className="flex gap-2 pt-1">
                {onImprove && (
                  <Button size="sm" onClick={handleAutoImprove} disabled={improving} className="rounded-pill gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" />
                    {improving ? "Amélioration..." : "Améliorer automatiquement"}
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setOpen(false)} className="rounded-pill">
                  Je le fais moi-même
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
