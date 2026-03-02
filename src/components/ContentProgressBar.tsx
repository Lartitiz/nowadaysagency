import { Check } from "lucide-react";

interface Step {
  key: string;
  label: string;
}

interface ContentProgressBarProps {
  steps: Step[];
  currentStep: string;
  onStepClick?: (stepKey: string) => void;
}

export default function ContentProgressBar({ steps, currentStep, onStepClick }: ContentProgressBarProps) {
  const currentIdx = steps.findIndex(s => s.key === currentStep);

  return (
    <div className="flex items-center gap-1.5 mb-8 overflow-x-auto pb-2">
      {steps.map((s, i) => {
        const isPast = i < currentIdx;
        const isCurrent = i === currentIdx;
        const canClick = isPast && !!onStepClick;

        return (
          <button
            key={s.key}
            onClick={() => canClick && onStepClick?.(s.key)}
            disabled={!canClick}
            className={`flex items-center gap-1 rounded-pill px-3 py-1.5 text-xs font-medium border transition-all whitespace-nowrap ${
              isCurrent
                ? "bg-primary text-primary-foreground border-primary"
                : isPast
                  ? "bg-secondary text-foreground border-secondary cursor-pointer hover:border-primary/40 hover:bg-secondary/80"
                  : "bg-card text-muted-foreground border-border opacity-60"
            }`}
          >
            {isPast && <Check className="h-3 w-3" />}
            {i + 1}. {s.label}
          </button>
        );
      })}
    </div>
  );
}
