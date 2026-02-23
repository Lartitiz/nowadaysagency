import { useDemoContext } from "@/contexts/DemoContext";
import { Film, X } from "lucide-react";

export default function DemoBanner() {
  const { isDemoMode, demoName, demoActivity, deactivateDemo } = useDemoContext();

  if (!isDemoMode) return null;

  return (
    <div className="sticky top-0 z-50 flex items-center justify-between px-4 py-2 bg-rose-pale text-foreground text-sm font-semibold border-b border-border">
      <div className="flex items-center gap-2">
        <Film className="h-4 w-4 text-primary" />
        <span>🎬 Mode démo · {demoName}, {demoActivity}</span>
      </div>
      <button
        onClick={deactivateDemo}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="h-3.5 w-3.5" />
        Quitter la démo
      </button>
    </div>
  );
}
