import {
  BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import EmptyState from "@/components/EmptyState";
import { MESSAGES } from "@/lib/messages";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import FollowersChart from "./FollowersChart";
import EngagementChart from "./EngagementChart";
import RevenueChart from "./RevenueChart";
import { fmt, fmtEur, pctChange, monthLabel } from "@/lib/stats-helpers";
import { type StatsRow, type StatsConfig, ALL_TRAFFIC_SOURCES } from "./stats-types";

interface StatsChartsProps {
  chartData: Record<string, any>[];
  isSingleMonth: boolean;
  activeConfig: StatsConfig;
  periodStats: StatsRow[];
  allStats: StatsRow[];
  compareA: string;
  compareB: string;
  setCompareA: (v: string) => void;
  setCompareB: (v: string) => void;
}

export default function StatsCharts({
  chartData, isSingleMonth, activeConfig, periodStats, allStats,
  compareA, compareB, setCompareA, setCompareB,
}: StatsChartsProps) {
  if (chartData.length < 2 && !isSingleMonth) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        Saisis au moins 2 mois de stats pour voir les graphiques d'évolution.
      </p>
    );
  }

  if (chartData.length === 0) {
    return <EmptyState {...MESSAGES.empty.stats} />;
  }

  return (
    <>
      {chartData.length >= 2 && (
        <>
          <ChartCard title="Évolution des abonné·es">
            <FollowersChart data={chartData as any} />
          </ChartCard>

          <ChartCard title="Portée et engagement">
            <EngagementChart data={chartData as any} />
          </ChartCard>

          <ChartCard title="Sources de trafic site web">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
                <Legend />
                {(activeConfig.traffic_sources || []).map((src, i) => {
                  const colors = ["#fb3d80", "#8B5CF6", "#FFE561", "#ffa7c6", "#34D399", "#60A5FA", "#F59E0B", "#A78BFA", "#FB923C"];
                  const label = ALL_TRAFFIC_SOURCES.find(s => s.id === src)?.label || src;
                  return (
                    <Bar key={src} dataKey={`traffic_${src}`} stackId="a" fill={colors[i % colors.length]} name={label}
                      radius={i === (activeConfig.traffic_sources || []).length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                  );
                })}
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="CA et clients">
            <RevenueChart data={chartData as any} />
          </ChartCard>
        </>
      )}

      <ChartCard title="Funnel de conversion">
        <FunnelChart data={periodStats.length > 0 ? periodStats[periodStats.length - 1] : undefined} businessType={activeConfig.business_type} />
      </ChartCard>

      {allStats.length >= 2 && (
        <ComparisonTable allStats={allStats} compareA={compareA} compareB={compareB}
          setCompareA={setCompareA} setCompareB={setCompareB} />
      )}
    </>
  );
}

/* ── Sub-components ── */

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-3">
      <h3 className="font-display text-sm font-bold text-foreground">{title}</h3>
      {children}
    </div>
  );
}

function FunnelChart({ data, businessType }: { data: StatsRow | undefined; businessType?: string | null }) {
  if (!data) return <EmptyState {...MESSAGES.empty.stats} />;

  const totalPageViews = (data.page_views_plan || 0) + (data.page_views_academy || 0) + (data.page_views_agency || 0);

  let steps: { label: string; value: number }[];
  switch (businessType) {
    case "ecommerce":
      steps = [
        { label: "Comptes touchés", value: data.reach || 0 },
        { label: "Visites profil", value: data.profile_visits || 0 },
        { label: "Boutique", value: data.website_visitors || 0 },
        { label: "Panier", value: (data.business_data as any)?.orders || data.clients_signed || 0 },
        { label: "Commande", value: (data.business_data as any)?.orders || data.clients_signed || 0 },
      ];
      break;
    case "formations":
      steps = [
        { label: "Comptes touchés", value: data.reach || 0 },
        { label: "Visites profil", value: data.profile_visits || 0 },
        { label: "Page vente", value: totalPageViews || data.website_clicks || 0 },
        { label: "Inscription", value: (data.business_data as any)?.signups || 0 },
        { label: "Achat", value: (data.business_data as any)?.conversions || data.clients_signed || 0 },
      ];
      break;
    case "freelance":
      steps = [
        { label: "Comptes touchés", value: data.reach || 0 },
        { label: "Visites profil", value: data.profile_visits || 0 },
        { label: "Site", value: data.website_clicks || 0 },
        { label: "Demande", value: (data.business_data as any)?.requests_received || 0 },
        { label: "Devis", value: (data.business_data as any)?.proposals_sent || 0 },
        { label: "Projet", value: (data.business_data as any)?.projects_signed || data.clients_signed || 0 },
      ];
      break;
    default:
      steps = [
        { label: "Comptes touchés", value: data.reach || 0 },
        { label: "Visites profil", value: data.profile_visits || 0 },
        { label: "Clics site", value: data.website_clicks || 0 },
        { label: "Pages vente", value: totalPageViews },
        { label: "Appels", value: data.discovery_calls || 0 },
        { label: "Clients", value: data.clients_signed || 0 },
      ];
  }

  const maxVal = Math.max(...steps.map(s => s.value), 1);

  return (
    <div className="space-y-2 py-2">
      {steps.map((step, i) => {
        const pct = (step.value / maxVal) * 100;
        const convRate = i > 0 && steps[i - 1].value > 0
          ? ((step.value / steps[i - 1].value) * 100).toFixed(1) : null;
        return (
          <div key={step.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{step.label}</span>
              <span className="font-medium text-foreground">
                {fmt(step.value)}
                {convRate && <span className="text-muted-foreground ml-1">({convRate}%)</span>}
              </span>
            </div>
            <div className="h-5 bg-muted rounded-lg overflow-hidden">
              <div className="h-full rounded-lg transition-all duration-500"
                style={{ width: `${Math.max(pct, 2)}%`, background: `linear-gradient(90deg, #fb3d80, #ffa7c6)` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ComparisonTable({ allStats, compareA, compareB, setCompareA, setCompareB }: {
  allStats: StatsRow[]; compareA: string; compareB: string;
  setCompareA: (v: string) => void; setCompareB: (v: string) => void;
}) {
  const a = allStats.find(s => s.month_date === compareA);
  const b = allStats.find(s => s.month_date === compareB);

  const metrics = [
    { label: "Followers", key: "followers" },
    { label: "Portée", key: "reach" },
    { label: "Interactions", key: "interactions" },
    { label: "Visites profil", key: "profile_visits" },
    { label: "Clics site", key: "website_clicks" },
    { label: "Inscrits email", key: "email_signups" },
    { label: "Visiteurs site", key: "website_visitors" },
    { label: "CA", key: "revenue", format: fmtEur },
    { label: "Clients", key: "clients_signed" },
  ];

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4">
      <h3 className="font-display text-sm font-bold text-foreground">Comparaison mois par mois</h3>
      <div className="flex items-center gap-2 flex-wrap text-sm">
        <Select value={compareA} onValueChange={setCompareA}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {allStats.map(s => <SelectItem key={s.month_date} value={s.month_date}>{monthLabel(s.month_date)}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground">vs</span>
        <Select value={compareB} onValueChange={setCompareB}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {allStats.map(s => <SelectItem key={s.month_date} value={s.month_date}>{monthLabel(s.month_date)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {a && b && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="py-2 pr-4"></th>
                <th className="py-2 pr-4">{monthLabel(b.month_date)}</th>
                <th className="py-2 pr-4">{monthLabel(a.month_date)}</th>
                <th className="py-2">Variation</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map(m => {
                const valA = a[m.key];
                const valB = b[m.key];
                const f = (m as any).format || fmt;
                const change = pctChange(valA, valB);
                return (
                  <tr key={m.key} className="border-b border-border/50">
                    <td className="py-2 pr-4 text-muted-foreground">{m.label}</td>
                    <td className="py-2 pr-4 font-medium">{f(valB)}</td>
                    <td className="py-2 pr-4 font-medium">{f(valA)}</td>
                    <td className="py-2">
                      {change ? (
                        <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${
                          change.dir === "up" ? "text-green-600" : change.dir === "down" ? "text-red-500" : "text-muted-foreground"
                        }`}>
                          {change.dir === "up" ? "↑" : change.dir === "down" ? "↓" : "→"}
                          {change.dir === "flat" ? "stable" : `${change.val > 0 ? "+" : ""}${change.val.toFixed(1)}%`}
                        </span>
                      ) : "–"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
