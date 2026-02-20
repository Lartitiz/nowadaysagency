import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import WeeklyRecap from "@/components/WeeklyRecap";
import WeekCard from "@/components/WeekCard";
import { PLAN_WEEKS, PHASES } from "@/lib/plan-content";
import { Lightbulb, RotateCcw, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import Confetti from "@/components/Confetti";

interface PlanTaskRow {
  id: string;
  week_number: number;
  task_index: number;
  is_completed: boolean;
  completed_at: string | null;
}

export default function PlanPage() {
  const { user } = useAuth();
  const [planStartDate, setPlanStartDate] = useState<string | null>(null);
  const [planTasks, setPlanTasks] = useState<PlanTaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showConfetti, setShowConfetti] = useState(false);

  // Initialize plan on first visit
  useEffect(() => {
    if (!user) return;
    const init = async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("plan_start_date")
        .eq("user_id", user.id)
        .single();

      if (profile?.plan_start_date) {
        setPlanStartDate(profile.plan_start_date);
      } else {
        const today = new Date().toISOString().split("T")[0];
        await supabase
          .from("profiles")
          .update({ plan_start_date: today })
          .eq("user_id", user.id);
        setPlanStartDate(today);
      }

      await fetchTasks();
      setLoading(false);
    };
    init();
  }, [user]);

  const fetchTasks = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("plan_tasks")
      .select("*")
      .eq("user_id", user.id)
      .order("week_number")
      .order("task_index");
    if (data) setPlanTasks(data as PlanTaskRow[]);
  };

  const currentWeek = useMemo(() => {
    if (!planStartDate) return 1;
    const start = new Date(planStartDate);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return Math.floor(diffDays / 7) + 1;
  }, [planStartDate]);

  const toggleTask = async (weekNumber: number, taskIndex: number) => {
    if (!user) return;
    const existing = planTasks.find(
      (t) => t.week_number === weekNumber && t.task_index === taskIndex
    );

    if (existing) {
      const newCompleted = !existing.is_completed;
      await supabase
        .from("plan_tasks")
        .update({
          is_completed: newCompleted,
          completed_at: newCompleted ? new Date().toISOString() : null,
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("plan_tasks").insert({
        user_id: user.id,
        week_number: weekNumber,
        task_index: taskIndex,
        is_completed: true,
        completed_at: new Date().toISOString(),
      });
    }
    await fetchTasks();
  };

  const isTaskCompleted = (weekNumber: number, taskIndex: number) => {
    return planTasks.some(
      (t) => t.week_number === weekNumber && t.task_index === taskIndex && t.is_completed
    );
  };

  const getWeekCompletedCount = (weekNumber: number) => {
    return planTasks.filter((t) => t.week_number === weekNumber && t.is_completed).length;
  };

  const isWeekCompleted = (weekNumber: number) => {
    const week = PLAN_WEEKS.find((w) => w.weekNumber === weekNumber);
    if (!week) return false;
    return getWeekCompletedCount(weekNumber) >= week.tasks.length;
  };

  const programCompleted = currentWeek > 12 && PLAN_WEEKS.every((w) => isWeekCompleted(w.weekNumber));

  const resetProgram = async () => {
    if (!user) return;
    await supabase.from("plan_tasks").delete().eq("user_id", user.id);
    const today = new Date().toISOString().split("T")[0];
    await supabase.from("profiles").update({ plan_start_date: today }).eq("user_id", user.id);
    setPlanStartDate(today);
    setPlanTasks([]);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex gap-1">
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.16s" }} />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.32s" }} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      {showConfetti && <Confetti />}
      <main className="mx-auto max-w-[800px] px-6 py-8 max-md:px-4">
        <div className="mb-8">
          <h1 className="font-display text-[26px] font-bold text-foreground">
            Ton programme com'
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Un plan progressif pour structurer ta visibilité sur les réseaux. Semaine par semaine, à ton rythme.
          </p>
        </div>

        {/* Program completed */}
        {programCompleted ? (
          <div className="rounded-2xl border border-primary/30 bg-card p-8 text-center mb-8">
            <h2 className="font-display text-2xl font-bold text-foreground mb-3">
              Tu as terminé le programme !
            </h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              12 semaines de com', c'est pas rien. Tu as posé tes bases, trouvé ton rythme, et affirmé ta voix. Maintenant, tu continues en autonomie : l'atelier et le calendrier sont toujours là pour toi.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={resetProgram} variant="outline" className="gap-2">
                <RotateCcw className="h-4 w-4" />
                Recommencer le programme
              </Button>
              <Button asChild className="gap-2">
                <Link to="/dashboard">
                  Continuer en freestyle
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Weekly recap */}
            <WeeklyRecap currentWeek={currentWeek} planTasks={planTasks} />

            {/* Timeline */}
            <div className="relative mt-8">
              {PHASES.map((phase) => (
                <div key={phase.number}>
                  {/* Phase header */}
                  <div className="mb-4 ml-7 rounded-xl bg-[hsl(var(--jaune-lumiere)/0.3)] px-4 py-2">
                    <span className="text-sm font-bold text-foreground">
                      Phase {phase.number} : {phase.title}
                    </span>
                  </div>

                  {/* Weeks in this phase */}
                  {phase.weeks.map((weekNum) => {
                    const week = PLAN_WEEKS.find((w) => w.weekNumber === weekNum)!;
                    const isCurrent = weekNum === Math.min(currentWeek, 12);
                    const isPast = weekNum < currentWeek;
                    const isFuture = weekNum > currentWeek;
                    const weeksUntil = weekNum - currentWeek;
                    const completed = isWeekCompleted(weekNum);

                    return (
                      <div key={weekNum} className="relative flex gap-4 pb-6 last:pb-0">
                        {/* Vertical line */}
                        <div className="flex flex-col items-center">
                          <TimelineDot
                            isCurrent={isCurrent}
                            isPast={isPast}
                            completed={completed}
                          />
                          {weekNum < 12 && (
                            <div className="w-[2px] flex-1 bg-[hsl(var(--rose-doux))]" />
                          )}
                        </div>

                        {/* Week card */}
                        <div className="flex-1 pb-2">
                          <WeekCard
                            week={week}
                            isCurrent={isCurrent}
                            isPast={isPast}
                            isFuture={isFuture}
                            weeksUntil={weeksUntil}
                            completed={completed}
                            completedCount={getWeekCompletedCount(weekNum)}
                            isTaskCompleted={isTaskCompleted}
                            onToggleTask={toggleTask}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function TimelineDot({ isCurrent, isPast, completed }: { isCurrent: boolean; isPast: boolean; completed: boolean }) {
  if (isCurrent) {
    return (
      <div className="relative flex h-5 w-5 items-center justify-center">
        <div className="absolute h-5 w-5 rounded-full bg-primary/30 animate-ping" style={{ animationDuration: "2s" }} />
        <div className="relative h-3 w-3 rounded-full bg-primary" />
      </div>
    );
  }
  if (isPast && completed) {
    return (
      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary">
        <svg className="h-3 w-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
    );
  }
  if (isPast) {
    return <div className="h-3 w-3 rounded-full bg-primary/50 mt-1" />;
  }
  return <div className="h-3 w-3 rounded-full border-2 border-muted-foreground/30 mt-1" />;
}
