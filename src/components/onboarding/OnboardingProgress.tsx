import { ArrowLeft } from "lucide-react";

interface OnboardingProgressProps {
  step: number;
  totalSteps: number;
  progress: number;
  onBack: () => void;
}

export default function OnboardingProgress({ step, totalSteps, progress, onBack }: OnboardingProgressProps) {
  return (
    <>
      {/* Progress bar */}
      {step <= totalSteps - 1 && step < 11 && (
        <div className="fixed top-0 left-0 right-0 z-40 h-1 bg-border/30">
          <div
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Back button */}
      {step > 0 && step < 11 && (
        <button
          onClick={onBack}
          className="fixed top-4 left-4 z-40 text-muted-foreground hover:text-foreground text-sm flex items-center gap-1 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Retour
        </button>
      )}
    </>
  );
}
