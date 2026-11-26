import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCarouselEditorShown } from "@/lib/carousel-editor-shown";
import { useAppHeaderSlot } from "@/lib/app-header-slot";

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
  // Étape « Contenu » : une seule ligne courte, pour laisser la place au contenu
  // et à son éditeur (plan simplicité, 16/10/2026). Mêmes boutons, plus petits.
  const compact = current === "result";
  // Éditeur de carrousel affiché (chantier W élargi, 18/10/2026) : une ligne fine
  // (~24 px), toujours cliquable, collée sous le menu de l'app. La place va à la slide.
  // (-mt-4 annule l'espace laissé au-dessus des étapes par la page.)
  const editorShown = useCarouselEditorShown();
  const folded = compact && editorShown;
  // Slide en grand (26/11/2026) : sur ordinateur, les étapes repliées montent dans la barre
  // fine du menu de l'app (plus de ligne à elles au-dessus de la slide).
  const slot = useAppHeaderSlot("steps");
  const inHeader = folded && !!slot;
  // Étape « Idée » épurée (14/11/2026) : étapes fines, sans la ligne « Étape 1 sur 4 :
  // Dis-moi ton idée » (gardée pour les lecteurs d'écran), le regard va au champ.
  const slim = current === "idea";

  const nav = (
    <nav aria-label="Étapes de création" data-testid="creer-stepper" data-current-step={current} data-folded={folded || undefined} data-in-header={inHeader || undefined} className={inHeader ? "flex items-center gap-x-4" : folded ? "-mt-4 mb-1.5 flex items-center justify-between gap-x-4" : compact ? "mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1" : slim ? "mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1" : "mb-8 space-y-3"}>
      <div className={cn("flex items-start gap-1 sm:gap-3", inHeader ? "w-64 xl:w-80" : compact || slim ? "flex-1 sm:max-w-md" : "sm:max-w-xl")}>
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
                  "flex items-center gap-1.5 rounded-md shrink-0",
                  compact || slim ? "text-[11px] sm:text-xs" : "flex-col sm:flex-row text-[11px] sm:text-sm",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4",
                  isAvailable && !isCurrent && "text-primary hover:underline cursor-pointer",
                  isCurrent && "text-primary font-semibold",
                  !isPast && !isCurrent && "text-muted-foreground",
                )}
              >
                <span className={cn("flex items-center justify-center rounded-full border", folded ? "h-4 w-4 text-[9px]" : compact || slim ? "h-5 w-5 text-[10px]" : "h-7 w-7 text-xs", isCurrent ? "bg-primary border-primary text-primary-foreground" : "border-border")}>
                  {isPast ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                <span className={inHeader && !isCurrent ? "hidden xl:inline" : compact && !isCurrent ? "hidden sm:inline" : undefined}>{s.label}</span>
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
      <div className={cn("flex items-center gap-3", compact || slim ? "shrink-0" : "justify-between")}>
        <p className={folded || slim ? "sr-only" : "text-xs text-muted-foreground"}>
          <span className="font-medium text-foreground">Étape {currentIndex + 1} sur {STEPS.length}</span>
          {!compact && <>{" : "}{verbOverride || currentStep.verb}</>}
        </p>
        {rightSlot && <div className="shrink-0">{rightSlot}</div>}
      </div>
    </nav>
  );
  // Dans le menu : la page ne garde pas la place des étapes (-mt-6 reprend l'espace laissé au-dessus du contenu).
  return inHeader ? <>{createPortal(nav, slot!)}<div aria-hidden="true" className="-mt-6" /></> : nav;
}
