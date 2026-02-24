import {
  ComposedChart, Line, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

interface RevenueChartProps {
  data: { month: string; revenue: number | null; clients: number | null }[];
}

export default function RevenueChart({ data }: RevenueChartProps) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="month" fontSize={11} stroke="hsl(var(--muted-foreground))" />
        <YAxis yAxisId="left" fontSize={11} stroke="hsl(var(--muted-foreground))" unit="€" />
        <YAxis yAxisId="right" orientation="right" fontSize={11} stroke="hsl(var(--muted-foreground))" />
        <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
        <Bar yAxisId="left" dataKey="revenue" fill="#fb3d80" name="CA (€)" radius={[4, 4, 0, 0]} />
        <Line yAxisId="right" type="monotone" dataKey="clients" stroke="#8B5CF6" name="Clients" strokeWidth={2} dot={{ r: 3 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
