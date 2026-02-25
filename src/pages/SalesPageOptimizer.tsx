import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import AiLoadingIndicator from "@/components/AiLoadingIndicator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowLeft, ChevronDown, ChevronUp, Copy, Pencil, Check, RotateCcw, ArrowRight, Zap } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

/* ─── Types ─── */
interface Section {
  nom: string;
  emoji: string;
  score: number;
  statut: "bon" | "moyen" | "faible";
  texte_actuel: string;
  points_forts: string[];
  problemes: string[];
  version_amelioree: string;
  explication: string;
}
interface MissingSection {
  nom: string;
  importance: "forte" | "moyenne";
  texte_propose: string;
  explication: string;
}
interface OptResult {
  score_global: number;
  synthese: string;
  quick_win: { titre: string; detail: string; section: string };
  sections: Section[];
  sections_manquantes: MissingSection[];
  plan_action: { priorite: number; action: string; section: string }[];
}

const FOCUS_CHIPS = ["Mon titre", "Mes CTA", "La preuve sociale", "Le prix", "Tout"];

function scoreColor(s: number) {
  if (s >= 75) return "text-emerald-600";
  if (s >= 50) return "text-amber-500";
  return "text-red-500";
}
function scoreStroke(s: number) {
  if (s >= 75) return "stroke-emerald-500";
  if (s >= 50) return "stroke-amber-400";
  return "stroke-red-500";
}
function statutBadge(s: string) {
  if (s === "bon") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400";
  if (s === "moyen") return "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400";
  return "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400";
}

function ScoreCircle({ score }: { score: number }) {
  const [animated, setAnimated] = useState(0);
  const r = 54; const c = 2 * Math.PI * r;
  const offset = c - (animated / 100) * c;
  useEffect(() => { const t = setTimeout(() => setAnimated(score), 100); return () => clearTimeout(t); }, [score]);
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="140" height="140" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="9" />
        <circle cx="60" cy="60" r={r} fill="none" className={`transition-all duration-1000 ease-out ${scoreStroke(score)}`} strokeWidth="9" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} transform="rotate(-90 60 60)" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-3xl font-display font-bold ${scoreColor(score)}`}>{animated}</span>
        <span className="text-xs text-muted-foreground">/100</span>
      </div>
    </div>
  );
}

/* ─── Main ─── */
export default function SalesPageOptimizer() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();

  const [step, setStep] = useState<"input" | "loading" | "results">("input");
  const [siteUrl, setSiteUrl] = useState("");
  const [focus, setFocus] = useState("");
  const [result, setResult] = useState<OptResult | null>(null);
  const [recentUrl, setRecentUrl] = useState<string | null>(null);
  const [recentDate, setRecentDate] = useState<string | null>(null);
  const [recentResult, setRecentResult] = useState<OptResult | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editTexts, setEditTexts] = useState<Record<string, string>>({});
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Check for recent optimization
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data } = await (supabase.from("sales_page_optimizations") as any)
        .select("site_url, created_at, raw_result, score_global")
        .eq(column, value)
        .gt("created_at", sevenDaysAgo)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.raw_result) {
        setRecentUrl(data.site_url);
        setRecentDate(data.created_at);
        setRecentResult(data.raw_result as OptResult);
      }
    };
    load();
  }, [user?.id]);

  const handleAnalyze = async () => {
    if (!siteUrl.trim() || !user) return;
    setStep("loading");
    try {
      const { data, error } = await supabase.functions.invoke("optimize-sales-page", {
        body: {
          site_url: siteUrl.trim(),
          focus: focus.trim() || null,
          workspace_id: workspaceId !== user.id ? workspaceId : null,
        },
      });
      if (error || !data?.success) throw new Error(data?.error || error?.message || "Erreur");
      setResult(data.result);
      setStep("results");
    } catch (e: any) {
      toast.error(e.message || "Erreur lors de l'analyse");
      setStep("input");
    }
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copié !");
  };

  const copyAllImproved = () => {
    if (!result) return;
    const all = result.sections
      .map((s) => `## ${s.emoji} ${s.nom}\n\n${editTexts[s.nom] || s.version_amelioree}`)
      .join("\n\n---\n\n");
    navigator.clipboard.writeText(all);
    toast.success("Tous les textes copiés !");
  };

  const scrollToSection = (nom: string) => {
    setExpandedSection(nom);
    setTimeout(() => sectionRefs.current[nom]?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  };

  const displayResult = result;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-6 py-8 max-md:px-4">
        <Link to="/site" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline mb-6">
          <ArrowLeft className="h-4 w-4" /> Retour au hub
        </Link>

        {/* ── Recent banner ── */}
        {step === "input" && recentUrl && recentResult && recentDate && (
          <div className="rounded-2xl border border-border bg-card p-4 mb-6 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground">
                Tu as analysé <strong className="truncate">{recentUrl}</strong>{" "}
                {formatDistanceToNow(new Date(recentDate), { addSuffix: true, locale: fr })}.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="outline" size="sm" className="rounded-pill gap-1.5" onClick={() => { setResult(recentResult); setStep("results"); }}>
                Voir les résultats →
              </Button>
            </div>
          </div>
        )}

        {/* ── STEP 1: INPUT ── */}
        {step === "input" && (
          <div className="space-y-6">
            <div>
              <h1 className="font-display text-[26px] sm:text-3xl font-bold text-foreground">🔧 Optimise ta page de vente</h1>
              <p className="mt-2 text-[15px] text-muted-foreground max-w-2xl">
                Tu as déjà une page ? Parfait. Colle ton URL, dis-moi ce qui te chiffonne, et l'IA te propose des améliorations concrètes, section par section.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">URL de ta page</label>
                <Input
                  value={siteUrl}
                  onChange={(e) => setSiteUrl(e.target.value)}
                  placeholder="https://monsite.com/mon-offre"
                  className="rounded-xl"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Qu'est-ce que tu veux améliorer ? <span className="text-muted-foreground font-normal">(optionnel)</span></label>
                <Textarea
                  value={focus}
                  onChange={(e) => setFocus(e.target.value)}
                  placeholder="Ex: Mon titre ne donne pas envie, personne ne clique, je veux plus de ventes..."
                  className="rounded-xl min-h-[80px]"
                />
                <div className="flex flex-wrap gap-1.5">
                  {FOCUS_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      onClick={() => setFocus((prev) => prev ? `${prev}, ${chip}` : chip)}
                      className="font-mono-ui text-[11px] font-semibold px-3 py-1 rounded-pill border border-border bg-card hover:border-primary hover:bg-rose-pale transition-colors"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>

              <Button onClick={handleAnalyze} disabled={!siteUrl.trim()} className="w-full sm:w-auto rounded-pill gap-2">
                ✨ Analyser ma page
              </Button>
              <p className="text-xs text-muted-foreground">~30 secondes · L'IA lit ta page et te propose des améliorations</p>
            </div>

            <Link to="/site/accueil" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
              Tu n'as pas encore de page ? Crée-la de zéro → <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}

        {/* ── STEP 2: LOADING ── */}
        {step === "loading" && (
          <div className="py-12">
            <AiLoadingIndicator
              isLoading={true}
              context="audit"
            />
          </div>
        )}

        {/* ── STEP 3: RESULTS ── */}
        {step === "results" && displayResult && (
          <div className="space-y-6">
            {/* A) Header */}
            <div className="rounded-2xl border border-border bg-card p-8 flex flex-col items-center text-center">
              <ScoreCircle score={displayResult.score_global || 0} />
              <p className="mt-4 text-sm text-muted-foreground max-w-lg">{displayResult.synthese}</p>
            </div>

            {/* Quick win */}
            {displayResult.quick_win && (
              <div className="rounded-2xl border border-primary bg-rose-pale p-5 flex gap-4 items-start cursor-pointer" onClick={() => scrollToSection(displayResult.quick_win.section)}>
                <span className="flex items-center justify-center h-10 w-10 rounded-full bg-primary/10 text-primary shrink-0">
                  <Zap className="h-5 w-5" />
                </span>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-primary mb-1">⚡ Quick win</p>
                  <h4 className="text-sm font-bold text-foreground">{displayResult.quick_win.titre}</h4>
                  <p className="text-sm text-muted-foreground mt-1">{displayResult.quick_win.detail}</p>
                </div>
              </div>
            )}

            {/* B) Sections */}
            <div className="space-y-3">
              <h3 className="font-display text-base font-bold text-foreground">📝 Sections analysées</h3>
              {[...displayResult.sections].sort((a, b) => a.score - b.score).map((section) => {
                const isOpen = expandedSection === section.nom;
                const isEditing = editingSection === section.nom;
                const currentText = editTexts[section.nom] || section.version_amelioree;

                return (
                  <div key={section.nom} ref={(el) => { sectionRefs.current[section.nom] = el; }}>
                    <Collapsible open={isOpen} onOpenChange={() => setExpandedSection(isOpen ? null : section.nom)}>
                      <CollapsibleTrigger className="w-full">
                        <div className="rounded-2xl border border-border bg-card p-4 hover:border-primary/40 transition-all cursor-pointer text-left">
                          <div className="flex items-center gap-3">
                            <span className="text-lg">{section.emoji}</span>
                            <span className="text-sm font-medium text-foreground flex-1 truncate">{section.nom}</span>
                            <span className={`text-lg font-bold ${scoreColor(section.score)}`}>{section.score}</span>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-pill ${statutBadge(section.statut)}`}>
                              {section.statut === "bon" ? "Bon" : section.statut === "moyen" ? "Moyen" : "Faible"}
                            </span>
                            {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                          </div>
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="rounded-b-2xl border border-t-0 border-border bg-card px-5 pb-5 space-y-4">
                          {/* Texte actuel */}
                          <div>
                            <p className="text-xs font-bold text-muted-foreground mb-1.5">📄 Texte actuel</p>
                            <div className="text-sm text-muted-foreground bg-muted rounded-xl p-3 whitespace-pre-wrap">{section.texte_actuel}</div>
                          </div>
                          {/* Points forts */}
                          {section.points_forts?.length > 0 && (
                            <div>
                              <p className="text-xs font-bold text-emerald-600 mb-1">✅ Ce qui fonctionne</p>
                              <ul className="space-y-1">{section.points_forts.map((p, i) => <li key={i} className="text-sm text-foreground flex items-start gap-2"><span className="text-emerald-500 shrink-0 mt-0.5">●</span>{p}</li>)}</ul>
                            </div>
                          )}
                          {/* Problèmes */}
                          {section.problemes?.length > 0 && (
                            <div>
                              <p className="text-xs font-bold text-amber-600 mb-1">⚠️ Ce qui coince</p>
                              <ul className="space-y-1">{section.problemes.map((p, i) => <li key={i} className="text-sm text-foreground flex items-start gap-2"><span className="text-amber-500 shrink-0 mt-0.5">●</span>{p}</li>)}</ul>
                            </div>
                          )}
                          {/* Version améliorée */}
                          <div>
                            <p className="text-xs font-bold text-primary mb-1.5">✨ Version améliorée</p>
                            <div className="rounded-xl border border-primary bg-rose-pale p-4">
                              {isEditing ? (
                                <Textarea
                                  value={currentText}
                                  onChange={(e) => setEditTexts((prev) => ({ ...prev, [section.nom]: e.target.value }))}
                                  className="min-h-[120px] rounded-xl border-primary/30"
                                  autoFocus
                                />
                              ) : (
                                <p className="text-sm text-foreground whitespace-pre-wrap">{currentText}</p>
                              )}
                              <div className="flex gap-2 mt-3">
                                <Button variant="outline" size="sm" className="gap-1.5 rounded-pill text-xs" onClick={() => copyText(currentText)}>
                                  <Copy className="h-3 w-3" /> Copier
                                </Button>
                                <Button
                                  variant="ghost" size="sm" className="gap-1.5 rounded-pill text-xs"
                                  onClick={() => setEditingSection(isEditing ? null : section.nom)}
                                >
                                  {isEditing ? <><Check className="h-3 w-3" /> OK</> : <><Pencil className="h-3 w-3" /> Éditer</>}
                                </Button>
                              </div>
                            </div>
                          </div>
                          {/* Explication */}
                          {section.explication && (
                            <p className="text-xs text-muted-foreground italic">💡 {section.explication}</p>
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                );
              })}
            </div>

            {/* C) Sections manquantes */}
            {displayResult.sections_manquantes?.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-display text-base font-bold text-foreground">📌 Sections à ajouter</h3>
                {displayResult.sections_manquantes.map((ms, i) => (
                  <div key={i} className="rounded-2xl border border-border bg-card p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-foreground flex-1">{ms.nom}</h4>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-pill ${ms.importance === "forte" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                        Importance {ms.importance}
                      </span>
                    </div>
                    <div className="rounded-xl bg-rose-pale border border-primary/20 p-3">
                      <p className="text-sm text-foreground whitespace-pre-wrap">{ms.texte_propose}</p>
                    </div>
                    <p className="text-xs text-muted-foreground italic">💡 {ms.explication}</p>
                    <Button variant="outline" size="sm" className="gap-1.5 rounded-pill text-xs" onClick={() => copyText(ms.texte_propose)}>
                      <Copy className="h-3 w-3" /> Copier le texte
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* D) Plan d'action */}
            {displayResult.plan_action?.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-display text-base font-bold text-foreground">🎯 Plan d'action</h3>
                {displayResult.plan_action.slice(0, 3).map((a, i) => (
                  <div
                    key={i}
                    className="rounded-2xl border border-border bg-card p-4 flex gap-3 items-center cursor-pointer hover:border-primary/40 transition-all"
                    onClick={() => scrollToSection(a.section)}
                  >
                    <span className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 text-primary text-sm font-bold shrink-0">
                      {a.priorite || i + 1}
                    </span>
                    <p className="text-sm text-foreground flex-1">{a.action}</p>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                ))}
              </div>
            )}

            {/* E) Actions globales */}
            <div className="flex flex-wrap gap-3 pt-2">
              <Button variant="outline" className="gap-2 rounded-pill" onClick={copyAllImproved}>
                <Copy className="h-4 w-4" /> Copier tous les textes améliorés
              </Button>
              <Button variant="outline" className="gap-2 rounded-pill" onClick={() => { setResult(null); setStep("input"); }}>
                <RotateCcw className="h-4 w-4" /> Refaire l'analyse
              </Button>
              <Link to="/site/audit">
                <Button variant="ghost" className="gap-2 rounded-pill">
                  📊 Faire un audit complet
                </Button>
              </Link>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center py-6 text-xs text-muted-foreground">
        Créé avec L'Assistant Com' par <a href="https://nowadaysagency.lovable.app" className="text-primary hover:underline">Nowadays Agency</a>
      </footer>
    </div>
  );
}
