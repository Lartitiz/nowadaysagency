import { useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { posthog } from "@/lib/posthog";
import type { CategoryUsage } from "@/hooks/use-user-plan";

interface AiCreditsCounterProps {
  plan: string;
  usage: Record<string, CategoryUsage>;
}

const DISPLAY_CATEGORIES: { key: string; label: string }[] = [
  { key: "content", label: "Contenus" },
  { key: "audit", label: "Audits" },
  { key: "dm_comment", label: "DM / Commentaires" },
];

export default function AiCreditsCounter({ plan, usage }: AiCreditsCounterProps) {
  const total = usage.total;
  const isUnlimited = !total || total.limit <= 0 || total.limit >= 9999;

  if (isUnlimited) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold bg-green-50 text-green-600">
        <Sparkles className="h-3 w-3" />
        Illimité
      </span>
    );
  }

  const remaining = Math.max(0, total.limit - total.used);
  const pct = remaining / total.limit;
  const usedPct = Math.min(1, total.used / total.limit);

  // Ring SVG constants
  const radius = 8;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - usedPct * circumference;

  // Palier logic
  const isExhausted = remaining === 0;
  const isUrgent = !isExhausted && pct < 0.2;
  const isWarning = !isExhausted && !isUrgent && pct <= 0.5;
  // const isComfort = pct > 0.5;

  const ringStroke = isExhausted
    ? "stroke-red-500"
    : isUrgent
      ? "stroke-red-400"
      : isWarning
        ? "stroke-orange-400"
        : "stroke-green-400";

  const colorClasses = isExhausted
    ? "bg-red-100 text-red-700 border border-red-200"
    : isUrgent
      ? "bg-red-50 text-red-600"
      : isWarning
        ? "bg-orange-50 text-orange-600"
        : "bg-green-50 text-green-600";

  const pulseStyle: React.CSSProperties | undefined = isUrgent
    ? { animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite" }
    : isWarning
      ? { animation: "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite" }
      : undefined;

  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
  const nextMonthLabel = `1er ${nextMonth.toLocaleDateString("fr-FR", { month: "long" })}`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors hover:opacity-80 ${colorClasses}`}
          aria-label={`${remaining} crédits IA restants`}
          style={pulseStyle}
        >
          <span className="relative flex items-center justify-center" style={{ width: 20, height: 20 }}>
            <svg viewBox="0 0 20 20" width={20} height={20} className="absolute inset-0 -rotate-90">
              <circle cx={10} cy={10} r={radius} fill="none" strokeWidth={2.5} className="stroke-secondary opacity-30" />
              <circle
                cx={10} cy={10} r={radius} fill="none" strokeWidth={2.5}
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                className={ringStroke}
              />
            </svg>
            <Sparkles className="h-3 w-3 relative z-10" />
          </span>
          {isExhausted ? (
            <>
              <span className="hidden sm:inline">0 crédit</span>
              <span className="sm:hidden">0</span>
            </>
          ) : (
            <>
              <span className="hidden sm:inline">{remaining} restants</span>
              <span className="sm:hidden">{remaining}</span>
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-4">
        {isExhausted ? (
          <div className="space-y-3 text-center">
            <p className="text-sm font-semibold text-foreground">Tes crédits du mois sont utilisés 🌸</p>
            <p className="text-xs text-muted-foreground">C'est bon signe : tu travailles ta com' !</p>
            <p className="text-xs text-muted-foreground">Tes crédits reviennent le {nextMonthLabel}.</p>
            <Link
              to="/mon-plan"
              className="inline-block rounded-full bg-[#FB3D80] text-white px-4 py-2 text-xs font-medium hover:bg-[#e0326f] transition-colors"
            >
              Passer au Premium — 300 crédits/mois
            </Link>
          </div>
        ) : (
          <>
            <p className="text-sm font-semibold text-foreground mb-3">Crédits IA ce mois</p>

            {/* Total */}
            <div className="mb-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>Total</span>
                <span className="font-mono-ui font-semibold">
                  {total.used}/{total.limit}
                </span>
              </div>
              <Progress value={Math.round(usedPct * 100)} className="h-1.5" />
            </div>

            {/* Per category */}
            <div className="space-y-2.5">
              {DISPLAY_CATEGORIES.map(({ key, label }) => {
                const cat = usage[key];
                if (!cat || cat.limit <= 0) return null;
                const catPct = Math.round((cat.used / cat.limit) * 100);
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-0.5">
                      <span>{label}</span>
                      <span className="font-mono-ui">
                        {cat.used}/{cat.limit}
                      </span>
                    </div>
                    <Progress value={catPct} className="h-1" />
                  </div>
                );
              })}
            </div>

            {/* Palier messages */}
            {isWarning && (
              <p className="mt-3 text-xs text-orange-600">
                Tes crédits diminuent. Priorise les contenus qui comptent le plus.
              </p>
            )}
            {isUrgent && (
              <p className="mt-3 text-xs text-red-600 font-medium">
                Plus que {remaining} crédit{remaining > 1 ? "s" : ""}. Chaque génération compte !
              </p>
            )}

            {plan === "free" && (
              isUrgent ? (
                <Link
                  to="/mon-plan"
                  className="inline-block mt-3 rounded-full bg-[#FB3D80] text-white px-4 py-2 text-xs font-medium hover:bg-[#e0326f] transition-colors"
                >
                  Débloquer 300 crédits/mois →
                </Link>
              ) : (
                <Link
                  to="/mon-plan"
                  className="block mt-3 text-xs font-semibold text-primary hover:underline"
                >
                  Débloquer 300 crédits/mois →
                </Link>
              )
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
