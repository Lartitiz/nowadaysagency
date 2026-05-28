import {
  LineChart, Line, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";

interface EngagementChartProps {
  data: { month: string; engagement: number | null; engagement_followers?: number | null }[];
}

export default function EngagementChart({ data }: EngagementChartProps) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="month" fontSize={11} stroke="hsl(var(--muted-foreground))" />
        <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" unit="%" />
        <Tooltip
          formatter={(val: any) => `${Number(val).toFixed(2)}%`}
          contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
        />
        <Legend />
        <Line type="monotone" dataKey="engagement" stroke="#8B5CF6" name="Engagement / portée" strokeWidth={2.5} dot={{ r: 3 }} />
        <Line type="monotone" dataKey="engagement_followers" stroke="#fb3d80" name="Engagement / abonné·es" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="4 4" />
      </LineChart>
    </ResponsiveContainer>
  );
}
