import { useNavigate } from "react-router-dom";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Settings, Check, Clock, Lock, Lightbulb, ArrowRight, Construction } from "lucide-react";
import type { PlanData, PlanPhase, PlanStep, StepStatus } from "@/lib/plan-engine";
import { GOAL_LABELS, TIME_LABELS } from "@/lib/plan-engine";
import AuditRecommendationsSection from "./AuditRecommendationsSection";

interface PlanViewProps {
  plan: PlanData;
  onEditConfig: () => void;
}

export default function PlanView({ plan, onEditConfig }: PlanViewProps) {
  const navigate = useNavigate();

  const channelLabels: Record<string, string> = {
    instagram: "Instagram",
    linkedin: "LinkedIn",
    newsletter: "Newsletter",
    site: "Site web",
    pinterest: "Pinterest",
    seo: "SEO",
  };

  const formatTime = (min: number) => {
    if (min >= 60) {
      const h = Math.floor(min / 60);
      const m = min % 60;
      return m > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${h}h`;
    }
    return `${min} min`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>🎯 {GOAL_LABELS[plan.config.main_goal] || plan.config.main_goal}</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span>⏰ {TIME_LABELS[plan.config.weekly_time] || plan.config.weekly_time} / semaine</span>
              <span>📱 {plan.config.channels.map(c => channelLabels[c] || c).join(", ")}</span>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onEditConfig} className="gap-1.5 text-muted-foreground">
            <Settings className="h-4 w-4" />
            Modifier
          </Button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-foreground">Progression globale</span>
            <span className="text-muted-foreground">{plan.completedCount}/{plan.totalCount} étapes · {plan.progressPercent}%</span>
          </div>
          <Progress value={plan.progressPercent} className="h-3" />
          {plan.totalMinutesRemaining > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              Il te reste environ {formatTime(plan.totalMinutesRemaining)} pour terminer ton plan.
            </p>
          )}
        </div>
      </div>

      {/* Audit Recommendations */}
      <AuditRecommendationsSection />

      {/* Phases */}
      {plan.phases.map(phase => (
        <PhaseSection key={phase.id} phase={phase} navigate={navigate} />
      ))}
    </div>
  );
}

function PhaseSection({ phase, navigate }: { phase: PlanPhase; navigate: (path: string) => void }) {
  const doneCount = phase.steps.filter(s => s.status === "done").length;
  const allDone = doneCount === phase.steps.length;

  let statusLabel: string;
  let statusColor: string;
  if (allDone) {
    statusLabel = "✅ Terminé";
    statusColor = "text-green-600";
  } else if (phase.locked) {
    statusLabel = "🔒 Après les fondations";
    statusColor = "text-muted-foreground";
  } else if (doneCount > 0) {
    statusLabel = "🟡 En cours";
    statusColor = "text-amber-600";
  } else {
    statusLabel = "À faire";
    statusColor = "text-muted-foreground";
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-bold text-foreground flex items-center gap-2">
          <span>{phase.emoji}</span> {phase.title}
        </h3>
        <span className={`text-xs font-medium ${statusColor}`}>{statusLabel}</span>
      </div>
      <div className="space-y-2">
        {phase.steps.map(step => (
          <StepCard key={step.id} step={step} navigate={navigate} />
        ))}
      </div>
    </div>
  );
}

function StepCard({ step, navigate }: { step: PlanStep; navigate: (path: string) => void }) {
  const statusConfig: Record<StepStatus, { icon: React.ReactNode; label: string; color: string }> = {
    done: { icon: <Check className="h-4 w-4 text-green-600" />, label: "Fait", color: "border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/30" },
    in_progress: { icon: <div className="h-4 w-4 rounded-full border-2 border-amber-500 bg-amber-100 dark:bg-amber-900/40" />, label: "En cours", color: "border-amber-200 bg-amber-50/30 dark:border-amber-900 dark:bg-amber-950/20" },
    todo: { icon: <div className="h-4 w-4 rounded border-2 border-muted-foreground/30" />, label: "À faire", color: "border-border" },
    locked: { icon: <Lock className="h-4 w-4 text-muted-foreground/40" />, label: "Bloqué", color: "border-border opacity-60" },
  };

  const cfg = statusConfig[step.status];

  const handleClick = () => {
    if (step.status === "locked" || step.comingSoon) return;
    if (step.route.startsWith("http")) {
      window.open(step.route, "_blank", "noopener,noreferrer");
      return;
    }
    navigate(step.route);
  };

  const actionLabel = step.status === "done" ? "Voir / Modifier" : step.status === "in_progress" ? "Continuer" : "Commencer";

  return (
    <button
      onClick={handleClick}
      disabled={step.status === "locked" || step.comingSoon}
      className={`w-full text-left p-4 rounded-xl border transition-all group ${cfg.color} ${
        step.status !== "locked" && !step.comingSoon ? "hover:shadow-sm hover:border-primary/30 cursor-pointer" : "cursor-not-allowed"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0">{cfg.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-foreground">{step.label}</span>
            {step.comingSoon && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground flex items-center gap-1">
                <Construction className="h-3 w-3" /> Bientôt
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
          {step.detail && (
            <p className="text-xs text-primary font-medium mt-1">{step.detail}</p>
          )}
          {step.recommendation && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
              <Lightbulb className="h-3 w-3" /> {step.recommendation}
            </p>
          )}
          {step.status === "locked" && (
            <p className="text-xs text-muted-foreground/60 mt-1 flex items-center gap-1">
              <Lock className="h-3 w-3" /> Termine d'abord les fondations
            </p>
          )}
        </div>
        <div className="flex-shrink-0 flex items-center gap-3">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" /> {step.duration} min
          </span>
          {step.status !== "locked" && !step.comingSoon && (
            <span className="text-xs text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
              {actionLabel} <ArrowRight className="h-3 w-3" />
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
