import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { startOfWeek, format, addDays, subDays } from "date-fns";
import { ArrowRight } from "lucide-react";

interface Props {
  animationDelay?: number;
}

export default function EngagementRoutineWidget({ animationDelay = 0 }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [weekDots, setWeekDots] = useState<boolean[]>(Array(7).fill(false));
  const [streakCount, setStreakCount] = useState(0);
  const [todayDone, setTodayDone] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;

    const now = new Date();
    const monday = startOfWeek(now, { weekStartsOn: 1 });
    const weekStart = format(monday, "yyyy-MM-dd");
    const weekEnd = format(addDays(monday, 6), "yyyy-MM-dd");
    const todayStr = format(now, "yyyy-MM-dd");

    const [logsRes, streakRes] = await Promise.all([
      supabase
        .from("engagement_checklist_logs")
        .select("log_date")
        .eq("user_id", user.id)
        .gte("log_date", weekStart)
        .lte("log_date", weekEnd),
      supabase
        .from("engagement_streaks")
        .select("current_streak, last_check_date")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    const logDates = (logsRes.data || []).map((d: any) => d.log_date);
    const dots = Array.from({ length: 7 }, (_, i) => {
      const day = format(addDays(monday, i), "yyyy-MM-dd");
      return logDates.includes(day);
    });
    setWeekDots(dots);
    setTodayDone(logDates.includes(todayStr));

    // Calculate streak from consecutive recent days
    if (streakRes.data) {
      setStreakCount(streakRes.data.current_streak || 0);
    } else {
      // Fallback: count consecutive days from logs
      let streak = 0;
      for (let i = 0; i < 30; i++) {
        const d = format(subDays(now, i), "yyyy-MM-dd");
        if (logDates.includes(d) || (i === 0 && !logDates.includes(d))) {
          if (logDates.includes(d)) streak++;
          else if (i === 0) continue; // today not done yet, skip
          else break;
        } else {
          break;
        }
      }
      setStreakCount(streak);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const dayLabels = ["L", "M", "M", "J", "V", "S", "D"];

  return (
    <div
      className="col-span-4 sm:col-span-6 lg:col-span-6 row-span-1
        rounded-[20px] p-5 sm:p-6
        bg-card border border-border
        shadow-[var(--shadow-bento)]
        hover:shadow-[var(--shadow-bento-hover)] hover:-translate-y-[3px]
        transition-all duration-[250ms] ease-out
        opacity-0 animate-reveal-up cursor-pointer"
      style={{ animationDelay: `${animationDelay}s`, animationFillMode: "forwards" }}
      onClick={() => navigate("/instagram/engagement")}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-heading text-base font-bold text-foreground">
          {todayDone ? "🔥" : "💬"} Routine d'engagement
        </h3>
        {todayDone ? (
          <span className="text-xs font-medium text-success flex items-center gap-1">
            Fait ✅
          </span>
        ) : (
          <span
            className="text-xs font-medium text-primary flex items-center gap-1"
            onClick={(e) => {
              e.stopPropagation();
              navigate("/instagram/engagement");
            }}
          >
            15 min · Go <ArrowRight className="h-3 w-3" />
          </span>
        )}
      </div>

      {/* Week dots */}
      <div className="flex items-center justify-between gap-2">
        {dayLabels.map((label, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <span className="text-[10px] font-mono-ui text-muted-foreground">{label}</span>
            <span className="text-base leading-none">
              {weekDots[i] ? "🔥" : "·"}
            </span>
          </div>
        ))}
      </div>

      {/* Streak */}
      {streakCount > 1 && (
        <p className="text-xs text-muted-foreground mt-2">
          {streakCount} jours de suite · Continue !
        </p>
      )}
    </div>
  );
}
