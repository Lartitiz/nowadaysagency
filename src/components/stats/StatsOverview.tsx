import { TrendingUp, TrendingDown, Minus, HelpCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { fmt, fmtPct } from "@/lib/stats-helpers";
import { type DashboardKPIs } from "./stats-types";

interface StatsOverviewProps {
  kpis: DashboardKPIs;
  isSingleMonth: boolean;
}

export default function StatsOverview({ kpis, isSingleMonth }: StatsOverviewProps) {
  const netGrowthValue = kpis.netGrowth != null
    ? `${kpis.netGrowth > 0 ? "+" : ""}${fmt(kpis.netGrowth)}`
    : "–";

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <DashboardCard icon="👥" label="Abonné·es" value={fmt(kpis.followers)}
        change={kpis.changeFollowers}
        sub={kpis.followersGained != null ? `+${kpis.followersGained} ce mois` : undefined} />
      <DashboardCard icon="📣" label={isSingleMonth ? "Portée" : "Portée moy."} value={fmt(kpis.avgReach)}
        change={kpis.changeReach} />
      <DashboardCard
        icon="💬"
        label={isSingleMonth ? "Engagement" : "Engagement moy."}
        value={fmtPct(kpis.avgEngagement)}
        change={kpis.changeEngagement}
        sub={kpis.engagementByFollowers != null ? `${fmtPct(kpis.engagementByFollowers)} / abonné·es` : undefined}
        help="Comptes engagés ÷ portée. Moyenne pondérée sur la période (les mois à forte portée comptent davantage)."
      />
      <DashboardCard
        icon="📈"
        label={isSingleMonth ? "Croissance nette" : "Croissance cumulée"}
        value={netGrowthValue}
        change={kpis.changeNetGrowth}
        help="Followers gagnés − followers perdus sur la période."
      />
    </div>
  );
}

function DashboardCard({ icon, label, value, change, sub, help }: {
  icon: string; label: string; value: string;
  change: { val: number; dir: "up" | "down" | "flat" } | null;
  sub?: string;
  help?: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 text-center">
        <span className="text-xl">{icon}</span>
        <p className="font-display text-xl font-bold text-foreground mt-1">{value}</p>
        <p className="text-xs text-muted-foreground inline-flex items-center gap-1 justify-center">
          {label}
          {help && (
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" aria-label="Aide" className="inline-flex">
                    <HelpCircle className="h-3 w-3 text-muted-foreground/60 hover:text-foreground transition-colors" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-[220px] text-xs leading-snug">{help}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </p>
        {change && (
          <span className={`inline-flex items-center gap-0.5 text-xs font-medium mt-1 ${
            change.dir === "up" ? "text-green-600" : change.dir === "down" ? "text-red-500" : "text-muted-foreground"
          }`}>
            {change.dir === "up" ? <TrendingUp className="h-3 w-3" /> : change.dir === "down" ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
            {change.dir === "flat" ? "stable" : `${change.val > 0 ? "+" : ""}${change.val.toFixed(0)}%`}
          </span>
        )}
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}
