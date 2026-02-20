import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Link, useLocation } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import WeeklyRecap from "@/components/WeeklyRecap";
import PlanMiniRecap from "@/components/PlanMiniRecap";
import { Lightbulb, ClipboardList, ArrowRight, User } from "lucide-react";
import { PLAN_WEEKS } from "@/lib/plan-content";
import { Checkbox } from "@/components/ui/checkbox";

export interface UserProfile {
  prenom: string;
  activite: string;
  type_activite: string;
  cible: string;
  probleme_principal: string;
  piliers: string[];
  tons: string[];
  plan_start_date: string | null;
}

const DAY_ACTIONS: Record<number, string> = {
  1: "parfait pour planifier ta semaine.",
  2: "parfait pour rédiger un post.",
  3: "parfait pour trouver de nouvelles idées.",
  4: "parfait pour avancer sur ton plan.",
  5: "parfait pour préparer le contenu de la semaine prochaine.",
  6: "parfait pour prendre du recul et observer.",
  0: "Jour de repos ou jour d'inspi ?",
};

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

export default function Dashboard() {
  const { user } = useAuth();
  const location = useLocation();
  const isAtelierRoute = location.pathname.startsWith("/instagram/idees");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [planTasks, setPlanTasks] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      const [profileRes, tasksRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("prenom, activite, type_activite, cible, probleme_principal, piliers, tons, plan_start_date")
          .eq("user_id", user.id)
          .single(),
        supabase
          .from("plan_tasks")
          .select("week_number, task_index, is_completed, completed_at")
          .eq("user_id", user.id),
      ]);
      if (profileRes.data) setProfile(profileRes.data as UserProfile);
      if (tasksRes.data) setPlanTasks(tasksRes.data);
    };
    fetchData();
  }, [user]);

  const currentWeek = useMemo(() => {
    if (!profile?.plan_start_date) return 0;
    const start = new Date(profile.plan_start_date);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return Math.min(Math.floor(diffDays / 7) + 1, 12);
  }, [profile?.plan_start_date]);

  const weekData = PLAN_WEEKS.find((w) => w.weekNumber === currentWeek);

  const handleToggleTask = async (taskIndex: number, checked: boolean) => {
    if (!user || !weekData) return;
    const existing = planTasks.find(
      (t) => t.week_number === currentWeek && t.task_index === taskIndex
    );
    if (existing) {
      await supabase
        .from("plan_tasks")
        .update({ is_completed: checked, completed_at: checked ? new Date().toISOString() : null })
        .eq("user_id", user.id)
        .eq("week_number", currentWeek)
        .eq("task_index", taskIndex);
    } else {
      await supabase.from("plan_tasks").insert({
        user_id: user.id,
        week_number: currentWeek,
        task_index: taskIndex,
        is_completed: checked,
        completed_at: checked ? new Date().toISOString() : null,
      });
    }
    // Refresh
    const { data } = await supabase
      .from("plan_tasks")
      .select("week_number, task_index, is_completed, completed_at")
      .eq("user_id", user.id);
    if (data) setPlanTasks(data);
  };

  if (!profile) {
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

  const today = new Date().getDay();
  const dayName = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"][today];
  const dayAction = DAY_ACTIONS[today];
  const subtitle = today === 0
    ? dayAction
    : `C'est ${dayName}, ${dayAction}`;

  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const conseil = CONSEILS[dayOfYear % CONSEILS.length];

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[1100px] px-6 py-8 max-md:px-4">
        {isAtelierRoute && (
          <SubPageHeader parentLabel="Instagram" parentTo="/instagram" currentLabel="Trouver des idées" />
        )}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
          {/* LEFT COLUMN */}
          <div className="space-y-6 min-w-0">
            {/* Header */}
            <div>
              <h1 className="font-display text-[22px] sm:text-[26px] font-bold text-foreground">
                Hey {profile.prenom}, on avance sur quoi aujourd'hui ?
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
            </div>

            {/* Weekly recap */}
            <WeeklyRecap currentWeek={currentWeek} planTasks={planTasks} />

            {/* Quick actions */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Link
                to="/instagram"
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:border-primary hover:shadow-sm transition-all group"
              >
                <Lightbulb className="h-5 w-5 text-primary shrink-0" />
                <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">Aller sur Instagram</span>
              </Link>
              <Link
                to="/plan"
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:border-primary hover:shadow-sm transition-all group"
              >
                <ClipboardList className="h-5 w-5 text-primary shrink-0" />
                <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">Continuer mon plan</span>
              </Link>
              <Link
                to="/profil"
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:border-primary hover:shadow-sm transition-all group"
              >
                <User className="h-5 w-5 text-primary shrink-0" />
                <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">Mon profil</span>
              </Link>
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="space-y-5">
            {/* Plan week tasks */}
            {weekData && currentWeek > 0 ? (
              <div className="rounded-2xl bg-card border border-border p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <ClipboardList className="h-5 w-5 text-primary" />
                  <h3 className="font-display text-lg font-bold">Ma semaine du plan</h3>
                </div>
                <p className="text-sm text-foreground font-medium mb-1">
                  Semaine {currentWeek} / 12 : {weekData.title}
                </p>
                {/* 12-segment progress */}
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: 12 }, (_, i) => {
                    const weekTasks = PLAN_WEEKS.find((w) => w.weekNumber === i + 1);
                    const completedCount = planTasks.filter(
                      (t) => t.week_number === i + 1 && t.is_completed
                    ).length;
                    const isComplete = weekTasks && completedCount >= weekTasks.tasks.length;
                    return (
                      <div
                        key={i}
                        className={`h-2 flex-1 rounded-full ${
                          isComplete
                            ? "bg-primary"
                            : i + 1 === currentWeek
                            ? "bg-primary/40"
                            : "bg-secondary"
                        }`}
                      />
                    );
                  })}
                </div>
                {/* Tasks */}
                <div className="space-y-2.5">
                  {weekData.tasks.map((task, idx) => {
                    const isCompleted = planTasks.some(
                      (t) => t.week_number === currentWeek && t.task_index === idx && t.is_completed
                    );
                    return (
                      <label
                        key={idx}
                        className="flex items-start gap-2.5 cursor-pointer group"
                      >
                        <Checkbox
                          checked={isCompleted}
                          onCheckedChange={(checked) => handleToggleTask(idx, !!checked)}
                          className="mt-0.5"
                        />
                        <span
                          className={`text-sm leading-snug ${
                            isCompleted
                              ? "line-through text-muted-foreground"
                              : "text-foreground"
                          }`}
                        >
                          {task.text}
                          <span className="text-xs text-muted-foreground ml-1">({task.duration})</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                <Link
                  to="/plan"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline mt-4"
                >
                  Voir le plan complet
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ) : (
              <PlanMiniRecap />
            )}

            {/* Conseil */}
            <div className="rounded-2xl bg-rose-pale border border-border p-5">
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb className="h-5 w-5 text-primary" />
                <h3 className="font-display text-lg font-bold">Le conseil Nowadays</h3>
              </div>
              <p className="text-sm text-foreground leading-relaxed italic">"{conseil}"</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
