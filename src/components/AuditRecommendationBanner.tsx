import { useState, useEffect } from "react";
import { X, Lightbulb } from "lucide-react";

export default function AuditRecommendationBanner() {
  const [recommendation, setRecommendation] = useState<{ module: string; conseil: string } | null>(null);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("audit_recommendation");
      if (stored) {
        setRecommendation(JSON.parse(stored));
      }
    } catch { /* ignore */ }
  }, []);

  const handleDismiss = () => {
    setRecommendation(null);
    sessionStorage.removeItem("audit_recommendation");
  };

  if (!recommendation) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-4 mb-6 flex items-start gap-3">
      <Lightbulb className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
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
