import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Loader2, ChevronDown, ChevronUp, ArrowRight, RefreshCw } from "lucide-react";

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

const PILLAR_META: Record<string, { emoji: string; label: string }> = {
  positionnement: { emoji: "🎯", label: "Positionnement" },
  cible: { emoji: "👤", label: "Cible" },
  ton_voix: { emoji: "🗣️", label: "Ton / Voix" },
  offres: { emoji: "🎁", label: "Offres" },
  storytelling: { emoji: "📖", label: "Storytelling" },
  identite_visuelle: { emoji: "🎨", label: "Identité visuelle" },
  coherence_cross_canal: { emoji: "🔗", label: "Cohérence canaux" },
  contenu: { emoji: "📝", label: "Contenu" },
};

const STATUT_COLORS: Record<string, string> = {
  absent: "text-red-500",
  flou: "text-amber-500",
  bon: "text-emerald-500",
  excellent: "text-emerald-600",
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

  useEffect(() => {
    if (!user || !id) return;
    (async () => {
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
    })();
  }, [user, id]);

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
                  const meta = PILLAR_META[key] || { emoji: "📋", label: key };
                  const isExpanded = expandedPillar === key;
                  return (
                    <div key={key} className="rounded-xl border border-border bg-card overflow-hidden">
                      <button className="w-full flex items-center gap-3 p-4 text-left" onClick={() => setExpandedPillar(isExpanded ? null : key)}>
                        <span className="text-base">{meta.emoji}</span>
                        <span className="text-sm font-medium flex-1">{meta.label}</span>
                        <span className={`text-xs font-mono ${STATUT_COLORS[pillar.statut] || "text-muted-foreground"}`}>
                          {pillar.score}/100 · {pillar.statut}
                        </span>
                        <div className="w-20 h-2 rounded-full bg-muted overflow-hidden">
                          <div className={`h-full rounded-full ${SCORE_BAR_COLOR(pillar.score)}`} style={{ width: `${pillar.score}%` }} />
                        </div>
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </button>
                      {isExpanded && (
                        <div className="px-4 pb-4 space-y-2 border-t border-border pt-3">
                          {pillar.ce_qui_existe && (
                            <div><p className="text-[10px] font-semibold text-emerald-600 uppercase">Ce qui existe</p><p className="text-xs text-muted-foreground">{pillar.ce_qui_existe}</p></div>
                          )}
                          {pillar.ce_qui_manque && (
                            <div><p className="text-[10px] font-semibold text-amber-600 uppercase">Ce qui manque</p><p className="text-xs text-muted-foreground">{pillar.ce_qui_manque}</p></div>
                          )}
                          {pillar.recommandation && (
                            <div><p className="text-[10px] font-semibold text-primary uppercase">Recommandation</p><p className="text-xs text-muted-foreground">{pillar.recommandation}</p></div>
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
                {result.plan_action_recommande.map((a, i) => (
                  <button key={i} onClick={() => navigate(a.lien)} className="w-full rounded-xl border border-border bg-card hover:bg-muted/50 transition-colors p-4 text-left flex items-center gap-3">
                    <span className="w-6 h-6 rounded-lg bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">{a.priorite}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{a.action}</p>
                      <p className="text-[10px] text-muted-foreground">{a.temps_estime}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                ))}
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
    </div>
  );
}
