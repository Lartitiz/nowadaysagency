import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, Circle, Flame, BarChart3, ClipboardList, Lightbulb } from "lucide-react";

const CONSEILS = [
  "Tu n'as pas besoin de poster tous les jours. Tu as besoin de poster avec intention.",
  "Un bon post par semaine vaut mieux que 7 posts vides.",
  "Si ton post fait réagir 10 personnes qui correspondent à ta cible, c'est un succès.",
  "Arrête de te comparer aux comptes qui ont 50K abonné·es. Toi, tu construis une communauté, pas une audience.",
  "Le contenu parfait n'existe pas. Le contenu publié, oui.",
  "Ton expertise mérite d'être visible. Poster, c'est un acte de générosité.",
  "Les algorithmes changent, les vraies connexions restent.",
  "Raconte ton histoire : c'est la seule chose que personne ne peut copier.",
  "La régularité bat la perfection. Toujours.",
  "Ton audience ne veut pas du contenu lisse. Elle veut du vrai.",
  "Chaque post est une graine. Certaines germent tout de suite, d'autres dans 6 mois.",
  "Ta voix unique est ton meilleur atout marketing.",
  "Mieux vaut 100 abonné·es engagé·es que 10 000 fantômes.",
  "Créer du contenu, c'est documenter ton expertise, pas performer.",
  "L'authenticité n'est pas une stratégie, c'est un état d'esprit.",
];

interface Task {
  id: string;
  label: string;
  duration_minutes: number;
  period: string;
  is_completed: boolean;
}

interface Props {
  ideaCount: number;
}

export default function SidebarPanel({ ideaCount }: Props) {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [streak, setStreak] = useState(0);

  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const conseil = CONSEILS[dayOfYear % CONSEILS.length];

  useEffect(() => {
    if (!user) return;
    fetchTasks();
    calculateStreak();
  }, [user]);

  const fetchTasks = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", user.id)
      .order("order_index");
    if (data) setTasks(data as Task[]);
  };

  const calculateStreak = async () => {
    if (!user) return;
    const { data: posts } = await supabase
      .from("generated_posts")
      .select("created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (!posts || posts.length === 0) { setStreak(0); return; }

    let streakCount = 0;
    const now = new Date();
    const getWeekStart = (d: Date) => {
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      return new Date(d.getFullYear(), d.getMonth(), diff);
    };

    let currentWeekStart = getWeekStart(now);
    const postDates = posts.map((p) => new Date(p.created_at));

    // Check current week
    const hasCurrentWeek = postDates.some((d) => d >= currentWeekStart);
    if (!hasCurrentWeek) {
      // Current week might not be over yet, check previous
      currentWeekStart = new Date(currentWeekStart.getTime() - 7 * 86400000);
    }

    while (true) {
      const weekEnd = new Date(currentWeekStart.getTime() + 7 * 86400000);
      const hasPost = postDates.some((d) => d >= currentWeekStart && d < weekEnd);
      if (!hasPost) break;
      streakCount++;
      currentWeekStart = new Date(currentWeekStart.getTime() - 7 * 86400000);
    }

    setStreak(streakCount);
  };

  const toggleTask = async (taskId: string, current: boolean) => {
    await supabase
      .from("tasks")
      .update({
        is_completed: !current,
        completed_at: !current ? new Date().toISOString() : null,
      })
      .eq("id", taskId);
    fetchTasks();
  };

  const completedCount = tasks.filter((t) => t.is_completed).length;
  const weekTasks = tasks.filter((t) => t.period === "week");
  const monthTasks = tasks.filter((t) => t.period === "month");

  const formatDuration = (min: number) => min >= 60 ? `${Math.floor(min / 60)}h${min % 60 > 0 ? min % 60 : ""}` : `${min} min`;

  return (
    <div className="space-y-5">
      {/* Plan de com */}
      <div className="rounded-2xl bg-card border border-border p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <ClipboardList className="h-5 w-5 text-primary" />
          <h3 className="font-display text-lg font-bold">Mon plan de com'</h3>
        </div>

        {weekTasks.length > 0 && (
          <>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Cette semaine</p>
            <div className="space-y-2 mb-4">
              {weekTasks.map((t) => (
                <TaskItem key={t.id} task={t} onToggle={toggleTask} formatDuration={formatDuration} />
              ))}
            </div>
          </>
        )}

        {monthTasks.length > 0 && (
          <>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Ce mois-ci</p>
            <div className="space-y-2">
              {monthTasks.map((t) => (
                <TaskItem key={t.id} task={t} onToggle={toggleTask} formatDuration={formatDuration} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Progression */}
      <div className="rounded-2xl bg-card border border-border p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h3 className="font-display text-lg font-bold">Ma progression</h3>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <StatCard label="Idées trouvées" value={ideaCount.toString()} />
          <StatCard label="Tâches complétées" value={`${completedCount}/${tasks.length}`} />
          <StatCard label="Thématique active" value="Social Media" />
          <div className="rounded-xl bg-rose-pale p-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Flame className="h-4 w-4 text-primary" />
              <span className="text-lg font-bold text-foreground">{streak}</span>
            </div>
            <span className="text-xs text-muted-foreground">semaines</span>
          </div>
        </div>
      </div>

      {/* Conseil */}
      <div className="rounded-2xl bg-rose-pale border border-border p-5">
        <div className="flex items-center gap-2 mb-3">
          <Lightbulb className="h-5 w-5 text-primary" />
          <h3 className="font-display text-lg font-bold">Le conseil Nowadays</h3>
        </div>
        <p className="text-sm text-foreground leading-relaxed italic">"{conseil}"</p>
      </div>
    </div>
  );
}

function TaskItem({ task, onToggle, formatDuration }: {
  task: Task;
  onToggle: (id: string, current: boolean) => void;
  formatDuration: (m: number) => string;
}) {
  return (
    <button
      onClick={() => onToggle(task.id, task.is_completed)}
      className="flex w-full items-center gap-3 rounded-lg p-2 hover:bg-secondary/50 transition-colors text-left"
    >
      {task.is_completed ? (
        <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
      ) : (
        <Circle className="h-5 w-5 text-border shrink-0" />
      )}
      <span className={`flex-1 text-sm ${task.is_completed ? "line-through text-muted-foreground" : "text-foreground"}`}>
        {task.label}
      </span>
      <span className="text-xs text-muted-foreground shrink-0">{formatDuration(task.duration_minutes)}</span>
    </button>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-rose-pale p-3 text-center">
      <p className="text-lg font-bold text-foreground">{value}</p>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
