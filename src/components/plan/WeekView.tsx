import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import {
  RefreshCw, Plus, ArrowRight, Clock, Check, Trash2, Loader2,
} from "lucide-react";
import { format, startOfWeek, addDays } from "date-fns";
import { fr } from "date-fns/locale";


interface WeeklyTask {
  id: string;
  user_id: string;
  week_start: string;
  day_of_week: number;
  task_type: string;
  title: string;
  description: string | null;
  estimated_minutes: number;
  link_to: string | null;
  link_label: string | null;
  related_contacts: any;
  related_prospect_ids: any;
  related_calendar_post_id: string | null;
  suggested_format: string | null;
  suggested_objective: string | null;
  is_completed: boolean;
  completed_at: string | null;
  is_custom: boolean;
  sort_order: number;
  created_at: string;
}

interface CalendarPost {
  id: string;
  date: string;
  canal: string;
  theme: string;
  status: string;
  format: string | null;
  content_draft: string | null;
}

const DAY_LABELS = ["", "LUN", "MAR", "MER", "JEU", "VEN", "SAM", "DIM"];
const DAY_FULL_LABELS = ["", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

export default function WeekView() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<WeeklyTask[]>([]);
  const [calendarPosts, setCalendarPosts] = useState<CalendarPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [weekStart, setWeekStart] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);
  const [config, setConfig] = useState<any>(null);

  const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
  const today = new Date();
  const todayDow = today.getDay() === 0 ? 7 : today.getDay();

  const loadWeek = useCallback(async (force = false) => {
    if (!user?.id) return;
    if (force) setRegenerating(true);
    else setLoading(true);

    try {
      // Load config
      const { data: cfg } = await supabase
        .from("user_plan_config")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      setConfig(cfg);

      // Generate/load week via edge function
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) return;

      const res = await supabase.functions.invoke("generate-weekly-plan", {
        body: { force },
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.data?.tasks) {
        setTasks(res.data.tasks);
        setWeekStart(res.data.week_start);
      }

      // Load calendar posts for mini-calendar
      const ws = res.data?.week_start || monday.toISOString().split("T")[0];
      const endDate = addDays(new Date(ws + "T00:00:00"), 6).toISOString().split("T")[0];
      const { data: posts } = await supabase
        .from("calendar_posts")
        .select("id, date, canal, theme, status, format, content_draft")
        .eq("user_id", user.id)
        .gte("date", ws)
        .lte("date", endDate);
      setCalendarPosts(posts || []);
    } finally {
      setLoading(false);
      setRegenerating(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadWeek();
  }, [loadWeek]);

  const toggleTask = async (task: WeeklyTask) => {
    const newCompleted = !task.is_completed;
    setTasks(prev =>
      prev.map(t =>
        t.id === task.id
          ? { ...t, is_completed: newCompleted, completed_at: newCompleted ? new Date().toISOString() : null }
          : t
      )
    );
    if (newCompleted) {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 2000);
    }

    await supabase
      .from("weekly_tasks")
      .update({
        is_completed: newCompleted,
        completed_at: newCompleted ? new Date().toISOString() : null,
      })
      .eq("id", task.id);
  };

  const deleteTask = async (taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
    await supabase.from("weekly_tasks").delete().eq("id", taskId);
  };

  const addCustomTask = async (dayOfWeek: number) => {
    if (!user?.id || !weekStart) return;
    const title = prompt("Titre de la tâche :");
    if (!title) return;

    const newTask = {
      user_id: user.id,
      week_start: weekStart,
      day_of_week: dayOfWeek,
      task_type: "custom",
      title,
      description: null,
      estimated_minutes: 15,
      link_to: null,
      link_label: null,
      is_custom: true,
      sort_order: 99,
    };

    const { data } = await supabase.from("weekly_tasks").insert(newTask).select().single();
    if (data) setTasks(prev => [...prev, data]);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">
          Configure d'abord ton plan dans l'onglet "Parcours" pour accéder à ta semaine.
        </p>
      </div>
    );
  }

  // Group tasks by day
  const tasksByDay: Record<number, WeeklyTask[]> = {};
  for (let d = 1; d <= 7; d++) tasksByDay[d] = [];
  for (const t of tasks) {
    if (tasksByDay[t.day_of_week]) tasksByDay[t.day_of_week].push(t);
  }

  // Calendar posts by day
  const postsByDay: Record<number, CalendarPost[]> = {};
  for (const post of calendarPosts) {
    const d = new Date(post.date + "T00:00:00");
    const dow = d.getDay() === 0 ? 7 : d.getDay();
    if (!postsByDay[dow]) postsByDay[dow] = [];
    postsByDay[dow].push(post);
  }

  // Stats
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.is_completed).length;
  const totalMinutes = tasks.filter(t => !t.is_completed).reduce((s, t) => s + (t.estimated_minutes || 0), 0);
  const weeklyBudgets: Record<string, string> = {
    less_2h: "Moins de 2h",
    "2_5h": "2-5h",
    "5_10h": "5-10h",
    more_10h: "Plus de 10h",
  };

  // Posts stats
  const postCount = calendarPosts.filter(p => p.format !== "stories").length;
  const storiesCount = calendarPosts.filter(p => p.format === "stories").length;

  const weekEndDate = addDays(monday, 4);
  const weekLabel = `${format(monday, "d", { locale: fr })}-${format(weekEndDate, "d MMMM", { locale: fr })}`;

  return (
    <div className="space-y-4">
      {showConfetti && <span className="fixed top-4 left-1/2 -translate-x-1/2 text-2xl z-50 animate-bounce">✨</span>}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-foreground">
          📆 Ma semaine · {weekLabel}
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => loadWeek(true)}
          disabled={regenerating}
          className="gap-1.5 text-xs text-muted-foreground"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${regenerating ? "animate-spin" : ""}`} />
          Régénérer
        </Button>
      </div>

      {/* Mini calendar */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <div className="grid grid-cols-6 gap-2 mb-3">
          {[1, 2, 3, 4, 5, 6].map(dow => {
            const dayDate = addDays(monday, dow - 1);
            const isToday = dow === todayDow;
            const dayPosts = postsByDay[dow] || [];

            return (
              <Link
                key={dow}
                to="/calendrier"
                className={`rounded-xl border p-2 text-center transition-all hover:border-primary/40 ${
                  isToday
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "border-border"
                }`}
              >
                <div className="text-[10px] font-semibold text-muted-foreground">
                  {DAY_LABELS[dow]}
                </div>
                <div className={`text-sm font-bold ${isToday ? "text-primary" : "text-foreground"}`}>
                  {format(dayDate, "d")}
                </div>
                {dayPosts.length > 0 ? (
                  <div className="mt-1 space-y-0.5">
                    {dayPosts.slice(0, 2).map(p => (
                      <div key={p.id} className="flex items-center gap-0.5 justify-center">
                        <span className="text-[8px]">
                          {p.status === "published" ? "🟢" : p.content_draft ? "🟡" : "🔴"}
                        </span>
                        <span className="text-[9px] text-muted-foreground truncate max-w-[50px]">
                          {p.format === "reel" ? "Reel" : p.format === "stories" ? "Story" : "Post"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-1 text-[9px] text-muted-foreground/40">⬜</div>
                )}
              </Link>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground mb-2">
          <span>🟢 Publié</span>
          <span>🟡 Rédigé</span>
          <span>🔴 À créer</span>
          <span>⬜ Rien de prévu</span>
        </div>

        {/* Counters */}
        <div className="text-xs text-muted-foreground">
          Cette semaine : {postCount} post{postCount > 1 ? "s" : ""} · {storiesCount} stories
        </div>
        <Button variant="ghost" size="sm" asChild className="mt-2 text-xs gap-1 text-primary p-0 h-auto">
          <Link to="/calendrier">+ Ajouter un contenu au calendrier</Link>
        </Button>
      </div>

      {/* Daily tasks */}
      {[1, 2, 3, 4, 5].map(dow => {
        const dayTasks = tasksByDay[dow] || [];
        if (dayTasks.length === 0 && dow > todayDow) return null;
        const dayDate = addDays(monday, dow - 1);
        const isToday = dow === todayDow;
        const dayMinutes = dayTasks.filter(t => !t.is_completed).reduce((s, t) => s + (t.estimated_minutes || 0), 0);
        const dayDone = dayTasks.filter(t => t.is_completed).length;

        return (
          <div key={dow} className="space-y-2">
            {/* Day header */}
            <div className={`flex items-center justify-between px-1 ${isToday ? "" : ""}`}>
              <div className="flex items-center gap-2">
                {isToday && <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />}
                <h3 className={`text-sm font-bold ${isToday ? "text-primary" : "text-foreground"}`}>
                  {isToday ? "AUJOURD'HUI · " : ""}{DAY_FULL_LABELS[dow].toUpperCase()} {format(dayDate, "d")}
                </h3>
                {dayDone === dayTasks.length && dayTasks.length > 0 && (
                  <span className="text-[10px] text-primary font-medium">✅ Tout fait !</span>
                )}
              </div>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" /> ~{dayMinutes} min
              </span>
            </div>

            {/* Tasks */}
            {dayTasks.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                onToggle={() => toggleTask(task)}
                onDelete={() => deleteTask(task.id)}
              />
            ))}

            {/* Add custom task */}
            <button
              onClick={() => addCustomTask(dow)}
              className="w-full text-xs text-muted-foreground hover:text-primary py-1.5 flex items-center justify-center gap-1 transition-colors"
            >
              <Plus className="h-3 w-3" /> Ajouter une tâche
            </button>
          </div>
        );
      })}

      {/* Week summary */}
      <div className="bg-muted/50 border border-border rounded-xl p-4 text-sm space-y-1">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Total semaine</span>
          <span className="font-bold text-foreground">
            ~{Math.floor(totalMinutes / 60)}h{(totalMinutes % 60).toString().padStart(2, "0")}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Budget temps</span>
          <span className="text-foreground">
            {weeklyBudgets[config?.weekly_time] || "2-5h"} / semaine
            {totalMinutes <= (({ less_2h: 120, "2_5h": 300, "5_10h": 600, more_10h: 900 } as any)[config?.weekly_time] || 300)
              ? " ✅"
              : " ⚠️"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Progression</span>
          <span className="font-medium text-foreground">
            {completedTasks}/{totalTasks} tâches faites
          </span>
        </div>
      </div>
    </div>
  );
}

function TaskCard({
  task,
  onToggle,
  onDelete,
}: {
  task: WeeklyTask;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 transition-all group ${
        task.is_completed
          ? "border-primary/20 bg-primary/5 opacity-70"
          : "border-border bg-card hover:border-primary/30"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <button
          onClick={onToggle}
          className={`mt-0.5 shrink-0 h-5 w-5 rounded-md border-2 flex items-center justify-center transition-all ${
            task.is_completed
              ? "bg-primary border-primary text-primary-foreground"
              : "border-muted-foreground/30 hover:border-primary"
          }`}
        >
          {task.is_completed && <Check className="h-3 w-3" />}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${task.is_completed ? "line-through text-muted-foreground" : "text-foreground"}`}>
            {task.title}
          </p>
          {task.description && (
            <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>
          )}
          {task.link_to && !task.is_completed && (
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="mt-1.5 text-xs gap-1 text-primary p-0 h-auto hover:bg-transparent"
            >
              <Link to={task.link_to}>
                <ArrowRight className="h-3 w-3" />
                {task.link_label || "Ouvrir →"}
              </Link>
            </Button>
          )}
        </div>

        {/* Right side */}
        <div className="shrink-0 flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">
            {task.estimated_minutes} min
          </span>
          {(task.is_custom || task.is_completed) && (
            <button
              onClick={onDelete}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
