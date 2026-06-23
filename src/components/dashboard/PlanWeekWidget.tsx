import { useState } from "react";
import { Sparkles, ArrowRight } from "lucide-react";
import CalendarCoachingDialog from "@/components/calendar/CalendarCoachingDialog";

interface Props {
  animationDelay?: number;
}

export default function PlanWeekWidget({ animationDelay = 0 }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div
        className="col-span-4 sm:col-span-6 lg:col-span-6 row-span-1
          rounded-[20px] p-5 sm:p-6
          bg-card border border-border
          shadow-[var(--shadow-bento)]
          hover:shadow-[var(--shadow-bento-hover)] hover:-translate-y-[3px]
          active:translate-y-0 active:shadow-[var(--shadow-bento)]
          transition-all duration-[250ms] ease-out
          opacity-0 animate-reveal-up cursor-pointer"
        style={{ animationDelay: `${animationDelay}s`, animationFillMode: "forwards" }}
        onClick={() => setOpen(true)}
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-heading text-base font-bold text-foreground">
            ✨ Planifier ma semaine
          </h3>
          <span className="text-xs font-medium text-primary flex items-center gap-1">
            Lancer <ArrowRight className="h-3 w-3" />
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          L'IA analyse ton branding et te propose un planning de contenus personnalisé pour la semaine.
        </p>
      </div>

      <CalendarCoachingDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
