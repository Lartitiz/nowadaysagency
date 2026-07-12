import {
  LineChart, Line, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

interface FollowersChartProps {
  data: { month: string; followers: number | null; followersIsEst?: boolean }[];
}

// Domaine Y : ni ancré à 0 (une croissance de +30 % paraissait plate), ni en
// auto pur (+3 abonnés sur 6 000 dessinait une pente spectaculaire). On garantit
// une plage minimale (~4 % de la valeur) pour que la pente reste proportionnée.
function paddedDomain(values: number[]): [number, number] | undefined {
  if (!values.length) return undefined;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const minSpan = Math.max(10, Math.round(max * 0.04));
  const span = Math.max(max - min, minSpan);
  const mid = (min + max) / 2;
  return [Math.max(0, Math.floor(mid - span * 0.75)), Math.ceil(mid + span * 0.75)];
}

export default function FollowersChart({ data }: FollowersChartProps) {
  const values = data.map(d => d.followers).filter((v): v is number => v != null);
  const domain = paddedDomain(values);
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="month" fontSize={11} stroke="hsl(var(--muted-foreground))" />
        <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" domain={domain ?? ["auto", "auto"]} allowDecimals={false} />
        <Tooltip
          formatter={(val: any, _name: any, entry: any) =>
            entry?.payload?.followersIsEst
              ? [`${Number(val).toLocaleString("fr-FR")} (reconstitué)`, "Abonné·es"]
              : Number(val).toLocaleString("fr-FR")
          }
          contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
        />
        <Line type="monotone" dataKey="followers" stroke="hsl(var(--primary))" name="Abonné·es" strokeWidth={2.5} dot={{ r: 4 }} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}
