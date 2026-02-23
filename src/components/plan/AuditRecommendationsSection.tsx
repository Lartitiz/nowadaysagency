import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowRight, Check, RefreshCw, Search } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface Recommendation {
  id: string;
  titre: string | null;
  label: string;
  detail: string | null;
  conseil_contextuel: string | null;
  conseil: string | null;
  module: string;
  route: string;
  priorite: string | null;
  temps_estime: string | null;
  completed: boolean | null;
  position: number | null;
}

interface AuditInfo {
  id: string;
  created_at: string;
  score_global: number | null;
}

export default function AuditRecommendationsSection() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [audit, setAudit] = useState<AuditInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user?.id]);

  const loadData = async () => {
    if (!user) return;
    const [auditRes, recsRes] = await Promise.all([
      supabase.from("branding_audits")
        .select("id, created_at, score_global")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("audit_recommendations")
        .select("*")
        .eq("user_id", user.id)
        .order("position", { ascending: true }),
    ]);

    if (auditRes.data) setAudit(auditRes.data as AuditInfo);
    if (recsRes.data) setRecommendations(recsRes.data as Recommendation[]);
    setLoading(false);
  };

  // Map stored routes (which may be incomplete) to actual app routes
  const resolveRoute = (rec: Recommendation): string => {
    const routeMap: Record<string, string> = {
      "/persona": "/branding/persona",
      "/instagram/bio": "/instagram/profil/bio",
      "/instagram/highlights": "/instagram/profil/stories",
      "/creer": "/instagram/creer",
      "/strategie": "/branding/strategie",
      "/storytelling": "/branding/storytelling",
      "/ton": "/branding/ton",
      "/proposition": "/branding/proposition",
      "/offres": "/branding/offres",
    };
    return routeMap[rec.route] || rec.route;
  };

  const navigateToModule = (rec: Recommendation) => {
    // SEO → external link
    if (rec.module === "seo" || rec.route.startsWith("http")) {
      window.open("https://referencement-seo.lovable.app/", "_blank", "noopener,noreferrer");
      return;
    }
    const conseil = rec.conseil_contextuel || rec.conseil || rec.detail || "";
    sessionStorage.setItem("audit_recommendation", JSON.stringify({ module: rec.module, conseil }));
    const resolvedRoute = resolveRoute(rec);
    const route = `${resolvedRoute}?from=audit&rec_id=${rec.id}`;
    navigate(route);
  };

  if (loading || recommendations.length === 0) return null;

  const completedCount = recommendations.filter(r => r.completed).length;
  const totalCount = recommendations.length;
  const allDone = completedCount === totalCount;

  // Sort: incomplete first (by position), then completed
  const sorted = [...recommendations].sort((a, b) => {
    if (a.completed && !b.completed) return 1;
    if (!a.completed && b.completed) return -1;
    return (a.position || 99) - (b.position || 99);
  });

  const prioriteStyle = (p: string | null) => {
    if (p === "haute") return "text-red-600 dark:text-red-400";
    if (p === "moyenne") return "text-amber-600 dark:text-amber-400";
    return "text-muted-foreground";
  };

  const prioriteIcon = (p: string | null) => {
    if (p === "haute") return "🔴";
    if (p === "moyenne") return "🟡";
    return "🟢";
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-display font-bold text-foreground flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" />
            Recommandations de ton audit
          </h3>
          {audit && (
            <p className="text-xs text-muted-foreground mt-1">
              {format(new Date(audit.created_at), "d MMMM yyyy", { locale: fr })}
              {audit.score_global != null && ` · Score : ${audit.score_global}/100`}
              {` · ${completedCount}/${totalCount} actions complétées`}
            </p>
          )}
        </div>
      </div>

      {/* Recommendations list */}
      <div className="space-y-2">
        {sorted.map(rec => (
          <div
            key={rec.id}
            className={`rounded-xl border p-4 transition-all ${
              rec.completed
                ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20"
                : "border-border hover:border-primary/30 hover:shadow-sm"
            }`}
          >
            <div className="flex items-start gap-3">
              {rec.completed ? (
                <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <span className="text-sm shrink-0">{prioriteIcon(rec.priorite)}</span>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {rec.titre || rec.label}
                  </span>
                  {rec.completed && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                      Fait ✓
                    </span>
                  )}
                </div>
                {!rec.completed && (
                  <>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {rec.conseil_contextuel || rec.conseil || rec.detail || ""}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      {rec.priorite && (
                        <span className={`text-[10px] font-medium ${prioriteStyle(rec.priorite)}`}>
                          Priorité {rec.priorite}
                        </span>
                      )}
                      {rec.temps_estime && (
                        <span className="text-[10px] text-muted-foreground">{rec.temps_estime}</span>
                      )}
                    </div>
                  </>
                )}
              </div>
              {!rec.completed && (
                <Button size="sm" variant="outline" onClick={() => navigateToModule(rec)} className="shrink-0 gap-1 text-xs">
                  Commencer <ArrowRight className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      {allDone ? (
        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/20 p-4 text-center">
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300 mb-2">
            🎉 Toutes les actions sont complétées !
          </p>
          <Button size="sm" variant="outline" onClick={() => navigate("/branding/audit#refaire")} className="gap-1.5 text-xs">
            <RefreshCw className="h-3 w-3" /> Refaire un audit pour mesurer ta progression
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center">
          💡 Quand toutes les actions seront faites, refais un audit pour voir ta progression.
        </p>
      )}
    </div>
  );
}
