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
  { key: "brief", label: "Précisions", verb: "Précise ton contenu" },
  { key: "result", label: "Contenu", verb: "Relis et personnalise ton contenu" },
];

interface Props {
  current: StepperKey;
  contentAvailable?: boolean;
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
export default function CreerStepper({ current, contentAvailable = false, onStepClick, rightSlot, verbOverride }: Props) {
  const currentIndex = STEPS.findIndex((s) => s.key === current);
  const currentStep = STEPS[currentIndex] ?? STEPS[0];

  return (
    <nav aria-label="Étapes de création" className="mb-8 space-y-3">
      <div className="flex items-start gap-1 sm:gap-3 sm:max-w-xl">
        {STEPS.map((s, i) => {
          const isPast = i < currentIndex;
          const isCurrent = i === currentIndex;
          const isAvailable = isPast || (s.key === "result" && contentAvailable && !isCurrent);
          const clickable = isAvailable && !!onStepClick;

          return (
            <div key={s.key} className="flex items-center gap-1 sm:gap-3 flex-1 last:flex-none">
              <button
                type="button"
                onClick={clickable ? () => onStepClick!(s.key) : undefined}
                disabled={!clickable}
                aria-current={isCurrent ? "step" : undefined}
                aria-label={`Étape ${i + 1} sur ${STEPS.length} — ${s.label}`}
                className={cn(
                  "flex flex-col sm:flex-row items-center gap-1.5 rounded-md text-[11px] sm:text-sm shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4",
                  isAvailable && !isCurrent && "text-primary hover:underline cursor-pointer",
                  isCurrent && "text-primary font-semibold",
                  !isPast && !isCurrent && "text-muted-foreground",
                )}
              >
                <span className={cn("flex h-7 w-7 items-center justify-center rounded-full border text-xs", isCurrent ? "bg-primary border-primary text-primary-foreground" : "border-border")}>
                  {isPast ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                <span>{s.label}</span>
              </button>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    "h-px rounded-full flex-1 min-w-2 transition-colors",
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
    </nav>
  );
}
