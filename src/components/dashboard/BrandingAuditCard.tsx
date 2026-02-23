import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Progress } from "@/components/ui/progress";
import { ArrowRight, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface AuditResult {
  score: number;
  date: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: { title: string; priority: string; category: string; action_route: string }[];
}

interface BrandingAuditCardProps {
  audit: AuditResult | null;
  loading: boolean;
  userId?: string;
  onRelaunch?: () => void;
}

/* ── Demo data (imported by Dashboard in demo mode) ── */
export const DEMO_AUDIT: AuditResult = {
  score: 62,
  date: "2026-02-15",
  strengths: [
    "Positionnement clair et différenciant",
    "Esthétique cohérente et reconnaissable sur Instagram",
    "Bon ratio de formats variés (carrousels + reels)",
  ],
  weaknesses: [
    "Pas de CTA dans ta bio Instagram",
    "Pas de lien vers une offre précise",
    "Highlights pas structurés (pas de catégories claires)",
    "Site web lent (3.2s de chargement)",
    "Pas de page de capture email",
    "Meta descriptions absentes sur le site",
  ],
  recommendations: [
    { title: "Optimiser ta bio avec un CTA", priority: "high", category: "instagram", action_route: "/instagram/bio" },
    { title: "Structurer tes Highlights en 5 catégories", priority: "high", category: "instagram", action_route: "/instagram" },
    { title: "Ajouter un formulaire newsletter sur ton site", priority: "medium", category: "website", action_route: "/site/accueil" },
    { title: "Optimiser la vitesse de ton site", priority: "medium", category: "seo", action_route: "https://referencement-seo.lovable.app/" },
    { title: "Créer une routine engagement 15min/jour", priority: "low", category: "instagram", action_route: "/instagram/engagement" },
  ],
};

/* ── State: No data yet ── */
function NoDataState({ userId, onRelaunch }: { userId?: string; onRelaunch?: () => void }) {
  const [instagram, setInstagram] = useState("");
  const [website, setWebsite] = useState("");
  const [launching, setLaunching] = useState(false);

  const handleLaunch = async () => {
    if (!instagram && !website) {
      toast.error("Renseigne au moins ton Instagram ou ton site web.");
      return;
    }
    setLaunching(true);
    // Save to profile
    if (userId) {
      const updates: Record<string, string> = {};
      if (instagram) updates.instagram = instagram.replace(/^@/, "");
      if (website) updates.website = website;
      await supabase.from("profiles").update(updates).eq("user_id", userId);
    }
    toast.success("Audit lancé ! Ça prend quelques secondes…");
    onRelaunch?.();
    setLaunching(false);
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <Search className="h-5 w-5 text-primary" />
        <h2 className="font-display text-lg font-bold text-foreground">Ton audit de communication</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-5">
        Pour analyser ta com', j'ai besoin de ton Instagram ou de ton site web.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <Input
          placeholder="@ton_instagram"
          value={instagram}
          onChange={(e) => setInstagram(e.target.value)}
          className="flex-1"
        />
        <Input
          placeholder="https://ton-site.fr"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          className="flex-1"
        />
      </div>
      <Button onClick={handleLaunch} disabled={launching} className="w-full sm:w-auto">
        {launching ? "Lancement…" : "Lancer mon audit →"}
      </Button>
    </div>
  );
}

/* ── State: Loading ── */
function LoadingState() {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <Search className="h-5 w-5 text-primary" />
        <h2 className="font-display text-lg font-bold text-foreground">Ton audit de communication</h2>
      </div>
      <div className="flex items-center gap-3 py-4">
        <RefreshCw className="h-5 w-5 text-primary animate-spin" />
        <div>
          <p className="text-sm font-medium text-foreground">Ton audit est en cours d'analyse…</p>
          <p className="text-xs text-muted-foreground mt-0.5">On regarde ton Instagram et ton site. Ça prend quelques secondes.</p>
        </div>
      </div>
    </div>
  );
}

/* ── State: Results ── */
function ResultState({ audit, onRelaunch }: { audit: AuditResult; onRelaunch?: () => void }) {
  const navigate = useNavigate();
  const priorityColors: Record<string, string> = {
    high: "bg-destructive/10 text-destructive",
    medium: "bg-accent/20 text-accent-foreground",
    low: "bg-muted text-muted-foreground",
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Search className="h-5 w-5 text-primary" />
          <h2 className="font-display text-lg font-bold text-foreground">Ton audit de communication</h2>
        </div>
      </div>

      {/* Score */}
      <div className="mb-5">
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-2xl font-display font-bold text-foreground">{audit.score}</span>
          <span className="text-sm text-muted-foreground font-mono-ui">/100</span>
        </div>
        <Progress value={audit.score} className="h-2.5" />
      </div>

      {/* Strengths */}
      {audit.strengths.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 font-mono-ui">
            ✅ Points forts
          </p>
          <ul className="space-y-1">
            {audit.strengths.map((s, i) => (
              <li key={i} className="text-sm text-foreground flex items-start gap-2">
                <span className="text-muted-foreground mt-0.5">·</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Weaknesses */}
      {audit.weaknesses.length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 font-mono-ui">
            ⚠️ À améliorer
          </p>
          <ul className="space-y-1">
            {audit.weaknesses.map((w, i) => (
              <li key={i} className="text-sm text-foreground flex items-start gap-2">
                <span className="text-muted-foreground mt-0.5">·</span>
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommendations */}
      {audit.recommendations.length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 font-mono-ui">
            🎯 Recommandations
          </p>
          <div className="space-y-2">
            {audit.recommendations.map((r, i) => (
              <button
                key={i}
                onClick={() => {
                  if (r.action_route.startsWith("http")) window.open(r.action_route, "_blank");
                  else navigate(r.action_route);
                }}
                className="w-full flex items-center justify-between text-left rounded-xl border border-border bg-background px-4 py-2.5
                  hover:border-primary hover:-translate-y-px hover:shadow-card transition-all duration-150"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`text-[10px] font-mono-ui px-1.5 py-0.5 rounded-md shrink-0 ${priorityColors[r.priority] || priorityColors.low}`}>
                    {r.priority === "high" ? "Urgent" : r.priority === "medium" ? "Important" : "Bonus"}
                  </span>
                  <span className="text-sm text-foreground truncate">{r.title}</span>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-primary shrink-0 ml-2" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Button
          variant="default"
          size="sm"
          onClick={() => navigate("/branding/audit-result")}
          className="gap-1"
        >
          Voir l'audit complet <ArrowRight className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onRelaunch}
          className="gap-1"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Relancer l'audit
        </Button>
      </div>
    </div>
  );
}

/* ── Main export ── */
export default function BrandingAuditCard({ audit, loading, userId, onRelaunch }: BrandingAuditCardProps) {
  if (loading) return <LoadingState />;
  if (!audit) return <NoDataState userId={userId} onRelaunch={onRelaunch} />;
  return <ResultState audit={audit} onRelaunch={onRelaunch} />;
}
