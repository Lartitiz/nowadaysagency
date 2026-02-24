import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { computeComScore, type ComScore } from "@/lib/com-score";
import BentoCard from "@/components/dashboard/BentoCard";

interface ComScoreWidgetProps {
  animationDelay?: number;
}

const DEMO_SCORE: ComScore = {
  total: 54,
  branding: 25,
  regularity: 12,
  engagement: 8,
  channels: 5,
  aiUsage: 4,
  trend: 3,
};

const COMPONENTS = [
  { key: "branding" as const, label: "Branding", max: 35 },
  { key: "regularity" as const, label: "Régularité", max: 25 },
  { key: "engagement" as const, label: "Engagement", max: 15 },
  { key: "channels" as const, label: "Canaux", max: 10 },
  { key: "aiUsage" as const, label: "Contenus IA", max: 15 },
];

function arcColor(score: number) {
  if (score > 70) return "text-green-500";
  if (score > 50) return "text-yellow-500";
  if (score > 30) return "text-orange-500";
  return "text-red-500";
}

function TrendLabel({ trend }: { trend: number }) {
  if (trend > 0)
    return <span className="text-xs text-green-600">↑ +{trend}</span>;
  if (trend < 0)
    return <span className="text-xs text-red-500">↓ {trend}</span>;
  return <span className="text-xs text-muted-foreground">→ stable</span>;
}

function ScoreCircle({ score, trend }: { score: number; trend: number }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={100} height={100} className="transform -rotate-90">
        <circle
          cx={50}
          cy={50}
          r={radius}
          fill="none"
          className="stroke-border"
          strokeWidth={8}
        />
        <circle
          cx={50}
          cy={50}
          r={radius}
          fill="none"
          className={`${arcColor(score)} stroke-current transition-all duration-700`}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span
        className="absolute font-heading text-3xl font-bold text-foreground"
        style={{ lineHeight: "100px", width: 100, textAlign: "center" }}
      >
        {score}
      </span>
      <TrendLabel trend={trend} />
    </div>
  );
}

function MiniBar({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground w-[72px] shrink-0 truncate">
        {label}
      </span>
      <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-mono text-muted-foreground w-[38px] text-right shrink-0">
        {value}/{max}
      </span>
    </div>
  );
}

function SkeletonScore() {
  return (
    <div className="flex flex-col sm:flex-row items-center gap-4 animate-pulse">
      <div className="w-[100px] h-[100px] rounded-full bg-muted" />
      <div className="flex-1 space-y-3 w-full">
        <div className="h-3 bg-muted rounded w-24" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-1.5 bg-muted rounded-full" />
        ))}
      </div>
    </div>
  );
}

export default function ComScoreWidget({ animationDelay }: ComScoreWidgetProps) {
  const { user } = useAuth();
  const { isDemoMode } = useDemoContext();
  const wf = useWorkspaceFilter();

  const { data: score, isLoading } = useQuery({
    queryKey: ["com-score", user?.id, wf.value, isDemoMode],
    enabled: !!user && !isDemoMode,
    staleTime: 3 * 60 * 1000,
    queryFn: () => computeComScore(user!.id, wf),
  });

  const s = isDemoMode ? DEMO_SCORE : score;

  return (
    <BentoCard title="" colSpan={6} rowSpan={2} animationDelay={animationDelay}>
      {isLoading && !isDemoMode ? (
        <SkeletonScore />
      ) : s ? (
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
          <div className="relative w-[120px] flex flex-col items-center justify-center shrink-0">
            <ScoreCircle score={s.total} trend={s.trend} />
          </div>
          <div className="flex-1 w-full">
            <h3 className="font-heading text-sm font-bold text-foreground mb-2">
              Score com'
            </h3>
            <div className="space-y-2">
              {COMPONENTS.map((c) => (
                <MiniBar
                  key={c.key}
                  label={c.label}
                  value={s[c.key]}
                  max={c.max}
                />
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </BentoCard>
  );
}
