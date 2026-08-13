import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Loader2, ChevronDown, ChevronUp, ArrowRight, RefreshCw, ExternalLink, Check, MessageCircle, Square, CheckSquare, Target, User, Gift, BookOpen, Palette, Link2, FileText, ClipboardList, CheckCircle2, AlertTriangle, PenLine, Camera, Star, Pin, type LucideIcon } from "lucide-react";
import AuditCoachingPanel from "@/components/audit/AuditCoachingPanel";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import AiGeneratedMention from "@/components/AiGeneratedMention";

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

interface AuditRec {
  id: string;
  module: string;
  label: string;
  completed: boolean;
  completed_at: string | null;
  position: number | null;
}

/* ─── Pillar metadata ─── */
const PILLAR_META: Record<string, { emoji: string; icon: LucideIcon; label: string; coachingModule: string; actionLabel: string; hasCoaching: boolean }> = {
  positionnement: { emoji: "🎯", icon: Target, label: "Positionnement", coachingModule: "branding", actionLabel: "Clarifier mon positionnement", hasCoaching: true },
  cible: { emoji: "👤", icon: User, label: "Cible", coachingModule: "persona", actionLabel: "Retravailler ma cible", hasCoaching: true },
  ton_voix: { emoji: "🗣️", icon: MessageCircle, label: "Ton / Voix", coachingModule: "tone", actionLabel: "Définir mon ton", hasCoaching: true },
  offres: { emoji: "🎁", icon: Gift, label: "Offres", coachingModule: "offers", actionLabel: "Reformuler mes offres", hasCoaching: true },
  storytelling: { emoji: "📖", icon: BookOpen, label: "Storytelling", coachingModule: "story", actionLabel: "Écrire mon histoire", hasCoaching: true },
  identite_visuelle: { emoji: "🎨", icon: Palette, label: "Identité visuelle", coachingModule: "branding", actionLabel: "Travailler mon identité", hasCoaching: false },
  coherence_cross_canal: { emoji: "🔗", icon: Link2, label: "Cohérence canaux", coachingModule: "branding", actionLabel: "Unifier ma communication", hasCoaching: false },
  contenu: { emoji: "📝", icon: FileText, label: "Contenu", coachingModule: "editorial", actionLabel: "Créer une ligne éditoriale", hasCoaching: true },
};

/* ─── Module → fallback route ─── */
const MODULE_ROUTES: Record<string, string> = {
  persona: "/branding", cible: "/branding", branding: "/branding", positionnement: "/branding",
  offers: "/branding", offres: "/branding", bio: "/instagram", bio_instagram: "/instagram",
  story: "/branding", storytelling: "/branding", histoire: "/branding",
  tone: "/branding", ton: "/branding", voix: "/branding",
  editorial: "/branding", ligne_editoriale: "/branding",
  content: "/creer", contenu: "/creer",
  instagram: "/instagram", highlights: "/instagram",
  linkedin: "/linkedin", calendar: "/calendrier", calendrier: "/calendrier",
  contacts: "/contacts", engagement: "/contacts",
  seo: "/seo",
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
  if (title.includes("contenu") || title.includes("content")) return "/creer";
  if (title.includes("calendrier") || title.includes("calendar")) return "/calendrier";
  if (title.includes("seo")) return "/seo";
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
  absent: "text-error", flou: "text-warning", bon: "text-success", excellent: "text-success",
};

const SCORE_BAR_COLOR = (score: number) =>
  score >= 75 ? "bg-success" : score >= 50 ? "bg-warning" : "bg-error";

/* ─── Render-safety ───
   Les audits sont produits par l'IA ; d'anciens audits ont un schéma différent
   (un champ texte peut être un objet { title, detail }). Rendre cet objet brut
   dans le JSX fait planter toute la page (React error #31). asText() coerce
   n'importe quelle valeur en chaîne sûre et ne rend jamais un objet brut. */
function asText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join(", ");
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    const heading = o.titre ?? o.title ?? o.label;
    const body = o.detail ?? o.description ?? o.text;
    const parts = [heading, body].filter((p) => typeof p === "string" && p) as string[];
    return parts.join(" : ");
  }
  return "";
}

export default function BrandingAuditResultPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
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

  // Recommendation completion tracking — keyed by rec ID
  const [auditRecs, setAuditRecs] = useState<AuditRec[]>([]);
  // Instagram audit scores for pillar action plan
  const [igScores, setIgScores] = useState<Record<string, number> | null>(null);

  const loadAuditData = useCallback(async () => {
    if (!user || !id) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase
        .from("branding_audits") as any)
        .select("*")
        .eq("id", id)
        .eq(column, value)
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
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [user, id, column, value]);

  const loadAuditRecs = useCallback(async () => {
    if (!user || !id) return;
    const { data } = await (supabase
      .from("audit_recommendations") as any)
      .select("id, module, label, completed, completed_at, position")
      .eq(column, value)
      .eq("audit_id", id)
      .order("position", { ascending: true });
    if (data) setAuditRecs(data as AuditRec[]);
  }, [user, id, column, value]);

  // Build a lookup by module for pillar section
  const completedRecs: Record<string, AuditRec> = {};
  auditRecs.forEach(r => { if (r.completed) completedRecs[r.module] = r; });

  const loadIgScores = useCallback(async () => {
    if (!user) return;
    const { data } = await (supabase.from("instagram_audit") as any)
      .select("score_bio, score_feed, score_edito, score_stories, score_epingles")
      .eq(column, value)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) setIgScores(data);
  }, [user, column, value]);

  useEffect(() => {
    loadAuditData();
    loadAuditRecs();
    loadIgScores();
  }, [loadAuditData, loadAuditRecs, loadIgScores]);

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
    loadAuditRecs();
  };

  const toggleRecCompletion = async (recId: string, currentlyCompleted: boolean) => {
    const newCompleted = !currentlyCompleted;
    // Optimistic update
    setAuditRecs(prev => prev.map(r => r.id === recId ? { ...r, completed: newCompleted, completed_at: newCompleted ? new Date().toISOString() : null } : r));
    await supabase
      .from("audit_recommendations")
      .update({
        completed: newCompleted,
        completed_at: newCompleted ? new Date().toISOString() : null,
      })
      .eq("id", recId);
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

  const scoreColor = result.score_global >= 75 ? "text-success" : result.score_global >= 50 ? "text-warning" : "text-error";

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
        <SubPageHeader currentLabel="Résultats de l'audit" parentLabel="Mon identité" parentTo="/branding" />

        {auditDate && (
          <p className="text-xs text-muted-foreground mb-6">Audit réalisé le {auditDate}</p>
        )}

        <div className="space-y-6" data-selection-enabled="true">
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
            <p className="text-sm text-muted-foreground mt-4 leading-relaxed">{asText(result.synthese)}</p>
          </div>
          <AiGeneratedMention />

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
              <h3 className="font-body font-bold text-sm mb-3">Ce qui marche ✅</h3>
              <div className="space-y-2">
                {result.points_forts.map((p, i) => (
                  <div key={i} className="rounded-xl border border-success/30 bg-success-bg p-4">
                    <p className="text-sm font-medium text-foreground flex items-start gap-1.5"><CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" strokeWidth={1.75} /><span>{asText(p.titre)}</span></p>
                    <p className="text-xs text-muted-foreground mt-1">{asText(p.detail)}</p>
                    <p className="text-2xs text-muted-foreground/70 mt-1">Source : {asText(p.source)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Points faibles */}
          {result.points_faibles?.length > 0 && (
            <div>
              <h3 className="font-body font-bold text-sm mb-3">Ce qui manque ⚠️</h3>
              <div className="space-y-2">
                {result.points_faibles.map((p, i) => (
                  <div key={i} className={`rounded-xl border p-4 ${p.priorite === "haute" ? "border-error/30 bg-error-bg" : "border-warning/30 bg-warning-bg"}`}>
                    <p className="text-sm font-medium text-foreground flex items-start gap-1.5"><AlertTriangle className={`h-4 w-4 shrink-0 mt-0.5 ${p.priorite === "haute" ? "text-error" : "text-warning"}`} strokeWidth={1.75} /><span>{asText(p.titre)}</span></p>
                    <p className="text-xs text-muted-foreground mt-1">{asText(p.detail)}</p>
                    <p className="text-2xs text-muted-foreground/70 mt-1">Priorité : {asText(p.priorite)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Detail par pilier */}
          {Object.keys(result.audit_detail || {}).length > 0 && (
            <div>
              <h3 className="font-body font-bold text-sm mb-3">Détail par pilier</h3>
              <div className="space-y-2">
                {Object.entries(result.audit_detail).map(([key, pillar]) => {
                  const meta = PILLAR_META[key] || { emoji: "📋", icon: ClipboardList, label: key, coachingModule: "branding", actionLabel: "Travailler ce pilier", hasCoaching: false };
                  const isExpanded = expandedPillar === key;
                  const completed = meta.hasCoaching && isModuleCompleted(meta.coachingModule);
                  const completedDate = completed ? getCompletedDate(meta.coachingModule) : null;

                  return (
                    <div key={key} className={`rounded-xl border overflow-hidden ${completed ? "border-success/30 bg-success-bg/30" : "border-border bg-card"}`}>
                      <button className="w-full flex items-center gap-3 p-4 text-left" onClick={() => setExpandedPillar(isExpanded ? null : key)}>
                        <meta.icon className="h-5 w-5 text-primary shrink-0" strokeWidth={1.75} />
                        <span className="text-sm font-medium flex-1">
                          {meta.label}
                          {completed && <CheckCircle2 className="inline h-3.5 w-3.5 ml-1.5 text-success align-text-bottom" strokeWidth={1.75} />}
                        </span>
                        <span className={`text-xs font-mono ${STATUT_COLORS[pillar.statut] || "text-muted-foreground"}`}>
                          {pillar.score}/100 · {asText(pillar.statut)}
                        </span>
                        <div className="w-20 h-2 rounded-full bg-muted overflow-hidden">
                          <div className={`h-full rounded-full ${SCORE_BAR_COLOR(pillar.score)}`} style={{ width: `${pillar.score}%` }} />
                        </div>
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </button>
                      {isExpanded && (
                        <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                          {pillar.ce_qui_existe && (
                            <div><p className="text-2xs font-semibold text-success uppercase">Ce qui existe</p><p className="text-xs text-muted-foreground">{asText(pillar.ce_qui_existe)}</p></div>
                          )}
                          {pillar.ce_qui_manque && (
                            <div><p className="text-2xs font-semibold text-warning uppercase">Ce qui manque</p><p className="text-xs text-muted-foreground">{asText(pillar.ce_qui_manque)}</p></div>
                          )}
                          {pillar.recommandation && (
                            <div><p className="text-2xs font-semibold text-primary uppercase">Recommandation</p><p className="text-xs text-muted-foreground">{asText(pillar.recommandation)}</p></div>
                          )}

                          {/* Action button with coaching state */}
                          {meta.hasCoaching ? (
                            completed ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="w-full mt-2 gap-2 justify-center text-success hover:text-success"
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
                                {meta.actionLabel}
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
                              <meta.icon className="h-3.5 w-3.5 text-primary" strokeWidth={1.75} />
                              {meta.actionLabel}
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

          {/* Plan d'action avec checkboxes */}
          {auditRecs.length > 0 && (() => {
            const recCompletedCount = auditRecs.filter(r => r.completed).length;
            const recTotal = auditRecs.length;
            const recProgress = recTotal > 0 ? Math.round((recCompletedCount / recTotal) * 100) : 0;
            const allRecsDone = recCompletedCount === recTotal;
            // Sort: incomplete first (by position), then completed
            const sortedRecs = [...auditRecs].sort((a, b) => {
              if (a.completed && !b.completed) return 1;
              if (!a.completed && b.completed) return -1;
              return (a.position || 99) - (b.position || 99);
            });

            return (
              <div>
                <h3 className="font-body font-bold text-sm mb-3">Plan d'action recommandé</h3>
                {/* Progress */}
                <div className="rounded-xl border border-border bg-card p-4 mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-foreground">{recCompletedCount}/{recTotal} actions complétées</p>
                    <span className="text-xs text-muted-foreground">{recProgress}%</span>
                  </div>
                  <Progress value={recProgress} className="h-2" />
                </div>

                <div className="space-y-2">
                  {sortedRecs.map((rec) => {
                    const matchingAction = result.plan_action_recommande?.find(a => {
                      const coachMod = getCoachingModuleForAction(a);
                      return coachMod === rec.module || a.module === rec.module;
                    });
                    const route = matchingAction ? getRouteForAction(matchingAction) : (MODULE_ROUTES[rec.module] || "/branding");
                    const isExternal = route.startsWith("http");
                    const completedDateStr = rec.completed && rec.completed_at
                      ? (() => { try { return format(new Date(rec.completed_at), "d MMM", { locale: fr }); } catch { return null; } })()
                      : null;

                    return (
                      <div
                        key={rec.id}
                        className={`rounded-xl border transition-colors p-4 flex items-center gap-3 ${
                          rec.completed
                            ? "border-success/30 bg-success-bg/50"
                            : "border-border bg-card"
                        }`}
                      >
                        {/* Checkbox */}
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleRecCompletion(rec.id, rec.completed); }}
                          className="shrink-0 text-foreground hover:text-primary transition-colors"
                          aria-label={rec.completed ? "Marquer comme non fait" : "Marquer comme fait"}
                        >
                          {rec.completed ? (
                            <CheckSquare className="h-5 w-5 text-success" />
                          ) : (
                            <Square className="h-5 w-5 text-muted-foreground" />
                          )}
                        </button>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${rec.completed ? "line-through text-muted-foreground" : "text-foreground"}`}>
                            {asText(rec.label)}
                          </p>
                          <p className="text-2xs text-muted-foreground">
                            {rec.completed && completedDateStr ? `Fait le ${completedDateStr}` : (matchingAction?.temps_estime || "")}
                          </p>
                        </div>

                        {/* Navigation button */}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="shrink-0 gap-1 text-xs px-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isExternal) {
                              window.open(route, "_blank", "noopener,noreferrer");
                            } else {
                              const coachMod = getCoachingModuleForAction(matchingAction || { module: rec.module });
                              if (coachMod && !rec.completed) {
                                openCoachingForAction(matchingAction || { module: rec.module, action: rec.label });
                              } else {
                                handleNavigate(route);
                              }
                            }
                          }}
                        >
                          {isExternal ? (
                            <ExternalLink className="h-3.5 w-3.5" />
                          ) : rec.completed ? (
                            <>Voir <ArrowRight className="h-3 w-3" /></>
                          ) : (
                            <><MessageCircle className="h-3.5 w-3.5 text-primary" /> <ArrowRight className="h-3 w-3" /></>
                          )}
                        </Button>
                      </div>
                    );
                  })}
                </div>

                {/* Celebration when all done */}
                {allRecsDone && (
                  <div className="rounded-xl bg-success-bg p-4 text-center mt-3">
                    <p className="text-sm font-medium text-success mb-2">
                      🎉 Bravo ! Toutes les actions sont complétées.
                    </p>
                    <Button size="sm" variant="outline" onClick={() => navigate("/branding/audit")} className="gap-1.5 text-xs">
                      <RefreshCw className="h-3 w-3" /> Refaire un audit pour mesurer ta progression
                    </Button>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Fallback: show plan_action if no audit_recommendations exist */}
          {auditRecs.length === 0 && result.plan_action_recommande?.length > 0 && (
            <div>
              <h3 className="font-body font-bold text-sm mb-3">Plan d'action recommandé</h3>
              <div className="space-y-2">
                {result.plan_action_recommande.map((a, i) => {
                  const route = getRouteForAction(a);
                  const isExternal = route.startsWith("http");
                  return (
                    <button
                      key={i}
                      onClick={() => {
                        const coachMod = getCoachingModuleForAction(a);
                        if (coachMod) openCoachingForAction(a);
                        else handleNavigate(route);
                      }}
                      className="w-full rounded-xl border border-border bg-card hover:bg-muted/50 transition-colors p-4 text-left flex items-center gap-3"
                    >
                      <span className="w-6 h-6 rounded-lg bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">{a.priorite}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{asText(a.action)}</p>
                        <p className="text-2xs text-muted-foreground">{asText(a.temps_estime)}</p>
                      </div>
                      {isExternal ? <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" /> : <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── Instagram Pillar Action Plan ─── */}
          {igScores && (() => {
            const PILLAR_ACTIONS: Record<string, { label: string; coaching_module: string; route: string; emoji: string; icon: LucideIcon }> = {
              score_bio: { label: "Optimiser ma bio", coaching_module: "bio", route: "/instagram/profil/bio", emoji: "✍️", icon: PenLine },
              score_feed: { label: "Harmoniser mon feed", coaching_module: "feed", route: "/creer", emoji: "📸", icon: Camera },
              score_edito: { label: "Structurer ma ligne éditoriale", coaching_module: "editorial", route: "/branding/section?section=content_strategy", emoji: "🍒", icon: FileText },
              score_stories: { label: "Structurer mes stories à la une", coaching_module: "alaune", route: "/instagram/profil/stories", emoji: "⭐", icon: Star },
              score_epingles: { label: "Choisir mes posts épinglés", coaching_module: "epingles", route: "/instagram/profil/epingles", emoji: "📌", icon: Pin },
            };
            const sorted = Object.entries(PILLAR_ACTIONS)
              .map(([key, action]) => ({ key, ...action, score: (igScores as any)[key] ?? 20 }))
              .sort((a, b) => a.score - b.score)
              .slice(0, 3);

            return (
              <div>
                <h3 className="font-body font-bold text-sm mb-3 flex items-center gap-1.5"><ClipboardList className="h-4 w-4 text-primary" strokeWidth={1.75} />Ton plan d'action Instagram (par priorité)</h3>
                <div className="space-y-2">
                  {sorted.map((item, i) => (
                    <div key={item.key} className={`rounded-xl border p-4 flex items-center gap-3 ${i === 0 ? "border-primary/30 bg-[hsl(var(--rose-pale))]" : "border-border bg-card"}`}>
                      <span className="w-7 h-7 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground flex items-center gap-1.5"><item.icon className="h-4 w-4 text-primary shrink-0" strokeWidth={1.75} />{item.label}</p>
                          {i === 0 && <span className="text-2xs bg-primary/10 text-primary px-2 py-0.5 rounded-pill font-semibold">Priorité #1</span>}
                        </div>
                        <p className="text-xs text-muted-foreground">{item.score}/20</p>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs px-2 gap-1"
                          onClick={() => {
                            setCoachingModule(item.coaching_module);
                            setCoachingPillarKey(item.key);
                            setCoachingPillarLabel(item.label);
                            setCoachingPillarEmoji(item.emoji);
                            setCoachingRecId(undefined);
                            setCoachingConseil(undefined);
                            setCoachingOpen(true);
                          }}
                        >
                          <MessageCircle className="h-3 w-3" /> Coaching
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs px-2 gap-1"
                          onClick={() => handleNavigate(item.route)}
                        >
                          Faire <ArrowRight className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

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
