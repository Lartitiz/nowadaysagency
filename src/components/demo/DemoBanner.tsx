import { useDemoContext, type DemoPlan } from "@/contexts/DemoContext";
import { useNavigate } from "react-router-dom";
import { Film, X } from "lucide-react";
import { cn } from "@/lib/utils";

export default function DemoBanner() {
  const { isDemoMode, demoName, demoActivity, demoPlan, setDemoPlan, deactivateDemo } = useDemoContext();
  const navigate = useNavigate();

  if (!isDemoMode) return null;

  const handleQuit = () => {
    deactivateDemo();
    navigate("/");
  };

  return (
    <div className="sticky top-0 z-50 flex items-center justify-between px-4 py-2 bg-rose-pale text-foreground text-sm font-semibold border-b border-border gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <Film className="h-4 w-4 text-primary" />
        <span>🎬 Mode démo · {demoName}, {demoActivity}</span>
      </div>

      <div className="flex items-center gap-3">
        {/* Plan toggle tabs */}
        <div className="flex bg-background/60 rounded-full p-0.5 border border-border/50">
          <PlanTab
            label="Outil seul"
            active={demoPlan === "free"}
            onClick={() => setDemoPlan("free")}
          />
          <PlanTab
            label="Now Pilot"
            active={demoPlan === "now_pilot"}
            onClick={() => setDemoPlan("now_pilot")}
          />
        </div>

        <button
          onClick={handleQuit}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" />
          Quitter la démo
        </button>
      </div>
    </div>
  );
}

function PlanTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1 rounded-full text-xs font-medium transition-all duration-200",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
    </button>
  );
}
