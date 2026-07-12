import {
  LineChart, Line, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { monthLabelShort } from "@/lib/stats-helpers";
import type { StatsRow } from "./stats-types";

interface AudienceTrendChartProps {
  /** Lignes mensuelles (déjà filtrées sur la période affichée), ordre indifférent. */
  rows: StatsRow[];
}

type Bucket = { label: string; value: number };

const countryNames = (() => {
  try { return new Intl.DisplayNames(["fr"], { type: "region" }); } catch { return null; }
})();

// % d'un segment (label) dans une distribution de buckets.
function pctOf(buckets: Bucket[] | undefined, label: string): number | null {
  if (!Array.isArray(buckets) || !buckets.length) return null;
  const total = buckets.reduce((s, b) => s + (Number(b?.value) || 0), 0);
  if (!total) return null;
  const hit = buckets.find((b) => String(b?.label) === label);
  if (!hit) return null;
  return Math.round(((Number(hit.value) || 0) / total) * 1000) / 10;
}

function topLabel(buckets: Bucket[] | undefined): string | null {
  if (!Array.isArray(buckets) || !buckets.length) return null;
  return [...buckets].sort((a, b) => (Number(b?.value) || 0) - (Number(a?.value) || 0))[0]?.label ?? null;
}

// Trois lignes : on suit la part des segments DOMINANTS du dernier mois (genre, âge,
// pays), pour montrer comment ils bougent dans le temps sans choisir à la main.
const SERIES_COLORS = ["hsl(var(--primary))", "hsl(var(--info))", "hsl(var(--success))"];

export default function AudienceTrendChart({ rows }: AudienceTrendChartProps) {
  const snapshots = rows
    .map((r) => ({ month_date: r.month_date, aud: (r.custom_data as any)?.ig_audience }))
    .filter((s) => s.aud && (s.aud.gender?.length || s.aud.age?.length || s.aud.countries?.length))
    .sort((a, b) => String(a.month_date).localeCompare(String(b.month_date)));

  if (snapshots.length < 2) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        📈 La courbe d'évolution de ton audience se construit au fil des mois.
        {snapshots.length === 1
          ? " Reviens le mois prochain (après avoir cliqué « Remplir depuis Instagram ») pour voir la tendance."
          : " Clique « Remplir depuis Instagram » chaque mois pour l'alimenter."}
      </p>
    );
  }

  const latest = snapshots[snapshots.length - 1].aud;
  const genderLabel = topLabel(latest.gender);
  const ageLabel = topLabel(latest.age);
  const countryCode = topLabel(latest.countries);
  const countryLabel = countryCode
    ? (() => { try { return countryNames?.of(countryCode) || countryCode; } catch { return countryCode; } })()
    : null;

  // Noms de séries lisibles (clé = libellé affiché dans la légende).
  const series: { key: string; color: string }[] = [];
  if (genderLabel) series.push({ key: genderLabel, color: SERIES_COLORS[0] });
  if (ageLabel) series.push({ key: `${ageLabel} ans`, color: SERIES_COLORS[1] });
  if (countryLabel) series.push({ key: countryLabel, color: SERIES_COLORS[2] });

  if (!series.length) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Pas encore de segment d'audience exploitable pour tracer une tendance.
      </p>
    );
  }

  const data = snapshots.map((s) => {
    const row: Record<string, any> = { month: monthLabelShort(s.month_date) };
    if (genderLabel) row[genderLabel] = pctOf(s.aud.gender, genderLabel);
    if (ageLabel) row[`${ageLabel} ans`] = pctOf(s.aud.age, ageLabel);
    if (countryCode && countryLabel) row[countryLabel] = pctOf(s.aud.countries, countryCode);
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="month" fontSize={11} stroke="hsl(var(--muted-foreground))" />
        <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" unit="%" />
        <Tooltip
          formatter={(val: any) => (val == null ? "—" : `${val}%`)}
          contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
        />
        <Legend />
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            stroke={s.color}
            name={s.key}
            strokeWidth={2.5}
            dot={{ r: 3 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
