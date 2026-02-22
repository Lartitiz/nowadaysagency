import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Lightbulb, CalendarDays, CheckSquare, Flame } from "lucide-react";

interface PlanTaskRow {
  week_number: number;
  task_index: number;
  is_completed: boolean;
  completed_at: string | null;
}

interface WeeklyRecapProps {
  currentWeek: number;
  planTasks: PlanTaskRow[];
}

function getLastWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() - diffToMonday);
  thisMonday.setHours(0, 0, 0, 0);
  
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(thisMonday.getDate() - 7);
  
  const lastSunday = new Date(thisMonday);
  lastSunday.setMilliseconds(-1);
  
  return { start: lastMonday, end: lastSunday };
}

export default function WeeklyRecap({ currentWeek, planTasks }: WeeklyRecapProps) {
  const { user } = useAuth();
  const [ideas, setIdeas] = useState(0);
  const [planned, setPlanned] = useState(0);
  const [published, setPublished] = useState(0);
  const [streak, setStreak] = useState(0);

  const { start, end } = getLastWeekRange();

  const tasksCompletedLastWeek = planTasks.filter(
    (t) => t.is_completed && t.completed_at && new Date(t.completed_at) >= start && new Date(t.completed_at) <= end
  ).length;

  useEffect(() => {
    if (!user) return;
    const fetchStats = async () => {
      const startISO = start.toISOString();
      const endISO = end.toISOString();

      const [ideasRes, plannedRes, publishedRes] = await Promise.all([
        supabase
          .from("saved_ideas")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .gte("created_at", startISO)
          .lte("created_at", endISO),
        supabase
          .from("calendar_posts")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .gte("created_at", startISO)
          .lte("created_at", endISO),
        supabase
          .from("calendar_posts")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("status", "published")
          .gte("updated_at", startISO)
          .lte("updated_at", endISO),
      ]);

      setIdeas(ideasRes.count || 0);
      setPlanned(plannedRes.count || 0);
      setPublished(publishedRes.count || 0);

      // Calculate streak
      calculateStreak();
    };
    fetchStats();
  }, [user?.id]);

  const calculateStreak = async () => {
    if (!user) return;
    const { data: posts } = await supabase
      .from("calendar_posts")
      .select("created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    const completedTasks = planTasks.filter((t) => t.is_completed && t.completed_at);

    const now = new Date();
    const getWeekStart = (d: Date) => {
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      return new Date(d.getFullYear(), d.getMonth(), diff);
    };

    let currentWeekStart = getWeekStart(now);
    let streakCount = 0;

    const allDates = [
      ...(posts?.map((p) => new Date(p.created_at)) || []),
      ...completedTasks.map((t) => new Date(t.completed_at!)),
    ];

    const hasCurrentWeek = allDates.some((d) => d >= currentWeekStart);
    if (!hasCurrentWeek) {
      currentWeekStart = new Date(currentWeekStart.getTime() - 7 * 86400000);
    }

    while (true) {
      const weekEnd = new Date(currentWeekStart.getTime() + 7 * 86400000);
      const hasActivity = allDates.some((d) => d >= currentWeekStart && d < weekEnd);
      if (!hasActivity) break;
      streakCount++;
      currentWeekStart = new Date(currentWeekStart.getTime() - 7 * 86400000);
    }

    setStreak(streakCount);
  };

  const totalActions = ideas + planned + tasksCompletedLastWeek;
  const isFirstWeek = currentWeek <= 1;

  let message: string;
  if (isFirstWeek) {
    message = "Bienvenue ! Ton programme démarre cette semaine. On y va étape par étape.";
  } else if (totalActions === 0) {
    message = "La semaine dernière était calme. Pas de pression : reprends où tu en es. L'important c'est la régularité, pas la perfection.";
  } else if (totalActions >= 3) {
    message = `Semaine en feu ! ${ideas > 0 ? `${ideas} idée${ideas > 1 ? "s" : ""}` : ""}${ideas > 0 && planned > 0 ? ", " : ""}${planned > 0 ? `${planned} post${planned > 1 ? "s" : ""} planifié${planned > 1 ? "s" : ""}` : ""}${tasksCompletedLastWeek > 0 ? `, ${tasksCompletedLastWeek} tâche${tasksCompletedLastWeek > 1 ? "s" : ""} complétée${tasksCompletedLastWeek > 1 ? "s" : ""}` : ""}. Tu es en train de construire quelque chose de solide.`;
  } else {
    message = `La semaine dernière, tu as ${ideas > 0 ? `trouvé ${ideas} idée${ideas > 1 ? "s" : ""}` : ""}${ideas > 0 && planned > 0 ? " et " : ""}${planned > 0 ? `planifié ${planned} post${planned > 1 ? "s" : ""}` : ""}${ideas === 0 && planned === 0 && tasksCompletedLastWeek > 0 ? `complété ${tasksCompletedLastWeek} tâche${tasksCompletedLastWeek > 1 ? "s" : ""}` : ""}. C'est du concret. Continue comme ça.`;
  }

  return (
    <div className="rounded-2xl border-l-4 border-l-primary bg-rose-pale p-5">
      <p className="text-sm text-foreground leading-relaxed">{message}</p>
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Lightbulb className="h-3.5 w-3.5 text-primary" />
          {ideas} idée{ideas !== 1 ? "s" : ""}
        </span>
        <span className="flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5 text-primary" />
          {planned} planifié{planned !== 1 ? "s" : ""}
        </span>
        <span className="flex items-center gap-1.5">
          <CheckSquare className="h-3.5 w-3.5 text-primary" />
          {tasksCompletedLastWeek} tâche{tasksCompletedLastWeek !== 1 ? "s" : ""}
        </span>
        <span className="flex items-center gap-1.5">
          <Flame className="h-3.5 w-3.5 text-primary" />
          Série : {streak} semaine{streak !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}
