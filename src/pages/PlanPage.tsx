import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Link } from "react-router-dom";
import {
  Check, Clock, ArrowRight, Lock, Settings, ChevronDown, ChevronRight, Sparkles,
  ClipboardList, BarChart3, Construction,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { computePlan, GOAL_LABELS, TIME_LABELS, type PlanData, type PlanConfig, type PlanPhase, type PlanStep, type StepStatus, type PlanStepOverride } from "@/lib/plan-engine";

/* ═══════════════════════════════════════════════════════════════
   PLAN CONFIG SETUP (first visit questionnaire)
   ═══════════════════════════════════════════════════════════════ */

const TIME_OPTIONS = [
  { value: "less_2h", label: "Moins de 2h" },
  { value: "2_5h", label: "2 à 5h" },
  { value: "5_10h", label: "5 à 10h" },
  { value: "more_10h", label: "Plus de 10h" },
];

const CHANNEL_OPTIONS = [
  { value: "instagram", label: "Instagram" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "newsletter", label: "Newsletter / Emailing" },
  { value: "site", label: "Site web / Blog" },
  { value: "pinterest", label: "Pinterest" },
  { value: "seo", label: "SEO" },
];

const GOAL_OPTIONS = [
  { value: "start", label: "Poser les bases de ma com' (je démarre)" },
  { value: "visibility", label: "Être plus visible sur les réseaux" },
  { value: "launch", label: "Lancer une offre / un produit" },
  { value: "clients", label: "Trouver des client·es" },
  { value: "structure", label: "Structurer ce que je fais déjà" },
];

function PlanSetupForm({ initial, onSave }: { initial?: PlanConfig | null; onSave: (c: PlanConfig) => void }) {
  const [weeklyTime, setWeeklyTime] = useState(initial?.weekly_time || "");
  const [channels, setChannels] = useState<string[]>(initial?.channels || []);
  const [mainGoal, setMainGoal] = useState(initial?.main_goal || "");

  const toggleChannel = (ch: string) =>
    setChannels((prev) => (prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]));

  const canSubmit = weeklyTime && channels.length > 0 && mainGoal;

  return (
    <div className="rounded-2xl border-2 border-primary/20 bg-card p-6 md:p-8 max-w-2xl mx-auto animate-fade-in">
      <h2 className="font-display text-2xl font-bold text-foreground mb-2">
        📋 {initial ? "Modifier ton plan" : "Configurons ton plan"}
      </h2>
      <p className="text-sm text-muted-foreground mb-6">
        Pour te proposer un parcours adapté, dis-moi :
      </p>

      {/* Time */}
      <fieldset className="mb-6">
        <legend className="text-sm font-semibold text-foreground mb-3">
          ⏰ Combien de temps par semaine tu peux consacrer à ta com' ?
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {TIME_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => setWeeklyTime(o.value)}
              className={`rounded-xl border-2 px-4 py-3 text-sm text-left transition-all ${
                weeklyTime === o.value
                  ? "border-primary bg-secondary text-foreground font-medium"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Channels */}
      <fieldset className="mb-6">
        <legend className="text-sm font-semibold text-foreground mb-3">
          📱 Quels canaux tu utilises ou tu veux utiliser ?
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {CHANNEL_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => toggleChannel(o.value)}
              className={`rounded-xl border-2 px-4 py-3 text-sm text-left transition-all ${
                channels.includes(o.value)
                  ? "border-primary bg-secondary text-foreground font-medium"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40"
              }`}
            >
              {channels.includes(o.value) ? "✅ " : ""}{o.label}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Goal */}
      <fieldset className="mb-8">
        <legend className="text-sm font-semibold text-foreground mb-3">
          🎯 C'est quoi ton objectif principal en ce moment ?
        </legend>
        <div className="space-y-2">
          {GOAL_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => setMainGoal(o.value)}
              className={`w-full rounded-xl border-2 px-4 py-3 text-sm text-left transition-all ${
                mainGoal === o.value
                  ? "border-primary bg-secondary text-foreground font-medium"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </fieldset>

      <Button
        onClick={() => canSubmit && onSave({ weekly_time: weeklyTime, channels, main_goal: mainGoal })}
        disabled={!canSubmit}
        className="w-full rounded-xl h-12 text-base gap-2"
      >
        <Sparkles className="h-4 w-4" />
        {initial ? "Mettre à jour mon plan" : "Générer mon plan"}
      </Button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   STEP & PHASE COMPONENTS
   ═══════════════════════════════════════════════════════════════ */

const STATUS_ICON: Record<StepStatus, React.ReactNode> = {
  done: <span className="text-primary">✅</span>,
  in_progress: <span>🟡</span>,
  todo: <span className="text-muted-foreground">🔲</span>,
  locked: <Lock className="h-4 w-4 text-muted-foreground/50" />,
};

const STATUS_LABEL: Record<StepStatus, string> = {
  done: "Fait ✓",
  in_progress: "En cours",
  todo: "À faire",
  locked: "Bloqué",
};

function ManualCheckbox({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
        checked
          ? "bg-primary border-primary"
          : "border-muted-foreground/30 hover:border-primary/50"
      }`}
      aria-label={checked ? "Marquer comme non fait" : "Marquer comme fait"}
    >
      {checked && <Check className="h-3 w-3 text-primary-foreground" />}
    </button>
  );
}

function StepCard({ step, isOverridden, onToggleOverride }: { step: PlanStep; isOverridden: boolean; onToggleOverride?: () => void }) {
  const isLocked = step.status === "locked";
  const isDone = step.status === "done";
  const canToggle = onToggleOverride && !isLocked && !step.comingSoon;

  return (
    <div
      className={`rounded-xl border px-5 py-4 transition-all ${
        isDone
          ? "border-primary/20 bg-primary/5"
          : isLocked
          ? "border-border/50 bg-muted/30 opacity-60"
          : "border-border bg-card hover:border-primary/30"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          {canToggle ? (
            <ManualCheckbox checked={isDone} onToggle={onToggleOverride} />
          ) : (
            STATUS_ICON[step.status]
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4
              className={`font-display text-[15px] font-bold ${
                isDone ? "line-through text-muted-foreground" : "text-foreground"
              }`}
            >
              {step.label}
            </h4>
            {step.comingSoon && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                🔜 Bientôt
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
          {step.detail && (
            <p className="text-xs text-primary font-medium mt-1">{step.detail}</p>
          )}
          {step.recommendation && (
            <p className="text-xs text-amber-600 mt-1">{step.recommendation}</p>
          )}
        </div>
        <div className="shrink-0 flex flex-col items-end gap-2">
          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" /> {step.duration} min
          </span>
          <span className={`text-[11px] font-medium ${isDone ? "text-primary" : "text-muted-foreground"}`}>
            {STATUS_LABEL[step.status]}
          </span>
        </div>
      </div>

      {/* Action button */}
      {!step.comingSoon && (
        <div className="mt-3 flex justify-end">
          {isLocked ? (
            <span className="text-[11px] italic text-muted-foreground">
              Termine d'abord tes fondations (branding + cible)
            </span>
          ) : (
            <Button size="sm" variant={isDone ? "ghost" : "outline"} asChild className="rounded-full gap-1.5 text-xs h-8">
              <Link to={step.route}>
                <ArrowRight className="h-3 w-3" />
                {isDone ? "Voir / Modifier" : step.status === "in_progress" ? "Continuer" : "Commencer"}
              </Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function PhaseSection({ phase, overrides, onToggleOverride }: { phase: PlanPhase; overrides: Set<string>; onToggleOverride: (stepId: string) => void }) {
  const [open, setOpen] = useState(!phase.locked);
  const doneCount = phase.steps.filter((s) => s.status === "done").length;
  const total = phase.steps.length;
  const allDone = doneCount === total;

  const statusLabel = allDone
    ? "✅ Terminé"
    : phase.locked
    ? "🔒 Après l'étape 1"
    : doneCount > 0
    ? "🟡 En cours"
    : "🔲 À faire";

  return (
    <section className="mb-6">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 rounded-xl bg-muted/50 border border-border px-5 py-3 hover:bg-muted/80 transition-colors text-left"
      >
        <span className="text-lg">{phase.emoji}</span>
        <span className="font-display text-base font-bold text-foreground flex-1">
          {phase.title}
        </span>
        <span className="text-xs text-muted-foreground mr-2">{doneCount}/{total}</span>
        <span className="text-[11px] font-medium text-muted-foreground">{statusLabel}</span>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="mt-3 space-y-3 pl-2">
          {phase.steps.map((step) => (
            <StepCard
              key={step.id}
              step={step}
              isOverridden={overrides.has(step.id)}
              onToggleOverride={() => onToggleOverride(step.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════ */

export default function PlanPage() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const [planData, setPlanData] = useState<PlanData | null>(null);
  const [config, setConfig] = useState<PlanConfig | null>(null);
  const [hasConfig, setHasConfig] = useState<boolean | null>(null);
  const [editing, setEditing] = useState(false);
  const [overrides, setOverrides] = useState<PlanStepOverride[]>([]);
  const overrideSet = new Set(overrides.map(o => o.step_id));

  const loadOverrides = useCallback(async (): Promise<PlanStepOverride[]> => {
    if (!user) return [];
    const { data } = await (supabase.from("plan_step_overrides") as any)
      .select("step_id, status")
      .eq("user_id", user.id);
    const list = (data || []) as PlanStepOverride[];
    setOverrides(list);
    return list;
  }, [user?.id]);

  const loadConfig = useCallback(async () => {
    if (!user) return;
    const [configRes, ov] = await Promise.all([
      (supabase.from("user_plan_config") as any).select("*").eq(column, value).maybeSingle(),
      loadOverrides(),
    ]);

    if (configRes.data) {
      const c: PlanConfig = {
        weekly_time: configRes.data.weekly_time || "2_5h",
        channels: (configRes.data.channels as string[]) || [],
        main_goal: configRes.data.main_goal || "start",
      };
      setConfig(c);
      setHasConfig(true);
      const plan = await computePlan({ column, value }, c, ov);
      setPlanData(plan);
    } else {
      setHasConfig(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const saveConfig = async (c: PlanConfig) => {
    if (!user) return;
    const payload = {
      user_id: user.id,
      weekly_time: c.weekly_time,
      channels: c.channels,
      main_goal: c.main_goal,
      updated_at: new Date().toISOString(),
    };

    if (hasConfig) {
      await (supabase.from("user_plan_config") as any).update(payload).eq(column, value);
    } else {
      await supabase.from("user_plan_config").insert(payload);
    }

    setConfig(c);
    setHasConfig(true);
    setEditing(false);
    const plan = await computePlan({ column, value }, c, overrides);
    setPlanData(plan);
  };

  const toggleOverride = async (stepId: string) => {
    if (!user || !config) return;
    const isCurrentlyOverridden = overrideSet.has(stepId);

    if (isCurrentlyOverridden) {
      await (supabase.from("plan_step_overrides") as any)
        .delete()
        .eq("user_id", user.id)
        .eq("step_id", stepId);
    } else {
      await (supabase.from("plan_step_overrides") as any)
        .insert({ user_id: user.id, step_id: stepId, status: "done" });
    }

    const newOverrides = await loadOverrides();
    const plan = await computePlan({ column, value }, config, newOverrides);
    setPlanData(plan);
  };

  // Loading
  if (hasConfig === null) {
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

  // No config yet → show setup
  if (!hasConfig || editing) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-[800px] px-6 py-8 max-md:px-4">
          {editing && (
            <button
              onClick={() => setEditing(false)}
              className="text-sm text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1"
            >
              ← Retour au plan
            </button>
          )}
          <PlanSetupForm initial={editing ? config : null} onSave={saveConfig} />
        </main>
      </div>
    );
  }

  if (!planData || !config) return null;

  const timeEstimate = formatTimeEstimate(planData.totalMinutesRemaining, config.weekly_time);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[800px] px-6 py-8 max-md:px-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <h1 className="font-display text-[26px] font-bold text-foreground">📋 Mon plan</h1>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing(true)}
            className="text-xs gap-1.5 text-muted-foreground"
          >
            <Settings className="h-3.5 w-3.5" /> Modifier
          </Button>
        </div>

        {/* Config summary */}
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mb-4">
          <span className="bg-muted px-2.5 py-1 rounded-full">🎯 {GOAL_LABELS[config.main_goal] || config.main_goal}</span>
          <span className="bg-muted px-2.5 py-1 rounded-full">⏰ {TIME_LABELS[config.weekly_time] || config.weekly_time} / semaine</span>
          <span className="bg-muted px-2.5 py-1 rounded-full">📱 {config.channels.map(c => c.charAt(0).toUpperCase() + c.slice(1)).join(", ")}</span>
        </div>

        {/* Global progress */}
        <div className="rounded-2xl border border-border bg-card p-5 mb-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-bold text-foreground">Progression globale</p>
            <span className="text-lg font-bold text-primary">{planData.progressPercent}%</span>
          </div>
          <Progress value={planData.progressPercent} className="h-2.5 mb-3" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{planData.completedCount}/{planData.totalCount} étapes terminées</span>
            <span>{timeEstimate}</span>
          </div>
        </div>

        {/* Recommended next step */}
        {(() => {
          const next = planData.phases
            .flatMap((p) => p.steps)
            .find((s) => s.status === "in_progress" || s.status === "todo");
          if (!next || next.status === "locked") return null;
          return (
            <div className="rounded-2xl border-2 border-primary/30 bg-secondary/30 p-4 mb-6 flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">💡 Prochaine étape recommandée</p>
                <p className="text-sm font-bold text-foreground">{next.label}</p>
              </div>
              <Button size="sm" asChild className="rounded-full gap-1.5 text-xs shrink-0">
                <Link to={next.route}>
                  <ArrowRight className="h-3 w-3" /> {next.status === "in_progress" ? "Continuer" : "Commencer"}
                </Link>
              </Button>
            </div>
          );
        })()}

        {/* Phases */}
        {planData.phases.map((phase) => (
          <PhaseSection key={phase.id} phase={phase} overrides={overrideSet} onToggleOverride={toggleOverride} />
        ))}
      </main>
    </div>
  );
}

/* ─── Helpers ─── */

function formatTimeEstimate(minutes: number, weeklyTime: string): string {
  if (minutes <= 0) return "🎉 Plan terminé !";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const timeStr = hours > 0 ? `~${hours}h${mins > 0 ? mins.toString().padStart(2, "0") : ""}` : `~${mins} min`;

  const weeklyMinutes: Record<string, number> = {
    less_2h: 90,
    "2_5h": 210,
    "5_10h": 450,
    more_10h: 720,
  };
  const available = weeklyMinutes[weeklyTime] || 210;
  const weeks = Math.ceil(minutes / available);

  return `${timeStr} restantes · ~${weeks} semaine${weeks > 1 ? "s" : ""}`;
}
