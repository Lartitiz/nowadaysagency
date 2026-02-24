import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "@/contexts/SessionContext";
import { Button } from "@/components/ui/button";
import Confetti from "@/components/Confetti";

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function formatMinutes(s: number): string {
  const m = Math.round(s / 60);
  return m <= 1 ? "1 minute" : `${m} minutes`;
}

/* ── Progress bar ── */

function ProgressBar() {
  const { tasks, currentTaskIndex } = useSession();
  return (
    <div className="flex w-full h-1">
      {tasks.map((t, i) => {
        let bg = "bg-border";
        if (t.completed) bg = "bg-green-500";
        else if (i === currentTaskIndex) bg = "bg-primary animate-pulse";
        return <div key={t.id} className={`flex-1 ${bg} ${i > 0 ? "ml-px" : ""}`} />;
      })}
    </div>
  );
}

/* ── Pause overlay ── */

function PauseOverlay() {
  const { resumeSession, endSession } = useSession();
  return (
    <div className="fixed inset-0 z-[101] bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
      <p className="font-heading text-xl font-bold text-foreground">
        Session en pause
      </p>
      <div className="flex gap-3">
        <Button variant="outline" onClick={endSession}>
          Quitter la session
        </Button>
        <Button onClick={resumeSession}>Reprendre</Button>
      </div>
    </div>
  );
}

/* ── Recap screen ── */

function RecapScreen() {
  const { tasks, completedTasks, elapsedSeconds, endSession } = useSession();
  const navigate = useNavigate();
  const completedCount = completedTasks.length;
  const totalCount = tasks.length;
  const pct = totalCount > 0 ? completedCount / totalCount : 0;

  let message = "C'est un début. L'important c'est d'avoir ouvert l'outil.";
  if (pct >= 1) {
    message =
      "Franchement, bravo. T'as fait plus en 30 min que la plupart en une semaine.";
  } else if (pct >= 0.5) {
    message = "Beau travail ! Même 15 min de com', c'est mieux que 0.";
  }

  const handleBack = () => {
    endSession();
    navigate("/dashboard");
  };

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col items-center justify-center p-6 text-center">
      <Confetti />
      <h1 className="font-heading text-2xl font-bold mb-2">
        Session terminée ! 🎉
      </h1>
      <p className="text-muted-foreground mb-6">
        Voici ce que tu as accompli en {formatMinutes(elapsedSeconds)}
      </p>

      <div className="w-full max-w-sm space-y-2 mb-6">
        {tasks.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-2 text-sm text-foreground"
          >
            <span>{t.emoji}</span>
            <span className="flex-1 text-left">{t.title}</span>
            <span>{t.completed ? "✅" : "⏭️ passée"}</span>
          </div>
        ))}
      </div>

      <p className="text-sm font-medium text-foreground mb-2">
        {completedCount}/{totalCount} tâches complétées
      </p>
      <p className="text-sm text-muted-foreground mb-4">{message}</p>
      <p className="text-sm italic text-muted-foreground mb-6">
        Ferme l'ordi et va prendre un café ☕ Tu l'as mérité.
      </p>

      <Button onClick={handleBack}>Retour au dashboard</Button>
    </div>
  );
}

/* ── Main overlay (banner) ── */

export default function SessionOverlay() {
  const {
    isActive,
    isPaused,
    isRecap,
    currentTask,
    taskElapsedSeconds,
    completeCurrentTask,
    skipCurrentTask,
    endSession,
    tasks,
    currentTaskIndex,
  } = useSession();
  const navigate = useNavigate();

  // Navigate to the current task route whenever it changes
  useEffect(() => {
    if (isActive && !isRecap && currentTask?.route) {
      navigate(currentTask.route);
    }
  }, [isActive, isRecap, currentTask?.route, navigate]);

  if (!isActive) return null;
  if (isRecap) return <RecapScreen />;

  const overTime = currentTask
    ? taskElapsedSeconds > currentTask.duration
    : false;

  const handleQuit = () => {
    if (window.confirm("Tu veux vraiment quitter la session ?")) {
      endSession();
      navigate("/dashboard");
    }
  };

  return (
    <>
      {/* Fixed banner at top */}
      <div className="fixed top-0 left-0 right-0 z-[100] bg-card border-b">
        {/* Top bar */}
        <div className="h-16 flex items-center px-4 gap-4">
          {/* Left: quit */}
          <button
            onClick={handleQuit}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            ✕ Quitter
          </button>

          {/* Center: task info + timer */}
          <div className="flex-1 flex flex-col items-center justify-center min-w-0">
            {currentTask && (
              <>
                <span className="font-heading text-sm font-bold truncate">
                  {currentTask.emoji} {currentTask.title}
                </span>
                <span
                  className={`text-xs font-mono ${overTime ? "text-orange-500" : "text-muted-foreground"}`}
                >
                  {formatTime(taskElapsedSeconds)}
                </span>
              </>
            )}
          </div>

          {/* Right: action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={skipCurrentTask}
            >
              Passer →
            </Button>
            <Button size="sm" className="text-xs" onClick={completeCurrentTask}>
              Terminé ✓
            </Button>
          </div>
        </div>

        {/* Progress bar */}
        <ProgressBar />
      </div>

      {/* Spacer to push page content below the banner */}
      <div className="h-[calc(4rem+4px)]" />

      {/* Pause overlay */}
      {isPaused && <PauseOverlay />}
    </>
  );
}
