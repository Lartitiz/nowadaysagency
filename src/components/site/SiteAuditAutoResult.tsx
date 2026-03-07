import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChevronDown, ChevronUp, ArrowRight, RotateCcw, Camera, CheckCircle2, History, TrendingUp, TrendingDown, Minus } from "lucide-react";
import SiteAuditBrandingSuggestions from "./SiteAuditBrandingSuggestions";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

/* ─── Types ─── */

interface Pilier {
  score: number;
  statut: "absent" | "flou" | "bon" | "excellent";
  ce_qui_existe: string;
  ce_qui_manque: string;
  recommandation: string;
  module_route?: string | null;
}

interface PointFort {
  titre: string;
  detail: string;
  pilier: string;
}

interface Priorite {
  titre: string;
  detail: string;
  impact: string;
  pilier: string;
  module_route?: string | null;
  module_label?: string | null;
}

interface PlanAction {
  priorite: number;
  action: string;
  module?: string;
  route?: string;
  temps_estime?: string;
}

interface PageAnalysis {
  score: number;
  resume: string;
  problemes: string[];
}

export interface BrandingPrefillFromSite {
  detected_tone?: string | null;
  detected_values?: string[];
  detected_positioning?: string | null;
  detected_mission?: string | null;
  detected_combat_cause?: string | null;
  detected_combat_fights?: string | null;
  detected_colors?: {
    primary?: string | null;
    secondary?: string | null;
    accent?: string | null;
    background?: string | null;
  };
  detected_fonts?: {
    title?: string | null;
    body?: string | null;
  };
  detected_mood?: string[];
  empty_fields?: Record<string, boolean>;
}

export interface AutoAuditResult {
  score_global: number;
  synthese: string;
  pages_analysees: string[];
  pages_en_erreur: string[];
  piliers: Record<string, Pilier>;
  points_forts: PointFort[];
  priorites: Priorite[];
  plan_action: PlanAction[];
  analyse_par_page: Record<string, PageAnalysis>;
  branding_prefill_from_site?: BrandingPrefillFromSite | null;
}

interface PastAudit {
  id: string;
  score_global: number;
  created_at: string;
  raw_result: AutoAuditResult | null;
}

interface SiteAuditAutoResultProps {
  result: AutoAuditResult;
  onReset: () => void;
  onRerun?: () => void;
  siteUrl?: string;
  userId?: string;
  workspaceFilter?: { column: string; value: string };
}

/* ─── Constants ─── */

const PILIER_META: Record<string, { emoji: string; label: string }> = {
  clarte: { emoji: "🎯", label: "Clarté du message" },
  copywriting: { emoji: "💬", label: "Copywriting" },
  parcours: { emoji: "🗺️", label: "Parcours utilisateur·ice" },
  confiance: { emoji: "🛡️", label: "Confiance" },
  seo: { emoji: "🔎", label: "SEO basique" },
  coherence_branding: { emoji: "🎨", label: "Cohérence branding" },
  cta: { emoji: "👆", label: "Appels à l'action" },
  structure: { emoji: "📐", label: "Structure & hiérarchie" },
};

const STATUT_BADGE: Record<string, { label: string; className: string }> = {
  absent: { label: "Absent", className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" },
  flou: { label: "Flou", className: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400" },
  bon: { label: "Bon", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" },
  excellent: { label: "Excellent", className: "bg-primary/10 text-primary" },
};

function scoreColor(score: number): string {
  if (score >= 75) return "text-emerald-600";
  if (score >= 50) return "text-amber-500";
  return "text-red-500";
}

function scoreStroke(score: number): string {
  if (score >= 75) return "stroke-emerald-500";
  if (score >= 50) return "stroke-amber-400";
  return "stroke-red-500";
}

/* ─── Score Circle ─── */

function ScoreCircle({ score }: { score: number }) {
  const [animated, setAnimated] = useState(0);
  const r = 60;
  const c = 2 * Math.PI * r;
  const offset = c - (animated / 100) * c;

  useEffect(() => {
    const t = setTimeout(() => setAnimated(score), 100);
    return () => clearTimeout(t);
  }, [score]);

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="160" height="160" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="10" />
        <circle
          cx="70" cy="70" r={r} fill="none"
          className={`transition-all duration-1000 ease-out ${scoreStroke(score)}`}
          strokeWidth="10" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={offset}
          transform="rotate(-90 70 70)"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-3xl font-display font-bold ${scoreColor(score)}`}>{animated}</span>
        <span className="text-xs text-muted-foreground">/100</span>
      </div>
    </div>
  );
}

/* ─── Comparison helpers ─── */

function ScoreDiff({ current, previous }: { current: number; previous: number }) {
  const diff = current - previous;
  if (diff > 0)
    return <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-600"><TrendingUp className="h-3 w-3" /> +{diff}</span>;
  if (diff < 0)
    return <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-red-500"><TrendingDown className="h-3 w-3" /> {diff}</span>;
  return <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-muted-foreground"><Minus className="h-3 w-3" /> =</span>;
}

/* ─── Main Component ─── */

export default function SiteAuditAutoResult({
  result,
  onReset,
  onRerun,
  siteUrl,
  userId,
  workspaceFilter,
}: SiteAuditAutoResultProps) {
  const navigate = useNavigate();
  const [expandedPilier, setExpandedPilier] = useState<string | null>(null);
  const [checklistMode, setChecklistMode] = useState(false);
  const [checkedActions, setCheckedActions] = useState<Record<number, boolean>>(() => {
    try {
      const saved = localStorage.getItem("site-audit-checklist");
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  // History & comparison
  const [pastAudits, setPastAudits] = useState<PastAudit[]>([]);
  const [previousResult, setPreviousResult] = useState<AutoAuditResult | null>(null);
  const [previousDate, setPreviousDate] = useState<string | null>(null);
  const [viewingOld, setViewingOld] = useState<PastAudit | null>(null);

  // Displayed result (current or old selected)
  const displayResult = viewingOld?.raw_result || result;

  useEffect(() => {
    if (!userId || !workspaceFilter) return;
    const load = async () => {
      const { data } = await (supabase.from("website_audit") as any)
        .select("id, score_global, created_at, raw_result")
        .eq(workspaceFilter.column, workspaceFilter.value)
        .eq("audit_mode", "auto")
        .eq("completed", true)
        .order("created_at", { ascending: false })
        .limit(20);
      if (data && data.length > 0) {
        setPastAudits(data);
        // The second item is the previous audit (first is the current)
        if (data.length > 1 && data[1].raw_result) {
          setPreviousResult(data[1].raw_result as AutoAuditResult);
          setPreviousDate(data[1].created_at);
        }
      }
    };
    load();
  }, [userId, workspaceFilter]);

  const toggleChecked = (idx: number) => {
    setCheckedActions(prev => {
      const next = { ...prev, [idx]: !prev[idx] };
      localStorage.setItem("site-audit-checklist", JSON.stringify(next));
      return next;
    });
  };

  const pilierEntries = Object.entries(displayResult.piliers || {});

  return (
    <div className="space-y-6">
      {/* ── Viewing old audit banner ── */}
      {viewingOld && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-4 flex items-center justify-between">
          <p className="text-sm text-foreground">
            📂 Tu consultes l'audit du <strong>{format(new Date(viewingOld.created_at), "d MMM yyyy", { locale: fr })}</strong> (score : {viewingOld.score_global}/100)
          </p>
          <Button variant="outline" size="sm" className="rounded-pill gap-1.5" onClick={() => setViewingOld(null)}>
            Revenir à l'audit actuel
          </Button>
        </div>
      )}

      {/* ── Comparison banner ── */}
      {!viewingOld && previousResult && previousDate && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground">
              📈 Comparaison avec ton audit du {format(new Date(previousDate), "d MMM yyyy", { locale: fr })} :
            </span>
            <ScoreDiff current={result.score_global} previous={previousResult.score_global} />
          </div>
          {result.score_global > previousResult.score_global && (
            <p className="text-sm font-medium text-emerald-600">
              🎉 Bravo, +{result.score_global - previousResult.score_global} points depuis ton dernier audit !
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {pilierEntries.map(([key, pilier]) => {
              const prev = previousResult.piliers?.[key];
              if (!prev) return null;
              const meta = PILIER_META[key] || { emoji: "📌", label: key };
              return (
                <div key={key} className="inline-flex items-center gap-1.5 text-xs bg-muted px-2 py-1 rounded-pill">
                  <span>{meta.emoji}</span>
                  <span className="text-foreground">{meta.label}</span>
                  <ScoreDiff current={pilier.score} previous={prev.score} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Header : Score global ── */}
      <div className="rounded-2xl border border-border bg-card p-8 flex flex-col items-center text-center">
        <ScoreCircle score={displayResult.score_global || 0} />
        <p className="text-[11px] italic text-muted-foreground mt-2">Score de site : bonnes pratiques et conversion</p>
        <p className="mt-4 text-sm text-muted-foreground max-w-lg">{displayResult.synthese}</p>
        <div className="mt-3 flex flex-wrap gap-2 justify-center">
          <span className="inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-pill bg-muted text-muted-foreground">
            📄 {displayResult.pages_analysees?.length || 1} page{(displayResult.pages_analysees?.length || 1) > 1 ? "s" : ""} analysée{(displayResult.pages_analysees?.length || 1) > 1 ? "s" : ""}
          </span>
          {displayResult.pages_en_erreur?.length > 0 && (
            <span className="inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-pill bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
              ⚠️ {displayResult.pages_en_erreur.length} page{displayResult.pages_en_erreur.length > 1 ? "s" : ""} en erreur
            </span>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-3 justify-center">
          {!viewingOld && onRerun && (
            <Button variant="outline" size="sm" className="gap-2 rounded-pill" onClick={onRerun}>
              <RotateCcw className="h-4 w-4" /> Refaire l'audit
            </Button>
          )}
          {!viewingOld && (
            <Button variant="ghost" size="sm" className="gap-2 rounded-pill" onClick={() => navigate("/site/audit?mode=screenshot")}>
              <Camera className="h-4 w-4" /> Compléter avec un audit visuel
            </Button>
          )}
          {pastAudits.length > 1 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2 rounded-pill">
                  <History className="h-4 w-4" /> Voir tous mes audits
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-64">
                {pastAudits.map((audit, i) => (
                  <DropdownMenuItem
                    key={audit.id}
                    onClick={() => {
                      if (i === 0) { setViewingOld(null); } else { setViewingOld(audit); }
                    }}
                    className="flex items-center justify-between"
                  >
                    <span className="text-sm">
                      {format(new Date(audit.created_at), "d MMM yyyy", { locale: fr })}
                      {i === 0 && " (actuel)"}
                    </span>
                    <span className={`text-sm font-bold ${scoreColor(audit.score_global)}`}>
                      {audit.score_global}/100
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* ── Points forts ── */}
      {displayResult.points_forts?.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-6 space-y-3">
          <h3 className="font-display text-base font-bold text-foreground">✅ Points forts</h3>
          <ul className="space-y-2">
            {displayResult.points_forts.map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                <span className="shrink-0 mt-0.5 text-emerald-500">●</span>
                <div>
                  <span className="font-medium">{p.titre}</span>
                  <span className="text-muted-foreground"> — {p.detail}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Suggestions branding (si détecté depuis le site) ── */}
      {!viewingOld && displayResult.branding_prefill_from_site && (
        <SiteAuditBrandingSuggestions
          prefill={displayResult.branding_prefill_from_site}
          workspaceFilter={workspaceFilter}
          userId={userId}
        />
      )}

      {/* ── Priorités d'action ── */}
      {displayResult.priorites?.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-display text-base font-bold text-foreground">🎯 Tes 3 priorités</h3>
          <div className="space-y-3">
            {displayResult.priorites.slice(0, 3).map((prio, i) => (
              <div key={i} className="rounded-2xl border border-primary/20 bg-rose-pale p-5 flex gap-4 items-start">
                <span className="flex items-center justify-center h-9 w-9 rounded-full bg-primary/10 text-primary text-lg font-bold shrink-0">
                  {i + 1}
                </span>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-bold text-foreground">{prio.titre}</h4>
                    <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-pill ${
                      prio.impact === "fort"
                        ? "bg-primary/10 text-primary"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                    }`}>
                      Impact {prio.impact}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{prio.detail}</p>
                  {!viewingOld && prio.module_route && (
                    <Button variant="outline" size="sm" className="gap-1.5 rounded-pill text-xs" onClick={() => navigate(prio.module_route!)}>
                      {prio.module_label || "Commencer"} <ArrowRight className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Piliers (grille) ── */}
      <div className="space-y-3">
        <h3 className="font-display text-base font-bold text-foreground">📊 Détail par pilier</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {pilierEntries.map(([key, pilier]) => {
            const meta = PILIER_META[key] || { emoji: "📌", label: key };
            const badge = STATUT_BADGE[pilier.statut] || STATUT_BADGE.flou;
            const isOpen = expandedPilier === key;
            const prevPilier = previousResult?.piliers?.[key];

            return (
              <Collapsible key={key} open={isOpen} onOpenChange={() => setExpandedPilier(isOpen ? null : key)}>
                <CollapsibleTrigger className="w-full">
                  <div className="rounded-2xl border border-border bg-card p-4 hover:border-primary/40 transition-all cursor-pointer text-left">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{meta.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-foreground block truncate">{meta.label}</span>
                      </div>
                      <span className={`text-lg font-bold ${scoreColor(pilier.score)}`}>{pilier.score}</span>
                      {!viewingOld && prevPilier && (
                        <ScoreDiff current={pilier.score} previous={prevPilier.score} />
                      )}
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-pill ${badge.className}`}>
                        {badge.label}
                      </span>
                      {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="rounded-b-2xl border border-t-0 border-border bg-card px-4 pb-4 space-y-3">
                    {pilier.ce_qui_existe && (
                      <div>
                        <p className="text-xs font-bold text-emerald-600 mb-1">✅ Ce qui existe</p>
                        <p className="text-sm text-muted-foreground">{pilier.ce_qui_existe}</p>
                      </div>
                    )}
                    {pilier.ce_qui_manque && (
                      <div>
                        <p className="text-xs font-bold text-red-500 mb-1">❌ Ce qui manque</p>
                        <p className="text-sm text-muted-foreground">{pilier.ce_qui_manque}</p>
                      </div>
                    )}
                    {pilier.recommandation && (
                      <div>
                        <p className="text-xs font-bold text-primary mb-1">💡 Recommandation</p>
                        <p className="text-sm text-muted-foreground">{pilier.recommandation}</p>
                      </div>
                    )}
                    {!viewingOld && pilier.module_route && (
                      <Button variant="outline" size="sm" className="gap-1.5 rounded-pill text-xs" onClick={() => navigate(pilier.module_route!)}>
                        Aller au module <ArrowRight className="h-3 w-3" />
                      </Button>
                    )}
                    {/* Garde-fou branding vide */}
                    {key === "coherence_branding" && !viewingOld && (() => {
                      const emptyFields = displayResult.branding_prefill_from_site?.empty_fields;
                      const brandingIsLikelyEmpty = emptyFields
                        ? Object.values(emptyFields).filter(v => v).length >= 3
                        : (pilier.statut === "absent" || (pilier.statut === "flou" && pilier.score <= 30));
                      if (!brandingIsLikelyEmpty) return null;
                      return (
                        <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3 mt-2">
                          <p className="text-xs text-amber-800 dark:text-amber-300">
                            💡 Ce score sera plus pertinent une fois ton branding complété. L'IA compare ton site avec ton profil de marque : si celui-ci est vide, la comparaison n'a pas beaucoup de sens.
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 rounded-pill text-xs mt-2 border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950"
                            onClick={() => navigate("/branding")}
                          >
                            Compléter mon branding <ArrowRight className="h-3 w-3" />
                          </Button>
                        </div>
                      );
                    })()}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      </div>

      {/* ── Analyse par page ── */}
      {displayResult.analyse_par_page && Object.keys(displayResult.analyse_par_page).length > 1 && (
        <div className="space-y-3">
          <h3 className="font-display text-base font-bold text-foreground">📄 Analyse par page</h3>
          <Tabs defaultValue={Object.keys(displayResult.analyse_par_page)[0]}>
            <TabsList className="w-full justify-start overflow-x-auto">
              {Object.keys(displayResult.analyse_par_page).map(path => (
                <TabsTrigger key={path} value={path} className="text-xs">
                  {path === "/" ? "Accueil" : path}
                </TabsTrigger>
              ))}
            </TabsList>
            {Object.entries(displayResult.analyse_par_page).map(([path, page]) => (
              <TabsContent key={path} value={path}>
                <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                  <div className="flex items-center gap-3">
                    <span className={`text-xl font-bold ${scoreColor(page.score)}`}>{page.score}/100</span>
                    <p className="text-sm text-muted-foreground flex-1">{page.resume}</p>
                  </div>
                  {page.problemes?.length > 0 && (
                    <ul className="space-y-1.5">
                      {page.problemes.map((prob, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                          <span className="shrink-0 mt-0.5 text-amber-500">⚠️</span>
                          <span>{prob}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      )}

      {/* ── Plan d'action complet ── */}
      {displayResult.plan_action?.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-base font-bold text-foreground">📋 Plan d'action complet</h3>
            {!viewingOld && (
              <button
                onClick={() => setChecklistMode(prev => !prev)}
                className="text-xs text-primary font-semibold hover:underline"
              >
                {checklistMode ? "Vue liste" : "Vue checklist ✓"}
              </button>
            )}
          </div>
          <div className="space-y-2">
            {displayResult.plan_action.map((action, idx) => (
              <div key={idx} className={`rounded-xl border border-border bg-card p-4 flex items-start gap-3 ${checkedActions[idx] ? "opacity-60" : ""}`}>
                {checklistMode && !viewingOld ? (
                  <Checkbox
                    checked={!!checkedActions[idx]}
                    onCheckedChange={() => toggleChecked(idx)}
                    className="mt-0.5"
                  />
                ) : (
                  <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
                    {action.priorite || idx + 1}
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm text-foreground ${checkedActions[idx] ? "line-through" : ""}`}>
                    {action.action}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {action.module && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-pill bg-muted text-muted-foreground">
                        {action.module}
                      </span>
                    )}
                    {action.temps_estime && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-pill bg-muted text-muted-foreground">
                        ⏱️ {action.temps_estime}
                      </span>
                    )}
                  </div>
                </div>
                {!viewingOld && action.route && !checkedActions[idx] && (
                  <Button variant="ghost" size="sm" className="shrink-0 gap-1 rounded-pill text-xs" onClick={() => navigate(action.route!)}>
                    Faire <ArrowRight className="h-3 w-3" />
                  </Button>
                )}
                {checkedActions[idx] && (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
