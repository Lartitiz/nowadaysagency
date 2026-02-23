import { type ReactNode } from "react";
import { useFirstTimeTooltip } from "@/hooks/use-first-time-tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDemoContext } from "@/contexts/DemoContext";
import { cn } from "@/lib/utils";

type Position = "top" | "bottom" | "left" | "right";

interface FirstTimeTooltipProps {
  id: string;
  text: string;
  position?: Position;
  /** Extra classes forwarded to the wrapper div (e.g. grid col-span) */
  className?: string;
  children: ReactNode;
}

const positionClasses: Record<Position, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
  left: "right-full top-1/2 -translate-y-1/2 mr-2",
  right: "left-full top-1/2 -translate-y-1/2 ml-2",
};

const arrowClasses: Record<Position, string> = {
  bottom: "-top-1 left-1/2 -translate-x-1/2",
  top: "-bottom-1 left-1/2 -translate-x-1/2",
  left: "-right-1 top-1/2 -translate-y-1/2",
  right: "-left-1 top-1/2 -translate-y-1/2",
};

export default function FirstTimeTooltip({
  id,
  text,
  position = "bottom",
  className,
  children,
}: FirstTimeTooltipProps) {
  const { isDemoMode } = useDemoContext();
  const isMobile = useIsMobile();
  const { show, handleMouseEnter, handleDismiss, alreadySeen } = useFirstTimeTooltip(id);

  // No tooltips in demo mode — render children directly, no wrapper
  if (isDemoMode) return <>{children}</>;

  // Mobile: show a small "?" badge that triggers on tap
  if (isMobile) {
    if (alreadySeen) return <>{children}</>;

    return (
      <div className={cn("relative", className)}>
        {children}
        {!show && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleMouseEnter(); }}
            className="absolute -top-1 -right-1 z-40 h-5 w-5 rounded-full bg-primary/80 text-primary-foreground text-[10px] font-bold flex items-center justify-center shadow-sm"
            aria-label="Info"
          >
            ?
          </button>
        )}
        {show && (
          <div
            className={cn(
              "absolute z-50",
              positionClasses[position],
              "bg-foreground text-background text-xs rounded-lg px-3 py-2 max-w-[220px] leading-relaxed shadow-lg animate-in fade-in slide-in-from-bottom-1 duration-200"
            )}
            role="tooltip"
            onClick={(e) => { e.stopPropagation(); handleDismiss(); }}
          >
            {text}
            <div className={cn("absolute w-2 h-2 bg-foreground rotate-45", arrowClasses[position])} />
          </div>
        )}
      </div>
    );
  }

  // Desktop: if already seen, render children directly — no wrapper div at all
  if (alreadySeen) return <>{children}</>;

  // Desktop: hover-triggered
  return (
    <div
      className={cn("relative", className)}
      onMouseEnter={handleMouseEnter}
      onClick={handleDismiss}
    >
      {children}
      {show && (
        <div
          className={cn(
            "absolute z-50",
            positionClasses[position],
            "bg-foreground text-background text-xs rounded-lg px-3 py-2 max-w-[220px] leading-relaxed shadow-lg animate-in fade-in slide-in-from-bottom-1 duration-200 pointer-events-none"
          )}
          role="tooltip"
        >
          {text}
          <div className={cn("absolute w-2 h-2 bg-foreground rotate-45", arrowClasses[position])} />
        </div>
      )}
    </div>
  );
}
