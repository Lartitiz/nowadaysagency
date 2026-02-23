import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Loader2, ChevronDown, ChevronUp, ArrowRight, RefreshCw, ExternalLink, Check, MessageCircle } from "lucide-react";
import AuditCoachingPanel from "@/components/audit/AuditCoachingPanel";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

/* ─── Types ─── */
interface PillarDetail {
  score: number;
  statut: string;
  ce_qui_existe: string | null;
  ce_qui_manque: string | null;
  recommandation: string | null;
}

interface AuditResult {
  score_global: number;
  synthese: string;
  points_forts: { titre: string; detail: string; source: string }[];
  points_faibles: { titre: string; detail: string; source: string; priorite: string }[];
  audit_detail: Record<string, PillarDetail>;
  plan_action_recommande: { priorite: number; action: string; module: string; temps_estime: string; lien: string }[];
  extraction_branding?: Record<string, any>;
}

interface CompletedRec {
  id: string;
  module: string;
  completed: boolean;
  completed_at: string | null;
}

/* ─── Pillar metadata ─── */
const PILLAR_META: Record<string, { emoji: string; label: string; coachingModule: string; actionLabel: string; hasCoaching: boolean }> = {
  positionnement: { emoji: "🎯", label: "Positionnement", coachingModule: "branding", actionLabel: "Clarifier mon positionnement", hasCoaching: true },
  cible: { emoji: "👤", label: "Cible", coachingModule: "persona", actionLabel: "Retravailler ma cible", hasCoaching: true },
  ton_voix: { emoji: "🗣️", label: "Ton / Voix", coachingModule: "tone", actionLabel: "Définir mon ton", hasCoaching: true },
  offres: { emoji: "🎁", label: "Offres", coachingModule: "offers", actionLabel: "Reformuler mes offres", hasCoaching: true },
  storytelling: { emoji: "📖", label: "Storytelling", coachingModule: "story", actionLabel: "Écrire mon histoire", hasCoaching: true },
  identite_visuelle: { emoji: "🎨", label: "Identité visuelle", coachingModule: "branding", actionLabel: "Travailler mon identité", hasCoaching: false },
  coherence_cross_canal: { emoji: "🔗", label: "Cohérence canaux", coachingModule: "branding", actionLabel: "Unifier ma communication", hasCoaching: false },
  contenu: { emoji: "📝", label: "Contenu", coachingModule: "editorial", actionLabel: "Créer une ligne éditoriale", hasCoaching: true },
};

/* ─── Module → fallback route ─── */
const MODULE_ROUTES: Record<string, string> = {
  persona: "/branding", cible: "/branding", branding: "/branding", positionnement: "/branding",
  offers: "/branding", offres: "/branding", bio: "/instagram", bio_instagram: "/instagram",
  story: "/branding", storytelling: "/branding", histoire: "/branding",
  tone: "/branding", ton: "/branding", voix: "/branding",
  editorial: "/branding", ligne_editoriale: "/branding",
  content: "/instagram/creer", contenu: "/instagram/creer",
  instagram: "/instagram", highlights: "/instagram",
  linkedin: "/linkedin", calendar: "/calendrier", calendrier: "/calendrier",
  contacts: "/contacts", engagement: "/contacts",
  seo: "https://referencement-seo.lovable.app/",
};

function getRouteForAction(action: { module?: string; action?: string }): string {
  const mod = action.module?.toLowerCase()?.trim();
  if (mod && MODULE_ROUTES[mod]) return MODULE_ROUTES[mod];
  const title = (action.action || "").toLowerCase();
  if (title.includes("cible") || title.includes("persona")) return "/branding";
  if (title.includes("bio")) return "/instagram";
  if (title.includes("offre")) return "/branding";
  if (title.includes("story") || title.includes("histoire")) return "/branding";
  if (title.includes("ton") || title.includes("voix")) return "/branding";
  if (title.includes("highlight")) return "/instagram";
  if (title.includes("ligne") || title.includes("éditorial") || title.includes("editorial")) return "/branding";
  if (title.includes("contenu") || title.includes("content")) return "/instagram/creer";
  if (title.includes("calendrier") || title.includes("calendar")) return "/calendrier";
  if (title.includes("seo")) return "https://referencement-seo.lovable.app/";
  if (title.includes("engagement")) return "/contacts";
  return "/branding";
}

function getCoachingModuleForAction(action: { module?: string; action?: string }): string | null {
  const mod = action.module?.toLowerCase()?.trim();
  const title = (action.action || "").toLowerCase();
  if (mod === "persona" || mod === "cible" || title.includes("cible") || title.includes("persona")) return "persona";
  if (mod === "offers" || mod === "offres" || title.includes("offre")) return "offers";
  if (mod === "bio" || mod === "bio_instagram" || title.includes("bio")) return "bio";
  if (mod === "story" || mod === "storytelling" || mod === "histoire" || title.includes("story") || title.includes("histoire")) return "story";
  if (mod === "tone" || mod === "ton" || mod === "voix" || title.includes("ton") || title.includes("voix")) return "tone";
  if (mod === "editorial" || mod === "ligne_editoriale" || title.includes("éditorial") || title.includes("editorial") || title.includes("ligne")) return "editorial";
  return null;
}

const STATUT_COLORS: Record<string, string> = {
  absent: "text-red-500", flou: "text-amber-500", bon: "text-emerald-500", excellent: "text-emerald-600",
};

const SCORE_BAR_COLOR = (score: number) =>
  score >= 75 ? "bg-emerald-500" : score >= 50 ? "bg-amber-400" : "bg-red-500";

export default function BrandingAuditResultPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [auditDate, setAuditDate] = useState<string | null>(null);
  const [expandedPillar, setExpandedPillar] = useState<string | null>(null);

  // Coaching panel state
  const [coachingOpen, setCoachingOpen] = useState(false);
  const [coachingModule, setCoachingModule] = useState("");
  const [coachingPillarKey, setCoachingPillarKey] = useState("");
  const [coachingPillarLabel, setCoachingPillarLabel] = useState("");
  const [coachingPillarEmoji, setCoachingPillarEmoji] = useState("");
  const [coachingRecId, setCoachingRecId] = useState<string | undefined>();
  const [coachingConseil, setCoachingConseil] = useState<string | undefined>();

  // Recommendation completion tracking
  const [completedRecs, setCompletedRecs] = useState<Record<string, CompletedRec>>({});

  const loadAuditData = useCallback(async () => {
    if (!user || !id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("branding_audits")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error || !data) {
      navigate("/branding/audit", { replace: true });
      return;
    }

    setAuditDate(new Date(data.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }));
    setResult({
      score_global: data.score_global ?? 0,
      synthese: data.synthese ?? "",
      points_forts: (data.points_forts as any[]) || [],
      points_faibles: (data.points_faibles as any[]) || [],
      audit_detail: (data.audit_detail as unknown as Record<string, PillarDetail>) || {},
      plan_action_recommande: (data.plan_action as any[]) || [],
      extraction_branding: data.extraction_branding as Record<string, any> | undefined,
    });
    setLoading(false);
  }, [user, id]);

  const loadCompletedRecs = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("audit_recommendations")
      .select("id, module, completed, completed_at")
      .eq("user_id", user.id)
      .eq("completed", true);
    if (data) {
      const map: Record<string, CompletedRec> = {};
      data.forEach(r => { map[r.module] = r as CompletedRec; });
      setCompletedRecs(map);
    }
  }, [user]);

  useEffect(() => {
    loadAuditData();
    loadCompletedRecs();
  }, [loadAuditData, loadCompletedRecs]);

  const handleNavigate = (route: string) => {
    if (route.startsWith("http")) {
      window.open(route, "_blank", "noopener,noreferrer");
    } else {
      navigate(route);
    }
  };

  const openCoaching = (pillarKey: string, meta: typeof PILLAR_META[string], conseil?: string) => {
    setCoachingModule(meta.coachingModule);
    setCoachingPillarKey(pillarKey);
    setCoachingPillarLabel(meta.label);
    setCoachingPillarEmoji(meta.emoji);
    setCoachingConseil(conseil);
    // Try to find a matching rec ID
    const rec = completedRecs[meta.coachingModule];
    setCoachingRecId(rec?.id);
    setCoachingOpen(true);
  };

  const openCoachingForAction = (action: { module?: string; action?: string; temps_estime?: string }) => {
    const coachMod = getCoachingModuleForAction(action);
    if (!coachMod) {
      handleNavigate(getRouteForAction(action));
      return;
    }
    // Find pillar meta matching this coaching module
    const pillarEntry = Object.entries(PILLAR_META).find(([_, m]) => m.coachingModule === coachMod);
    if (pillarEntry) {
      openCoaching(pillarEntry[0], pillarEntry[1], action.action);
    } else {
      handleNavigate(getRouteForAction(action));
    }
  };

  const handleCoachingComplete = () => {
    loadCompletedRecs();
  };

  const isModuleCompleted = (coachingModule: string) => !!completedRecs[coachingModule];

  const getCompletedDate = (coachingModule: string) => {
    const rec = completedRecs[coachingModule];
    if (!rec?.completed_at) return null;
    try {
      return format(new Date(rec.completed_at), "d MMM", { locale: fr });
    } catch { return null; }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="container max-w-2xl mx-auto px-4 py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </main>
      </div>
    );
  }

  if (!result) return null;

  const scoreColor = result.score_global >= 75 ? "text-emerald-500" : result.score_global >= 50 ? "text-amber-500" : "text-red-500";

  // Count completed actions for progress
  const totalActions = Object.keys(result.audit_detail).filter(k => PILLAR_META[k]?.hasCoaching).length;
  const completedActions = Object.keys(result.audit_detail).filter(k => {
    const meta = PILLAR_META[k];
    return meta?.hasCoaching && isModuleCompleted(meta.coachingModule);
  }).length;
  const progressPercent = totalActions > 0 ? Math.round((completedActions / totalActions) * 100) : 0;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="container max-w-2xl mx-auto px-4 py-6 pb-24">
        <SubPageHeader currentLabel="🔍 Résultats de l'audit" parentLabel="Branding" parentTo="/branding" />

        {auditDate && (
          <p className="text-xs text-muted-foreground mb-6">Audit réalisé le {auditDate}</p>
        )}

        <div className="space-y-6">
          {/* Score global */}
          <div className="rounded-2xl border border-border bg-card p-6 text-center">
            <p className={`text-5xl font-display font-bold ${scoreColor}`}>
              {result.score_global}<span className="text-lg text-muted-foreground">/100</span>
            </p>
            <div className="w-full max-w-xs mx-auto mt-3">
              <div className="h-3 rounded-full bg-muted overflow-hidden">
                <div className={`h-full rounded-full transition-all ${SCORE_BAR_COLOR(result.score_global)}`} style={{ width: `${result.score_global}%` }} />
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-4 leading-relaxed">{result.synthese}</p>
          </div>

          {/* Progress bar global */}
          {totalActions > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-foreground">{completedActions}/{totalActions} actions complétées</p>
                <span className="text-xs text-muted-foreground">{progressPercent}%</span>
              </div>
              <Progress value={progressPercent} className="h-2" />
            </div>
          )}

          {/* Points forts */}
          {result.points_forts?.length > 0 && (
            <div>
              <h3 className="font-display font-bold text-sm mb-3">Ce qui marche ✅</h3>
              <div className="space-y-2">
                {result.points_forts.map((p, i) => (
                  <div key={i} className="rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30 p-4">
                    <p className="text-sm font-medium text-foreground">✅ {p.titre}</p>
                    <p className="text-xs text-muted-foreground mt-1">{p.detail}</p>
                    <p className="text-[10px] text-muted-foreground/70 mt-1">Source : {p.source}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Points faibles */}
          {result.points_faibles?.length > 0 && (
            <div>
              <h3 className="font-display font-bold text-sm mb-3">Ce qui manque ⚠️</h3>
              <div className="space-y-2">
                {result.points_faibles.map((p, i) => (
                  <div key={i} className={`rounded-xl border p-4 ${p.priorite === "haute" ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30" : "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30"}`}>
                    <p className="text-sm font-medium text-foreground">{p.priorite === "haute" ? "🔴" : "🟡"} {p.titre}</p>
                    <p className="text-xs text-muted-foreground mt-1">{p.detail}</p>
                    <p className="text-[10px] text-muted-foreground/70 mt-1">Priorité : {p.priorite}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Detail par pilier */}
          {Object.keys(result.audit_detail || {}).length > 0 && (
            <div>
              <h3 className="font-display font-bold text-sm mb-3">Détail par pilier</h3>
              <div className="space-y-2">
                {Object.entries(result.audit_detail).map(([key, pillar]) => {
                  const meta = PILLAR_META[key] || { emoji: "📋", label: key, coachingModule: "branding", actionLabel: "Travailler ce pilier", hasCoaching: false };
                  const isExpanded = expandedPillar === key;
                  const completed = meta.hasCoaching && isModuleCompleted(meta.coachingModule);
                  const completedDate = completed ? getCompletedDate(meta.coachingModule) : null;

                  return (
                    <div key={key} className={`rounded-xl border overflow-hidden ${completed ? "border-emerald-200 bg-emerald-50/30 dark:border-emerald-900 dark:bg-emerald-950/10" : "border-border bg-card"}`}>
                      <button className="w-full flex items-center gap-3 p-4 text-left" onClick={() => setExpandedPillar(isExpanded ? null : key)}>
                        <span className="text-base">{meta.emoji}</span>
                        <span className="text-sm font-medium flex-1">
                          {meta.label}
                          {completed && <span className="ml-1.5 text-emerald-600">✅</span>}
                        </span>
                        <span className={`text-xs font-mono ${STATUT_COLORS[pillar.statut] || "text-muted-foreground"}`}>
                          {pillar.score}/100 · {pillar.statut}
                        </span>
                        <div className="w-20 h-2 rounded-full bg-muted overflow-hidden">
                          <div className={`h-full rounded-full ${SCORE_BAR_COLOR(pillar.score)}`} style={{ width: `${pillar.score}%` }} />
                        </div>
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </button>
                      {isExpanded && (
                        <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                          {pillar.ce_qui_existe && (
                            <div><p className="text-[10px] font-semibold text-emerald-600 uppercase">Ce qui existe</p><p className="text-xs text-muted-foreground">{pillar.ce_qui_existe}</p></div>
                          )}
                          {pillar.ce_qui_manque && (
                            <div><p className="text-[10px] font-semibold text-amber-600 uppercase">Ce qui manque</p><p className="text-xs text-muted-foreground">{pillar.ce_qui_manque}</p></div>
                          )}
                          {pillar.recommandation && (
                            <div><p className="text-[10px] font-semibold text-primary uppercase">Recommandation</p><p className="text-xs text-muted-foreground">{pillar.recommandation}</p></div>
                          )}

                          {/* Action button with coaching state */}
                          {meta.hasCoaching ? (
                            completed ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="w-full mt-2 gap-2 justify-center text-emerald-700 hover:text-emerald-800"
                                onClick={() => handleNavigate(MODULE_ROUTES[meta.coachingModule] || "/branding")}
                              >
                                <Check className="h-3.5 w-3.5" />
                                Fait{completedDate ? ` le ${completedDate}` : ""} · Voir les modifications
                                <ArrowRight className="h-3.5 w-3.5" />
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="w-full mt-2 gap-2 justify-center"
                                onClick={() => openCoaching(key, meta, pillar.recommandation || undefined)}
                              >
                                <MessageCircle className="h-3.5 w-3.5 text-primary" />
                                {meta.emoji} {meta.actionLabel}
                                <ArrowRight className="h-3.5 w-3.5" />
                              </Button>
                            )
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="w-full mt-2 gap-2 justify-center"
                              onClick={() => handleNavigate(MODULE_ROUTES[meta.coachingModule] || "/branding")}
                            >
                              {meta.emoji} {meta.actionLabel}
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Plan d'action */}
          {result.plan_action_recommande?.length > 0 && (
            <div>
              <h3 className="font-display font-bold text-sm mb-3">Plan d'action recommandé</h3>
              <div className="space-y-2">
                {result.plan_action_recommande.map((a, i) => {
                  const route = getRouteForAction(a);
                  const isExternal = route.startsWith("http");
                  const coachMod = getCoachingModuleForAction(a);
                  const completed = coachMod ? isModuleCompleted(coachMod) : false;
                  const completedDate = coachMod ? getCompletedDate(coachMod) : null;

                  return (
                    <button
                      key={i}
                      onClick={() => {
                        if (completed) {
                          handleNavigate(route);
                        } else if (coachMod) {
                          openCoachingForAction(a);
                        } else {
                          handleNavigate(route);
                        }
                      }}
                      className={`w-full rounded-xl border transition-colors p-4 text-left flex items-center gap-3 ${
                        completed
                          ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20"
                          : "border-border bg-card hover:bg-muted/50"
                      }`}
                    >
                      {completed ? (
                        <span className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-600 text-xs font-bold flex items-center justify-center shrink-0">
                          <Check className="h-3.5 w-3.5" />
                        </span>
                      ) : (
                        <span className="w-6 h-6 rounded-lg bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">{a.priorite}</span>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${completed ? "line-through text-muted-foreground" : ""}`}>{a.action}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {completed && completedDate ? `Fait le ${completedDate}` : a.temps_estime}
                        </p>
                      </div>
                      {isExternal ? (
                        <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : completed ? (
                        <span className="text-xs text-emerald-600 font-medium shrink-0">Voir →</span>
                      ) : coachMod ? (
                        <MessageCircle className="h-4 w-4 text-primary shrink-0" />
                      ) : (
                        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-3 pt-2">
            <Button variant="outline" className="w-full gap-2" onClick={() => navigate("/branding/audit")}>
              <RefreshCw className="h-4 w-4" /> Refaire un audit
            </Button>
          </div>
        </div>
      </main>

      {/* Coaching Panel */}
      <AuditCoachingPanel
        open={coachingOpen}
        onOpenChange={setCoachingOpen}
        module={coachingModule}
        pillarKey={coachingPillarKey}
        pillarLabel={coachingPillarLabel}
        pillarEmoji={coachingPillarEmoji}
        recId={coachingRecId}
        conseil={coachingConseil}
        onComplete={handleCoachingComplete}
        onSkipToModule={(route) => handleNavigate(route)}
      />
    </div>
  );
}
