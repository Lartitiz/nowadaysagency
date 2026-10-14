import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { posthog } from "@/lib/posthog";
import { memoriseRetour } from "@/lib/retour-apres-detour";

export default function LowCreditsBanner({ remaining, plan }: { remaining: number; plan: string }) {
  const [dismissed, setDismissed] = useState(false);
  const shouldShow = !dismissed && plan === "free" && remaining < 5 && remaining > 0;

  useEffect(() => {
    if (shouldShow) {
      posthog.capture("low_credits_banner_shown", { remaining, plan });
    }
  }, [shouldShow]);

  if (!shouldShow) return null;

  return (
    <div className="mb-4 rounded-xl border border-warning/30 bg-warning-bg px-4 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <Sparkles className="h-5 w-5 shrink-0 text-warning" strokeWidth={1.75} />
        <p className="text-sm text-warning">
          <span className="font-medium">Plus que {remaining} crédit{remaining > 1 ? "s" : ""}</span> ce mois-ci.
          {" "}Tes brouillons et tes contenus restent accessibles.
        </p>
      </div>
      <Link
        to="/pricing"
        onClick={() => {
          posthog.capture("low_credits_banner_cta_clicked", { remaining, plan });
          // Elle est en pleine création : les tarifs proposeront d'y revenir.
          memoriseRetour();
        }}
        className="shrink-0 text-xs font-medium text-warning hover:text-warning underline underline-offset-2 transition-colors"
      >
        Découvrir le Premium
      </Link>
      <button aria-label="Masquer cette invitation" onClick={() => setDismissed(true)} className="p-2">×</button>
    </div>
  );
}
