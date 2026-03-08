import { useState, useEffect } from "react";

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

function getTooltipPosition(rect: DOMRect, position: string): React.CSSProperties {
  const gap = 12;
  switch (position) {
    case "top":
      return { left: rect.left + rect.width / 2 - 140, bottom: window.innerHeight - rect.top + gap };
    case "bottom":
      return { left: Math.max(8, Math.min(rect.left + rect.width / 2 - 140, window.innerWidth - 296)), top: rect.bottom + gap };
    case "left":
      return { right: window.innerWidth - rect.left + gap, top: rect.top + rect.height / 2 - 50 };
    case "right":
      return { left: rect.right + gap, top: rect.top + rect.height / 2 - 50 };
    default:
      return { left: rect.left, top: rect.bottom + gap };
  }
}


export default function GuidedTour({ steps, onComplete, storageKey }: GuidedTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(storageKey)) {
      onComplete();
      return;
    }
    const timer = setTimeout(() => setVisible(true), 600);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const step = steps[currentStep];
    if (!step) return;

    const findTarget = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (el) {
        const rect = el.getBoundingClientRect();
        setTargetRect(rect);
      } else {
        setTargetRect(null);
      }
    };

    findTarget();
    window.addEventListener("resize", findTarget);
    return () => window.removeEventListener("resize", findTarget);
  }, [currentStep, visible, steps]);

  if (!visible || localStorage.getItem(storageKey)) return null;

  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;
  const position = step.position || "bottom";

  const handleNext = () => {
    if (isLast) {
      localStorage.setItem(storageKey, "true");
      setVisible(false);
      onComplete();
    } else {
      setCurrentStep((s) => s + 1);
    }
  };

  const handleSkip = () => {
    localStorage.setItem(storageKey, "true");
    setVisible(false);
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-[90]">
      {/* Overlay with spotlight hole */}
      <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: "none" }}>
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                x={targetRect.left - 6}
                y={targetRect.top - 6}
                width={targetRect.width + 12}
                height={targetRect.height + 12}
                rx={12}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.5)"
          mask="url(#tour-mask)"
        />
      </svg>

      {/* Clickable overlay to skip */}
      <div className="absolute inset-0" onClick={handleSkip} style={{ zIndex: 91 }} />

      {/* Tooltip */}
      {targetRect && (
        <div
          className="absolute z-[92] animate-fade-in"
          style={getTooltipPosition(targetRect, position)}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-card border border-border rounded-2xl p-5 shadow-xl max-w-[280px]">
            <h3 className="font-display text-sm text-foreground mb-1.5">{step.title}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">{step.text}</p>
            <div className="flex items-center justify-between mt-4">
              <span className="text-[10px] text-muted-foreground">
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
      )}

      {/* Auto-skip if target not found */}
      {!targetRect && visible && (
        <div className="hidden">
          <AutoSkip
            onSkip={() => {
              if (isLast) handleSkip();
              else setCurrentStep((s) => s + 1);
            }}
          />
        </div>
      )}
    </div>
  );
}
