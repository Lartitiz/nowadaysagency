import { useState, useEffect, useRef } from "react";

interface TourStep {
  target: string;
  title: string;
  text: string;
  position?: "top" | "bottom" | "left" | "right";
}

interface GuidedTourProps {
  steps: TourStep[];
  onComplete: () => void;
  storageKey: string;
}

// Approximate tooltip footprint — used to keep it fully inside the viewport.
const TOOLTIP_W = 280;
const TOOLTIP_H = 200;

function getTooltipPosition(rect: DOMRect, position: string): React.CSSProperties {
  const gap = 12;
  let left: number;
  let top: number;
  switch (position) {
    case "top":
      left = rect.left + rect.width / 2 - TOOLTIP_W / 2;
      top = rect.top - TOOLTIP_H - gap;
      break;
    case "left":
      left = rect.left - TOOLTIP_W - gap;
      top = rect.top + rect.height / 2 - TOOLTIP_H / 2;
      break;
    case "right":
      left = rect.right + gap;
      top = rect.top + rect.height / 2 - TOOLTIP_H / 2;
      break;
    case "bottom":
    default:
      left = rect.left + rect.width / 2 - TOOLTIP_W / 2;
      top = rect.bottom + gap;
      break;
  }
  // Clamp so the tooltip is always fully on-screen, whatever the target's position.
  left = Math.max(8, Math.min(left, window.innerWidth - TOOLTIP_W - 8));
  top = Math.max(8, Math.min(top, window.innerHeight - TOOLTIP_H - 8));
  return { left, top };
}


export default function GuidedTour({ steps, onComplete, storageKey }: GuidedTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [visible, setVisible] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (localStorage.getItem(storageKey)) {
      onComplete();
      return;
    }
    const timer = setTimeout(() => {
      // Jamais par-dessus un dialog ouvert : l'utilisatrice est déjà en train
      // de faire quelque chose. On ne marque pas « vu » → nouvel essai à la
      // prochaine visite du dashboard.
      if (
        document.querySelector(
          '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
        )
      ) {
        onComplete();
        return;
      }
      // Première visite uniquement : marqué « vu » dès l'affichage, pas à la
      // complétion. Naviguer ailleurs en cours de tour ne le fait plus revenir
      // à chaque retour sur le dashboard.
      localStorage.setItem(storageKey, "true");
      setVisible(true);
    }, 600);
    return () => clearTimeout(timer);
  }, []);

  // Le tour se dissout au premier pointerdown hors de sa bulle, SANS consommer
  // le clic : l'overlay est en pointer-events:none, l'action visée s'exécute.
  useEffect(() => {
    if (!visible) return;
    const onPointerDown = (e: PointerEvent) => {
      if (tooltipRef.current?.contains(e.target as Node)) return;
      setVisible(false);
      onComplete();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const step = steps[currentStep];
    if (!step) return;

    let retryCount = 0;
    const maxRetries = 8;
    let retryInterval: ReturnType<typeof setInterval> | null = null;
    let didScroll = false;

    // A target is only usable if it's actually rendered and visible. Some
    // data-tour anchors live in layouts that are hidden on the current viewport
    // (e.g. the desktop nav header) — those must be skipped, not pointed at.
    const isUsable = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1 && el.getClientRects().length > 0;
    };

    const stopRetry = () => {
      if (retryInterval) { clearInterval(retryInterval); retryInterval = null; }
    };

    const skipStep = () => {
      stopRetry();
      setTargetRect(null);
      if (currentStep === steps.length - 1) {
        setVisible(false);
        onComplete();
      } else {
        setCurrentStep((s) => s + 1);
      }
    };

    const findTarget = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (el && isUsable(el)) {
        // Bring the target into view once, then measure where it landed.
        if (!didScroll) {
          didScroll = true;
          el.scrollIntoView({ block: "center", inline: "nearest" });
        }
        setTargetRect(el.getBoundingClientRect());
        stopRetry();
      } else if (el) {
        // Present but hidden on this layout → skip immediately.
        skipStep();
      } else {
        // Not in the DOM yet → retry a few times, then skip.
        setTargetRect(null);
        retryCount++;
        if (retryCount >= maxRetries) skipStep();
      }
    };

    findTarget();
    retryInterval = setInterval(findTarget, 400);

    // On scroll/resize, only re-measure the (already located) target — never
    // re-scroll, to avoid fighting the user.
    const remeasure = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (el && isUsable(el)) setTargetRect(el.getBoundingClientRect());
    };
    window.addEventListener("resize", remeasure);
    window.addEventListener("scroll", remeasure, { passive: true });

    return () => {
      stopRetry();
      window.removeEventListener("resize", remeasure);
      window.removeEventListener("scroll", remeasure);
    };
  }, [currentStep, visible, steps]);

  // Rien tant que la cible n'est pas localisée : pas d'assombrissement « à
  // vide » pendant les retries (écran assombri bloquant, constaté en audit).
  if (!visible || !targetRect) return null;

  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;
  const position = step.position || "bottom";

  const handleNext = () => {
    if (isLast) {
      setVisible(false);
      onComplete();
    } else {
      setCurrentStep((s) => s + 1);
    }
  };

  const handleSkip = () => {
    setVisible(false);
    onComplete();
  };

  return (
    // z-[45] : au-dessus du contenu et du header sticky (z-40), mais SOUS les
    // dialogs Radix (z-50) et la sidebar (z-299+). pointer-events-none : le
    // coachmark ne bloque jamais la page — seule sa bulle est interactive.
    <div className="fixed inset-0 z-[45] pointer-events-none">
      {/* Overlay with spotlight hole */}
      <svg className="absolute inset-0 w-full h-full">
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            <rect
              x={targetRect.left - 6}
              y={targetRect.top - 6}
              width={targetRect.width + 12}
              height={targetRect.height + 12}
              rx={12}
              fill="black"
            />
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.5)"
          mask="url(#tour-mask)"
        />
      </svg>

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="absolute animate-fade-in pointer-events-auto"
        style={getTooltipPosition(targetRect, position)}
      >
        <div className="bg-card border border-border rounded-2xl p-5 shadow-xl max-w-[280px]">
          <h3 className="font-display text-sm text-foreground mb-1.5">{step.title}</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">{step.text}</p>
          <div className="flex items-center justify-between mt-4">
            <span className="text-2xs text-muted-foreground">
              {currentStep + 1}/{steps.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSkip}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Passer
              </button>
              <button
                onClick={handleNext}
                className="text-xs font-medium text-primary-foreground bg-primary px-4 py-1.5 rounded-full hover:opacity-90 transition"
              >
                {isLast ? "C'est compris !" : "Suivant →"}
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
