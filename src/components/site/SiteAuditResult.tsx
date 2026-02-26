import { useState, useEffect, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, ArrowRight, RotateCcw, Sparkles, Loader2, RefreshCw, Palette } from "lucide-react";
import {
  calculateWebsiteAuditScore,
  calculatePageByPageScore,
  getWebsiteScoreLabel,
  getCategoryRecommendations,
  type AuditScoreResult,
  type CategoryRecommendation,
} from "@/lib/website-audit-score";
import { friendlyError } from "@/lib/error-messages";
import { useWorkspaceId } from "@/hooks/use-workspace-query";

interface SiteAuditResultProps {
  auditId: string;
  auditMode: "global" | "page_by_page";
  answers: Record<string, any>;
  globalSections: { id: string; emoji: string; title: string; questions: { id: string; text: string }[] }[];
  pageQuestions: Record<string, { id: string; text: string }[]>;
  onReset: () => void;
}

interface AiDiagnosticData {
  positif: string[];
  priorites: { titre: string; detail: string; impact: "fort" | "moyen"; module?: string | null }[];
  premier_pas: string;
}

const ANSWER_DISPLAY: Record<string, { icon: string; label: string; className: string }> = {
  oui: { icon: "✅", label: "Oui", className: "text-emerald-600" },
  non: { icon: "❌", label: "Non", className: "text-red-500" },
  pas_sure: { icon: "⚠️", label: "Pas sûr·e", className: "text-amber-500" },
};

const PRIORITY_BADGE: Record<string, { icon: string; label: string; className: string }> = {
  haute: { icon: "🔴", label: "Haute", className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" },
  moyenne: { icon: "🟠", label: "Moyenne", className: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400" },
  basse: { icon: "🟢", label: "Basse", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" },
};

const EFFORT_BADGE: Record<string, { icon: string; label: string }> = {
  rapide: { icon: "⚡", label: "Rapide" },
  moyen: { icon: "⏱️", label: "Moyen" },
  long: { icon: "🔧", label: "Long" },
};

const CATEGORY_INSPIRATION_MAP: Record<string, string> = {
  clarte: "hero",
  copywriting: "hero",
  confiance: "testimonials",
  parcours: "how_it_works",
  visuel: "benefits",
};

function barColor(score: number, max: number): string {
  const pct = max > 0 ? (score / max) * 100 : 0;
  if (pct >= 75) return "bg-emerald-500";
  if (pct >= 50) return "bg-amber-400";
  return "bg-red-500";
}

function ScoreCircle({ score }: { score: number }) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (animatedScore / 100) * circumference;
  const { color } = getWebsiteScoreLabel(score);

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedScore(score), 100);
    return () => clearTimeout(timer);
  }, [score]);

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="160" height="160" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="10" />
        <circle
          cx="70" cy="70" r={radius}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          transform="rotate(-90 70 70)"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-3xl font-display font-bold ${color}`}>{animatedScore}</span>
        <span className="text-xs text-muted-foreground">/100</span>
      </div>
    </div>
  );
}

/** Try to parse the AI diagnostic JSON from either a raw string or already-parsed object */
function parseDiagnostic(raw: unknown): AiDiagnosticData | null {
  if (!raw) return null;
  try {
    if (typeof raw === "object" && raw !== null && "positif" in raw) return raw as AiDiagnosticData;
    const str = typeof raw === "string" ? raw : JSON.stringify(raw);
    // Strip potential markdown fences
    const cleaned = str.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned);
    if (parsed?.positif && parsed?.priorites && parsed?.premier_pas) return parsed as AiDiagnosticData;
    return null;
  } catch {
    return null;
  }
}

export default function SiteAuditResult({
  auditId,
  auditMode,
  answers,
  globalSections,
  pageQuestions,
  onReset,
}: SiteAuditResultProps) {
  const navigate = useNavigate();
  const workspaceId = useWorkspaceId();
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [aiDiagnostic, setAiDiagnostic] = useState<AiDiagnosticData | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [diagnosticLoaded, setDiagnosticLoaded] = useState(false);

  const scoreResult: AuditScoreResult = useMemo(() => {
    if (auditMode === "global") {
      return calculateWebsiteAuditScore(answers as Record<string, string>);
    }
    return calculatePageByPageScore(answers as Record<string, Record<string, string>>);
  }, [answers, auditMode]);

  const scoreLabel = getWebsiteScoreLabel(scoreResult.total);

  const allRecs = useMemo(() => {
    const recs: (CategoryRecommendation & { categoryId: string })[] = [];
    for (const [catId, cat] of Object.entries(scoreResult.categories)) {
      const catRecs = getCategoryRecommendations(catId, cat.score, cat.max);
      catRecs.forEach(r => recs.push({ ...r, categoryId: catId }));
    }
    const order: Record<string, number> = { haute: 0, moyenne: 1, basse: 2 };
    recs.sort((a, b) => (order[a.priority] ?? 1) - (order[b.priority] ?? 1));
    return recs;
  }, [scoreResult]);

  // Save scores to DB on mount
  useEffect(() => {
    if (saved || !auditId) return;
    const save = async () => {
      await (supabase.from("website_audit") as any)
        .update({ scores: scoreResult.categories, score_global: scoreResult.total, completed: true })
        .eq("id", auditId);
      setSaved(true);
    };
    save();
  }, [auditId, scoreResult, saved]);

  const getQuestionsForCategory = (catId: string): { id: string; text: string }[] => {
    if (auditMode === "global") {
      const sec = globalSections.find(s => s.id === catId);
      return sec?.questions ?? [];
    }
    return pageQuestions[catId] ?? [];
  };

  const getAnswerForQuestion = (catId: string, qId: string): string | null => {
    if (auditMode === "global") {
      return (answers as Record<string, string>)[qId] ?? null;
    }
    const pageAnswers = (answers as Record<string, Record<string, string>>)[catId];
    return pageAnswers?.[qId] ?? null;
  };

  // ── Load existing diagnostic from DB ──
  useEffect(() => {
    if (!auditId) return;
    const loadDiag = async () => {
      const { data } = await (supabase.from("website_audit") as any)
        .select("diagnostic")
        .eq("id", auditId)
        .maybeSingle();
      const parsed = parseDiagnostic(data?.diagnostic);
      if (parsed) setAiDiagnostic(parsed);
      setDiagnosticLoaded(true);
    };
    loadDiag();
  }, [auditId]);

  // ── Generate AI diagnostic ──
  const generateAiDiagnostic = async () => {
    setAiLoading(true);
    try {
      const weakCategories = Object.entries(scoreResult.categories)
        .filter(([, cat]) => cat.max > 0 && (cat.score / cat.max) < 0.75)
        .map(([, cat]) => cat.label);

      const { data, error } = await supabase.functions.invoke("website-ai", {
        body: {
          action: "audit-diagnostic",
          audit_mode: auditMode,
          scores: scoreResult.categories,
          score_global: scoreResult.total,
          answers,
          weak_categories: weakCategories,
          workspace_id: workspaceId,
        },
      });
      if (error) throw error;

      const rawDiag = data?.diagnostic || data?.content || "";
      const parsed = parseDiagnostic(rawDiag);
      if (!parsed) throw new Error("Format de réponse inattendu");
      setAiDiagnostic(parsed);
    } catch (e) {
      console.error("AI diagnostic error:", e);
      toast.error(friendlyError(e));
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Score global ── */}
      <div className="rounded-2xl border border-border bg-card p-8 flex flex-col items-center text-center">
        <ScoreCircle score={scoreResult.total} />
        <div className="mt-4 space-y-1">
          <p className={`text-lg font-display font-bold ${scoreLabel.color}`}>
            {scoreLabel.emoji} {scoreLabel.label}
          </p>
          <p className="text-sm text-muted-foreground max-w-md">{scoreLabel.message}</p>
          <p className="text-[11px] italic text-muted-foreground mt-1">Score de site : bonnes pratiques et conversion</p>
        </div>
      </div>

      {/* ── Scores par catégorie ── */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-1">
        <h3 className="font-display text-base font-bold text-foreground mb-4">
          {auditMode === "global" ? "📊 Scores par catégorie" : "📊 Scores par page"}
        </h3>
        {Object.entries(scoreResult.categories).map(([catId, cat]) => {
          const pct = cat.max > 0 ? Math.round((cat.score / cat.max) * 100) : 0;
          const isExpanded = expandedCat === catId;
          const questions = getQuestionsForCategory(catId);

          return (
            <Collapsible key={catId} open={isExpanded} onOpenChange={() => setExpandedCat(isExpanded ? null : catId)}>
              <CollapsibleTrigger className="w-full">
                <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors cursor-pointer">
                  <span className="text-base">{cat.emoji}</span>
                  <span className="text-sm font-medium text-foreground flex-1 text-left">{cat.label}</span>
                  <span className="text-xs text-muted-foreground">{cat.score}/{cat.max}</span>
                  <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${barColor(cat.score, cat.max)}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="pl-10 pr-3 pb-3 space-y-2">
                  {questions.map(q => {
                    const ans = getAnswerForQuestion(catId, q.id);
                    const display = ans ? ANSWER_DISPLAY[ans] : null;
                    return (
                      <div key={q.id} className="flex items-start gap-2 text-sm">
                        <span className="shrink-0 mt-0.5">{display?.icon ?? "—"}</span>
                        <span className={display?.className ?? "text-muted-foreground"}>{q.text}</span>
                      </div>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>

      {/* ── Plan d'action priorisé ── */}
      {allRecs.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <h3 className="font-display text-base font-bold text-foreground">🎯 Plan d'action priorisé</h3>
          <div className="space-y-3">
            {allRecs.map((rec, i) => {
              const pBadge = PRIORITY_BADGE[rec.priority];
              const eBadge = EFFORT_BADGE[rec.effort];
              // Determine if this rec's category has an inspiration link
              const inspirationLink = CATEGORY_INSPIRATION_MAP[rec.categoryId];
              const catScore = scoreResult.categories[rec.categoryId];
              const showInspirationLink = inspirationLink && catScore && catScore.max > 0 && (catScore.score / catScore.max) < 0.75;
              return (
                <div key={i} className="rounded-xl border border-border p-4 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-pill ${pBadge?.className}`}>
                      {pBadge?.icon} {pBadge?.label}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-pill bg-muted text-muted-foreground">
                      {eBadge?.icon} {eBadge?.label}
                    </span>
                  </div>
                  <p className="text-sm text-foreground">{rec.recommendation}</p>
                  <div className="flex flex-wrap gap-2">
                    {rec.link && rec.linkLabel && (
                      <Button variant="outline" size="sm" className="gap-1.5 rounded-pill text-xs" onClick={() => navigate(rec.link!)}>
                        {rec.linkLabel} <ArrowRight className="h-3 w-3" />
                      </Button>
                    )}
                    {showInspirationLink && (
                      <Button variant="ghost" size="sm" className="gap-1.5 rounded-pill text-xs" asChild>
                        <Link to={`/site/inspirations?section=${inspirationLink}`}>
                          <Palette className="h-3 w-3" />
                          🎨 Voir un template
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── AI Diagnostic ── */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        {aiDiagnostic ? (
          <>
            {/* ✅ Ce qui va bien */}
            <div className="space-y-3">
              <h3 className="font-display text-base font-bold text-foreground">✅ Ce qui va bien</h3>
              <ul className="space-y-2">
                {aiDiagnostic.positif.map((point, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                    <span className="shrink-0 mt-0.5 text-emerald-500">●</span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* 🎯 Tes 3 priorités */}
            <div className="space-y-3">
              <h3 className="font-display text-base font-bold text-foreground">🎯 Tes 3 priorités</h3>
              <div className="space-y-3">
                {aiDiagnostic.priorites.map((prio, i) => (
                  <div key={i} className="rounded-xl border border-border p-4 space-y-2">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center justify-center h-7 w-7 rounded-full bg-primary/10 text-primary text-sm font-bold">{i + 1}</span>
                      <h4 className="text-sm font-bold text-foreground flex-1">{prio.titre}</h4>
                      <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-pill ${
                        prio.impact === "fort"
                          ? "bg-primary/10 text-primary"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                      }`}>
                        {prio.impact === "fort" ? "Impact fort" : "Impact moyen"}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground pl-10">{prio.detail}</p>
                    {prio.module && (
                      <div className="pl-10">
                        <Button variant="outline" size="sm" className="gap-1.5 rounded-pill text-xs" onClick={() => navigate(prio.module!)}>
                          Y aller <ArrowRight className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* ⚡ Ton premier pas */}
            <div className="space-y-2">
              <h3 className="font-display text-base font-bold text-foreground">⚡ Ton premier pas</h3>
              <div className="rounded-xl bg-rose-pale border border-primary/20 p-5">
                <p className="text-sm text-foreground">{aiDiagnostic.premier_pas}</p>
              </div>
            </div>

            {/* Regénérer */}
            <Button
              variant="outline"
              size="sm"
              className="gap-2 rounded-pill"
              onClick={generateAiDiagnostic}
              disabled={aiLoading}
            >
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              🔄 Regénérer
            </Button>
          </>
        ) : (
          <div className="text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              Envie d'un diagnostic plus détaillé et personnalisé ?
            </p>
            <Button
              onClick={generateAiDiagnostic}
              disabled={aiLoading || !diagnosticLoaded}
              className="gap-2 rounded-pill"
            >
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Générer un diagnostic IA personnalisé
            </Button>
          </div>
        )}
      </div>

      {/* ── Reset ── */}
      <div className="flex justify-center">
        <Button variant="outline" onClick={onReset} className="gap-2 rounded-pill">
          <RotateCcw className="h-4 w-4" />
          Refaire l'audit
        </Button>
      </div>
    </div>
  );
}
