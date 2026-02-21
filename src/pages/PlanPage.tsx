import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Link } from "react-router-dom";
import { Check, Clock, ArrowRight, ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import { fetchAppState, generateMissions, computeProgress, getMonday, type MissionDef } from "@/lib/mission-engine";
import { useToast } from "@/hooks/use-toast";

interface MissionRow {
  id: string;
  mission_key: string;
  title: string;
  description: string | null;
  priority: string;
  module: string | null;
  route: string | null;
  estimated_minutes: number | null;
  is_done: boolean;
  auto_completed: boolean;
  completed_at: string | null;
  week_start: string;
}

const PRIORITY_BADGE: Record<string, { label: string; className: string }> = {
  urgent: { label: "🔴 Urgent", className: "bg-red-100 text-red-700" },
  important: { label: "🟡 Important", className: "bg-amber-100 text-amber-700" },
  bonus: { label: "🟢 Bonus", className: "bg-emerald-100 text-emerald-700" },
};

const MODULE_BADGE: Record<string, { label: string; className: string }> = {
  branding: { label: "Branding", className: "bg-rose-pale text-primary" },
  instagram: { label: "Instagram", className: "bg-purple-100 text-purple-700" },
  linkedin: { label: "LinkedIn", className: "bg-blue-100 text-blue-700" },
  pinterest: { label: "Pinterest", className: "bg-red-50 text-red-600" },
  site_web: { label: "Site web", className: "bg-teal-100 text-teal-700" },
};

export default function PlanPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [missions, setMissions] = useState<MissionRow[]>([]);
  const [history, setHistory] = useState<{ week_start: string; total: number; done: number }[]>([]);
  const [progress, setProgress] = useState({ global: 0, branding: 0, profilInsta: 0, contenu: 0, engagement: 0, siteWeb: 0 });
  const [loading, setLoading] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);

  const weekStart = useMemo(() => getMonday(new Date()).toISOString().split("T")[0], []);

  useEffect(() => {
    if (!user) return;
    init();
  }, [user]);

  const init = async () => {
    if (!user) return;
    setLoading(true);

    // 1. Fetch app state and compute progress
    const state = await fetchAppState(user.id);
    setProgress(computeProgress(state));

    // 2. Check if missions exist for this week
    const { data: existingMissions } = await supabase
      .from("weekly_missions")
      .select("*")
      .eq("user_id", user.id)
      .eq("week_start", weekStart)
      .order("created_at");

    if (existingMissions && existingMissions.length > 0) {
      setMissions(existingMissions as MissionRow[]);
    } else {
      // Generate new missions
      const defs = generateMissions(state);
      if (defs.length > 0) {
        const toInsert = defs.map((d) => ({
          user_id: user.id,
          week_start: weekStart,
          mission_key: d.mission_key,
          title: d.title,
          description: d.description,
          priority: d.priority,
          module: d.module,
          route: d.route,
          estimated_minutes: d.estimated_minutes,
        }));
        const { data: inserted } = await supabase.from("weekly_missions").insert(toInsert).select();
        if (inserted) setMissions(inserted as MissionRow[]);
      }
    }

    // 3. Load history (past weeks)
    const { data: allMissions } = await supabase
      .from("weekly_missions")
      .select("week_start, is_done")
      .eq("user_id", user.id)
      .lt("week_start", weekStart)
      .order("week_start", { ascending: false });

    if (allMissions) {
      const weekMap = new Map<string, { total: number; done: number }>();
      allMissions.forEach((m: any) => {
        const w = m.week_start;
        if (!weekMap.has(w)) weekMap.set(w, { total: 0, done: 0 });
        const entry = weekMap.get(w)!;
        entry.total++;
        if (m.is_done) entry.done++;
      });
      setHistory(
        Array.from(weekMap.entries())
          .map(([week_start, counts]) => ({ week_start, ...counts }))
          .slice(0, 8)
      );
    }

    setLoading(false);
  };

  const completeMission = async (mission: MissionRow) => {
    await supabase
      .from("weekly_missions")
      .update({ is_done: true, completed_at: new Date().toISOString() })
      .eq("id", mission.id);
    setMissions((prev) =>
      prev.map((m) => (m.id === mission.id ? { ...m, is_done: true, completed_at: new Date().toISOString() } : m))
    );
    toast({ title: "Mission accomplie ! 🎉" });
  };

  const doneMissions = missions.filter((m) => m.is_done).length;
  const allDone = missions.length > 0 && doneMissions === missions.length;

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
      <main className="mx-auto max-w-[800px] px-6 py-8 max-md:px-4">
        <div className="mb-6">
          <h1 className="font-display text-[26px] font-bold text-foreground">Mon plan</h1>
          <p className="mt-1 text-[15px] text-muted-foreground">
            Tes missions de la semaine, adaptées à ton avancement. L'outil regarde où tu en es et te dit quoi faire.
          </p>
        </div>

        {/* SECTION 1: Overview */}
        <section className="mb-8">
          <div className="rounded-2xl border border-border bg-card p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-foreground">🚀 Ton avancement global</p>
              <span className="text-lg font-bold text-primary">{progress.global}%</span>
            </div>
            <Progress value={progress.global} className="h-2.5 mb-5" />
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <ProgressIndicator label="Branding" value={progress.branding} route="/branding" />
              <ProgressIndicator label="Profil Insta" value={progress.profilInsta} route="/instagram" />
              <ProgressIndicator label="Contenu" value={progress.contenu} route="/calendrier" />
              <ProgressIndicator label="Engagement" value={progress.engagement} route="/instagram/engagement" />
              <ProgressIndicator label="Site web" value={progress.siteWeb} route="/site" />
            </div>
          </div>
        </section>

        {/* SECTION 2: Weekly missions */}
        <section className="mb-8">
          <h2 className="font-display text-xl font-bold text-foreground mb-1">🎯 Tes missions cette semaine</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Semaine du {formatDate(weekStart)} au {formatDate(addDays(weekStart, 6))}
          </p>

          {allDone ? (
            <div className="rounded-2xl border border-primary/30 bg-card p-6 text-center">
              <p className="text-3xl mb-3">🎉</p>
              <p className="font-display text-lg font-bold text-foreground mb-2">
                Toutes tes missions de la semaine sont faites.
              </p>
              <p className="text-sm text-muted-foreground mb-1">Bravo, c'est énorme.</p>
              <div className="text-sm text-muted-foreground mt-4 space-y-1 text-left max-w-sm mx-auto">
                <p>Tu peux :</p>
                <p>• <Link to="/atelier" className="text-primary hover:underline">Aller générer des idées dans l'atelier</Link></p>
                <p>• <Link to="/branding" className="text-primary hover:underline">Avancer sur une section bonus de ton branding</Link></p>
                <p>• Ou tout simplement souffler. Tu l'as mérité.</p>
              </div>
              <p className="text-xs text-muted-foreground mt-4 italic">On se retrouve lundi avec tes nouvelles missions.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {missions.map((mission) => (
                <MissionCard
                  key={mission.id}
                  mission={mission}
                  onComplete={() => completeMission(mission)}
                />
              ))}
            </div>
          )}
        </section>

        {/* SECTION 3: History */}
        {history.length > 0 && (
          <section className="mb-8">
            <button
              onClick={() => setHistoryOpen(!historyOpen)}
              className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
            >
              {historyOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              Mes semaines précédentes
            </button>
            {historyOpen && (
              <div className="mt-3 space-y-2">
                {history.map((h) => (
                  <div key={h.week_start} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
                    <span className="text-sm text-muted-foreground">Semaine du {formatDate(h.week_start)}</span>
                    <span className="ml-auto text-sm font-medium text-foreground">
                      {h.done}/{h.total} missions {h.done === h.total ? "🎉" : "✅"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

/* ─── Sub-components ─── */

function ProgressIndicator({ label, value, route }: { label: string; value: number; route: string }) {
  return (
    <Link to={route} className="rounded-xl border border-border bg-muted/30 p-3 text-center hover:border-primary/40 transition-colors">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-lg font-bold text-foreground">{value}%</p>
      <div className="h-1.5 w-full rounded-full bg-muted mt-1.5 overflow-hidden">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${value}%` }} />
      </div>
    </Link>
  );
}

function MissionCard({ mission, onComplete }: { mission: MissionRow; onComplete: () => void }) {
  const priorityBadge = PRIORITY_BADGE[mission.priority] || PRIORITY_BADGE.important;
  const moduleBadge = mission.module ? MODULE_BADGE[mission.module] : null;

  return (
    <div className={`rounded-2xl border bg-card p-5 transition-all ${mission.is_done ? "opacity-50 border-border" : "border-border hover:border-primary/30"}`}>
      {/* Badges */}
      <div className="flex flex-wrap gap-2 mb-3">
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${priorityBadge.className}`}>
          {priorityBadge.label}
        </span>
        {moduleBadge && (
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${moduleBadge.className}`}>
            {moduleBadge.label}
          </span>
        )}
      </div>

      {/* Title */}
      <h3 className={`font-display text-lg font-bold mb-2 ${mission.is_done ? "line-through text-muted-foreground" : "text-foreground"}`}>
        {mission.title}
      </h3>

      {/* Description */}
      {mission.description && (
        <p className="text-sm text-muted-foreground leading-relaxed mb-3">{mission.description}</p>
      )}

      {/* Meta + actions */}
      <div className="flex flex-wrap items-center gap-3">
        {mission.estimated_minutes && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" /> ~{mission.estimated_minutes} min
          </span>
        )}
        {mission.route && mission.module && (
          <span className="text-xs text-muted-foreground">
            📍 {MODULE_BADGE[mission.module]?.label || mission.module}
          </span>
        )}
        <div className="flex gap-2 ml-auto">
          {mission.route && !mission.is_done && (
            <Button size="sm" variant="outline" asChild className="rounded-pill gap-1.5 text-xs">
              <Link to={mission.route}>
                <ArrowRight className="h-3.5 w-3.5" /> Y aller
              </Link>
            </Button>
          )}
          {!mission.is_done && (
            <Button size="sm" onClick={onComplete} className="rounded-pill gap-1.5 text-xs">
              <Check className="h-3.5 w-3.5" /> C'est fait
            </Button>
          )}
          {mission.is_done && (
            <span className="text-xs text-primary font-medium flex items-center gap-1">
              <Check className="h-3.5 w-3.5" /> Fait
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Helpers ─── */
function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}
