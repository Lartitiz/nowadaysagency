import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Progress } from "@/components/ui/progress";
import { ArrowRight } from "lucide-react";

interface Props {
  animationDelay?: number;
}

function getMonthlyObjectives(weeklyTime: string): { posts: number; routineDays: number } {
  switch (weeklyTime) {
    case "15min":
    case "0_5h":
      return { posts: 4, routineDays: 10 };
    case "30min":
    case "1h":
      return { posts: 8, routineDays: 15 };
    case "2h":
    case "2_5h":
      return { posts: 12, routineDays: 20 };
    case "5h":
    case "5h+":
      return { posts: 16, routineDays: 23 };
    default:
      return { posts: 8, routineDays: 15 };
  }
}

function getMonthMessage(pubPercent: number, routinePercent: number): string {
  const avg = (pubPercent + routinePercent) / 2;
  if (avg >= 80) return "🔥 Mois incroyable. Continue comme ça.";
  if (avg >= 60) return "💡 Tu es sur la bonne voie ce mois-ci.";
  if (avg >= 40) return "🌱 Ça avance. Chaque pas compte.";
  if (avg >= 20) return "💪 Le mois n'est pas fini, tu peux encore rattraper.";
  return "Pas de pression. Un contenu cette semaine, c'est déjà bien.";
}

export default function MonthlyStatsWidget({ animationDelay = 0 }: Props) {
  const { user } = useAuth();
  const { isDemoMode, demoData } = useDemoContext();
  const { column, value } = useWorkspaceFilter();
  const navigate = useNavigate();
  const [monthPublished, setMonthPublished] = useState(0);
  const [monthRoutineDays, setMonthRoutineDays] = useState(0);
  const [monthAiUsage, setMonthAiUsage] = useState(0);
  const [objectives, setObjectives] = useState({ posts: 8, routineDays: 15 });
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const monthName = format(now, "MMMM", { locale: fr });
  const monthStart = format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd");
  const monthEnd = format(new Date(now.getFullYear(), now.getMonth() + 1, 0), "yyyy-MM-dd");

  const fetchData = useCallback(async () => {
    if (isDemoMode && demoData) {
      setMonthPublished(5);
      setMonthRoutineDays(12);
      setMonthAiUsage(demoData.profile.credits_used);
      setObjectives({ posts: 8, routineDays: 20 });
      setLoading(false);
      return;
    }

    if (!user) return;

    const [pubRes, routineRes, aiRes, configRes] = await Promise.all([
      (supabase
        .from("calendar_posts") as any)
        .select("id", { count: "exact", head: true })
        .eq(column, value)
        .eq("status", "published")
        .gte("date", monthStart)
        .lte("date", monthEnd),
      (supabase
        .from("engagement_checklist_logs") as any)
        .select("id", { count: "exact", head: true })
        .eq(column, value)
        .gte("log_date", monthStart)
        .lte("log_date", monthEnd),
      (supabase
        .from("ai_usage") as any)
        .select("id", { count: "exact", head: true })
        .eq(column, value)
        .gte("created_at", monthStart + "T00:00:00"),
      (supabase
        .from("user_plan_config") as any)
        .select("weekly_time")
        .eq(column, value)
        .maybeSingle(),
    ]);

    setMonthPublished(pubRes.count ?? 0);
    setMonthRoutineDays(routineRes.count ?? 0);
    setMonthAiUsage(aiRes.count ?? 0);

    const weeklyTime = (configRes.data as any)?.weekly_time?.toString() || "2_5h";
    setObjectives(getMonthlyObjectives(weeklyTime));
    setLoading(false);
  }, [user?.id, isDemoMode, monthStart, monthEnd, column, value]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const pubPercent = objectives.posts > 0 ? Math.min(100, Math.round((monthPublished / objectives.posts) * 100)) : 0;
  const routinePercent = objectives.routineDays > 0 ? Math.min(100, Math.round((monthRoutineDays / objectives.routineDays) * 100)) : 0;
  const aiMax = 300;
  const aiPercent = Math.min(100, Math.round((monthAiUsage / aiMax) * 100));

  const message = getMonthMessage(pubPercent, routinePercent);

  return (
    <div
      className="col-span-4 sm:col-span-6 lg:col-span-6 row-span-2
        rounded-[20px] p-5 sm:p-6
        bg-[hsl(var(--bento-dark))] border-none text-white
        shadow-[var(--shadow-bento)]
        hover:shadow-[var(--shadow-bento-hover)] hover:-translate-y-[3px]
        active:translate-y-0 active:shadow-[var(--shadow-bento)]
        transition-all duration-[250ms] ease-out
        opacity-0 animate-reveal-up cursor-pointer"
      style={{ animationDelay: `${animationDelay}s`, animationFillMode: "forwards" }}
      onClick={() => navigate("/instagram/stats")}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-heading text-base font-bold text-white">
          📊 Mon mois de {monthName}
        </h3>
        <span className="text-xs text-white/50 font-medium flex items-center gap-1">
          Voir les stats <ArrowRight className="h-3 w-3" />
        </span>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="text-xs text-white/60 w-24 shrink-0">Publications</span>
          <div className="flex-1">
            <Progress
              value={pubPercent}
              className="h-1.5 bg-white/10 [&>div]:bg-gradient-to-r [&>div]:from-primary [&>div]:to-accent"
            />
          </div>
          <span className="text-xs text-white/80 font-mono-ui w-12 text-right">
            {monthPublished}/{objectives.posts}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-white/60 w-24 shrink-0">Routine</span>
          <div className="flex-1">
            <Progress
              value={routinePercent}
              className="h-1.5 bg-white/10 [&>div]:bg-[hsl(25_95%_53%)]"
            />
          </div>
          <span className="text-xs text-white/80 font-mono-ui w-12 text-right">
            {monthRoutineDays}/{objectives.routineDays}j
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-white/60 w-24 shrink-0">Crédits IA</span>
          <div className="flex-1">
            <Progress
              value={aiPercent}
              className="h-1.5 bg-white/10 [&>div]:bg-white/40"
            />
          </div>
          <span className="text-xs text-white/80 font-mono-ui w-12 text-right">
            {monthAiUsage}/{aiMax}
          </span>
        </div>
      </div>

      <p className="text-xs text-white/50 mt-4 italic">{message}</p>
    </div>
  );
}
