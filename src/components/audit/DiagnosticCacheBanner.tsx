import { Button } from "@/components/ui/button";
import { RotateCcw, Sparkles } from "lucide-react";
import type { DiagnosticCacheData } from "@/hooks/use-diagnostic-cache";

interface DiagnosticCacheBannerProps {
  diagnosticData: DiagnosticCacheData;
  /** Which audit domain to extract from scores (e.g. "instagram", "website", "branding") */
  domain: "instagram" | "website" | "branding";
  onRelaunch: () => void;
}

const DOMAIN_LABELS: Record<string, string> = {
  instagram: "Instagram",
  website: "site web",
  branding: "branding",
};

export default function DiagnosticCacheBanner({ diagnosticData, domain, onRelaunch }: DiagnosticCacheBannerProps) {
  const scores = diagnosticData.scores as Record<string, any> | null;
  const domainScore = scores?.[domain];
  const label = DOMAIN_LABELS[domain] || domain;

  // Extract domain-relevant strengths/weaknesses
  const strengths = (diagnosticData.strengths || []).filter(
    (s: any) => !s.source || s.source === domain || s.source === "all"
  ).slice(0, 2);

  const weaknesses = (diagnosticData.weaknesses || []).filter(
    (w: any) => !w.source || w.source === domain || w.source === "all"
  ).slice(0, 2);

  const diagDate = new Date(diagnosticData.created_at).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
  });

  return (
    <div className="rounded-2xl border border-primary/30 bg-secondary/50 p-5 space-y-3">
      <div className="flex items-start gap-3">
        <Sparkles className="h-5 w-5 text-primary mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">
            Diagnostic initial ({diagDate})
            {domainScore != null && (
              <span className="ml-2 text-primary">{domainScore}/100</span>
            )}
          </p>
          <p className="text-xs text-muted-foreground mt-1 italic">
            Voici ce que j'ai trouvé lors de ton diagnostic initial. Tu peux relancer un audit plus détaillé si tu veux.
          </p>
        </div>
      </div>

      {(strengths.length > 0 || weaknesses.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
          {strengths.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">✅ Points forts</p>
              <ul className="space-y-1">
                {strengths.map((s: any, i: number) => (
                  <li key={i} className="text-xs text-foreground">{s.titre || s.title || s}</li>
                ))}
              </ul>
            </div>
          )}
          {weaknesses.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">⚠️ À améliorer</p>
              <ul className="space-y-1">
                {weaknesses.map((w: any, i: number) => (
                  <li key={i} className="text-xs text-foreground">{w.titre || w.title || w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <Button variant="outline" size="sm" onClick={onRelaunch} className="gap-2 rounded-full mt-1">
        <RotateCcw className="h-3.5 w-3.5" /> Relancer un audit détaillé
      </Button>
    </div>
  );
}
