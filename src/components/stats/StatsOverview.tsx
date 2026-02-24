import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { fmt, fmtPct, fmtEur } from "@/lib/stats-helpers";
import { type DashboardKPIs } from "./stats-types";

interface StatsOverviewProps {
  kpis: DashboardKPIs;
  isSingleMonth: boolean;
}

export default function StatsOverview({ kpis, isSingleMonth }: StatsOverviewProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <DashboardCard icon="👥" label="Abonné·es" value={fmt(kpis.followers)}
        change={kpis.changeFollowers}
        sub={kpis.followersGained != null ? `+${kpis.followersGained}` : undefined} />
      <DashboardCard icon="📣" label={isSingleMonth ? "Portée" : "Portée moy."} value={fmt(kpis.avgReach)}
        change={kpis.changeReach} />
      <DashboardCard icon="💬" label={isSingleMonth ? "Engagement" : "Engagement moy."} value={fmtPct(kpis.avgEngagement)}
        change={kpis.changeEngagement} />
      <DashboardCard icon="💰" label={isSingleMonth ? "CA" : "CA cumulé"} value={fmtEur(kpis.totalRevenue)}
        change={kpis.changeRevenue} />
    </div>
  );
}

function DashboardCard({ icon, label, value, change, sub }: {
  icon: string; label: string; value: string;
  change: { val: number; dir: "up" | "down" | "flat" } | null;
  sub?: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 text-center">
        <span className="text-xl">{icon}</span>
        <p className="font-display text-xl font-bold text-foreground mt-1">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
        {change && (
          <span className={`inline-flex items-center gap-0.5 text-xs font-medium mt-1 ${
            change.dir === "up" ? "text-green-600" : change.dir === "down" ? "text-red-500" : "text-muted-foreground"
          }`}>
            {change.dir === "up" ? <TrendingUp className="h-3 w-3" /> : change.dir === "down" ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
            {change.dir === "flat" ? "stable" : `${change.val > 0 ? "+" : ""}${change.val.toFixed(0)}%`}
          </span>
        )}
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
