import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type StepperKey = "idea" | "format" | "brief" | "result";

interface StepDef {
  key: StepperKey;
  label: string;
  /** Short verb-led label shown under the stepper for the current step */
  verb: string;
}

const STEPS: StepDef[] = [
  { key: "idea", label: "Idée", verb: "Dis-moi ton idée" },
  { key: "format", label: "Format", verb: "Canal et format" },
  { key: "brief", label: "Brief", verb: "Affine le brief" },
  { key: "result", label: "Résultat", verb: "Ton contenu prêt" },
];

interface Props {
  current: StepperKey;
  /** Optional callback when user clicks a past step (jump back). If undefined, past steps aren't clickable. */
  onStepClick?: (key: StepperKey) => void;
  /** Optional right-aligned slot (e.g. credits counter) */
  rightSlot?: React.ReactNode;
  /** Remplace le verbe de l'étape courante (ex. « Ton premier contenu » sur le récap auto=1). */
  verbOverride?: string;
}

/**
 * Visual stepper for the /creer flow.
 * Pure presentation component — does not own routing/state.
 */
export default function CreerStepper({ current, onStepClick, rightSlot, verbOverride }: Props) {
  const currentIndex = STEPS.findIndex((s) => s.key === current);
  const currentStep = STEPS[currentIndex] ?? STEPS[0];

  return (
    <div className="mb-5 space-y-2">
      {/* Dots row */}
      <div className="flex items-center gap-1.5">
        {STEPS.map((s, i) => {
          const isPast = i < currentIndex;
          const isCurrent = i === currentIndex;
          const clickable = isPast && !!onStepClick;

          return (
            <div key={s.key} className="flex items-center gap-1.5 flex-1 last:flex-none">
              <button
                type="button"
                onClick={clickable ? () => onStepClick!(s.key) : undefined}
                disabled={!clickable}
                aria-current={isCurrent ? "step" : undefined}
                aria-label={`Étape ${i + 1} sur ${STEPS.length} — ${s.label}`}
                className={cn(
                  "flex items-center justify-center h-6 w-6 rounded-full text-2xs font-bold shrink-0 transition-all",
                  isPast && "bg-primary/40 text-primary-foreground hover:bg-primary/60 cursor-pointer",
                  isCurrent && "bg-primary text-primary-foreground shadow-sm scale-110",
                  !isPast && !isCurrent && "bg-muted text-muted-foreground",
                )}
              >
                {isPast ? <Check className="h-3 w-3" /> : i + 1}
              </button>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    "h-0.5 rounded-full flex-1 transition-colors",
                    isPast ? "bg-primary/40" : "bg-muted",
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Label row */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Étape {currentIndex + 1} sur {STEPS.length}</span>
          {" : "}
          {verbOverride || currentStep.verb}
        </p>
        {rightSlot && <div className="shrink-0">{rightSlot}</div>}
      </div>
    </div>
  );
}
