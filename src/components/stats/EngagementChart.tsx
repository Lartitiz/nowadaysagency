import {
  ComposedChart, Line, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

interface EngagementChartProps {
  data: { month: string; reach: number | null; engagement: number | null }[];
}

export default function EngagementChart({ data }: EngagementChartProps) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="month" fontSize={11} stroke="hsl(var(--muted-foreground))" />
        <YAxis yAxisId="left" fontSize={11} stroke="hsl(var(--muted-foreground))" />
        <YAxis yAxisId="right" orientation="right" fontSize={11} stroke="hsl(var(--muted-foreground))" unit="%" />
        <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
        <Bar yAxisId="left" dataKey="reach" fill="#ffa7c6" name="Portée" radius={[4, 4, 0, 0]} />
        <Line yAxisId="right" type="monotone" dataKey="engagement" stroke="#8B5CF6" name="Engagement %" strokeWidth={2} dot={{ r: 3 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
