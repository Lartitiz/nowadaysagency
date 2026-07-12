import {
  LineChart, Line, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

interface EngagementChartProps {
  data: { month: string; engagement: number | null }[];
}

// UNE seule définition d'engagement dans toute la page (arbitrage 12/07) :
// comptes engagés ÷ portée — celle d'Instagram Insights, robuste aux abonnés
// dormants, cohérente avec les taux par post (top/flop) et l'analyse IA.
// L'ancienne « interactions ÷ abonné·es » (30-50 %, déroutante à côté d'un
// 5 %) reste visible comme champ calculé secondaire dans « Saisir mes stats ».
export default function EngagementChart({ data }: EngagementChartProps) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="month" fontSize={11} stroke="hsl(var(--muted-foreground))" />
        <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" unit="%" />
        <Tooltip
          formatter={(val: any) => (val == null ? "–" : `${Number(val).toFixed(2)}%`)}
          contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
        />
        <Line type="monotone" dataKey="engagement" stroke="hsl(var(--primary))" name="Taux d'engagement" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}
