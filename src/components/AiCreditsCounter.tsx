import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
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
  const isUnlimited = !total || total.limit <= 0;

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

  const colorClasses =
    pct > 0.5
      ? "bg-green-50 text-green-600"
      : pct >= 0.2
        ? "bg-orange-50 text-orange-600"
        : "bg-red-50 text-red-600";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors hover:opacity-80 ${colorClasses}`}
          aria-label={`${remaining} crédits IA restants`}
        >
          <Sparkles className="h-3 w-3" />
          <span className="hidden sm:inline">{remaining} restants</span>
          <span className="sm:hidden">{remaining}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-4">
        <p className="text-sm font-semibold text-foreground mb-3">Crédits IA ce mois</p>

        {/* Total */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Total</span>
            <span className="font-mono-ui font-semibold">
              {total.used}/{total.limit}
            </span>
          </div>
          <Progress value={Math.round((total.used / total.limit) * 100)} className="h-1.5" />
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

        {plan === "free" && (
          <Link
            to="/mon-plan"
            className="block mt-3 text-xs font-semibold text-primary hover:underline"
          >
            Passer à Outil →
          </Link>
        )}
      </PopoverContent>
    </Popover>
  );
}
