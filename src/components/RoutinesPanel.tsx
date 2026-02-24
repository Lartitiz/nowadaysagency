import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, Circle, Plus, Trash2, Flame, RotateCcw } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Task {
  id: string;
  label: string;
  duration_minutes: number;
  period: string;
  order_index: number;
}

interface Completion {
  id: string;
  task_id: string;
  period_start: string;
}

function getWeekStart(d: Date): string {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
  return monday.toISOString().split("T")[0];
}

function getMonthStart(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export default function RoutinesPanel() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [streak, setStreak] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newDuration, setNewDuration] = useState("15");
  const [newPeriod, setNewPeriod] = useState("week");

  const now = new Date();
  const currentWeekStart = getWeekStart(now);
  const currentMonthStart = getMonthStart(now);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    const [tasksRes, compRes] = await Promise.all([
      supabase
        .from("tasks")
        .select("id, label, duration_minutes, period, order_index")
        .eq("user_id", user.id)
        .order("order_index"),
      supabase
        .from("routine_completions")
        .select("id, task_id, period_start")
        .eq("user_id", user.id),
    ]);
    if (tasksRes.data) setTasks(tasksRes.data);
    if (compRes.data) setCompletions(compRes.data);
  }, [user?.id]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Calculate streak (consecutive weeks with at least 1 completion)
  useEffect(() => {
    if (!completions.length) { setStreak(0); return; }
    const weekStarts = new Set(
      completions
        .filter((c) => {
          const task = tasks.find((t) => t.id === c.task_id);
          return task?.period === "week";
        })
        .map((c) => c.period_start)
    );

    let s = 0;
    let check = currentWeekStart;
    // If nothing this week, start from last week
    if (!weekStarts.has(check)) {
      const d = new Date(check);
      d.setDate(d.getDate() - 7);
      check = d.toISOString().split("T")[0];
    }
    while (weekStarts.has(check)) {
      s++;
      const d = new Date(check);
      d.setDate(d.getDate() - 7);
      check = d.toISOString().split("T")[0];
    }
    setStreak(s);
  }, [completions, tasks, currentWeekStart]);

  const weeklyTasks = useMemo(() => tasks.filter((t) => t.period === "week"), [tasks]);
  const monthlyTasks = useMemo(() => tasks.filter((t) => t.period === "month"), [tasks]);

  const isCompleted = (taskId: string, periodStart: string) =>
    completions.some((c) => c.task_id === taskId && c.period_start === periodStart);

  const toggleCompletion = async (taskId: string, periodStart: string) => {
    if (!user) return;
    const existing = completions.find(
      (c) => c.task_id === taskId && c.period_start === periodStart
    );
    if (existing) {
      await supabase.from("routine_completions").delete().eq("id", existing.id);
    } else {
      await supabase.from("routine_completions").insert({
        user_id: user.id,
        task_id: taskId,
        period_start: periodStart,
      });
    }
    await fetchAll();
  };

  const addRoutine = async () => {
    if (!user || !newLabel.trim()) return;
    const maxOrder = tasks.length > 0 ? Math.max(...tasks.map((t) => t.order_index)) : 0;
    await supabase.from("tasks").insert({
      user_id: user.id,
      label: newLabel.trim(),
      duration_minutes: parseInt(newDuration) || 15,
      period: newPeriod,
      order_index: maxOrder + 1,
    });
    setNewLabel("");
    setNewDuration("15");
    setNewPeriod("week");
    setAddOpen(false);
    await fetchAll();
  };

  const deleteRoutine = async (taskId: string) => {
    await supabase.from("routine_completions").delete().eq("task_id", taskId);
    await supabase.from("tasks").delete().eq("id", taskId);
    await fetchAll();
  };

  const weeklyCompleted = weeklyTasks.filter((t) =>
    isCompleted(t.id, currentWeekStart)
  ).length;
  const monthlyCompleted = monthlyTasks.filter((t) =>
    isCompleted(t.id, currentMonthStart)
  ).length;

  const weeklyPercent = weeklyTasks.length > 0 ? Math.round((weeklyCompleted / weeklyTasks.length) * 100) : 0;
  const monthlyPercent = monthlyTasks.length > 0 ? Math.round((monthlyCompleted / monthlyTasks.length) * 100) : 0;

  if (tasks.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-bold text-foreground">Mes routines</h2>
          <AddRoutineDialog
            open={addOpen}
            onOpenChange={setAddOpen}
            newLabel={newLabel}
            setNewLabel={setNewLabel}
            newDuration={newDuration}
            setNewDuration={setNewDuration}
            newPeriod={newPeriod}
            setNewPeriod={setNewPeriod}
            onAdd={addRoutine}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Ajoute tes premières routines pour structurer ta semaine de com'.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-display text-lg font-bold text-foreground">Mes routines</h2>
        <div className="flex items-center gap-3">
          {streak > 0 && (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-primary">
              <Flame className="h-4 w-4" />
              {streak} semaine{streak > 1 ? "s" : ""}
            </span>
          )}
          <AddRoutineDialog
            open={addOpen}
            onOpenChange={setAddOpen}
            newLabel={newLabel}
            setNewLabel={setNewLabel}
            newDuration={newDuration}
            setNewDuration={setNewDuration}
            newPeriod={newPeriod}
            setNewPeriod={setNewPeriod}
            onAdd={addRoutine}
          />
        </div>
      </div>

      {/* Weekly section */}
      {weeklyTasks.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono-ui text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Cette semaine
            </span>
            <span className="font-mono-ui text-[11px] text-muted-foreground">
              {weeklyCompleted}/{weeklyTasks.length} · {weeklyPercent}%
            </span>
          </div>
          <Progress value={weeklyPercent} className="h-2 mb-3" />
          <div className="space-y-1">
            {weeklyTasks.map((task) => (
              <RoutineRow
                key={task.id}
                task={task}
                checked={isCompleted(task.id, currentWeekStart)}
                onToggle={() => toggleCompletion(task.id, currentWeekStart)}
                onDelete={() => deleteRoutine(task.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Monthly section */}
      {monthlyTasks.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono-ui text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Ce mois-ci
            </span>
            <span className="font-mono-ui text-[11px] text-muted-foreground">
              {monthlyCompleted}/{monthlyTasks.length} · {monthlyPercent}%
            </span>
          </div>
          <Progress value={monthlyPercent} className="h-2 mb-3" />
          <div className="space-y-1">
            {monthlyTasks.map((task) => (
              <RoutineRow
                key={task.id}
                task={task}
                checked={isCompleted(task.id, currentMonthStart)}
                onToggle={() => toggleCompletion(task.id, currentMonthStart)}
                onDelete={() => deleteRoutine(task.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Routine row ─── */
function RoutineRow({
  task,
  checked,
  onToggle,
  onDelete,
}: {
  task: Task;
  checked: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [showDelete, setShowDelete] = useState(false);

  return (
    <div
      className="flex items-center gap-3 rounded-lg p-2 hover:bg-secondary/50 transition-colors group"
      onMouseEnter={() => setShowDelete(true)}
      onMouseLeave={() => setShowDelete(false)}
    >
      <button onClick={onToggle} className="shrink-0">
        {checked ? (
          <CheckCircle2 className="h-5 w-5 text-primary" />
        ) : (
          <Circle className="h-5 w-5 text-border" />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <span className={`text-sm ${checked ? "line-through text-muted-foreground" : "text-foreground"}`}>
          {task.label}
        </span>
      </div>
      <span className="text-[11px] text-muted-foreground shrink-0">{task.duration_minutes} min</span>
      {showDelete && (
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

/* ─── Add routine dialog ─── */
function AddRoutineDialog({
  open,
  onOpenChange,
  newLabel,
  setNewLabel,
  newDuration,
  setNewDuration,
  newPeriod,
  setNewPeriod,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  newLabel: string;
  setNewLabel: (v: string) => void;
  newDuration: string;
  setNewDuration: (v: string) => void;
  newPeriod: string;
  setNewPeriod: (v: string) => void;
  onAdd: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
          <Plus className="h-3.5 w-3.5" />
          Ajouter
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display">Nouvelle routine</DialogTitle>
          <DialogDescription className="sr-only">Créer une nouvelle routine personnalisée</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              Tâche
            </label>
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Ex : Rédiger 2 posts"
              onKeyDown={(e) => e.key === "Enter" && onAdd()}
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Durée (min)
              </label>
              <Input
                type="number"
                value={newDuration}
                onChange={(e) => setNewDuration(e.target.value)}
                min={5}
                max={180}
              />
            </div>
            <div className="flex-1">
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Fréquence
              </label>
              <Select value={newPeriod} onValueChange={setNewPeriod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">Chaque semaine</SelectItem>
                  <SelectItem value="month">Chaque mois</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={onAdd} className="w-full" disabled={!newLabel.trim()}>
            Ajouter la routine
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
