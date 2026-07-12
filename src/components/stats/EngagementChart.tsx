import {
  LineChart, Line, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";

interface EngagementChartProps {
  data: { month: string; engagement: number | null; engagement_followers?: number | null }[];
}

// Deux échelles distinctes : l'engagement par portée (~2-8 %) était écrasé en
// ligne plate par l'engagement par abonné·es (~30-50 %) sur un axe commun.
export default function EngagementChart({ data }: EngagementChartProps) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="month" fontSize={11} stroke="hsl(var(--muted-foreground))" />
        <YAxis yAxisId="left" fontSize={11} stroke="hsl(var(--info))" unit="%" />
        <YAxis yAxisId="right" orientation="right" fontSize={11} stroke="hsl(var(--primary))" unit="%" />
        <Tooltip
          formatter={(val: any) => (val == null ? "–" : `${Number(val).toFixed(2)}%`)}
          contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
        />
        <Legend />
        <Line yAxisId="left" type="monotone" dataKey="engagement" stroke="hsl(var(--info))" name="Engagement / portée (éch. gauche)" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
        <Line yAxisId="right" type="monotone" dataKey="engagement_followers" stroke="hsl(var(--primary))" name="Engagement / abonné·es (éch. droite)" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="4 4" connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}
