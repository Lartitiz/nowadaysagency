import { useState, useEffect } from "react";
import { X, Lightbulb } from "lucide-react";

const TTL_MS = 30 * 60 * 1000; // 30 min

export default function AuditRecommendationBanner() {
  const [recommendation, setRecommendation] = useState<{ module: string; conseil: string } | null>(null);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("audit_recommendation");
      if (!stored) return;
      const parsed = JSON.parse(stored) as { module: string; conseil: string; ts?: number };
      if (!parsed.ts || Date.now() - parsed.ts > TTL_MS) {
        sessionStorage.removeItem("audit_recommendation");
        return;
      }
      setRecommendation({ module: parsed.module, conseil: parsed.conseil });
    } catch { /* ignore */ }
  }, []);

  const handleDismiss = () => {
    setRecommendation(null);
    sessionStorage.removeItem("audit_recommendation");
  };

  if (!recommendation) return null;

  return (
    <div className="rounded-xl border border-warning/30 bg-warning-bg p-4 mb-6 flex items-start gap-3">
      <Lightbulb className="h-4 w-4 text-warning shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">Ton audit recommande :</p>
        <p className="text-xs text-muted-foreground mt-1">{recommendation.conseil}</p>
      </div>
      <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground shrink-0">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
