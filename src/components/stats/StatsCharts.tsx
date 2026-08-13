import {
  BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid, Legend, Line, ComposedChart, ReferenceLine,
} from "recharts";
import EmptyState from "@/components/EmptyState";
import { MESSAGES } from "@/lib/messages";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import FollowersChart from "./FollowersChart";
import EngagementChart from "./EngagementChart";
import AudienceTrendChart from "./AudienceTrendChart";
import { fmt, pctChange, monthLabel } from "@/lib/stats-helpers";
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

          <ChartCard
            title="Acquisition de followers"
            subtitle="Gagnés vs perdus chaque mois, avec la croissance nette. Instagram ne fournit pas les désabonnements : quand ils ne sont pas saisis, ils sont estimés (gagnés − variation d'abonnés)."
          >
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={chartData} stackOffset="sign">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  formatter={(val: any, name: any, entry: any) =>
                    name === "Perdus" && entry?.payload?.lostEstimated
                      ? [`${fmt(Math.abs(Number(val)))} (estimé)`, name]
                      : fmt(Math.abs(Number(val)))
                  }
                  contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                />
                <Legend />
                <ReferenceLine y={0} stroke="hsl(var(--border))" />
                <Bar dataKey="gained" stackId="g" fill="hsl(var(--success))" name="Gagnés" radius={[4, 4, 0, 0]} />
                <Bar dataKey="lost" stackId="g" fill="hsl(var(--primary))" name="Perdus" radius={[0, 0, 4, 4]} />
                <Line type="monotone" dataKey="net" stroke="hsl(var(--info))" name="Net" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Du contenu au profil"
            subtitle="Rythme de publication (barres) face à la portée, aux visites profil et aux clics site. Saisis ta « portée sponsorisée » les mois avec pub : la courbe organique (pointillés) montre alors ce que TES contenus ont réellement fait."
          >
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <YAxis yAxisId="left" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <YAxis yAxisId="right" orientation="right" fontSize={11} stroke="hsl(var(--bordeaux))" allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
                <Legend />
                <Bar yAxisId="right" dataKey="posts_count" fill="hsl(var(--rose-medium))" name="Posts publiés (éch. droite)" radius={[4, 4, 0, 0]} barSize={18} />
                <Line yAxisId="left" type="monotone" dataKey="reach" stroke="hsl(var(--primary))" name="Portée totale" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                <Line yAxisId="left" type="monotone" dataKey="reach_organic" stroke="hsl(var(--bordeaux))" name="Portée organique (est.)" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} connectNulls />
                <Line yAxisId="left" type="monotone" dataKey="profile_visits" stroke="hsl(var(--info))" name="Visites profil" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                <Line yAxisId="left" type="monotone" dataKey="website_clicks" stroke="hsl(var(--warning))" name="Clics site" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Qualité de l'engagement"
            subtitle="Comptes engagés ÷ portée, la mesure de référence. Repères : 1-3 % correct, 3-6 % solide, au-delà excellent."
          >
            <EngagementChart data={chartData as any} />
          </ChartCard>

          <ChartCard
            title="Évolution de ton audience"
            subtitle="Part de tes segments dominants (genre, âge, pays) au fil des mois : alimentée par « Remplir depuis Instagram »."
          >
            <AudienceTrendChart rows={periodStats} />
          </ChartCard>

          <ChartCard title="Sources de trafic site web">
            {/* Sans aucune donnée de trafic, une grille vide avec axes se faisait
                passer pour un graphique : état vide pédagogique à la place. */}
            {chartData.some(d =>
              (activeConfig.traffic_sources || []).some(src => Number(d[`traffic_${src}`]) > 0),
            ) ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
                  <Legend />
                  {(activeConfig.traffic_sources || []).map((src, i) => {
                    const colors = ["hsl(var(--primary))", "hsl(var(--info))", "hsl(var(--warning))", "hsl(var(--bordeaux))", "hsl(var(--success))", "hsl(var(--raspberry))", "#7C3AED", "#0E7490", "#B45309"];
                    const label = ALL_TRAFFIC_SOURCES.find(s => s.id === src)?.label || src;
                    return (
                      <Bar key={src} dataKey={`traffic_${src}`} stackId="a" fill={colors[i % colors.length]} name={label}
                        radius={i === (activeConfig.traffic_sources || []).length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                    );
                  })}
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground py-6 text-center">
                🌐 Renseigne tes sources de trafic dans « Saisir mes stats » (section Site web) pour voir ce graphique.
              </p>
            )}
          </ChartCard>
        </>
      )}

      <ChartCard title="Funnel Instagram → site">
        <FunnelChart data={periodStats.length > 0 ? periodStats[periodStats.length - 1] : undefined} />
      </ChartCard>

      {allStats.length >= 2 && (
        <ComparisonTable allStats={allStats} compareA={compareA} compareB={compareB}
          setCompareA={setCompareA} setCompareB={setCompareB} />
      )}
    </>
  );
}

/* ── Sub-components ── */

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-3">
      <div className="space-y-0.5">
        <h3 className="font-body text-sm font-bold text-foreground">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function FunnelChart({ data }: { data: StatsRow | undefined }) {
  if (!data) return <EmptyState {...MESSAGES.empty.stats} />;

  // null = non renseigné (affiché « – », pas de taux de conversion) ; avant,
  // un champ vide s'affichait « 0 (0.0%) » comme si le funnel s'effondrait.
  const steps: { label: string; value: number | null }[] = [
    { label: "Comptes touchés", value: data.reach ?? null },
    { label: "Comptes engagés", value: data.accounts_engaged ?? null },
    { label: "Visites profil", value: data.profile_visits ?? null },
    { label: "Clics site", value: data.website_clicks ?? null },
  ];

  const maxVal = Math.max(...steps.map(s => s.value ?? 0), 1);

  return (
    <div className="space-y-2 py-2">
      {steps.map((step, i) => {
        const pct = ((step.value ?? 0) / maxVal) * 100;
        const prev = steps[i - 1]?.value;
        const convRate = i > 0 && step.value != null && prev != null && prev > 0
          ? ((step.value / prev) * 100).toFixed(1) : null;
        return (
          <div key={step.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{step.label}</span>
              <span className="font-medium text-foreground">
                {step.value == null ? <span className="text-muted-foreground">non renseigné</span> : fmt(step.value)}
                {convRate && <span className="text-muted-foreground ml-1">({convRate}%)</span>}
              </span>
            </div>
            <div className="h-5 bg-muted rounded-lg overflow-hidden">
              {step.value != null && (
                <div className="h-full rounded-lg transition-all duration-500"
                  style={{ width: `${Math.max(pct, 2)}%`, background: `linear-gradient(90deg, #fb3d80, #ffa7c6)` }} />
              )}
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
    { label: "Posts publiés", key: "posts_count" },
    { label: "Portée", key: "reach" },
    { label: "Portée sponsorisée", key: "reach_paid" },
    { label: "Comptes engagés", key: "accounts_engaged" },
    { label: "Interactions", key: "interactions" },
    { label: "Visites profil", key: "profile_visits" },
    { label: "Clics site", key: "website_clicks" },
    { label: "Followers gagnés", key: "followers_gained" },
    { label: "Inscrits email", key: "email_signups" },
    // Contexte pub : un pic de reach/abonnés peut venir d'un budget sponsorisé.
    { label: "Budget pub (€)", key: "ad_budget" },
  ];

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4">
      <h3 className="font-body text-sm font-bold text-foreground">Comparaison mois par mois</h3>
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
                const change = pctChange(valA, valB);
                return (
                  <tr key={m.key} className="border-b border-border/50">
                    <td className="py-2 pr-4 text-muted-foreground">{m.label}</td>
                    <td className="py-2 pr-4 font-medium">{fmt(valB)}</td>
                    <td className="py-2 pr-4 font-medium">{fmt(valA)}</td>
                    <td className="py-2">
                      {change ? (
                        <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${
                          change.dir === "up" ? "text-success" : change.dir === "down" ? "text-error" : "text-muted-foreground"
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
