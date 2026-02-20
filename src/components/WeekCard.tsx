import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Circle, Lock, ChevronDown, ChevronRight, ArrowRight } from "lucide-react";
import { PlanWeek } from "@/lib/plan-content";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface WeekCardProps {
  week: PlanWeek;
  isCurrent: boolean;
  isPast: boolean;
  isFuture: boolean;
  weeksUntil: number;
  completed: boolean;
  completedCount: number;
  isTaskCompleted: (weekNumber: number, taskIndex: number) => boolean;
  onToggleTask: (weekNumber: number, taskIndex: number) => void;
}

export default function WeekCard({
  week,
  isCurrent,
  isPast,
  isFuture,
  weeksUntil,
  completed,
  completedCount,
  isTaskCompleted,
  onToggleTask,
}: WeekCardProps) {
  const [open, setOpen] = useState(isCurrent);

  // Future weeks: show title + locked message
  if (isFuture) {
    return (
      <div className="rounded-2xl border border-border bg-card/50 p-4 opacity-60">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Semaine {week.weekNumber}
            </span>
            <h3 className="font-display text-base font-bold text-foreground mt-0.5">{week.title}</h3>
            <p className="text-xs italic text-muted-foreground mt-1">{week.objective}</p>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Lock className="h-4 w-4" />
            <span className="text-xs">Dans {weeksUntil} semaine{weeksUntil > 1 ? "s" : ""}</span>
          </div>
        </div>
      </div>
    );
  }

  // Past weeks: collapsible
  if (isPast && !isCurrent) {
    return (
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button className={`w-full rounded-2xl border p-4 text-left transition-colors ${
            completed
              ? "border-primary/20 bg-primary/5"
              : "border-border bg-card/80"
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Semaine {week.weekNumber}
                </span>
                <h3 className="font-display text-base font-bold text-foreground mt-0.5">{week.title}</h3>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  {completedCount}/{week.tasks.length}
                </span>
                {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </div>
            </div>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 space-y-1 pl-1">
            {week.tasks.map((task, idx) => (
              <TaskRow
                key={idx}
                task={task}
                checked={isTaskCompleted(week.weekNumber, idx)}
                onToggle={() => onToggleTask(week.weekNumber, idx)}
              />
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  }

  // Current week: always expanded, highlighted
  return (
    <div className="rounded-2xl border-2 border-primary bg-card p-5 shadow-md">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-primary uppercase tracking-wider">
          Semaine {week.weekNumber} — En cours
        </span>
        <span className="text-xs text-muted-foreground">
          {completedCount}/{week.tasks.length} tâches
        </span>
      </div>
      <h3 className="font-display text-lg font-bold text-foreground">{week.title}</h3>
      <p className="text-sm italic text-muted-foreground mt-1 mb-4">{week.objective}</p>
      <div className="space-y-1">
        {week.tasks.map((task, idx) => (
          <TaskRow
            key={idx}
            task={task}
            checked={isTaskCompleted(week.weekNumber, idx)}
            onToggle={() => onToggleTask(week.weekNumber, idx)}
          />
        ))}
      </div>
    </div>
  );
}

function TaskRow({
  task,
  checked,
  onToggle,
}: {
  task: { text: string; duration: string; link?: { label: string; to: string } };
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg p-2 hover:bg-secondary/50 transition-colors">
      <button onClick={onToggle} className="mt-0.5 shrink-0">
        {checked ? (
          <CheckCircle2 className="h-5 w-5 text-primary" />
        ) : (
          <Circle className="h-5 w-5 text-border" />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <span className={`text-sm ${checked ? "line-through text-muted-foreground" : "text-foreground"}`}>
          {task.text}
        </span>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-xs text-muted-foreground">{task.duration}</span>
          {task.link && (
            <Link
              to={task.link.to}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ArrowRight className="h-3 w-3" />
              {task.link.label}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
