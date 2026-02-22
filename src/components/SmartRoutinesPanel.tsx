import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Link, useNavigate } from "react-router-dom";
import {
  CheckCircle2, Circle, Plus, Trash2, Flame, Settings, Calendar,
  ArrowRight, Clock, Target, Sparkles, ChevronDown
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import Confetti from "@/components/Confetti";
import {
  getTaskEmoji, getChannelEmoji, getDayLabel, getTaskCategory,
} from "@/lib/routine-generator";

interface RoutineTask {
  id: string;
  title: string;
  task_type: string;
  channel: string | null;
  duration_minutes: number;
  recurrence: string;
  day_of_week: string | null;
  week_of_month: number | null;
  linked_module: string | null;
  is_auto_generated: boolean;
  sort_order: number;
  is_active: boolean;
}

interface Completion {
  id: string;
  routine_task_id: string;
  week: string | null;
  month: string | null;
  completed_at: string;
}

interface CommPlan {
  daily_time: number;
  active_days: string[];
  monthly_goal: string;
}

const DAYS_ORDER = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];
const GOAL_LABELS: Record<string, string> = {
  launch: "Lancer une offre", visibility: "Gagner en visibilité",
  convert: "Convertir / vendre", network: "Développer mon réseau",
  foundations: "Poser les bases",
};

function getWeekId(d: Date): string {
  const start = new Date(d.getFullYear(), 0, 1);
  const diff = d.getTime() - start.getTime();
  const weekNum = Math.ceil((diff / 86400000 + start.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function getMonthId(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getTodayKey(): string {
  const dayMap: Record<number, string> = { 0: "dim", 1: "lun", 2: "mar", 3: "mer", 4: "jeu", 5: "ven", 6: "sam" };
  return dayMap[new Date().getDay()];
}

export default function SmartRoutinesPanel() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<RoutineTask[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [plan, setPlan] = useState<CommPlan | null>(null);
  const [streak, setStreak] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDuration, setNewDuration] = useState("15");
  const [newRecurrence, setNewRecurrence] = useState("daily");

  const now = new Date();
  const weekId = getWeekId(now);
  const monthId = getMonthId(now);
  const today = getTodayKey();
  const weekOfMonth = Math.ceil(now.getDate() / 7);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    const [tasksRes, compRes, planRes] = await Promise.all([
      supabase.from("routine_tasks").select("*").eq("user_id", user.id).eq("is_active", true).order("sort_order"),
      supabase.from("routine_completions").select("id, routine_task_id, week, month, completed_at").eq("user_id", user.id),
      supabase.from("communication_plans").select("daily_time, active_days, monthly_goal").eq("user_id", user.id).maybeSingle(),
    ]);
    if (tasksRes.data) setTasks(tasksRes.data as RoutineTask[]);
    if (compRes.data) setCompletions(compRes.data as Completion[]);
    if (planRes.data) setPlan({
      daily_time: planRes.data.daily_time || 30,
      active_days: (planRes.data.active_days as string[]) || [],
      monthly_goal: planRes.data.monthly_goal || "visibility",
    });
  }, [user?.id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Streak calculation
  useEffect(() => {
    if (!completions.length) { setStreak(0); return; }
    const completedDates = new Set(
      completions.map(c => c.completed_at?.split("T")[0]).filter(Boolean)
    );
    let s = 0;
    const d = new Date();
    // Check today first; if not done, start from yesterday
    if (!completedDates.has(d.toISOString().split("T")[0])) {
      d.setDate(d.getDate() - 1);
    }
    while (completedDates.has(d.toISOString().split("T")[0])) {
      s++;
      d.setDate(d.getDate() - 1);
    }
    setStreak(s);
  }, [completions]);

  // Today's tasks
  const todayTasks = useMemo(() => {
    if (!plan || !plan.active_days.includes(today)) return [];
    return tasks.filter(t => {
      if (t.recurrence === "daily") return true;
      if (t.recurrence === "weekly" && t.day_of_week === today) return true;
      if (t.recurrence === "monthly" && t.week_of_month === weekOfMonth && (t.day_of_week === today || !t.day_of_week)) return true;
      return false;
    });
  }, [tasks, plan, today, weekOfMonth]);

  // Week tasks grouped by day
  const weekTasks = useMemo(() => {
    if (!plan) return {};
    const result: Record<string, RoutineTask[]> = {};
    for (const day of DAYS_ORDER) {
      if (!plan.active_days.includes(day)) continue;
      result[day] = tasks.filter(t => {
        if (t.recurrence === "daily") return true;
        if (t.recurrence === "weekly" && t.day_of_week === day) return true;
        if (t.recurrence === "monthly" && t.week_of_month === weekOfMonth && (t.day_of_week === day || !t.day_of_week)) return true;
        return false;
      });
    }
    return result;
  }, [tasks, plan, weekOfMonth]);

  // Month tasks
  const monthTasks = useMemo(() => tasks.filter(t => t.recurrence === "monthly"), [tasks]);

  const isCompleted = (taskId: string, period: "day" | "week" | "month") => {
    const todayStr = now.toISOString().split("T")[0];
    return completions.some(c => {
      if (c.routine_task_id !== taskId) return false;
      if (period === "day") return c.completed_at?.startsWith(todayStr);
      if (period === "week") return c.week === weekId;
      if (period === "month") return c.month === monthId;
      return false;
    });
  };

  const toggleCompletion = async (taskId: string, recurrence: string) => {
    if (!user) return;
    const period = recurrence === "daily" ? "day" : recurrence === "monthly" ? "month" : "week";
    const todayStr = now.toISOString().split("T")[0];

    const existing = completions.find(c => {
      if (c.routine_task_id !== taskId) return false;
      if (period === "day") return c.completed_at?.startsWith(todayStr);
      if (period === "week") return c.week === weekId;
      if (period === "month") return c.month === monthId;
      return false;
    });

    if (existing) {
      await supabase.from("routine_completions").delete().eq("id", existing.id);
    } else {
      await supabase.from("routine_completions").insert([{
        user_id: user.id,
        task_id: taskId,
        period_start: now.toISOString().split("T")[0],
        routine_task_id: taskId,
        week: weekId,
        month: monthId,
      }]);

      // Check if all today's tasks are done
      const remaining = todayTasks.filter(t => t.id !== taskId && !isCompleted(t.id, t.recurrence === "daily" ? "day" : t.recurrence === "monthly" ? "month" : "week"));
      if (remaining.length === 0 && todayTasks.length > 1) {
        setShowConfetti(true);
        toast.success(`🔥 Journée bouclée ! Ton streak passe à ${streak + 1} jours.`);
        setTimeout(() => setShowConfetti(false), 3000);
      }
    }
    await fetchAll();
  };

  const addCustomTask = async () => {
    if (!user || !newTitle.trim()) return;
    await supabase.from("routine_tasks").insert({
      user_id: user.id,
      title: newTitle.trim(),
      task_type: "custom",
      duration_minutes: parseInt(newDuration) || 15,
      recurrence: newRecurrence,
      is_auto_generated: false,
      sort_order: tasks.length,
    });
    setNewTitle("");
    setNewDuration("15");
    setNewRecurrence("daily");
    setAddOpen(false);
    await fetchAll();
  };

  const deleteTask = async (id: string) => {
    await supabase.from("routine_completions").delete().eq("routine_task_id", id);
    await supabase.from("routine_tasks").delete().eq("id", id);
    await fetchAll();
  };

  const todayCompleted = todayTasks.filter(t => isCompleted(t.id, t.recurrence === "daily" ? "day" : t.recurrence === "monthly" ? "month" : "week")).length;
  const todayTotal = todayTasks.length;
  const todayPercent = todayTotal > 0 ? Math.round((todayCompleted / todayTotal) * 100) : 0;
  const todayMinutes = todayTasks.reduce((acc, t) => acc + t.duration_minutes, 0);

  // No plan yet - show setup CTA
  if (!plan) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="font-display text-lg font-bold text-foreground">Ma routine de com'</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Configure ton plan de com' pour recevoir des routines personnalisées chaque jour.
          On te dit quoi faire, combien de temps, et on t'emmène directement au bon endroit.
        </p>
        <Button onClick={() => navigate("/mon-plan")} className="gap-2">
          <Settings className="h-4 w-4" />
          Configurer mon plan
        </Button>
      </div>
    );
  }

  // Not an active day
  if (!plan.active_days.includes(today) && todayTasks.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-xl">☀️</span>
            <h2 className="font-display text-lg font-bold text-foreground">Pas de routine aujourd'hui</h2>
          </div>
          <Link to="/mon-plan" className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
            <Settings className="h-3.5 w-3.5" /> Mon plan
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">
          C'est ton jour off ! Profite. 🌸
        </p>
        {streak > 0 && (
          <p className="text-xs text-primary font-medium mt-3 flex items-center gap-1">
            <Flame className="h-4 w-4" /> Streak : {streak} jour{streak > 1 ? "s" : ""}
          </p>
        )}
      </div>
    );
  }

  // Group today's tasks by category
  const groupedToday = todayTasks.reduce<Record<string, RoutineTask[]>>((acc, t) => {
    const cat = getTaskCategory(t.task_type);
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(t);
    return acc;
  }, {});

  const categoryOrder = ["Création", "Engagement", "Prospection", "Admin", "Autre"];

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      {showConfetti && <Confetti />}

      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-xl">📋</span>
          <h2 className="font-display text-lg font-bold text-foreground">Ma routine</h2>
        </div>
        <div className="flex items-center gap-2">
          {streak > 0 && (
            <span className="flex items-center gap-1 text-xs font-semibold text-primary">
              <Flame className="h-4 w-4" /> {streak}j
            </span>
          )}
          <Link to="/mon-plan" className="text-muted-foreground hover:text-primary transition-colors">
            <Settings className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {plan.monthly_goal && (
        <p className="text-[11px] text-muted-foreground mb-4 flex items-center gap-1">
          <Target className="h-3 w-3" /> Objectif : {GOAL_LABELS[plan.monthly_goal] || plan.monthly_goal}
        </p>
      )}

      <Tabs defaultValue="today" className="w-full">
        <TabsList className="w-full mb-4">
          <TabsTrigger value="today" className="flex-1 text-xs">Aujourd'hui</TabsTrigger>
          <TabsTrigger value="week" className="flex-1 text-xs">Semaine</TabsTrigger>
          <TabsTrigger value="month" className="flex-1 text-xs">Ce mois</TabsTrigger>
        </TabsList>

        {/* ─── TODAY ─── */}
        <TabsContent value="today">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {getDayLabel(today)} · ~{todayMinutes} min
            </span>
            <span className="text-xs text-muted-foreground">{todayCompleted}/{todayTotal}</span>
          </div>
          <Progress value={todayPercent} className="h-2 mb-4" />

          <div className="space-y-4">
            {categoryOrder.map(cat => {
              const catTasks = groupedToday[cat];
              if (!catTasks?.length) return null;
              const catEmoji = cat === "Création" ? "✍️" : cat === "Engagement" ? "💬" : cat === "Prospection" ? "🎯" : "📊";
              const catMinutes = catTasks.reduce((a, t) => a + t.duration_minutes, 0);
              return (
                <div key={cat}>
                  <p className="font-mono-ui text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                    {catEmoji} {cat} ({catMinutes} min)
                  </p>
                  <div className="space-y-1">
                    {catTasks.map(task => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        checked={isCompleted(task.id, task.recurrence === "daily" ? "day" : task.recurrence === "monthly" ? "month" : "week")}
                        onToggle={() => toggleCompletion(task.id, task.recurrence)}
                        onDelete={!task.is_auto_generated ? () => deleteTask(task.id) : undefined}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex gap-2 mt-4">
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <Plus className="h-3.5 w-3.5" /> Ajouter une tâche
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle className="font-display">Nouvelle tâche</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <Input
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    placeholder="Ex : Préparer mes visuels Canva"
                    onKeyDown={e => e.key === "Enter" && addCustomTask()}
                  />
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-sm font-medium mb-1.5 block">Durée (min)</label>
                      <Input type="number" value={newDuration} onChange={e => setNewDuration(e.target.value)} min={5} max={180} />
                    </div>
                    <div className="flex-1">
                      <label className="text-sm font-medium mb-1.5 block">Fréquence</label>
                      <Select value={newRecurrence} onValueChange={setNewRecurrence}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Chaque jour</SelectItem>
                          <SelectItem value="weekly">Chaque semaine</SelectItem>
                          <SelectItem value="monthly">Chaque mois</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button onClick={addCustomTask} className="w-full" disabled={!newTitle.trim()}>
                    Ajouter
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </TabsContent>

        {/* ─── WEEK ─── */}
        <TabsContent value="week">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
            {DAYS_ORDER.filter(d => plan.active_days.includes(d)).map(day => {
              const dayTasks = weekTasks[day] || [];
              const isToday = day === today;
              return (
                <div key={day} className={`rounded-xl border p-3 ${isToday ? "border-primary bg-primary/5" : "border-border"}`}>
                  <p className={`text-xs font-bold mb-2 ${isToday ? "text-primary" : "text-foreground"}`}>
                    {getDayLabel(day)}
                  </p>
                  <div className="space-y-1.5">
                    {dayTasks.map(t => (
                      <div key={t.id} className="flex items-start gap-1">
                        <span className="text-[10px] leading-none mt-0.5">{getTaskEmoji(t.task_type)}</span>
                        <span className="text-[11px] text-muted-foreground leading-tight line-clamp-2">{t.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 text-[11px] text-muted-foreground">
            Temps total semaine : ~{Object.values(weekTasks).flat().reduce((a, t) => a + t.duration_minutes, 0)} min
          </div>
        </TabsContent>

        {/* ─── MONTH ─── */}
        <TabsContent value="month">
          {monthTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Pas de tâches mensuelles configurées.</p>
          ) : (
            <div className="space-y-1">
              {monthTasks.map(task => (
                <TaskRow
                  key={task.id}
                  task={task}
                  checked={isCompleted(task.id, "month")}
                  onToggle={() => toggleCompletion(task.id, task.recurrence)}
                  onDelete={!task.is_auto_generated ? () => deleteTask(task.id) : undefined}
                  showWeek
                />
              ))}
            </div>
          )}
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Fait : {monthTasks.filter(t => isCompleted(t.id, "month")).length}/{monthTasks.length}</span>
              <span>{monthTasks.length > 0 ? Math.round((monthTasks.filter(t => isCompleted(t.id, "month")).length / monthTasks.length) * 100) : 0}%</span>
            </div>
            <Progress value={monthTasks.length > 0 ? (monthTasks.filter(t => isCompleted(t.id, "month")).length / monthTasks.length) * 100 : 0} className="h-2 mt-1" />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ─── Task Row ─── */
function TaskRow({
  task,
  checked,
  onToggle,
  onDelete,
  showWeek,
}: {
  task: RoutineTask;
  checked: boolean;
  onToggle: () => void;
  onDelete?: () => void;
  showWeek?: boolean;
}) {
  const navigate = useNavigate();
  const [showActions, setShowActions] = useState(false);

  return (
    <div
      className="flex items-center gap-2.5 rounded-lg p-2 hover:bg-secondary/50 transition-colors group"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <button onClick={onToggle} className="shrink-0">
        {checked ? (
          <CheckCircle2 className="h-5 w-5 text-primary" />
        ) : (
          <Circle className="h-5 w-5 text-border" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px]">{getTaskEmoji(task.task_type)}</span>
          <span className={`text-sm leading-tight ${checked ? "line-through text-muted-foreground" : "text-foreground"}`}>
            {task.title}
          </span>
        </div>
        {showWeek && task.week_of_month && (
          <p className="text-[10px] text-muted-foreground mt-0.5 ml-5">
            📅 Semaine {task.week_of_month}
          </p>
        )}
      </div>

      <span className="text-[11px] text-muted-foreground shrink-0">{task.duration_minutes} min</span>

      {task.linked_module && (
        <button
          onClick={(e) => { e.stopPropagation(); navigate(task.linked_module!); }}
          className="shrink-0 text-primary hover:text-primary/80 transition-colors"
          title="Ouvrir le module"
        >
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      )}

      {showActions && onDelete && (
        <button
          onClick={onDelete}
          className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
