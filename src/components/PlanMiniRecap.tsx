import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { ClipboardList, ArrowRight } from "lucide-react";
import { PLAN_WEEKS } from "@/lib/plan-content";
import { Progress } from "@/components/ui/progress";

export default function PlanMiniRecap() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const [planStartDate, setPlanStartDate] = useState<string | null>(null);
  const [completedThisWeek, setCompletedThisWeek] = useState(0);
  const [totalThisWeek, setTotalThisWeek] = useState(0);
  const [completedWeeks, setCompletedWeeks] = useState(0);

  const currentWeek = useMemo(() => {
    if (!planStartDate) return 0;
    const start = new Date(planStartDate);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return Math.min(Math.floor(diffDays / 7) + 1, 12);
  }, [planStartDate]);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const { data: profile } = await (supabase.from("profiles") as any)
        .select("plan_start_date")
        .eq(column, value)
        .single();
      if (profile?.plan_start_date) {
        setPlanStartDate(profile.plan_start_date);
      }

      const { data: tasks } = await (supabase.from("plan_tasks") as any)
        .select("week_number, task_index, is_completed")
        .eq(column, value);

      if (tasks && profile?.plan_start_date) {
        const start = new Date(profile.plan_start_date);
        const now = new Date();
        const diffDays = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        const cw = Math.min(Math.floor(diffDays / 7) + 1, 12);

        const weekData = PLAN_WEEKS.find((w) => w.weekNumber === cw);
        setTotalThisWeek(weekData?.tasks.length || 0);
        setCompletedThisWeek(
          tasks.filter((t) => t.week_number === cw && t.is_completed).length
        );

        // Count completed weeks
        let done = 0;
        for (let w = 1; w <= 12; w++) {
          const weekTasks = PLAN_WEEKS.find((pw) => pw.weekNumber === w);
          if (!weekTasks) continue;
          const completedCount = tasks.filter((t) => t.week_number === w && t.is_completed).length;
          if (completedCount >= weekTasks.tasks.length) done++;
        }
        setCompletedWeeks(done);
      }
    };
    fetch();
  }, [user?.id]);

  const weekTitle = PLAN_WEEKS.find((w) => w.weekNumber === currentWeek)?.title || "";

  if (!planStartDate) {
    return (
      <div className="rounded-2xl bg-card border border-border p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <ClipboardList className="h-5 w-5 text-primary" />
          <h3 className="font-display text-lg font-bold">Mon programme</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          Un plan en 12 semaines pour structurer ta com'.
        </p>
        <Link
          to="/mon-plan"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          Commencer le programme
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-card border border-border p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <ClipboardList className="h-5 w-5 text-primary" />
        <h3 className="font-display text-lg font-bold">Mon programme</h3>
      </div>

      <p className="text-sm text-foreground font-medium">
        Semaine {currentWeek} / 12 : {weekTitle}
      </p>

      {/* 12-segment progress bar */}
      <div className="flex gap-1 mt-3 mb-2">
        {Array.from({ length: 12 }, (_, i) => (
          <div
            key={i}
            className={`h-2 flex-1 rounded-full ${
              i < completedWeeks
                ? "bg-primary"
                : i + 1 === currentWeek
                ? "bg-primary/40"
                : "bg-secondary"
            }`}
          />
        ))}
      </div>

      <p className="text-xs text-muted-foreground mb-3">
        {completedThisWeek} / {totalThisWeek} tâches faites cette semaine
      </p>

      <Link
        to="/mon-plan"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        Voir mon plan
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
