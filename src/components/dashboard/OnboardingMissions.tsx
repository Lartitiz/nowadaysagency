import { useNavigate } from "react-router-dom";
import { Clock, X } from "lucide-react";
import { useOnboardingMissions, OnboardingMission } from "@/hooks/use-onboarding-missions";
import { Progress } from "@/components/ui/progress";
import Confetti from "@/components/Confetti";

interface OnboardingMissionsProps {
  prenom?: string;
}

export default function OnboardingMissions({ prenom }: OnboardingMissionsProps) {
  const navigate = useNavigate();
  const { missions, completedCount, allDone, nextMission, dismissed, dismiss, isLoading } = useOnboardingMissions();

  if (dismissed || isLoading) return null;

  if (allDone) {
    return (
      <div className="rounded-[20px] bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 p-5 mb-6 shadow-[var(--shadow-bento)]">
        <Confetti />
        <p className="font-heading font-bold text-foreground">
          Bravo {prenom || "toi"} ! Tu as posé tes fondations 🎉
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          Tu connais les bases de l'outil. Maintenant, explore librement.
        </p>
        <button
          onClick={dismiss}
          className="mt-3 text-sm font-medium text-primary hover:underline"
        >
          Explorer l'outil →
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-[20px] bg-card border border-border p-5 shadow-[var(--shadow-bento)] mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-heading text-base font-bold text-foreground">
          🚀 Tes premières missions
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{completedCount}/5</span>
          <button
            onClick={dismiss}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md"
            aria-label="Fermer les missions"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Progress */}
      <Progress value={(completedCount / 5) * 100} className="h-2 mb-4" />

      {/* Mission cards */}
      <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory">
        {missions.map((mission) => (
          <MissionCard
            key={mission.id}
            mission={mission}
            isNext={nextMission?.id === mission.id}
            onClick={() => navigate(mission.route)}
          />
        ))}
      </div>
    </div>
  );
}

function MissionCard({
  mission,
  isNext,
  onClick,
}: {
  mission: OnboardingMission;
  isNext: boolean;
  onClick: () => void;
}) {
  const borderClass = mission.completed
    ? "border-green-200 bg-green-50/50"
    : isNext
    ? "border-primary bg-secondary"
    : "border-border bg-card";

  return (
    <button
      onClick={onClick}
      className={`min-w-[200px] snap-start rounded-xl border p-4 flex flex-col gap-2 cursor-pointer transition-all text-left ${borderClass}`}
    >
      <span className="text-2xl">{mission.completed ? "✅" : mission.emoji}</span>
      <span className="text-sm font-semibold text-foreground">{mission.title}</span>
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Clock className="h-3 w-3" />
        {mission.time}
      </span>
      <span className="text-xs text-muted-foreground line-clamp-2">{mission.description}</span>
      {isNext && !mission.completed && (
        <span className="text-xs font-medium text-primary animate-pulse mt-auto">
          Commencer →
        </span>
      )}
    </button>
  );
}
